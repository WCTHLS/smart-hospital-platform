"""AI utility routes — model status, standalone intake preview, compliance check."""
from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.ai import agents
from app.ai.gateway import gateway
from app.core.config import settings
from app.core.database import get_db
from app.schemas import IntakeRequest

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.get("/status")
def ai_status() -> dict:
    available = gateway.available()
    model_name = gateway.active_model_name()
    
    # Determine the display message based on active keys
    if settings.gemini_api_key:
        msg = "Gemini API connected."
    elif settings.grok_api_key or settings.grok_api:
        msg = "xAI Grok API connected."
    else:
        msg = "Self-hosted LLM connected."

    return {
        "ai_enabled": settings.ai_enabled,
        "llm_available": available,
        "model": model_name if available else None,
        "mode": "llm" if available else "deterministic-fallback",
        "message": msg if available else "Running on the deterministic clinical engine (no GPU required).",
    }


@router.post("/intake")
def intake_preview(body: IntakeRequest) -> dict:
    """Standalone intake preview used by the patient chat before an encounter exists."""
    return agents.intake_agent(body.symptom_text, duration=body.duration)


def _extract_registration_fields(transcript: str) -> dict:
    """Pull structured new-patient-registration fields out of a free-form spoken transcript.
    Uses the LLM gateway when available (much more reliable for names/addresses/free text);
    falls back to a minimal, best-effort regex pass (mobile number + gender only) so the
    voice feature still does *something* useful when no LLM is configured."""
    today = datetime.now(timezone.utc).date().isoformat()
    if gateway.available():
        prompt = (
            f"Today's date is {today}. A hospital receptionist spoke the details below while "
            f"registering a new walk-in patient. Extract the details into ONLY a JSON object "
            f"with exactly these keys: first_name, last_name, mobile, dob, gender, blood_group, "
            f"address, allergies, reason.\n"
            f"Rules:\n"
            f"- dob must be \"YYYY-MM-DD\" or null. If only an age is stated (e.g. \"34 years old\"), "
            f"compute an approximate dob using today's date (month/day 01-01 if not given).\n"
            f"- mobile must be a 10-digit string or null.\n"
            f"- gender must be exactly \"MALE\", \"FEMALE\", \"OTHER\", or null.\n"
            f"- blood_group like \"O+\" or null if not mentioned.\n"
            f"- allergies is a short comma-separated string, or empty string if none mentioned.\n"
            f"- reason is the chief complaint / reason for the visit, or empty string if not mentioned.\n"
            f"- Use null for any field genuinely not present in the transcript — never invent details.\n\n"
            f"Transcript: \"{transcript}\""
        )
        parsed = gateway.generate_json(
            prompt, system="You are a precise medical-intake data extractor. Reply with JSON only, no prose, no markdown fences."
        )
        if isinstance(parsed, dict):
            return parsed

    fields: dict = {"reason": transcript}
    digits = re.sub(r"[^0-9]", "", transcript)
    for i in range(len(digits) - 9):
        candidate = digits[i : i + 10]
        if candidate[0] != "0":
            fields["mobile"] = candidate
            break
    lower = transcript.lower()
    if "female" in lower:
        fields["gender"] = "FEMALE"
    elif "male" in lower:
        fields["gender"] = "MALE"
    return fields


@router.post("/registration/voice-intake")
async def registration_voice_intake(audio: UploadFile = File(...)) -> dict:
    """Transcribe a short voice clip of a receptionist reading out a new patient's details
    (locally, via faster-whisper — no audio leaves this server) and, when an LLM is available,
    extract structured registration fields (name, mobile, dob, gender, blood group, address,
    allergies, reason for visit) so the New Patient Registration form can be auto-filled. Runs
    with no patient/encounter context since it's used BEFORE any patient record exists."""
    from app.ai import asr

    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    try:
        result = asr.transcribe_audio(data, suffix=suffix)
    except RuntimeError as err:
        raise HTTPException(503, str(err))
    transcript = result.get("text", "")
    fields = _extract_registration_fields(transcript) if transcript.strip() else {}
    return {"transcript": transcript, "fields": fields}


@router.get("/encounters/{encounter_id}/compliance")
def encounter_compliance(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter:
        raise HTTPException(404, "Encounter not found")
    notes = db.scalars(select(models.ClinicalNote).where(models.ClinicalNote.encounter_id == encounter_id)).all()
    approved = next((n for n in notes if n.status == "APPROVED"), None)
    vitals = db.scalar(select(models.Vitals).where(models.Vitals.encounter_id == encounter_id))
    consent = db.scalar(select(models.ConsentArtifact).where(models.ConsentArtifact.patient_id == encounter.patient_id)
                        .where(models.ConsentArtifact.status == "GRANTED"))
    rx = db.scalar(select(models.Prescription).where(models.Prescription.encounter_id == encounter_id))
    bundle = {
        "has_consent": consent is not None, "has_vitals": vitals is not None,
        "note_approved": approved is not None,
        "has_diagnosis": bool(approved and approved.icd10_codes),
        "has_prescription": rx is not None, "rx_approved": bool(rx and rx.status == "APPROVED"),
    }
    return agents.compliance_agent(bundle)
