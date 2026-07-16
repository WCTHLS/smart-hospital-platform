"""Twilio Verify integration for patient mobile OTP authentication."""
from __future__ import annotations

import httpx
from fastapi import HTTPException

from app.core.config import settings


def _ensure_configured() -> None:
    if not settings.twilio_verify_configured:
        raise HTTPException(503, "Twilio Verify is not configured")


def _phone_number(mobile: str) -> str:
    return f"{settings.twilio_country_code.strip()}{mobile}"


def _twilio_post(resource: str, data: dict[str, str]) -> dict:
    _ensure_configured()
    url = (
        "https://verify.twilio.com/v2/Services/"
        f"{settings.twilio_verify_service_sid.strip()}/{resource}"
    )
    try:
        response = httpx.post(
            url,
            data=data,
            auth=(settings.twilio_account_sid.strip(), settings.twilio_auth_token.strip()),
            timeout=15.0,
        )
    except httpx.RequestError as exc:
        raise HTTPException(503, "Unable to contact Twilio Verify") from exc

    if response.is_error:
        if response.status_code == 429:
            raise HTTPException(429, "Too many OTP attempts. Please try again later")
        try:
            message = response.json().get("message")
        except ValueError:
            message = None
        raise HTTPException(502, message or "Twilio Verify rejected the request")
    return response.json()


def send_otp(mobile: str) -> dict:
    if not settings.twilio_verify_enabled:
        return {"sent": True, "status": "simulated", "mode": "development"}
    verification = _twilio_post(
        "Verifications",
        {"To": _phone_number(mobile), "Channel": "sms"},
    )
    return {"sent": True, "status": verification.get("status", "pending")}


def check_otp(mobile: str, code: str) -> dict:
    if not settings.twilio_verify_enabled:
        return {"verified": True, "status": "approved", "mode": "development"}
    if len(code) < 4:
        raise HTTPException(400, "OTP must contain at least 4 digits")
    try:
        verification = _twilio_post(
            "VerificationCheck",
            {"To": _phone_number(mobile), "Code": code},
        )
    except HTTPException as exc:
        if exc.status_code == 502:
            raise HTTPException(400, "Invalid or expired OTP") from exc
        raise
    if verification.get("status") != "approved":
        raise HTTPException(400, "Invalid or expired OTP")
    return {"verified": True, "status": "approved"}
