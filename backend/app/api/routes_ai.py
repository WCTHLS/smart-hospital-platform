"""AI utility routes — model status, standalone intake preview, compliance check."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
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
    return {
        "ai_enabled": settings.ai_enabled,
        "llm_available": available,
        "model": settings.ollama_model if available else None,
        "mode": "llm" if available else "deterministic-fallback",
        "message": ("Self-hosted LLM connected." if available
                    else "Running on the deterministic clinical engine (no GPU required)."),
    }


@router.post("/intake")
def intake_preview(body: IntakeRequest) -> dict:
    """Standalone intake preview used by the patient chat before an encounter exists."""
    return agents.intake_agent(body.symptom_text, duration=body.duration)


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
