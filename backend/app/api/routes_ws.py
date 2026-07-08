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
    await ws.send_json({"topic": "hello", "payload": {"message": "connected"}, "ts": _now()})
    try:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=25.0)
            except asyncio.TimeoutError:
                # keepalive so proxies/browsers don't drop an idle socket
                event = {"topic": "ping", "payload": {}, "ts": _now()}
            await ws.send_json(event)
    except (WebSocketDisconnect, RuntimeError):
        # Client went away: receive raises WebSocketDisconnect, while a send on a
        # closed transport raises RuntimeError. Both just mean "stop streaming".
        pass
    finally:
        hub.unregister(q)
