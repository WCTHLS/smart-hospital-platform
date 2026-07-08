"""Realtime hub — bridges the synchronous domain event bus to async WebSocket clients.

The event bus publishes from request/worker threads; WebSocket sends must happen on the event
loop. The hub captures the running loop at startup and uses ``call_soon_threadsafe`` to hand each
event to every connected client's asyncio queue.
"""
from __future__ import annotations

import asyncio
import logging

from app.core.events import DomainEvent

logger = logging.getLogger("aarogya.realtime")


class RealtimeHub:
    def __init__(self) -> None:
        self._queues: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def on_event(self, event: DomainEvent) -> None:
        """Fan out a domain event to all connected clients. Safe to call from any thread."""
        if self._loop is None:
            return
        data = event.as_dict()
        for q in list(self._queues):
            try:
                self._loop.call_soon_threadsafe(q.put_nowait, data)
            except (RuntimeError, asyncio.QueueFull):
                pass

    async def register(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=200)
        self._queues.add(q)
        return q

    def unregister(self, q: asyncio.Queue) -> None:
        self._queues.discard(q)

    @property
    def clients(self) -> int:
        return len(self._queues)


hub = RealtimeHub()
