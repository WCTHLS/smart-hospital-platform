"""Validate the browser path: WebSocket + API through the Vite dev proxy (:5173)."""
from __future__ import annotations

import asyncio
import json

import httpx
import websockets


async def main() -> None:
    async with websockets.connect("ws://localhost:5173/ws/stream") as ws:
        hello = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
        assert hello["topic"] == "hello", hello
        async with httpx.AsyncClient() as c:
            r = await c.post(
                "http://localhost:5173/api/v1/checkin",
                json={"abha_number": "91-2345-6789-0123", "channel": "APP"},
            )
            r.raise_for_status()
        got = None
        for _ in range(6):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["topic"] not in ("hello", "ping"):
                got = msg
                break
        assert got is not None, "no event via proxy"
        print(f"PROXY_WS_OK · {got['topic']} {got['payload']}")


asyncio.run(main())
