"""Validate live WebSocket event delivery against the running server.

Run:  python scripts/ws_check.py   (backend venv active, server on :8000)
"""
from __future__ import annotations

import asyncio
import json

import httpx
import websockets


async def main() -> None:
    async with websockets.connect("ws://127.0.0.1:8000/ws/stream") as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["topic"] == "hello", hello
        async with httpx.AsyncClient() as c:
            r = await c.post(
                "http://127.0.0.1:8000/api/v1/checkin",
                json={"abha_number": "91-2345-6789-0123", "channel": "KIOSK"},
            )
            r.raise_for_status()
        got = None
        for _ in range(6):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["topic"] not in ("hello", "ping"):
                got = msg
                break
        assert got is not None, "no live event received over WebSocket"
        print(f"WS_OK · received live event: {got['topic']} {got['payload']}")


asyncio.run(main())
