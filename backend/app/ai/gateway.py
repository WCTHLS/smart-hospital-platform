"""Model Gateway — a single seam in front of every LLM call.

Talks to a self-hosted Ollama server when reachable. If the server is down, the model is missing,
or AI is disabled, `generate()` returns ``None`` and callers fall back to the deterministic clinical
engine. This is what lets the whole platform run with zero GPU while staying upgrade-ready.
"""
from __future__ import annotations

import json
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("aarogya.ai.gateway")


class ModelGateway:
    def __init__(self) -> None:
        self._base = settings.ollama_base_url.rstrip("/")
        self._model = settings.ollama_model
        self._timeout = settings.ai_timeout_seconds
        self._known_available: bool | None = None

    def available(self) -> bool:
        """Cheap reachability probe (cached until process restart on success)."""
        if not settings.ai_enabled:
            return False
        if self._known_available:
            return True
        try:
            resp = httpx.get(f"{self._base}/api/tags", timeout=2.0)
            self._known_available = resp.status_code == 200
        except Exception:  # noqa: BLE001
            self._known_available = False
        return bool(self._known_available)

    def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
        temperature: float = 0.2,
    ) -> str | None:
        """Return model text, or ``None`` if the LLM is unavailable/errored."""
        if not self.available():
            return None
        body: dict[str, object] = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            body["system"] = system
        if json_mode:
            body["format"] = "json"
        try:
            resp = httpx.post(f"{self._base}/api/generate", json=body, timeout=self._timeout)
            resp.raise_for_status()
            return (resp.json().get("response") or "").strip() or None
        except Exception:  # noqa: BLE001
            logger.warning("LLM generate failed; using deterministic fallback", exc_info=False)
            self._known_available = None  # re-probe next time
            return None

    def generate_json(
        self, prompt: str, *, system: str | None = None
    ) -> dict | list | None:
        """Generate and parse JSON. Returns ``None`` on any failure."""
        raw = self.generate(prompt, system=system, json_mode=True)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("{"), raw.rfind("}")
            if 0 <= start < end:
                try:
                    return json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    return None
        return None


gateway = ModelGateway()
