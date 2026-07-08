"""Always-on guardrails wrapped around every agent output.

- PII minimisation before any text leaves for the model.
- Human-in-the-loop envelope: clinical outputs are *drafts* that require explicit approval.
- Source citation + safety flags travel with the payload for the UI and the audit trail.
"""
from __future__ import annotations

import re
from typing import Any

_PHONE = re.compile(r"\b(?:\+?91[-\s]?)?[6-9]\d{9}\b")
_ABHA = re.compile(r"\b\d{2}-\d{4}-\d{4}-\d{4}\b")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")


def redact_pii(text: str) -> str:
    """Mask direct identifiers before sending text to the model gateway."""
    if not text:
        return text
    text = _ABHA.sub("[ABHA]", text)
    text = _PHONE.sub("[PHONE]", text)
    text = _EMAIL.sub("[EMAIL]", text)
    return text


def envelope(
    content: dict[str, Any],
    *,
    agent: str,
    needs_approval: bool,
    citations: list[str] | None = None,
    source: str = "deterministic-engine",
) -> dict[str, Any]:
    """Standard agent response envelope consumed by the API and UI."""
    return {
        "agent": agent,
        "needs_approval": needs_approval,
        "autonomous_action": False,  # platform invariant: agents never act autonomously
        "source": source,  # "llm:<model>" or "deterministic-engine"
        "citations": citations or [],
        "result": content,
    }
