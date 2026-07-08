"""In-process domain event bus.

A lightweight pub/sub that decouples domain modules (mirrors the Kafka topics in the
Solution Architecture). Swap this for a real broker later without touching call sites.
It also keeps a rolling in-memory feed that powers the Command Center live stream.
"""
from __future__ import annotations

import logging
from collections import deque
from collections.abc import Callable
from datetime import datetime, timezone
from threading import Lock
from typing import Any

logger = logging.getLogger("aarogya.events")

Handler = Callable[["DomainEvent"], None]


class DomainEvent:
    __slots__ = ("topic", "payload", "ts")

    def __init__(self, topic: str, payload: dict[str, Any]) -> None:
        self.topic = topic
        self.payload = payload
        self.ts = datetime.now(timezone.utc)

    def as_dict(self) -> dict[str, Any]:
        return {"topic": self.topic, "payload": self.payload, "ts": self.ts.isoformat()}


class EventBus:
    def __init__(self, feed_size: int = 200) -> None:
        self._subscribers: dict[str, list[Handler]] = {}
        self._feed: deque[DomainEvent] = deque(maxlen=feed_size)
        self._lock = Lock()

    def subscribe(self, topic: str, handler: Handler) -> None:
        self._subscribers.setdefault(topic, []).append(handler)

    def publish(self, topic: str, payload: dict[str, Any] | None = None) -> DomainEvent:
        event = DomainEvent(topic, payload or {})
        with self._lock:
            self._feed.appendleft(event)
        # Notify topic subscribers plus any wildcard ("*") subscribers (e.g. the realtime hub).
        for handler in [*self._subscribers.get(topic, []), *self._subscribers.get("*", [])]:
            try:
                handler(event)
            except Exception:  # noqa: BLE001 — never let a subscriber break the producer
                logger.exception("event handler failed for topic=%s", topic)
        logger.info("event %s %s", topic, payload)
        return event

    def recent(self, limit: int = 50, topics: set[str] | None = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._feed)
        if topics:
            items = [e for e in items if e.topic in topics]
        return [e.as_dict() for e in items[:limit]]


# Canonical topic names (kept in one place)
class Topics:
    PATIENT_CHECKED_IN = "patient.checkedin"
    IDENTITY_VERIFIED = "identity.verified"
    CONSENT_GRANTED = "consent.granted"
    CONSENT_REVOKED = "consent.revoked"
    PATIENT360_ASSEMBLED = "patient360.assembled"
    TRIAGE_COMPLETED = "triage.completed"
    TOKEN_ISSUED = "token.issued"
    NOTE_APPROVED = "note.approved"
    LABORDER_CREATED = "laborder.created"
    LABRESULT_PUBLISHED = "labresult.published"
    RESULT_ABNORMAL = "result.abnormal"
    PRESCRIPTION_APPROVED = "prescription.approved"
    INVOICE_GENERATED = "invoice.generated"
    PAYMENT_COMPLETED = "payment.completed"
    CLAIM_INITIATED = "claim.initiated"
    VISIT_DISCHARGED = "visit.discharged"
    COMPLIANCE_FLAGGED = "compliance.flagged"


bus = EventBus()
