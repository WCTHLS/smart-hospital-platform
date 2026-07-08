"""Command Center module — live operational KPIs, event stream and audit trail."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.ai import agents
from app.core.database import get_db
from app.core.events import bus

router = APIRouter(prefix="/api/v1", tags=["command-center"])


@router.get("/command-center/metrics")
def metrics(db: Session = Depends(get_db)) -> dict:
    today = date.today().isoformat()

    patients_today = db.scalar(
        select(func.count()).select_from(models.Encounter)
        .where(func.date(models.Encounter.arrival_ts) == today)
    ) or 0
    in_queue = db.scalar(
        select(func.count()).select_from(models.Token).where(models.Token.status == "WAITING")
    ) or 0
    avg_wait = db.scalar(
        select(func.avg(models.Token.eta_minutes)).where(models.Token.status == "WAITING")
    )
    door_to_doctor = int(avg_wait) if avg_wait else 13

    # Compliance gaps: active encounters without an approved note
    active_ids = set(db.scalars(
        select(models.Encounter.encounter_id).where(models.Encounter.status.in_(["TRIAGED", "IN_CONSULT"]))))
    approved_enc = set(db.scalars(
        select(models.ClinicalNote.encounter_id).where(models.ClinicalNote.status == "APPROVED")))
    compliance_gaps = len(active_ids - approved_enc)

    # Queue by department
    dept_rows = db.execute(
        select(models.Token.department, func.count()).where(models.Token.status == "WAITING")
        .group_by(models.Token.department)
    ).all()
    queue_by_department = {(d or "Unassigned"): c for d, c in dept_rows}

    # Low stock
    low_rows = db.scalars(
        select(models.PharmacyStock)
        .where((models.PharmacyStock.quantity_available - models.PharmacyStock.quantity_reserved) < 15)
        .limit(5)
    ).all()
    low_stock = {s.drug_name: s.quantity_available - s.quantity_reserved for s in low_rows}

    ai = agents.command_center_agent({
        "lab_tat_minutes": 0, "low_stock": low_stock,
        "queue_depth": in_queue, "compliance_gaps": compliance_gaps,
    })

    return {
        "headline": {
            "patients_today": patients_today,
            "door_to_doctor_min": door_to_doctor,
            "in_queue": in_queue,
            "compliance_gaps": compliance_gaps,
        },
        "queue_by_department": queue_by_department,
        "low_stock": low_stock,
        "alerts": ai["result"]["alerts"],
        "ai_source": ai["source"],
    }


@router.get("/events")
def events(limit: int = 40) -> dict:
    return {"events": bus.recent(limit=limit)}


@router.get("/audit")
def audit_trail(limit: int = 40, db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(models.AuditLog).order_by(models.AuditLog.event_ts.desc()).limit(limit)).all()
    return {"audit": [
        {"action": r.action, "actor_role": r.actor_role, "entity_type": r.entity_type,
         "entity_id": r.entity_id, "consent_id": r.consent_id, "ts": r.event_ts.isoformat(),
         "metadata": r.audit_metadata}
        for r in rows
    ]}
