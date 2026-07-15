"""WebSocket endpoint that streams the live domain-event feed to the UI."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.realtime import hub

router = APIRouter(tags=["realtime"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.websocket("/ws/stream")
async def stream(ws: WebSocket) -> None:
    await ws.accept()
    q = await hub.register()
    receive_task: asyncio.Task | None = None
    try:
        await ws.send_json({"topic": "hello", "payload": {"message": "connected"}, "ts": _now()})
        receive_task = asyncio.create_task(ws.receive_text())
        while True:
            event_task = asyncio.create_task(q.get())
            try:
                done, _ = await asyncio.wait(
                    {event_task, receive_task},
                    timeout=25.0,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if receive_task in done:
                    # Raises WebSocketDisconnect when the browser goes away.
                    receive_task.result()
                    receive_task = asyncio.create_task(ws.receive_text())

                if event_task in done:
                    event = event_task.result()
                else:
                    # Keepalive so proxies/browsers don't drop an idle socket.
                    event = {"topic": "ping", "payload": {}, "ts": _now()}

                await ws.send_json(event)
            finally:
                # Queue.get() must be both cancelled and awaited. Otherwise a browser
                # disconnect or dev-server reload can destroy it while still pending.
                if not event_task.done():
                    event_task.cancel()
                await asyncio.gather(event_task, return_exceptions=True)
    except asyncio.CancelledError:
        raise
    except (WebSocketDisconnect, RuntimeError, OSError):
        # Client went away: receive raises WebSocketDisconnect, while a send on a
        # closed transport raises RuntimeError/OSError. Both just mean "stop streaming".
        pass
    finally:
        if receive_task and not receive_task.done():
            receive_task.cancel()
        if receive_task:
            await asyncio.gather(receive_task, return_exceptions=True)
        hub.unregister(q)
