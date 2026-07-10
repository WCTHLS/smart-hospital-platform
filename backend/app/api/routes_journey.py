"""Journey module — Access & Identity, Consent, Patient 360, Intake & Triage, Queue & Token.

Maps to services: Identity & Consent, Registration/EMPI, Patient 360, Intake & Triage, Queue & Token.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.ai import agents
from app.core.database import get_db
from app.core.events import Topics, bus
from app.core.security import audit, require_active_consent
from app.schemas import CheckInRequest, ConsentRequest, IdentityVerifyRequest, TriageRequest

router = APIRouter(prefix="/api/v1", tags=["journey"])

_ROOMS = {
    "General Medicine": ("Room 3", "Floor 2"),
    "Cardiology": ("Room 7", "Floor 3"),
    "Pulmonology": ("Room 5", "Floor 3"),
    "Paediatrics": ("Room 2", "Floor 1"),
    "Orthopaedics": ("Room 9", "Floor 2"),
    "Dermatology": ("Room 4", "Floor 1"),
}

# Cache to prevent hitting Gemini API 429 Rate Limits
_SUMMARY_CACHE: dict[str, dict] = {}


def _patient_brief(p: models.Patient) -> dict:
    return {
        "patient_id": p.patient_id,
        "name": p.full_name,
        "age": p.age,
        "gender": p.gender,
        "abha_number": p.abha_number,
        "abha_address": p.abha_address,
        "mrn": p.mrn,
        "blood_group": p.blood_group,
        "mobile": p.mobile,
    }


def _get_patient(db: Session, patient_id: str) -> models.Patient:
    p = db.get(models.Patient, patient_id)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


def _get_encounter(db: Session, encounter_id: str) -> models.Encounter:
    e = db.get(models.Encounter, encounter_id)
    if not e:
        raise HTTPException(404, "Encounter not found")
    return e


# --------------------------------------------------------------------------------- Check-in
@router.post("/checkin")
def check_in(body: CheckInRequest, db: Session = Depends(get_db)) -> dict:
    patient: models.Patient | None = None
    if body.abha_number:
        patient = db.scalar(select(models.Patient).where(models.Patient.abha_number == body.abha_number))
    if not patient and body.mrn:
        patient = db.scalar(select(models.Patient).where(models.Patient.mrn == body.mrn))
    if not patient and body.mobile:
        patient = db.scalar(select(models.Patient).where(models.Patient.mobile == body.mobile))

    created = False
    if not patient:
        created = True
        patient = models.Patient(
            first_name=body.first_name or "New",
            last_name="Patient" if not body.first_name else None,
            abha_number=body.abha_number,
            mobile=body.mobile,
            mrn=body.mrn,
        )
        db.add(patient)
        db.flush()

    encounter = models.Encounter(
        patient_id=patient.patient_id, channel=body.channel, status="CHECKED_IN"
    )
    db.add(encounter)
    db.flush()

    audit(db, actor_id=patient.patient_id, actor_role="PATIENT", action="CHECK_IN",
          entity_type="encounter", entity_id=encounter.encounter_id, metadata={"channel": body.channel})
    db.commit()
    bus.publish(Topics.PATIENT_CHECKED_IN, {"encounter_id": encounter.encounter_id, "channel": body.channel})

    return {
        "patient": _patient_brief(patient),
        "encounter_id": encounter.encounter_id,
        "status": encounter.status,
        "new_patient": created,
        "reason": body.reason,
    }


# --------------------------------------------------------------------------------- Identity
@router.post("/identity/verify")
def verify_identity(body: IdentityVerifyRequest, db: Session = Depends(get_db)) -> dict:
    field = {"ABHA": models.Patient.abha_number, "MRN": models.Patient.mrn, "OTP": models.Patient.mobile}
    col = field.get(body.method.upper())
    if col is None:
        raise HTTPException(400, "method must be ABHA, MRN or OTP")
    patient = db.scalar(select(models.Patient).where(col == body.value))
    if not patient:
        raise HTTPException(404, "No patient matched — please register at check-in")
    if not patient.empi_id:
        patient.empi_id = f"EMPI-{patient.patient_id[:8].upper()}"
    audit(db, actor_id=patient.patient_id, actor_role="SYSTEM", action="IDENTITY_VERIFIED",
          entity_type="patient", entity_id=patient.patient_id, metadata={"method": body.method})
    db.commit()
    bus.publish(Topics.IDENTITY_VERIFIED, {"patient_id": patient.patient_id, "method": body.method})
    return {"verified": True, "empi_id": patient.empi_id, "patient": _patient_brief(patient)}


# --------------------------------------------------------------------------------- Consent
@router.post("/consent")
def create_consent(body: ConsentRequest, db: Session = Depends(get_db)) -> dict:
    _get_patient(db, body.patient_id)
    now = datetime.now(timezone.utc)
    consent = models.ConsentArtifact(
        patient_id=body.patient_id, purpose=body.purpose, hip_id=body.hip_id, hiu_id=body.hiu_id,
        status="GRANTED", valid_from=now, valid_to=now + timedelta(hours=body.hours),
    )
    db.add(consent)
    audit(db, actor_id=body.patient_id, actor_role="PATIENT", action="CONSENT_GRANTED",
          entity_type="consent", entity_id=consent.consent_id, consent_id=consent.consent_id,
          metadata={"purpose": body.purpose, "hours": body.hours})
    db.commit()
    bus.publish(Topics.CONSENT_GRANTED, {"patient_id": body.patient_id, "consent_id": consent.consent_id})
    return {"consent_id": consent.consent_id, "status": consent.status,
            "valid_to": consent.valid_to.isoformat()}


# --------------------------------------------------------------------------------- Patient 360
@router.get("/patients/{patient_id}/patient360")
def patient_360(patient_id: str, db: Session = Depends(get_db)) -> dict:
    patient = _get_patient(db, patient_id)
    consent_id = require_active_consent(db, patient_id)  # enforcement point

    encounters = db.scalars(
        select(models.Encounter).where(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.arrival_ts.desc()).limit(5)
    ).all()
    enc_ids = [e.encounter_id for e in encounters]

    latest_vitals = None
    if enc_ids:
        latest_vitals = db.scalar(
            select(models.Vitals).where(models.Vitals.encounter_id.in_(enc_ids))
            .order_by(models.Vitals.captured_ts.desc())
        )

    notes = db.scalars(
        select(models.ClinicalNote).where(models.ClinicalNote.encounter_id.in_(enc_ids or [""]))
        .where(models.ClinicalNote.status == "APPROVED")
        .order_by(models.ClinicalNote.created_ts.desc()).limit(5)
    ).all()

    recent_results = db.scalars(
        select(models.LabResult).join(models.LabOrder, models.LabResult.lab_order_id == models.LabOrder.lab_order_id)
        .where(models.LabOrder.patient_id == patient_id)
        .order_by(models.LabResult.resulted_ts.desc()).limit(8)
    ).all()

    active_meds: list[str] = []
    for rx in db.scalars(
        select(models.Prescription).where(models.Prescription.patient_id == patient_id)
        .where(models.Prescription.status == "APPROVED")
        .order_by(models.Prescription.created_ts.desc()).limit(3)
    ):
        active_meds.extend(f"{i.drug_name} {i.dose or ''}".strip() for i in rx.items)

    audit(db, actor_id="copilot", actor_role="SYSTEM", action="PATIENT360_READ",
          entity_type="patient", entity_id=patient_id, consent_id=consent_id)
    db.commit()
    bus.publish(Topics.PATIENT360_ASSEMBLED, {"patient_id": patient_id})

    brief = _patient_brief(patient)
    allergies_list = [
        {"substance": a.substance, "drug_class": a.drug_class, "severity": a.severity, "reaction": a.reaction}
        for a in patient.allergies
    ]
    formatted_notes = [{"date": n.created_ts.date().isoformat(), "text": n.final_text} for n in notes]
    vitals_payload = None if not latest_vitals else {
        "bp": f"{latest_vitals.bp_systolic}/{latest_vitals.bp_diastolic}",
        "spo2": latest_vitals.spo2, "heart_rate": latest_vitals.heart_rate,
        "temperature": latest_vitals.temperature, "bmi": latest_vitals.bmi,
    }

    summary_res = None
    if patient.summary:
        summary_res = {
            "result": {"summary": patient.summary},
            "agent": "Patient History Summary",
            "source": "database"
        }

    return {
        "patient": brief,
        "allergies": allergies_list,
        "active_medications": active_meds,
        "latest_vitals": vitals_payload,
        "recent_notes": formatted_notes,
        "recent_results": [
            {"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag,
             "date": r.resulted_ts.date().isoformat()}
            for r in recent_results
        ],
        "encounters": [
            {"encounter_id": e.encounter_id, "date": e.arrival_ts.date().isoformat(),
             "department": e.department, "status": e.status}
            for e in encounters
        ],
        "consent_id": consent_id,
        "ai_summary": summary_res,
    }


@router.post("/patients/{patient_id}/summary")
def generate_patient_summary(patient_id: str, db: Session = Depends(get_db)) -> dict:
    """Explicitly generate or refresh the AI-drafted patient summary and save it to the DB."""
    patient = _get_patient(db, patient_id)
    
    # Fetch all clinical details needed for summary
    encounters = db.scalars(
        select(models.Encounter).where(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.arrival_ts.desc()).limit(5)
    ).all()
    enc_ids = [e.encounter_id for e in encounters]

    latest_vitals = None
    if enc_ids:
        latest_vitals = db.scalar(
            select(models.Vitals).where(models.Vitals.encounter_id.in_(enc_ids))
            .order_by(models.Vitals.captured_ts.desc())
        )

    notes = db.scalars(
        select(models.ClinicalNote).where(models.ClinicalNote.encounter_id.in_(enc_ids or [""]))
        .where(models.ClinicalNote.status == "APPROVED")
        .order_by(models.ClinicalNote.created_ts.desc()).limit(5)
    ).all()

    active_meds: list[str] = []
    for rx in db.scalars(
        select(models.Prescription).where(models.Prescription.patient_id == patient_id)
        .where(models.Prescription.status == "APPROVED")
        .order_by(models.Prescription.created_ts.desc()).limit(3)
    ):
        active_meds.extend(f"{i.drug_name} {i.dose or ''}".strip() for i in rx.items)

    brief = _patient_brief(patient)
    allergies_list = [
        {"substance": a.substance, "drug_class": a.drug_class, "severity": a.severity, "reaction": a.reaction}
        for a in patient.allergies
    ]
    formatted_notes = [{"date": n.created_ts.date().isoformat(), "text": n.final_text} for n in notes]
    vitals_payload = None if not latest_vitals else {
        "bp": f"{latest_vitals.bp_systolic}/{latest_vitals.bp_diastolic}",
        "spo2": latest_vitals.spo2, "heart_rate": latest_vitals.heart_rate,
        "temperature": latest_vitals.temperature, "bmi": latest_vitals.bmi,
    }

    summary_res = agents.patient_summary_agent(
        brief, allergies_list, active_meds, formatted_notes, vitals_payload
    )
    
    # If it succeeded, save to database
    summary_text = summary_res.get("result", {}).get("summary")
    if summary_text and summary_text != "AI responses did not give any response":
        patient.summary = summary_text
        db.commit()

    return summary_res


# --------------------------------------------------------------------------------- Intake + Triage + Token
@router.post("/encounters/{encounter_id}/triage")
def run_triage(encounter_id: str, body: TriageRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _get_encounter(db, encounter_id)
    patient = _get_patient(db, encounter.patient_id)

    intake = agents.intake_agent(body.symptom_text, duration=body.duration)
    chief = intake["result"]["chief_complaint"]
    summary = intake["result"]["symptom_summary"]

    vitals_dict: dict = {}
    if body.vitals:
        vitals_dict = body.vitals.model_dump(exclude_none=True)
        v = models.Vitals(encounter_id=encounter_id, **vitals_dict)
        if v.weight_kg and v.height_cm:
            v.bmi = round(v.weight_kg / ((v.height_cm / 100) ** 2), 1)
        db.add(v)

    triage = agents.triage_agent(chief, summary, vitals_dict, patient.age)
    tr = triage["result"]

    doctor = db.scalar(
        select(models.Staff).where(models.Staff.role == "DOCTOR")
        .where(models.Staff.specialty == tr["specialty"]).where(models.Staff.available.is_(True))
    ) or db.scalar(select(models.Staff).where(models.Staff.role == "DOCTOR"))

    triage_row = models.Triage(
        encounter_id=encounter_id, chief_complaint=chief, symptom_summary=summary,
        acuity_level=tr["acuity_level"], specialty=tr["specialty"],
        recommended_doctor_id=doctor.staff_id if doctor else None,
        red_flag=tr["red_flag"], red_flag_reason=tr.get("red_flag_reason"),
    )
    db.add(triage_row)

    encounter.department = tr["specialty"]
    encounter.doctor_id = doctor.staff_id if doctor else None
    encounter.status = "EMERGENCY" if tr["red_flag"] and tr["acuity_level"] == "1" else "TRIAGED"

    waiting = db.scalar(
        select(func.count()).select_from(models.Token).where(models.Token.status == "WAITING")
    ) or 0
    total_tokens = db.scalar(select(func.count()).select_from(models.Token)) or 0
    room, floor = _ROOMS.get(tr["specialty"], ("Room 1", "Floor 1"))
    token = models.Token(
        encounter_id=encounter_id, token_number=f"A-{total_tokens + 42:03d}",
        department=tr["specialty"], room=room, floor=floor,
        eta_minutes=6 + waiting * 4, status="WAITING",
    )
    db.add(token)

    audit(db, actor_id="triage-agent", actor_role="AI", action="TRIAGE_COMPLETED",
          entity_type="encounter", entity_id=encounter_id,
          metadata={"acuity": tr["acuity_level"], "specialty": tr["specialty"], "red_flag": tr["red_flag"]})
    db.commit()

    bus.publish(Topics.TRIAGE_COMPLETED, {"encounter_id": encounter_id, "acuity": tr["acuity_level"],
                                          "specialty": tr["specialty"], "red_flag": tr["red_flag"]})
    bus.publish(Topics.TOKEN_ISSUED, {"encounter_id": encounter_id, "token": token.token_number})

    return {
        "intake": intake,
        "triage": triage,
        "vitals": vitals_dict or None,
        "doctor": None if not doctor else {"id": doctor.staff_id, "name": doctor.name, "specialty": doctor.specialty},
        "token": {"number": token.token_number, "department": token.department, "room": token.room,
                  "floor": token.floor, "eta_minutes": token.eta_minutes},
        "encounter_status": encounter.status,
    }


@router.get("/encounters/{encounter_id}")
def get_encounter(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    e = _get_encounter(db, encounter_id)
    p = _get_patient(db, e.patient_id)
    triage = db.scalar(select(models.Triage).where(models.Triage.encounter_id == encounter_id)
                       .order_by(models.Triage.created_ts.desc()))
    token = db.scalar(select(models.Token).where(models.Token.encounter_id == encounter_id)
                      .order_by(models.Token.issued_ts.desc()))

    # Fetch vitals
    vitals = db.scalar(select(models.Vitals).where(models.Vitals.encounter_id == encounter_id)
                       .order_by(models.Vitals.captured_ts.desc()))

    # Fetch clinical notes
    note = db.scalar(select(models.ClinicalNote).where(models.ClinicalNote.encounter_id == encounter_id)
                      .order_by(models.ClinicalNote.created_ts.desc()))

    # Fetch prescriptions
    rx = db.scalar(select(models.Prescription).where(models.Prescription.encounter_id == encounter_id)
                    .order_by(models.Prescription.created_ts.desc()))
    rx_items = []
    if rx:
        rx_items = db.scalars(select(models.PrescriptionItem).where(models.PrescriptionItem.rx_id == rx.rx_id)).all()

    # Fetch lab orders and results
    lab_orders = db.scalars(select(models.LabOrder).where(models.LabOrder.encounter_id == encounter_id)).all()
    labs = []
    for lo in lab_orders:
        results = db.scalars(select(models.LabResult).where(models.LabResult.lab_order_id == lo.lab_order_id)).all()
        labs.append({
            "lab_order_id": lo.lab_order_id,
            "test": lo.test_name,
            "status": lo.status,
            "results": [
                {"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag}
                for r in results
            ]
        })

    return {
        "encounter_id": e.encounter_id, "status": e.status, "department": e.department,
        "channel": e.channel, "arrival": e.arrival_ts.isoformat(),
        "notes": e.notes,
        "patient": _patient_brief(p),
        "triage": None if not triage else {
            "chief_complaint": triage.chief_complaint, "acuity": triage.acuity_level,
            "specialty": triage.specialty, "red_flag": triage.red_flag},
        "token": None if not token else {"number": token.token_number, "room": token.room,
                                         "floor": token.floor, "eta_minutes": token.eta_minutes},
        "vitals": None if not vitals else {
            "bp": f"{vitals.bp_systolic}/{vitals.bp_diastolic}", "spo2": vitals.spo2,
            "heart_rate": vitals.heart_rate, "temperature": vitals.temperature, "bmi": vitals.bmi
        },
        "note": None if not note else {
            "note_id": note.note_id, "note_type": note.note_type, "final_text": note.final_text,
            "icd10_codes": note.icd10_codes
        },
        "prescription": None if not rx else {
            "rx_id": rx.rx_id, "status": rx.status,
            "items": [
                {"drug_name": i.drug_name, "dose": i.dose, "frequency": i.frequency, "duration_days": i.duration_days}
                for i in rx_items
            ]
        },
        "labs": labs
    }


@router.get("/doctors")
def list_doctors(db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all staff with the DOCTOR role."""
    doctors = db.scalars(select(models.Staff).where(models.Staff.role == "DOCTOR")).all()
    return [{
        "doctor_id": d.staff_id,
        "name": d.name,
        "department": d.department,
        "specialty": d.specialty,
        "available": d.available,
        "experience_years": d.experience_years or 0,
        "room": d.room or "Room 1",
        "floor": d.floor or "Floor 1",
        "opd_fee": d.opd_fee or 500.0,
    } for d in doctors]


@router.get("/doctors/{doctor_id}/encounters")
def list_doctor_encounters(doctor_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all active encounters (queue) for a specific doctor."""
    doctor = db.get(models.Staff, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    stmt = (
        select(models.Encounter)
        .where(
            (models.Encounter.doctor_id == doctor_id) |
            ((models.Encounter.doctor_id.is_(None)) & (models.Encounter.department == doctor.department))
        )
        .where(models.Encounter.status.in_(["CHECKED_IN", "TRIAGED", "IN_CONSULT", "EMERGENCY"]))
        .order_by(models.Encounter.arrival_ts.desc())
    )
    encounters = db.scalars(stmt).all()
    out = []
    for e in encounters:
        p = db.get(models.Patient, e.patient_id)
        token = db.scalar(select(models.Token).where(models.Token.encounter_id == e.encounter_id)
                          .order_by(models.Token.issued_ts.desc()))
        triage = db.scalar(select(models.Triage).where(models.Triage.encounter_id == e.encounter_id)
                           .order_by(models.Triage.created_ts.desc()))
        has_results = db.scalar(
            select(models.LabOrder)
            .where(models.LabOrder.encounter_id == e.encounter_id)
            .where(models.LabOrder.status == "RESULTED")
            .limit(1)
        ) is not None

        out.append({
            "encounter_id": e.encounter_id,
            "status": e.status,
            "visit_type": e.visit_type,
            "arrival": e.arrival_ts.isoformat(),
            "is_reconsult": has_results,
            "patient": {
                "patient_id": p.patient_id,
                "name": p.full_name,
                "age": p.age,
                "gender": p.gender,
                "mobile": p.mobile,
                "mrn": p.mrn,
            } if p else None,
            "token": {
                "number": token.token_number,
                "room": token.room,
                "floor": token.floor,
                "eta_minutes": token.eta_minutes
            } if token else None,
            "triage": {
                "chief_complaint": triage.chief_complaint if triage else None,
                "acuity": triage.acuity_level if triage else None,
                "red_flag": triage.red_flag if triage else False,
            } if triage else None,
        })
    return out

