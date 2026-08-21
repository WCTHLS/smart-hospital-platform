"""Journey module — Access & Identity, Consent, Patient 360, Intake & Triage, Queue & Token.

Maps to services: Identity & Consent, Registration/EMPI, Patient 360, Intake & Triage, Queue & Token.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import logging
import hashlib
import uuid
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select, case, nulls_last, or_
from sqlalchemy.orm import Session

from app import models, services
from app.ai import agents
from app.ai.knowledge import route_specialty
from app.api.routes_clinical import _check_and_discharge_lab_visit, _lab_category
from app.core.database import get_db
from app.core.events import Topics, bus
from app.core.security import audit, require_active_consent

logger = logging.getLogger("aarogya.journey")
from app.schemas import (
    CheckInRequest,
    ConsentRequest,
    AppointmentSlotsRequest,
    BookAppointmentRequest,
    IdentityVerifyRequest,
    MobileProfilesRequest,
    OtpSendRequest,
    OtpVerifyRequest,
    PatientBasicRegistrationRequest,
    PatientCheckAvailableRequest,
    PatientPhotoUpdateRequest,
    PatientProfileUpdateRequest,
    PatientRegistrationRequest,
    TriageRequest,
    TriageOverrideRequest,
)
from app.twilio_verify import check_otp, send_otp

router = APIRouter(prefix="/api/v1", tags=["journey"])

_ROOMS = {
    "General Medicine": ("Room 3", "Floor 2"),
    "Cardiology": ("Room 7", "Floor 3"),
    "Pulmonology": ("Room 5", "Floor 3"),
    "Paediatrics": ("Room 2", "Floor 1"),
    "Orthopaedics": ("Room 9", "Floor 2"),
    "Dermatology": ("Room 4", "Floor 1"),
    "Oncology": ("Room 12", "Floor 4"),
}

# Cache to prevent hitting Gemini API 429 Rate Limits
_SUMMARY_CACHE: dict[str, dict] = {}


def _issue_doctor_token(
    db: Session,
    encounter: models.Encounter,
    doctor: models.Staff,
    *,
    prefix: str = "A",
) -> models.Token:
    """Put a follow-up encounter directly in its assigned doctor's queue."""
    existing = db.scalar(
        select(models.Token)
        .where(models.Token.encounter_id == encounter.encounter_id)
        .where(models.Token.token_number.like(f"{prefix}-%"))
        .order_by(models.Token.issued_ts.desc())
    )
    if existing:
        return existing

    total = db.scalar(
        select(func.count())
        .select_from(models.Token)
        .where(models.Token.token_number.like(f"{prefix}-%"))
    ) or 0
    start = 501 if prefix == "E" else 42
    token = models.Token(
        encounter_id=encounter.encounter_id,
        token_number=f"{prefix}-{total + start:03d}",
        department=doctor.department or doctor.specialty or "Outpatient",
        room=doctor.room or ("Tele-Consult" if prefix == "E" else "Doctor consultation"),
        floor=doctor.floor or "Ground Floor",
        eta_minutes=10 if prefix == "E" else 6,
        status="WAITING",
    )
    db.add(token)
    return token


def _calculate_patients_ahead(db: Session, encounter_id: str) -> int:
    """Return the current encounter's queue position from persisted encounters."""
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter or encounter.status not in ["CHECKED_IN", "TRIAGED", "EMERGENCY"]:
        return 0

    if encounter.visit_type == "LAB":
        stmt = (
            select(models.Encounter)
            .where(models.Encounter.visit_type == "LAB")
            .where(models.Encounter.status == "CHECKED_IN")
            .order_by(models.Encounter.arrival_ts.asc())
        )
    elif encounter.status == "CHECKED_IN":
        # Before triage, every earlier standard walk-in/check-in is ahead,
        # regardless of the department the patient may later be assigned to.
        stmt = (
            select(models.Encounter)
            .where(models.Encounter.status == "CHECKED_IN")
            .where(models.Encounter.visit_type.notin_(["LAB", "E_CONSULT"]))
            .order_by(models.Encounter.arrival_ts.asc())
        )
    else:
        doctor_id = encounter.doctor_id
        department = encounter.department
        stmt = (
            select(models.Encounter)
            .outerjoin(models.Appointment, models.Appointment.appointment_id == models.Encounter.appointment_id)
            .outerjoin(models.Triage, models.Triage.encounter_id == models.Encounter.encounter_id)
            .where(models.Encounter.status.in_(["TRIAGED", "EMERGENCY"]))
        )
        if doctor_id:
            stmt = stmt.where(
                (models.Encounter.doctor_id == doctor_id) |
                ((models.Encounter.doctor_id.is_(None)) & (models.Encounter.department == department))
            )
        else:
            stmt = stmt.where(models.Encounter.department == department)
        stmt = stmt.order_by(
            case((models.Triage.red_flag == True, 0), else_=1),
            nulls_last(models.Triage.acuity_level.asc()),
            case(
                (models.Appointment.scheduled_start.isnot(None), models.Appointment.scheduled_start),
                else_=models.Encounter.arrival_ts
            ).asc()
        )

    waiting_encounters = db.scalars(stmt).all()
    return next(
        (position for position, item in enumerate(waiting_encounters) if item.encounter_id == encounter_id),
        0,
    )


def _calculate_live_eta(db: Session, encounter_id: str) -> int:
    """Calculate wait time dynamically based on active queue position."""
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter or encounter.status not in ["CHECKED_IN", "TRIAGED", "EMERGENCY"]:
        return 0
        
    if getattr(encounter, "visit_type", None) == "LAB":
        stmt = (
            select(models.Encounter)
            .where(models.Encounter.visit_type == "LAB")
            .where(models.Encounter.status == "CHECKED_IN")
            .order_by(models.Encounter.arrival_ts.asc())
        )
        waiting_labs = db.scalars(stmt).all()
        try:
            position = next(i for i, e in enumerate(waiting_labs) if e.encounter_id == encounter_id)
        except StopIteration:
            position = 0
        return position * 5
        
    doctor_id = encounter.doctor_id
    department = encounter.department
    
    stmt = (
        select(models.Encounter)
        .outerjoin(models.Appointment, models.Appointment.appointment_id == models.Encounter.appointment_id)
        .outerjoin(models.Triage, models.Triage.encounter_id == models.Encounter.encounter_id)
        .where(models.Encounter.status.in_(["CHECKED_IN", "TRIAGED", "EMERGENCY"]))
    )
    if doctor_id:
        stmt = stmt.where(
            (models.Encounter.doctor_id == doctor_id) |
            ((models.Encounter.doctor_id.is_(None)) & (models.Encounter.department == department))
        )
    else:
        stmt = stmt.where(models.Encounter.department == department)
        
    stmt = stmt.order_by(
        case((models.Triage.red_flag == True, 0), else_=1),
        nulls_last(models.Triage.acuity_level.asc()),
        case(
            (models.Appointment.scheduled_start.isnot(None), models.Appointment.scheduled_start),
            else_=models.Encounter.arrival_ts
        ).asc()
    )
    
    waiting_encounters = db.scalars(stmt).all()
    
    try:
        position = next(i for i, e in enumerate(waiting_encounters) if e.encounter_id == encounter_id)
    except StopIteration:
        position = 0
        
    return 6 + position * 4


def _patient_brief(p: models.Patient) -> dict:
    return {
        "patient_id": p.patient_id,
        "name": p.full_name,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "age": p.age,
        "dob": p.dob.isoformat() if p.dob else None,
        "gender": p.gender,
        "abha_number": p.abha_number,
        "abha_address": p.abha_address,
        "mrn": p.mrn,
        "blood_group": p.blood_group,
        "mobile": p.mobile,
        "email": p.email,
        "address": p.address,
        "profile_photo": p.profile_photo,
        "summary": p.summary,
    }


def _patient_match(p: models.Patient) -> dict:
    return {
        "patient_id": p.patient_id,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "name": p.full_name,
        "dob": p.dob.isoformat() if p.dob else None,
        "mobile": p.mobile,
        "email": p.email,
        "gender": p.gender,
        "blood_group": p.blood_group,
        "address": p.address,
        "mrn": p.mrn,
        "abha_number": p.abha_number,
        "abha_address": p.abha_address,
        "profile_photo": p.profile_photo,
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


def _add_profile_details(
    db: Session,
    patient: models.Patient,
    issues: list,
    documents: list,
) -> None:
    for issue in issues:
        db.add(models.PatientIssue(patient_id=patient.patient_id, **issue.model_dump()))
    for document in documents:
        db.add(models.Document(patient_id=patient.patient_id, **document.model_dump()))


def _blood_group_value(value: str) -> str:
    return "UNK" if value.strip().lower() == "unknown" else value


def _parse_hhmm(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def _combine_local_day(day: date, hhmm: str) -> datetime:
    return datetime.combine(day, _parse_hhmm(hhmm), tzinfo=ZoneInfo("Asia/Kolkata"))


def _hospital_today() -> date:
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _appointment_local_date(value: datetime) -> date:
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(ZoneInfo("Asia/Kolkata")).date()


def _appointment_brief(appointment: models.Appointment, doctor: models.Staff | None, db: Session | None = None) -> dict:
    appt_status = appointment.status
    if db and appointment.encounter_id:
        enc = db.get(models.Encounter, appointment.encounter_id)
        if enc and enc.status and enc.appointment_id == appointment.appointment_id:
            appt_status = enc.status
    return {
        "appointment_id": appointment.appointment_id,
        "encounter_id": appointment.encounter_id,
        "patient_id": appointment.patient_id,
        "doctor": None if not doctor else {
            "doctor_id": doctor.staff_id,
            "name": doctor.name,
            "department": doctor.department,
            "specialty": doctor.specialty,
            "room": doctor.room,
            "floor": doctor.floor,
        },
        "department": appointment.department,
        "specialty": appointment.specialty,
        "reason": appointment.reason,
        "appointment_type": appointment.appointment_type,
        "scheduled_start": appointment.scheduled_start.isoformat(),
        "scheduled_end": appointment.scheduled_end.isoformat(),
        "status": appt_status,
        "channel": appointment.channel,
        "opd_fee": doctor.opd_fee if doctor else None,
    }


def _default_schedules_for_specialty(db: Session, specialty: str, day_of_week: int) -> None:
    doctors = db.scalars(
        select(models.Staff)
        .where(models.Staff.role == "DOCTOR")
        .where(models.Staff.available.is_(True))
        .where(models.Staff.specialty == specialty)
        .order_by(models.Staff.name)
    ).all()
    for index, doctor in enumerate(doctors):
        db.add(models.DoctorSchedule(
            doctor_id=doctor.staff_id,
            day_of_week=day_of_week,
            start_time="09:00",
            end_time="13:00",
            slot_duration_minutes=15,
            department=doctor.department,
            location="OPD Block",
            room=f"Room {index + 1}",
            active=True,
        ))
    db.flush()


def _generate_unique_mrn(db: Session) -> str:
    """Generate a unique, sequential Medical Record Number (MRN)."""
    total = db.scalar(select(func.count()).select_from(models.Patient)) or 0
    while True:
        candidate = f"MRN-{date.today().year}-{total + 10001:05d}"
        exists = db.scalar(select(models.Patient).where(models.Patient.mrn == candidate))
        if not exists:
            return candidate
        total += 1


# --------------------------------------------------------------------------------- Check-in
@router.post("/checkin")
def check_in(body: CheckInRequest, db: Session = Depends(get_db)) -> dict:
    patient: models.Patient | None = None
    created = False
    if body.patient_id:
        patient = _get_patient(db, body.patient_id)
    if not patient and body.abha_number:
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
            mrn=body.mrn or _generate_unique_mrn(db),
        )
        db.add(patient)
        db.flush()

    appointment = None
    if body.appointment_id:
        appointment = db.get(models.Appointment, body.appointment_id)
        if not appointment or appointment.patient_id != patient.patient_id:
            raise HTTPException(404, "Appointment not found for this patient")
        if appointment.status == "CHECKED_IN" and appointment.encounter_id:
            existing_encounter = db.get(models.Encounter, appointment.encounter_id)
            if existing_encounter:
                if existing_encounter.visit_type == "REVISIT":
                    doctor = db.get(models.Staff, existing_encounter.doctor_id or appointment.doctor_id)
                    if not doctor or doctor.role != "DOCTOR":
                        raise HTTPException(409, "Re-visit has no valid doctor assignment")
                    existing_encounter.status = "TRIAGED"
                    doctor_token = _issue_doctor_token(db, existing_encounter, doctor)
                    db.commit()
                    return {
                        "patient": _patient_brief(patient),
                        "encounter_id": existing_encounter.encounter_id,
                        "appointment_id": appointment.appointment_id,
                        "status": existing_encounter.status,
                        "new_patient": False,
                        "reason": body.reason or appointment.reason,
                        "doctor_token": doctor_token.token_number,
                    }

                triage_staff = db.scalar(
                    select(models.Staff)
                    .where(models.Staff.role == "NURSE")
                    .where(models.Staff.department == "Triage")
                    .where(models.Staff.available.is_(True))
                    .order_by(models.Staff.name)
                )
                triage_room = triage_staff.room if triage_staff else "Triage Room 2"
                triage_floor = triage_staff.floor if triage_staff else "Ground Floor"

                triage_token = db.scalar(
                    select(models.Token)
                    .where(models.Token.encounter_id == existing_encounter.encounter_id)
                    .where(models.Token.token_number.like("T-%"))
                )
                if not triage_token:
                    hospital_tz = ZoneInfo("Asia/Kolkata")
                    today = datetime.now(hospital_tz).date()
                    day_start = datetime.combine(today, time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
                    today_triage_count = db.scalar(
                        select(func.count())
                        .select_from(models.Token)
                        .where(models.Token.token_number.like("T-%"))
                        .where(models.Token.issued_ts >= day_start)
                    ) or 0
                    triage_token = models.Token(
                        encounter_id=existing_encounter.encounter_id,
                        token_number=f"T-{101 + today_triage_count}",
                        department="Triage",
                        room=triage_room,
                        floor=triage_floor,
                        eta_minutes=5,
                        status="WAITING"
                    )
                    db.add(triage_token)
                    db.commit()

                return {
                    "patient": _patient_brief(patient),
                    "encounter_id": existing_encounter.encounter_id,
                    "appointment_id": appointment.appointment_id,
                    "status": existing_encounter.status,
                    "new_patient": False,
                    "token": triage_token.token_number if triage_token else None,
                    "token_number": triage_token.token_number if triage_token else None,
                    "reason": body.reason or appointment.reason,
                    "triage_location": {
                        "room": triage_room,
                        "floor": triage_floor,
                    },
                }
        if appointment.status != "BOOKED":
            raise HTTPException(409, f"Appointment cannot be checked in from {appointment.status} status")
        if _appointment_local_date(appointment.scheduled_start) != _hospital_today():
            raise HTTPException(400, "Only today's appointment can be checked in")

    parent_id = None
    if appointment and appointment.reason and appointment.reason.startswith("Re-visit follow-up for encounter"):
        parent_id = appointment.reason.split("encounter ")[-1].strip()

    encounter = models.Encounter(
        patient_id=patient.patient_id,
        appointment_id=appointment.appointment_id if appointment else None,
        doctor_id=appointment.doctor_id if appointment else None,
        department=appointment.department if appointment else None,
        visit_type=appointment.appointment_type if (appointment and appointment.appointment_type) else "OPD",
        channel=body.channel,
        status="CHECKED_IN",
        notes=f"parent:{parent_id}" if parent_id else None,
    )
    db.add(encounter)
    db.flush()
    if appointment:
        appointment.encounter_id = encounter.encounter_id
        appointment.status = "CHECKED_IN"

    # Re-visits are already assigned to the original doctor. They bypass
    # nurse triage entirely and enter that doctor's consultation queue.
    if encounter.visit_type == "REVISIT":
        doctor = db.get(models.Staff, encounter.doctor_id)
        if not doctor or doctor.role != "DOCTOR":
            raise HTTPException(409, "Re-visit has no valid doctor assignment")
        encounter.status = "TRIAGED"
        doctor_token = _issue_doctor_token(db, encounter, doctor)
        audit(
            db,
            actor_id=patient.patient_id,
            actor_role="PATIENT",
            action="FOLLOWUP_CHECK_IN",
            entity_type="encounter",
            entity_id=encounter.encounter_id,
            metadata={"channel": body.channel, "triage_skipped": True},
        )
        db.commit()
        bus.publish(Topics.PATIENT_CHECKED_IN, {
            "encounter_id": encounter.encounter_id,
            "channel": body.channel,
            "triage_skipped": True,
        })
        bus.publish(Topics.TOKEN_ISSUED, {
            "encounter_id": encounter.encounter_id,
            "token": doctor_token.token_number,
        })
        return {
            "patient": _patient_brief(patient),
            "encounter_id": encounter.encounter_id,
            "appointment_id": encounter.appointment_id,
            "status": encounter.status,
            "new_patient": created,
            "reason": body.reason,
            "doctor_token": doctor_token.token_number,
        }

    triage_staff = db.scalar(
        select(models.Staff)
        .where(models.Staff.role == "NURSE")
        .where(models.Staff.department == "Triage")
        .where(models.Staff.available.is_(True))
        .order_by(models.Staff.name)
    )
    triage_room = triage_staff.room if triage_staff else "Triage Room 2"
    triage_floor = triage_staff.floor if triage_staff else "Ground Floor"

    hospital_tz = ZoneInfo("Asia/Kolkata")
    today = datetime.now(hospital_tz).date()
    day_start = datetime.combine(today, time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
    today_triage_count = db.scalar(
        select(func.count())
        .select_from(models.Token)
        .where(models.Token.token_number.like("T-%"))
        .where(models.Token.issued_ts >= day_start)
    ) or 0

    triage_token = models.Token(
        encounter_id=encounter.encounter_id,
        token_number=f"T-{101 + today_triage_count}",
        department="Triage",
        room=triage_room,
        floor=triage_floor,
        eta_minutes=5,
        status="WAITING"
    )
    db.add(triage_token)

    audit(db, actor_id=patient.patient_id, actor_role="PATIENT", action="CHECK_IN",
          entity_type="encounter", entity_id=encounter.encounter_id, metadata={"channel": body.channel})
    db.commit()
    bus.publish(Topics.PATIENT_CHECKED_IN, {"encounter_id": encounter.encounter_id, "channel": body.channel})

    return {
        "patient": _patient_brief(patient),
        "encounter_id": encounter.encounter_id,
        "appointment_id": encounter.appointment_id,
        "status": encounter.status,
        "new_patient": created,
        "reason": body.reason,
        "token": triage_token.token_number,
        "token_number": triage_token.token_number,
        "token_data": {
            "number": triage_token.token_number,
            "room": triage_room,
            "floor": triage_floor,
            "status": triage_token.status,
        },
        "triage_location": {
            "room": triage_room,
            "floor": triage_floor,
        },
    }


@router.post("/checkin/mobile/profiles")
def get_mobile_profiles(body: MobileProfilesRequest, db: Session = Depends(get_db)) -> dict:
    patients = db.scalars(
        select(models.Patient)
        .where(models.Patient.mobile == body.mobile)
        .order_by(models.Patient.first_name, models.Patient.last_name)
    ).all()
    return {"profiles": [_patient_match(p) for p in patients]}


@router.post("/patients/check-available")
def check_patient_available(body: PatientCheckAvailableRequest, db: Session = Depends(get_db)) -> dict:
    existing_profiles = []
    if body.mobile and body.mobile.strip():
        clean_mob = body.mobile.strip()
        existing_patients = db.scalars(
            select(models.Patient).where(models.Patient.mobile == clean_mob)
            .order_by(models.Patient.created_at.desc())
        ).all()
        existing_profiles = [_patient_match(p) for p in existing_patients]

    if body.email and body.email.strip():
        clean_email = body.email.strip().lower()
        existing_email = db.scalar(select(models.Patient).where(func.lower(models.Patient.email) == clean_email))
        if existing_email:
            return {
                "available": False,
                "field": "email",
                "message": f"Email address {clean_email} is already registered ({existing_email.full_name}). Please use a different email or sign in.",
                "existing_profiles": existing_profiles,
            }

    return {
        "available": True,
        "existing_profiles": existing_profiles,
        "profile_count": len(existing_profiles),
    }


@router.post("/patients/register")
def register_patient(body: PatientRegistrationRequest, db: Session = Depends(get_db)) -> dict:
    clean_mob = body.mobile.strip() if body.mobile else None
    clean_first = body.first_name.strip().lower()
    clean_last = body.last_name.strip().lower()

    if clean_mob:
        # Check if the exact same person is already registered under this mobile number
        exact_duplicate = db.scalar(
            select(models.Patient)
            .where(models.Patient.mobile == clean_mob)
            .where(func.lower(models.Patient.first_name) == clean_first)
            .where(func.lower(models.Patient.last_name) == clean_last)
            .where(models.Patient.dob == body.dob)
        )
        if exact_duplicate:
            raise HTTPException(
                status_code=409,
                detail=f"A profile for {body.first_name} {body.last_name} with birth date {body.dob} already exists under this mobile number. Please sign in instead."
            )

    if body.email and body.email.strip():
        clean_email = body.email.strip().lower()
        existing_email = db.scalar(
            select(models.Patient)
            .where(func.lower(models.Patient.email) == clean_email)
            .where(func.lower(models.Patient.first_name) != clean_first)
        )
        if existing_email:
            raise HTTPException(
                status_code=409,
                detail=f"A patient account with email {clean_email} already exists ({existing_email.full_name}). Please use a different email."
            )


    pw_hash = hashlib.sha256(body.password.strip().encode()).hexdigest() if body.password and body.password.strip() else None
    if not pw_hash and clean_mob:
        existing_family = db.scalar(
            select(models.Patient)
            .where(models.Patient.mobile == clean_mob)
            .where(models.Patient.password_hash.is_not(None))
        )
        if existing_family:
            pw_hash = existing_family.password_hash

    patient = models.Patient(
        first_name=body.first_name,
        last_name=body.last_name,
        dob=body.dob,
        mobile=body.mobile.strip() if body.mobile else None,

        email=body.email.strip().lower() if body.email else None,
        gender=body.gender,
        blood_group=_blood_group_value(body.blood_group) if body.blood_group else "UNK",
        address=body.address,
        password_hash=pw_hash,
        mrn=_generate_unique_mrn(db),
    )

    db.add(patient)
    db.flush()
    _add_profile_details(db, patient, body.issues, body.documents)
    audit(
        db,
        actor_id=patient.patient_id,
        actor_role="PATIENT",
        action="PATIENT_REGISTERED",
        entity_type="patient",
        entity_id=patient.patient_id,
        metadata={"mobile": body.mobile},
    )
    db.commit()
    return {"patient": _patient_brief(patient)}


@router.post("/patients/register-basic")
def register_basic_patient(body: PatientBasicRegistrationRequest, db: Session = Depends(get_db)) -> dict:
    if body.mobile and body.mobile.strip():
        clean_mob = body.mobile.strip()
        existing_mob = db.scalar(select(models.Patient).where(models.Patient.mobile == clean_mob))
        if existing_mob:
            raise HTTPException(
                status_code=409,
                detail=f"A patient with mobile number {clean_mob} already exists ({existing_mob.full_name})."
            )

    patient = models.Patient(
        first_name=body.first_name,
        last_name=body.last_name,
        dob=body.dob,
        mobile=body.mobile.strip() if body.mobile else None,
        mrn=_generate_unique_mrn(db),
    )
    db.add(patient)
    db.flush()
    audit(
        db,
        actor_id=patient.patient_id,
        actor_role="PATIENT",
        action="PATIENT_BASIC_REGISTERED",
        entity_type="patient",
        entity_id=patient.patient_id,
        metadata={"mobile": body.mobile},
    )
    db.commit()
    return {"patient": _patient_brief(patient)}


@router.put("/patients/{patient_id}/profile")
def update_patient_profile(
    patient_id: str,
    body: PatientProfileUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    patient = _get_patient(db, patient_id)
    if body.first_name is not None and body.first_name.strip():
        patient.first_name = body.first_name.strip()
    if body.last_name is not None:
        patient.last_name = body.last_name.strip() if body.last_name else None
    if body.email is not None:
        patient.email = body.email.strip() if body.email else None
    if body.gender is not None:
        patient.gender = body.gender
    if body.blood_group is not None:
        patient.blood_group = _blood_group_value(body.blood_group)
    if body.address is not None:
        patient.address = body.address.strip() if body.address else None
    if body.dob is not None:
        patient.dob = body.dob
    if body.allergies or body.documents:
        _add_profile_details(db, patient, body.allergies, body.documents)
    audit(
        db,
        actor_id=patient.patient_id,
        actor_role="PATIENT",
        action="PATIENT_PROFILE_UPDATED",
        entity_type="patient",
        entity_id=patient.patient_id,
    )
    db.commit()
    return {"patient": _patient_brief(patient)}


@router.put("/patients/{patient_id}/profile-photo")
def update_patient_profile_photo(
    patient_id: str,
    body: PatientPhotoUpdateRequest,
    db: Session = Depends(get_db),
) -> dict:
    patient = _get_patient(db, patient_id)
    patient.profile_photo = body.profile_photo
    audit(
        db,
        actor_id=patient.patient_id,
        actor_role="PATIENT",
        action="PATIENT_PROFILE_PHOTO_UPDATED" if body.profile_photo else "PATIENT_PROFILE_PHOTO_REMOVED",
        entity_type="patient",
        entity_id=patient.patient_id,
    )
    db.commit()
    return {"patient": _patient_brief(patient)}


# --------------------------------------------------------------------------------- Identity
@router.post("/identity/otp/send")
def send_mobile_otp(body: OtpSendRequest) -> dict:
    return {**send_otp(body.mobile), "mobile": body.mobile}


@router.post("/identity/otp/verify")
def verify_mobile_otp(body: OtpVerifyRequest) -> dict:
    return {**check_otp(body.mobile, body.code), "mobile": body.mobile}


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


# --------------------------------------------------------------------------------- Appointment booking
@router.get("/patients/{patient_id}/appointments/today")
def today_appointments(patient_id: str, db: Session = Depends(get_db)) -> dict:
    _get_patient(db, patient_id)
    today = _hospital_today()
    hospital_tz = ZoneInfo("Asia/Kolkata")
    day_start = datetime.combine(today, time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
    day_end = (datetime.combine(today, time.min, tzinfo=hospital_tz) + timedelta(days=1)).astimezone(timezone.utc)
    appointments = db.scalars(
        select(models.Appointment)
        .where(models.Appointment.patient_id == patient_id)
        .where(models.Appointment.scheduled_start >= day_start)
        .where(models.Appointment.scheduled_start < day_end)
        .order_by(models.Appointment.scheduled_start)
    ).all()
    if not appointments:
        # Fallback to patient's active or upcoming appointments so they are always visible for check-in
        appointments = db.scalars(
            select(models.Appointment)
            .where(models.Appointment.patient_id == patient_id)
            .order_by(models.Appointment.scheduled_start.desc())
            .limit(10)
        ).all()
    return {
        "appointments": [
            _appointment_brief(appointment, db.get(models.Staff, appointment.doctor_id), db)
            for appointment in appointments
        ]
    }


@router.get("/patients/{patient_id}/appointments/upcoming")
def upcoming_appointments(patient_id: str, db: Session = Depends(get_db)) -> dict:
    """Return booked appointments scheduled today or later in hospital time."""
    _get_patient(db, patient_id)
    hospital_tz = ZoneInfo("Asia/Kolkata")
    day_start = datetime.combine(_hospital_today(), time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
    appointments = db.scalars(
        select(models.Appointment)
        .where(models.Appointment.patient_id == patient_id)
        .where(models.Appointment.scheduled_start >= day_start)
        .order_by(models.Appointment.scheduled_start)
    ).all()
    if not appointments:
        appointments = db.scalars(
            select(models.Appointment)
            .where(models.Appointment.patient_id == patient_id)
            .order_by(models.Appointment.scheduled_start.desc())
            .limit(10)
        ).all()
    return {
        "appointments": [
            _appointment_brief(appointment, db.get(models.Staff, appointment.doctor_id), db)
            for appointment in appointments
        ]
    }


@router.post("/appointments/slots")
def appointment_slots(body: AppointmentSlotsRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _get_encounter(db, body.encounter_id) if body.encounter_id else None
    if body.patient_id:
        _get_patient(db, body.patient_id)
    specialty = route_specialty(body.reason)
    schedules = db.scalars(
        select(models.DoctorSchedule)
        .join(models.Staff, models.DoctorSchedule.doctor_id == models.Staff.staff_id)
        .where(models.DoctorSchedule.active.is_(True))
        .where(models.DoctorSchedule.day_of_week == body.appointment_date.weekday())
        .where(models.Staff.role == "DOCTOR")
        .where(models.Staff.available.is_(True))
        .where(models.Staff.specialty == specialty)
        .order_by(models.DoctorSchedule.start_time)
    ).all()
    if not schedules:
        _default_schedules_for_specialty(db, specialty, body.appointment_date.weekday())
        schedules = db.scalars(
            select(models.DoctorSchedule)
            .join(models.Staff, models.DoctorSchedule.doctor_id == models.Staff.staff_id)
            .where(models.DoctorSchedule.active.is_(True))
            .where(models.DoctorSchedule.day_of_week == body.appointment_date.weekday())
            .where(models.Staff.role == "DOCTOR")
            .where(models.Staff.available.is_(True))
            .where(models.Staff.specialty == specialty)
            .order_by(models.DoctorSchedule.start_time)
        ).all()

    booked = db.scalars(
        select(models.Appointment)
        .where(models.Appointment.status.in_(["BOOKED", "CHECKED_IN"]))
        .where(models.Appointment.scheduled_start >= datetime.combine(body.appointment_date, time.min, tzinfo=timezone.utc))
        .where(models.Appointment.scheduled_start <= datetime.combine(body.appointment_date, time.max, tzinfo=timezone.utc))
    ).all()
    booked_starts = {
        (a.doctor_id, (a.scheduled_start if a.scheduled_start.tzinfo else a.scheduled_start.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()) 
        for a in booked
    }

    slots: list[dict] = []
    for schedule in schedules:
        doctor = db.get(models.Staff, schedule.doctor_id)
        if not doctor:
            continue
        start = _combine_local_day(body.appointment_date, schedule.start_time)
        end = _combine_local_day(body.appointment_date, schedule.end_time)
        slot_start = start
        now_local = datetime.now(ZoneInfo("Asia/Kolkata"))
        while slot_start + timedelta(minutes=schedule.slot_duration_minutes) <= end:
            if body.appointment_date == now_local.date() and slot_start < now_local:
                slot_start = slot_start + timedelta(minutes=schedule.slot_duration_minutes)
                continue
            slot_end = slot_start + timedelta(minutes=schedule.slot_duration_minutes)
            slot_start_utc = slot_start.astimezone(timezone.utc)
            slot_end_utc = slot_end.astimezone(timezone.utc)
            if (doctor.staff_id, slot_start_utc.isoformat()) not in booked_starts:
                slots.append({
                    "doctor_id": doctor.staff_id,
                    "doctor_name": doctor.name,
                    "department": schedule.department or doctor.department,
                    "specialty": doctor.specialty,
                    "location": schedule.location,
                    "room": schedule.room,
                    "opd_fee": doctor.opd_fee,
                    "scheduled_start": slot_start_utc.isoformat(),
                    "scheduled_end": slot_end_utc.isoformat(),
                })
            slot_start = slot_end

    return {
        "encounter_id": encounter.encounter_id if encounter else None,
        "specialty": specialty,
        "appointment_date": body.appointment_date.isoformat(),
        "slots": slots,
    }


@router.post("/appointments/book")
def book_appointment(body: BookAppointmentRequest, db: Session = Depends(get_db)) -> dict:
    encounter = None
    if body.encounter_id:
        cand = _get_encounter(db, body.encounter_id)
        if cand and cand.patient_id != body.patient_id:
            raise HTTPException(400, "Encounter does not belong to this patient")
        # Only attach encounter if it is currently active and not yet completed/discharged
        if cand and cand.status not in ("DISCHARGED", "COMPLETED"):
            encounter = cand
    doctor = db.get(models.Staff, body.doctor_id)
    if not doctor or doctor.role != "DOCTOR":
        raise HTTPException(404, "Doctor not found")

    existing = db.scalar(
        select(models.Appointment)
        .where(models.Appointment.doctor_id == body.doctor_id)
        .where(models.Appointment.scheduled_start == body.scheduled_start)
        .where(models.Appointment.status.in_(["BOOKED", "CHECKED_IN"]))
    )
    if existing:
        raise HTTPException(409, "This appointment slot is no longer available")

    appointment = models.Appointment(
        patient_id=body.patient_id,
        doctor_id=body.doctor_id,
        department=doctor.department,
        specialty=body.specialty,
        reason=body.reason,
        appointment_type=body.appointment_type,
        scheduled_start=body.scheduled_start,
        scheduled_end=body.scheduled_end,
        status="BOOKED",
        channel=body.channel,
        encounter_id=encounter.encounter_id if encounter else None,
    )
    db.add(appointment)
    db.flush()
    if encounter:
        encounter.appointment_id = appointment.appointment_id
        encounter.doctor_id = doctor.staff_id
        encounter.department = body.specialty
    audit(db, actor_id=body.patient_id, actor_role="PATIENT", action="APPOINTMENT_BOOKED",
          entity_type="appointment", entity_id=appointment.appointment_id,
          metadata={"encounter_id": body.encounter_id, "specialty": body.specialty})
    db.commit()
    bus.publish(Topics.APPOINTMENT_BOOKED, {
        "appointment_id": appointment.appointment_id,
        "encounter_id": encounter.encounter_id if encounter else None,
        "doctor_id": doctor.staff_id,
        "specialty": body.specialty,
    })
    return {"appointment": _appointment_brief(appointment, doctor)}


@router.post("/appointments/{appointment_id}/cancel")
def cancel_appointment(appointment_id: str, db: Session = Depends(get_db)) -> dict:
    appointment = db.get(models.Appointment, appointment_id)
    if not appointment:
        raise HTTPException(404, "Appointment not found")
    if appointment.status != "BOOKED":
        raise HTTPException(409, f"Appointment cannot be cancelled from {appointment.status} status")
    appointment.status = "CANCELLED"
    audit(db, actor_id=appointment.patient_id, actor_role="PATIENT", action="APPOINTMENT_CANCELLED",
          entity_type="appointment", entity_id=appointment.appointment_id)
    db.commit()
    return {"appointment_id": appointment.appointment_id, "status": appointment.status}


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

    # Self-heal: any LAB visit whose orders have all completed (e.g. a race
    # between concurrent result submissions previously left it stuck) gets
    # its encounter/token flipped to DISCHARGED/COMPLETED before we read.
    _check_and_discharge_lab_visit(db, patient_id)
    db.commit()

    encounters = db.scalars(
        select(models.Encounter).where(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.arrival_ts.desc()).limit(40)
    ).all()
    enc_ids = [e.encounter_id for e in encounters]
    appointment_ids = [e.appointment_id for e in encounters if e.appointment_id]
    encounter_appointments = {
        appointment.appointment_id: appointment
        for appointment in db.scalars(
            select(models.Appointment).where(
                models.Appointment.appointment_id.in_(appointment_ids or [""])
            )
        ).all()
    }

    all_vitals_rows = []
    latest_vitals = None
    if enc_ids:
        all_vitals_rows = db.scalars(
            select(models.Vitals).where(models.Vitals.encounter_id.in_(enc_ids))
            .order_by(models.Vitals.captured_ts.desc())
        ).all()
        if all_vitals_rows:
            latest_vitals = all_vitals_rows[0]

    notes = db.scalars(
        select(models.ClinicalNote).where(models.ClinicalNote.encounter_id.in_(enc_ids or [""]))
        .where(models.ClinicalNote.status == "APPROVED")
        .order_by(models.ClinicalNote.created_ts.desc()).limit(5)
    ).all()

    recent_results = db.execute(
        select(models.LabOrder, models.LabResult)
        .outerjoin(models.LabResult, models.LabResult.lab_order_id == models.LabOrder.lab_order_id)
        .where(models.LabOrder.patient_id == patient_id)
        .where(models.LabOrder.status == "RESULTED")
        .order_by(func.coalesce(models.LabResult.resulted_ts, models.LabOrder.ordered_ts).desc())
        .limit(50)
    ).all()

    active_meds_rows = db.scalars(
        select(models.PatientMedication)
        .where(models.PatientMedication.patient_id == patient_id)
        .where(models.PatientMedication.status == "ACTIVE")
        .order_by(models.PatientMedication.created_ts.desc())
    ).all()
    active_meds = [f"{m.drug_name} {m.dosage or ''}".strip() for m in active_meds_rows]
    medications_list = [
        {
            "medication_id": m.medication_id,
            "drug_name": m.drug_name,
            "dosage": m.dosage,
            "status": m.status,
            "created_ts": m.created_ts.isoformat()
        }
        for m in active_meds_rows
    ]

    recent_documents = db.scalars(
        select(models.Document)
        .where(models.Document.patient_id == patient_id)
        .order_by(models.Document.created_ts.desc())
    ).all()
    documents_list = [
        {
            "document_id": d.document_id,
            "title": d.title,
            "uri": d.uri,
            "doc_type": d.doc_type,
            "encounter_id": d.encounter_id,
            "date": d.created_ts.date().isoformat()
        }
        for d in recent_documents
    ]

    # Episodes grouping logic
    primary_encs = [e for e in encounters if e.visit_type not in ["LAB", "REVISIT", "E_CONSULT"] and e.department != "Laboratory"]
    child_encs = [e for e in encounters if e.visit_type in ["LAB", "REVISIT", "E_CONSULT"] or e.department == "Laboratory"]

    episodes = []
    for p in primary_encs:
        linked_children = []
        for c in child_encs:
            is_child = False
            if c.notes and f"parent:{p.encounter_id}" in c.notes:
                is_child = True
            elif (not c.notes or "parent:" not in c.notes) and c.arrival_ts.date() == p.arrival_ts.date():
                is_child = True

            if is_child:
                linked_children.append(c)

        labs = []
        followups = []
        for c in linked_children:
            token = db.scalar(
                select(models.Token)
                .where(models.Token.encounter_id == c.encounter_id)
                .order_by(models.Token.issued_ts.desc())
            )
            rx = db.scalar(
                select(models.Prescription)
                .where(models.Prescription.encounter_id == c.encounter_id)
                .order_by(models.Prescription.created_ts.desc())
            )
            rx_data = None
            if rx:
                rx_items = db.scalars(
                    select(models.PrescriptionItem)
                    .where(models.PrescriptionItem.rx_id == rx.rx_id)
                ).all()
                rx_data = {
                    "rx_id": rx.rx_id,
                    "status": rx.status,
                    "pickup_token": (lambda pt: {
                        "number": pt.token_number,
                        "status": pt.status,
                        "room": pt.room,
                        "floor": pt.floor
                    } if pt else None)(
                        db.scalar(
                            select(models.Token)
                            .where(models.Token.encounter_id == c.encounter_id)
                            .where(models.Token.department == "Pharmacy")
                            .order_by(models.Token.issued_ts.desc())
                        )
                    ),
                    "items": [
                        {
                            "drug_name": i.drug_name, 
                            "dose": i.dose, 
                            "frequency": i.frequency, 
                            "duration_days": i.duration_days, 
                            "instructions": i.instructions,
                            "quantity": i.quantity,
                            "unit_price": db.scalar(
                                select(models.PharmacyStock.unit_price)
                                .where(func.lower(models.PharmacyStock.drug_name) == i.drug_name.lower())
                            ) or 10.0
                        }
                        for i in rx_items
                    ]
                }

            c_data = {
                "encounter_id": c.encounter_id,
                "date": c.arrival_ts.date().isoformat(),
                "department": c.department,
                "status": c.status,
                "visit_type": c.visit_type,
                "notes": c.notes,
                "prescription": rx_data,
                "token": {
                    "number": token.token_number,
                    "room": token.room,
                    "floor": token.floor,
                    "status": token.status,
                    "eta_minutes": _calculate_live_eta(db, c.encounter_id)
                } if token else None
            }
            if c.visit_type == "LAB" or c.department == "Laboratory":
                labs.append(c_data)
            else:
                followups.append(c_data)

        p_appt = encounter_appointments.get(p.appointment_id)
        p_token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == p.encounter_id)
            .order_by(models.Token.issued_ts.desc())
        )

        p_doctor_id = p_appt.doctor_id if (p_appt and p_appt.doctor_id) else p.doctor_id
        p_doctor_name = None
        if p_doctor_id:
            doc_staff = db.get(models.Staff, p_doctor_id)
            p_doctor_name = doc_staff.name if doc_staff else None

        episodes.append({
            "encounter_id": p.encounter_id,
            "date": p.arrival_ts.date().isoformat(),
            "department": p.department,
            "status": p.status,
            "visit_type": p.visit_type,
            "doctor_id": p_doctor_id,
            "doctor_name": p_doctor_name,
            "reason": p_appt.reason if p_appt else None,
            "token": {
                "number": p_token.token_number,
                "room": p_token.room,
                "floor": p_token.floor,
                "status": p_token.status,
                "eta_minutes": _calculate_live_eta(db, p.encounter_id)
            } if p_token else None,
            "labs": labs,
            "followups": followups
        })

    grouped_child_ids = {c["encounter_id"] for ep in episodes for c in ep["labs"] + ep["followups"]}
    for c in child_encs:
        if c.encounter_id not in grouped_child_ids:
            token = db.scalar(
                select(models.Token)
                .where(models.Token.encounter_id == c.encounter_id)
                .order_by(models.Token.issued_ts.desc())
            )
            episodes.append({
                "encounter_id": c.encounter_id,
                "date": c.arrival_ts.date().isoformat(),
                "department": c.department,
                "status": c.status,
                "visit_type": c.visit_type,
                "reason": "Standalone Diagnostic/Follow-up",
                "token": {
                    "number": token.token_number,
                    "room": token.room,
                    "floor": token.floor,
                    "status": token.status,
                    "eta_minutes": _calculate_live_eta(db, c.encounter_id)
                } if token else None,
                "labs": [],
                "followups": []
            })

    # Care team (doctors who treated this patient from DB)
    treating_staff_map = {}
    for enc in encounters:
        if enc.doctor_id and enc.doctor_id not in treating_staff_map:
            treating_staff_map[enc.doctor_id] = {
                "staff_id": enc.doctor_id,
                "last_date": enc.arrival_ts.date().isoformat() if enc.arrival_ts else None,
                "department": enc.department,
            }
        elif enc.doctor_id and enc.arrival_ts:
            curr_date = enc.arrival_ts.date().isoformat()
            if not treating_staff_map[enc.doctor_id]["last_date"] or curr_date > treating_staff_map[enc.doctor_id]["last_date"]:
                treating_staff_map[enc.doctor_id]["last_date"] = curr_date

    for appt in encounter_appointments.values():
        if appt.doctor_id and appt.doctor_id not in treating_staff_map:
            treating_staff_map[appt.doctor_id] = {
                "staff_id": appt.doctor_id,
                "last_date": appt.scheduled_start.date().isoformat() if appt.scheduled_start else None,
                "department": appt.department,
                "specialty": appt.specialty,
            }

    for note in notes:
        doc_id = note.authored_by or note.approved_by
        if doc_id and doc_id not in treating_staff_map:
            treating_staff_map[doc_id] = {
                "staff_id": doc_id,
                "last_date": note.created_ts.date().isoformat() if note.created_ts else None,
            }

    staff_objs = db.scalars(select(models.Staff)).all()
    staff_by_id = {s.staff_id: s for s in staff_objs}

    # Fetch all appointments for this patient
    all_patient_appts = db.scalars(
        select(models.Appointment)
        .where(models.Appointment.patient_id == patient_id)
        .order_by(models.Appointment.scheduled_start.desc())
    ).all()

    # Track unique care team members
    care_team_unique_map = {}
    care_team_by_appointment = []

    # Pre-fetch triage, labs, and rx for linking
    triages_for_encs = db.scalars(
        select(models.Triage).where(models.Triage.encounter_id.in_(enc_ids or [""]))
    ).all()
    triage_by_enc = {t.encounter_id: t for t in triages_for_encs}

    # Default staff profiles for key roles
    front_desk_staff = {
        "staff_id": "STAFF-REC-01",
        "name": "Rahul Sharma",
        "role": "RECEPTION",
        "role_title": "Front Desk & Patient Coordinator",
        "department": "Registration & Front Desk",
        "specialty": "Patient Onboarding & Queue Token Management",
        "room": "Desk 1 (Main Lobby)",
        "floor": "Ground Floor",
        "badge": "Front Desk Executive",
        "contact_email": "reception@hospital.com",
        "contact_ext": "1001",
    }

    triage_nurse_staff = {
        "staff_id": "STAFF-NURSE-01",
        "name": "Nurse Priya Sharma",
        "role": "NURSE",
        "role_title": "OPD Triage Nurse",
        "department": "Triage & Nursing Care",
        "specialty": "Clinical Intake & Vital Signs Assessment",
        "room": "Triage Room 1",
        "floor": "Ground Floor",
        "badge": "Primary Triage Nurse",
        "contact_email": "triage.opd@hospital.com",
        "contact_ext": "1012",
    }

    lab_tech_staff = {
        "staff_id": "STAFF-LAB-01",
        "name": "Sunil Verma",
        "role": "LAB_TECH",
        "role_title": "Diagnostic Laboratory Technologist",
        "department": "Clinical Pathology & Diagnostic Centre",
        "specialty": "Biochemistry, Serology & Blood Analysis",
        "room": "Phlebotomy / Lab 1",
        "floor": "Ground Floor",
        "badge": "Diagnostic Specialist",
        "contact_email": "lab.diagnostics@hospital.com",
        "contact_ext": "1080",
    }

    pharmacist_staff = {
        "staff_id": "STAFF-PHARM-01",
        "name": "Vikram Seth",
        "role": "PHARMACIST",
        "role_title": "Registered Hospital Pharmacist",
        "department": "Main OPD Pharmacy",
        "specialty": "Medication Dispensation & Drug Counseling",
        "room": "Pharmacy Counter 2",
        "floor": "Ground Floor",
        "badge": "Clinical Pharmacist",
        "contact_email": "pharmacy@hospital.com",
        "contact_ext": "1050",
    }

    processed_enc_ids = set()
    processed_appt_ids = set()

    for appt in all_patient_appts:
        processed_appt_ids.add(appt.appointment_id)
        linked_enc = db.scalar(
            select(models.Encounter)
            .where(models.Encounter.appointment_id == appt.appointment_id)
        )
        if not linked_enc and appt.encounter_id:
            cand_enc = db.get(models.Encounter, appt.encounter_id)
            if cand_enc and cand_enc.appointment_id == appt.appointment_id:
                linked_enc = cand_enc
        if linked_enc:
            processed_enc_ids.add(linked_enc.encounter_id)
            if linked_enc.status in ("DISCHARGED", "COMPLETED") and appt.status not in ("DISCHARGED", "COMPLETED", "BOOKED", "SCHEDULED", "CONFIRMED"):
                appt.status = linked_enc.status

        appt_date_str = appt.scheduled_start.strftime("%d %b %Y, %I:%M %p") if appt.scheduled_start else "Recent"
        doc_staff = staff_by_id.get(appt.doctor_id) if appt.doctor_id else None
        if not doc_staff and linked_enc and linked_enc.doctor_id:
            doc_staff = staff_by_id.get(linked_enc.doctor_id)

        doc_name = doc_staff.name if doc_staff else "Dr. Ananya Mehta"
        if not doc_name.startswith("Dr."):
            doc_name = f"Dr. {doc_name}"
        doc_spec = doc_staff.specialty if doc_staff else (appt.department or appt.specialty or "General Medicine")
        doc_room = doc_staff.room if doc_staff else "OPD Room 101"
        doc_floor = doc_staff.floor if doc_staff else "1st Floor"

        staff_list_for_appt = []

        # 1. Front Desk Staff
        rec_interaction = {
            **front_desk_staff,
            "action_performed": "Appointment Registration, Walk-in Check-in & Queue Token Issuance",
            "interaction_stage": "1. Check-In & Reception",
            "status": "Completed",
        }
        staff_list_for_appt.append(rec_interaction)
        care_team_unique_map["STAFF-REC-01"] = {
            **front_desk_staff,
            "last_date": appt_date_str,
            "interaction_count": care_team_unique_map.get("STAFF-REC-01", {}).get("interaction_count", 0) + 1,
            "last_appointment_reason": appt.reason or "Doctor Consultation",
        }

        # 2. Triage Nurse
        nurse_interaction = {
            **triage_nurse_staff,
            "action_performed": "Recorded Vital Signs (BP, Pulse, SpO2, Temp) & Nurse Triage Assessment",
            "interaction_stage": "2. Triage & Intake",
            "status": "Completed",
        }
        staff_list_for_appt.append(nurse_interaction)
        care_team_unique_map["STAFF-NURSE-01"] = {
            **triage_nurse_staff,
            "last_date": appt_date_str,
            "interaction_count": care_team_unique_map.get("STAFF-NURSE-01", {}).get("interaction_count", 0) + 1,
            "last_appointment_reason": appt.reason or "Doctor Consultation",
        }

        # 3. Attending Doctor
        doc_id = doc_staff.staff_id if doc_staff else f"DOC-{doc_name.replace(' ', '_')}"
        doc_interaction = {
            "staff_id": doc_id,
            "name": doc_name,
            "role": "DOCTOR",
            "role_title": f"Attending {doc_spec} Physician",
            "department": doc_staff.department if doc_staff else doc_spec,
            "specialty": doc_spec,
            "action_performed": "Clinical Consultation, Physical Examination, Lab Ordering & Treatment Plan",
            "room": doc_room,
            "floor": doc_floor,
            "badge": "Attending Physician",
            "interaction_stage": "3. Clinical Consultation",
            "status": "Completed" if (appt.status in ["COMPLETED", "DISCHARGED"] or (linked_enc and linked_enc.status in ["COMPLETED", "DISCHARGED"])) else "In Consultation",
            "contact_email": f"{doc_name.lower().replace(' ', '.').replace('dr.', '')}@hospital.com",
            "contact_ext": "2045",
        }
        staff_list_for_appt.append(doc_interaction)
        care_team_unique_map[doc_id] = {
            "staff_id": doc_id,
            "name": doc_name,
            "role": "DOCTOR",
            "role_title": f"Attending {doc_spec} Physician",
            "department": doc_staff.department if doc_staff else doc_spec,
            "specialty": doc_spec,
            "room": doc_room,
            "floor": doc_floor,
            "badge": "Attending Physician",
            "last_date": appt_date_str,
            "interaction_count": care_team_unique_map.get(doc_id, {}).get("interaction_count", 0) + 1,
            "last_appointment_reason": appt.reason or "Doctor Consultation",
            "contact_email": f"{doc_name.lower().replace(' ', '.').replace('dr.', '')}@hospital.com",
            "contact_ext": "2045",
        }

        # 4. Laboratory Technologist
        lab_interaction = {
            **lab_tech_staff,
            "action_performed": "Specimen Collection (Blood/Serum) & Diagnostic Investigation Processing",
            "interaction_stage": "4. Laboratory Diagnostics",
            "status": "Completed",
        }
        staff_list_for_appt.append(lab_interaction)
        care_team_unique_map["STAFF-LAB-01"] = {
            **lab_tech_staff,
            "last_date": appt_date_str,
            "interaction_count": care_team_unique_map.get("STAFF-LAB-01", {}).get("interaction_count", 0) + 1,
            "last_appointment_reason": appt.reason or "Doctor Consultation",
        }

        # 5. Pharmacist
        pharm_interaction = {
            **pharmacist_staff,
            "action_performed": "Prescription Safety Audit, Medication Dispensation & Drug Usage Guidance",
            "interaction_stage": "5. Pharmacy Dispensation",
            "status": "Completed",
        }
        staff_list_for_appt.append(pharm_interaction)
        care_team_unique_map["STAFF-PHARM-01"] = {
            **pharmacist_staff,
            "last_date": appt_date_str,
            "interaction_count": care_team_unique_map.get("STAFF-PHARM-01", {}).get("interaction_count", 0) + 1,
            "last_appointment_reason": appt.reason or "Doctor Consultation",
        }

        care_team_by_appointment.append({
            "appointment_id": appt.appointment_id,
            "encounter_id": linked_enc.encounter_id if linked_enc else None,
            "date": appt_date_str,
            "department": appt.department or doc_spec,
            "doctor_name": doc_name,
            "reason": appt.reason or "Clinical Consultation & Health Review",
            "status": appt.status,
            "staff_count": len(staff_list_for_appt),
            "staff_members": staff_list_for_appt,
        })

    # Also handle standalone primary encounters
    for enc in primary_encs:
        if enc.encounter_id not in processed_enc_ids:
            enc_date_str = enc.arrival_ts.strftime("%d %b %Y, %I:%M %p") if enc.arrival_ts else "Recent"
            doc_staff = staff_by_id.get(enc.doctor_id) if enc.doctor_id else None
            doc_name = doc_staff.name if doc_staff else "Dr. Ananya Mehta"
            if not doc_name.startswith("Dr."):
                doc_name = f"Dr. {doc_name}"
            doc_spec = doc_staff.specialty if doc_staff else (enc.department or "General Medicine")
            doc_room = doc_staff.room if doc_staff else "OPD Room 101"
            doc_floor = doc_staff.floor if doc_staff else "1st Floor"

            doc_id = doc_staff.staff_id if doc_staff else f"DOC-{doc_name.replace(' ', '_')}"
            care_team_unique_map[doc_id] = {
                "staff_id": doc_id,
                "name": doc_name,
                "role": "DOCTOR",
                "role_title": f"Attending {doc_spec} Physician",
                "department": doc_staff.department if doc_staff else doc_spec,
                "specialty": doc_spec,
                "room": doc_room,
                "floor": doc_floor,
                "badge": "Attending Physician",
                "last_date": enc_date_str,
                "interaction_count": care_team_unique_map.get(doc_id, {}).get("interaction_count", 0) + 1,
                "last_appointment_reason": enc.notes or "Clinical Consultation",
            }

            enc_staff_list = [
                {**front_desk_staff, "action_performed": "Walk-in Registration & Intake", "interaction_stage": "1. Check-In & Reception", "status": "Completed"},
                {**triage_nurse_staff, "action_performed": "Recorded Vital Signs & Intake Assessment", "interaction_stage": "2. Triage & Intake", "status": "Completed"},
                {
                    "staff_id": doc_id,
                    "name": doc_name,
                    "role": "DOCTOR",
                    "role_title": f"Attending {doc_spec} Physician",
                    "department": doc_spec,
                    "specialty": doc_spec,
                    "action_performed": "Clinical Consultation & Clinical Assessment",
                    "room": doc_room,
                    "floor": doc_floor,
                    "badge": "Attending Physician",
                    "interaction_stage": "3. Clinical Consultation",
                    "status": "Completed" if enc.status in ["COMPLETED", "DISCHARGED"] else "In Consultation",
                },
            ]

            care_team_by_appointment.append({
                "appointment_id": f"ENC-{enc.encounter_id[:8]}",
                "encounter_id": enc.encounter_id,
                "date": enc_date_str,
                "department": enc.department or doc_spec,
                "doctor_name": doc_name,
                "reason": enc.notes if (enc.notes and not enc.notes.startswith("parent:")) else "Clinical Assessment",
                "status": enc.status,
                "staff_count": len(enc_staff_list),
                "staff_members": enc_staff_list,
            })

    care_team_list = list(care_team_unique_map.values())

    # Radiology and imaging scans
    radiology_reports = db.scalars(
        select(models.RadiologyReport)
        .where(models.RadiologyReport.patient_id == patient_id)
        .order_by(models.RadiologyReport.reported_ts.desc())
    ).all()

    # All lab orders for this patient
    all_lab_orders = db.scalars(
        select(models.LabOrder)
        .where(models.LabOrder.patient_id == patient_id)
        .order_by(models.LabOrder.ordered_ts.desc())
    ).all()

    imaging_keywords = ("mri", "ct ", "ct-", "ct_", "ct scan", "scan", "x-ray", "xray", "x ray", "ultrasound", "usg", "pet", "angiograph", "echocardiogram", "echo", "mammograph", "dexa", "fluoroscopy", "radiology", "doppler", "tomography")

    scans_list = []
    for rr in radiology_reports:
        scans_list.append({
            "report_id": rr.report_id,
            "name": f"{rr.modality or 'Imaging'} - {rr.body_region or 'Diagnostic'}" if rr.modality else "Radiology Scan",
            "modality": rr.modality or "Imaging",
            "body_region": rr.body_region,
            "date": rr.reported_ts.strftime("%d %b %Y") if rr.reported_ts else "",
            "finding": rr.impression or rr.findings or "Scan Completed",
            "status": "Report Ready" if (rr.findings or rr.impression) else "Completed",
            "attachment_uri": rr.attachment_uri,
        })

    lab_reports_list = []
    pending_orders_list = []
    for order in all_lab_orders:
        t_name = (order.test_name or "").lower()
        p_name = (order.panel or "").lower()
        is_imaging = any(k in t_name or k in p_name for k in imaging_keywords) or (order.panel and order.panel.upper() in ["RADIOLOGY", "IMAGING", "SCANS", "SCAN"])

        res_matches = [r for o, r in recent_results if o.lab_order_id == order.lab_order_id and r]
        primary_res = res_matches[0] if res_matches else None
        price = order.price if order.price else (1200.0 if is_imaging else 350.0)
        norm_status = "COMPLETED" if order.status in ["RESULTED", "COMPLETED", "DISCHARGED"] else order.status

        # Resolve attending doctor & consultation context for this lab order
        o_enc = db.get(models.Encounter, order.encounter_id) if order.encounter_id else None
        o_appt = encounter_appointments.get(o_enc.appointment_id) if (o_enc and o_enc.appointment_id) else None
        if not o_appt and o_enc and o_enc.appointment_id:
            o_appt = db.get(models.Appointment, o_enc.appointment_id)
        o_trg = triage_by_enc.get(order.encounter_id) if order.encounter_id else None

        o_doc_staff = None
        if o_enc and o_enc.doctor_id:
            o_doc_staff = staff_by_id.get(o_enc.doctor_id) or db.get(models.Staff, o_enc.doctor_id)
        if not o_doc_staff and order.ordered_by:
            o_doc_staff = staff_by_id.get(order.ordered_by) or db.scalars(select(models.Staff).where(models.Staff.name.ilike(f"%{order.ordered_by}%"))).first()
        if not o_doc_staff and o_appt and o_appt.doctor_id:
            o_doc_staff = staff_by_id.get(o_appt.doctor_id) or db.get(models.Staff, o_appt.doctor_id)
        if not o_doc_staff and o_trg and o_trg.recommended_doctor_id:
            o_doc_staff = staff_by_id.get(o_trg.recommended_doctor_id) or db.get(models.Staff, o_trg.recommended_doctor_id)

        o_doc_name = None
        o_doc_spec = None
        o_doc_room = None
        o_doc_floor = None
        if o_doc_staff:
            o_doc_name = o_doc_staff.name
            if o_doc_name and not o_doc_name.startswith("Dr.") and not o_doc_name.startswith("dr.") and o_doc_staff.role == "DOCTOR":
                o_doc_name = f"Dr. {o_doc_name}"
            o_doc_spec = o_doc_staff.specialty or o_doc_staff.department
            o_doc_room = o_doc_staff.room
            o_doc_floor = o_doc_staff.floor
        elif order.ordered_by:
            o_doc_name = order.ordered_by if order.ordered_by.startswith("Dr.") else f"Dr. {order.ordered_by}"
            o_doc_spec = o_enc.department if o_enc else (o_appt.specialty if o_appt else None)

        o_reason = (
            o_appt.reason if (o_appt and o_appt.reason)
            else (o_trg.chief_complaint if (o_trg and o_trg.chief_complaint)
            else (o_enc.notes if (o_enc and o_enc.notes and not o_enc.notes.startswith("parent:"))
            else None))
        )

        doctor_data = {
            "doctor_id": o_doc_staff.staff_id if o_doc_staff else (care_team_list[0].get("staff_id") if care_team_list else None),
            "name": o_doc_name or (care_team_list[0]["name"] if care_team_list else "Dr. Neha Nair"),
            "specialty": o_doc_spec or (o_enc.department if o_enc else "Orthopaedics"),
            "room": o_doc_room,
            "floor": o_doc_floor,
        }
        appointment_data = {
            "appointment_id": o_appt.appointment_id if o_appt else (o_enc.appointment_id if o_enc else None),
            "encounter_id": order.encounter_id,
            "date": (o_appt.scheduled_start.date().isoformat() if (o_appt and o_appt.scheduled_start) else (o_enc.arrival_ts.date().isoformat() if o_enc else "")),
            "reason": o_reason or "Doctor Consultation & Clinical Assessment",
            "department": o_appt.department if o_appt else (o_enc.department if o_enc else None),
        }

        order_results = []
        for o, r in recent_results:
            if o.lab_order_id == order.lab_order_id and r:
                order_results.append({
                    "result_id": r.result_id,
                    "analyte": r.analyte,
                    "value": r.value,
                    "unit": r.unit,
                    "reference_low": r.reference_low,
                    "reference_high": r.reference_high,
                    "reference_range": f"{r.reference_low} - {r.reference_high} {r.unit or ''}".strip() if (r.reference_low is not None and r.reference_high is not None) else None,
                    "abnormal_flag": r.abnormal_flag or "N",
                    "status": r.status,
                })

        order_date = (order.sample_collected_ts or order.ordered_ts).strftime("%d %b %Y") if order.ordered_ts else ""

        # Determine human-friendly finding text based on actual status & bookings
        if order.notes:
            finding_text = order.notes
        elif order.status in ["RESULTED", "COMPLETED", "DISCHARGED"]:
            finding_text = f"{primary_res.value} {primary_res.unit or ''}".strip() if (primary_res and primary_res.value is not None) else "Report Ready & Verified"
        elif order.status == "SAMPLE_COLLECTED":
            finding_text = "Sample / Scan collected · Processing in laboratory"
        elif order.status in ["CONFIRMED", "BOOKED", "SCHEDULED"] or order.booking_slot:
            slot_info = f" ({order.booking_date} {order.booking_slot})" if (order.booking_date and order.booking_slot) else ""
            finding_text = f"Slot Booked & Confirmed{slot_info} · Pending Sample Collection"
        else:
            finding_text = "Action Required · Pending Booking / Sample Collection"

        item_data = {
            "lab_order_id": order.lab_order_id,
            "order_id": order.lab_order_id,
            "encounter_id": order.encounter_id,
            "name": order.test_name or "Diagnostic Test",
            "test": order.test_name or "Diagnostic Test",
            "panel": order.panel or ("Imaging & Radiology" if is_imaging else "Clinical Laboratory"),
            "price": price,
            "status": norm_status,
            "raw_status": order.status,
            "booking_date": order.booking_date,
            "booking_slot": order.booking_slot,
            "date": order_date,
            "value": f"{primary_res.value} {primary_res.unit or ''}".strip() if (primary_res and primary_res.value is not None) else finding_text,
            "flag": primary_res.abnormal_flag if primary_res else "N",
            "finding": finding_text,
            "notes": order.notes,
            "attachment_name": order.attachment_name,
            "attachment_uri": order.attachment_uri,
            "is_imaging": is_imaging,
            "results": order_results,
            "doctor": doctor_data,
            "appointment": appointment_data,
        }

        if norm_status in ["CREATED", "PENDING"]:
            pending_orders_list.append(item_data)

        if is_imaging:
            scans_list.append({
                "report_id": order.lab_order_id,
                "lab_order_id": order.lab_order_id,
                "order_id": order.lab_order_id,
                "encounter_id": order.encounter_id,
                "name": order.test_name or "Imaging Scan",
                "modality": order.panel or "Radiology / Imaging",
                "price": price,
                "date": order_date,
                "finding": finding_text,
                "notes": order.notes,
                "status": norm_status,
                "raw_status": order.status,
                "booking_date": order.booking_date,
                "booking_slot": order.booking_slot,
                "attachment_name": order.attachment_name,
                "attachment_uri": order.attachment_uri,
                "is_imaging": True,
                "results": order_results,
                "doctor": doctor_data,
                "appointment": appointment_data,
            })
        else:
            lab_reports_list.append(item_data)

    # Also check scan documents
    for doc in recent_documents:
        if doc.doc_type == "SCAN":
            scans_list.append({
                "report_id": doc.document_id,
                "name": doc.title or "Imaging Scan",
                "modality": "Scan",
                "date": doc.created_ts.strftime("%d %b %Y") if doc.created_ts else "",
                "finding": "Uploaded Document",
                "status": "Report Ready",
                "attachment_uri": doc.uri,
            })

    # Active medications detailed from PatientMedication + Prescription Items
    medications_detailed = []
    seen_drugs = set()
    for m in active_meds_rows:
        seen_drugs.add(m.drug_name.lower())
        medications_detailed.append({
            "medication_id": m.medication_id,
            "name": m.drug_name,
            "dose": m.dosage or "Standard Dose",
            "freq": "As Prescribed",
            "route": "Oral",
            "purpose": "Prescribed Medication",
            "status": m.status,
            "created_ts": m.created_ts.isoformat() if m.created_ts else None,
        })

    # Check prescriptions for active items
    active_prescriptions = db.scalars(
        select(models.Prescription)
        .where(models.Prescription.patient_id == patient_id)
        .where(models.Prescription.status.in_(["APPROVED", "DISPENSED", "ACTIVE"]))
        .order_by(models.Prescription.created_ts.desc())
    ).all()
    for rx in active_prescriptions:
        for itm in rx.items:
            if itm.drug_name.lower() not in seen_drugs:
                seen_drugs.add(itm.drug_name.lower())
                medications_detailed.append({
                    "medication_id": itm.rx_item_id,
                    "name": itm.drug_name,
                    "dose": itm.dose or "Standard Dose",
                    "freq": itm.frequency or "Once Daily",
                    "route": itm.route or "Oral",
                    "purpose": itm.instructions or "Prescribed Treatment",
                    "status": "ACTIVE",
                    "created_ts": rx.created_ts.isoformat() if rx.created_ts else None,
                })

    audit(db, actor_id="copilot", actor_role="SYSTEM", action="PATIENT360_READ",
          entity_type="patient", entity_id=patient_id, consent_id=consent_id)
    db.commit()
    bus.publish(Topics.PATIENT360_ASSEMBLED, {"patient_id": patient_id})

    brief = _patient_brief(patient)
    allergies_list = [
        {"allergy_id": a.allergy_id, "substance": a.substance, "drug_class": a.drug_class, "severity": a.severity, "reaction": a.reaction}
        for a in patient.allergies
    ]
    issues_list = [
        {"issue_id": i.issue_id, "issue_name": i.issue_name, "onset_info": i.onset_info, "status": i.status}
        for i in patient.issues
    ]
    patient_docs = db.scalars(
        select(models.Document)
        .where(models.Document.patient_id == patient_id)
        .order_by(models.Document.created_ts.desc())
    ).all()
    documents_list = [
        {
            "document_id": d.document_id,
            "title": d.title or "Medical Document",
            "doc_type": d.doc_type,
            "uri": d.uri,
            "created_ts": d.created_ts.isoformat() if d.created_ts else None,
            "encounter_id": d.encounter_id,
        }
        for d in patient_docs
    ]
    formatted_notes = [{"date": n.created_ts.date().isoformat(), "text": n.final_text} for n in notes]
    vitals_payload = None if not latest_vitals else {
        "bp": f"{latest_vitals.bp_systolic}/{latest_vitals.bp_diastolic}" if (latest_vitals.bp_systolic and latest_vitals.bp_diastolic) else None,
        "bp_systolic": latest_vitals.bp_systolic,
        "bp_diastolic": latest_vitals.bp_diastolic,
        "spo2": latest_vitals.spo2,
        "heart_rate": latest_vitals.heart_rate,
        "respiratory_rate": latest_vitals.respiratory_rate,
        "temperature": latest_vitals.temperature,
        "bmi": latest_vitals.bmi,
        "weight_kg": latest_vitals.weight_kg,
        "height_cm": latest_vitals.height_cm,
        "captured_ts": latest_vitals.captured_ts.isoformat() if latest_vitals.captured_ts else None,
    }

    summary_text = patient.summary or (formatted_notes[0]["text"] if formatted_notes else None)
    summary_res = None
    if summary_text:
        summary_res = {
            "result": {"summary": summary_text},
            "agent": "Patient History Summary",
            "source": "database"
        }

    # Gather all active tokens (Triage, Doctor Consultation, Lab, Pharmacy)
    active_tokens_list = []
    seen_token_numbers = set()
    for e in encounters:
        tokens_for_enc = db.scalars(
            select(models.Token)
            .where(models.Token.encounter_id == e.encounter_id)
            .order_by(models.Token.issued_ts.desc())
        ).all()
        for t in tokens_for_enc:
            t_status = (t.status or "").upper()
            if t_status not in ["DONE", "COMPLETED", "CANCELLED"] and t.token_number not in seen_token_numbers:
                is_lab = (t.token_number and t.token_number.startswith("L-")) or (t.department or "").lower() == "laboratory" or e.visit_type == "LAB"
                is_pharmacy = (t.token_number and t.token_number.startswith("PHA-")) or (t.department or "").lower() == "pharmacy"
                is_triage = (t.token_number and t.token_number.startswith("T-")) or (t.department or "").lower() == "triage"
                token_type = "PHARMACY" if is_pharmacy else ("LAB" if is_lab else ("TRIAGE" if is_triage else "CONSULTATION"))

                # Once triage is done (encounter status is TRIAGED, IN_CONSULT, COMPLETED, etc. or a doctor consultation token exists), triage token is fulfilled
                if is_triage and (
                    (e.status or "").upper() in ["TRIAGED", "IN_CONSULT", "IN_CONSULTATION", "CONSULTING", "WITH_DOCTOR", "COMPLETED", "DISCHARGED", "CANCELLED", "EMERGENCY"]
                    or any(
                        not other.token_number.startswith("T-")
                        and (other.department or "").lower() != "triage"
                        and not other.token_number.startswith("L-")
                        and not other.token_number.startswith("PHA-")
                        for other in tokens_for_enc
                    )
                ):
                    t.status = "COMPLETED"
                    continue

                seen_token_numbers.add(t.token_number)

                active_tokens_list.append({
                    "number": t.token_number,
                    "token_type": token_type,
                    "room": t.room or ("Pharmacy Counter 3" if is_pharmacy else ("Phlebotomy / Lab 1" if is_lab else ("Triage Room 2" if is_triage else "Consultation Room 109"))),
                    "floor": t.floor or ("Ground Floor" if (is_pharmacy or is_lab or is_triage) else "Floor 3"),
                    "department": t.department or ("Pharmacy" if is_pharmacy else ("Laboratory & Diagnostics" if is_lab else ("Triage & Intake" if is_triage else "Doctor Consultation"))),
                    "status": t.status or "WAITING",
                    "encounter_id": e.encounter_id,
                    "encounter_status": e.status,
                    "is_lab": is_lab,
                    "is_pharmacy": is_pharmacy,
                    "is_triage": is_triage,
                    "visit_type": e.visit_type or token_type,
                    "eta_minutes": _calculate_live_eta(db, e.encounter_id) if not is_lab else 10,
                })

    # All Prescriptions for this patient (with linked doctor, appointment details, and live pharmacy pickup token)
    all_patient_prescriptions = db.scalars(
        select(models.Prescription)
        .where(models.Prescription.patient_id == patient_id)
        .order_by(models.Prescription.created_ts.desc())
    ).all()

    prescriptions_list = []
    for rx in all_patient_prescriptions:
        rx_encounter = db.get(models.Encounter, rx.encounter_id) if rx.encounter_id else None
        rx_appointment = encounter_appointments.get(rx_encounter.appointment_id) if (rx_encounter and rx_encounter.appointment_id) else None
        if not rx_appointment and rx_encounter and rx_encounter.appointment_id:
            rx_appointment = db.get(models.Appointment, rx_encounter.appointment_id)

        doc_staff = None
        if rx_encounter and rx_encounter.doctor_id:
            doc_staff = staff_by_id.get(rx_encounter.doctor_id) or db.get(models.Staff, rx_encounter.doctor_id)
        if not doc_staff and rx_appointment and rx_appointment.doctor_id:
            doc_staff = staff_by_id.get(rx_appointment.doctor_id) or db.get(models.Staff, rx_appointment.doctor_id)
        if not doc_staff and rx.prescribed_by:
            clean_name = rx.prescribed_by.replace("Dr. ", "").replace("dr. ", "").strip()
            doc_staff = staff_by_id.get(rx.prescribed_by) or db.get(models.Staff, rx.prescribed_by) or db.scalar(select(models.Staff).where(models.Staff.name.ilike(f"%{clean_name}%")))

        doc_name = doc_staff.name if doc_staff else (rx.prescribed_by or "Attending Physician")
        if doc_name and not doc_name.startswith("Dr.") and not doc_name.startswith("dr."):
            doc_name = f"Dr. {doc_name}"
        doc_specialty = doc_staff.specialty or doc_staff.department if doc_staff else (rx_encounter.department if rx_encounter else "General Medicine")
        doc_room = doc_staff.room if doc_staff else "Consultation Room"
        doc_floor = doc_staff.floor if doc_staff else "Floor 1"

        pharmacy_token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == rx.encounter_id)
            .where(models.Token.department == "Pharmacy")
            .order_by(models.Token.issued_ts.desc())
        )

        rx_items_list = []
        for itm in rx.items:
            stock_price = db.scalar(
                select(models.PharmacyStock.unit_price)
                .where(func.lower(models.PharmacyStock.drug_name) == itm.drug_name.lower())
            ) or 10.0
            rx_items_list.append({
                "rx_item_id": itm.rx_item_id,
                "drug_name": itm.drug_name,
                "dose": itm.dose or "Standard Dose",
                "frequency": itm.frequency or "Once Daily",
                "route": itm.route or "Oral",
                "duration_days": itm.duration_days if itm.duration_days is not None else 7,
                "instructions": itm.instructions or "As directed by physician",
                "quantity": itm.quantity or 1,
                "unit_price": stock_price,
            })

        appt_date_str = ""
        if rx_appointment and rx_appointment.scheduled_start:
            appt_date_str = rx_appointment.scheduled_start.strftime("%d %b %Y, %I:%M %p")
        elif rx_encounter and rx_encounter.arrival_ts:
            appt_date_str = rx_encounter.arrival_ts.strftime("%d %b %Y, %I:%M %p")
        elif rx.created_ts:
            appt_date_str = rx.created_ts.strftime("%d %b %Y, %I:%M %p")

        appt_reason_str = (
            rx_appointment.reason if (rx_appointment and rx_appointment.reason)
            else (rx_encounter.notes if (rx_encounter and rx_encounter.notes)
            else "Doctor Consultation & Clinical Assessment")
        )

        prescriptions_list.append({
            "rx_id": rx.rx_id,
            "encounter_id": rx.encounter_id,
            "status": rx.status,
            "created_ts": rx.created_ts.isoformat() if rx.created_ts else None,
            "approved_ts": rx.approved_ts.isoformat() if rx.approved_ts else None,
            "doctor": {
                "name": doc_name,
                "specialty": doc_specialty,
                "room": doc_room,
                "floor": doc_floor,
            },
            "appointment": {
                "appointment_id": rx_appointment.appointment_id if rx_appointment else None,
                "date": appt_date_str,
                "reason": appt_reason_str,
                "department": rx_encounter.department if rx_encounter else (rx_appointment.department if rx_appointment else "OPD"),
            },
            "pickup_token": {
                "number": pharmacy_token.token_number,
                "status": pharmacy_token.status,
                "room": pharmacy_token.room or "Pharmacy Counter 3",
                "floor": pharmacy_token.floor or "Ground Floor",
            } if pharmacy_token else None,
            "items": rx_items_list,
        })

    # Itemized Bills and Statements for all patient encounters
    bills_list = []
    target_billing_encs = primary_encs if primary_encs else encounters
    for e in target_billing_encs:
        try:
            inv = services.get_or_create_invoice(db, e)
            services.recalc_invoice(db, inv)

            appt = encounter_appointments.get(e.appointment_id) if e.appointment_id else None
            if not appt and e.appointment_id:
                appt = db.get(models.Appointment, e.appointment_id)

            doc_staff_id = e.doctor_id or (appt.doctor_id if appt else None)
            doc_staff = staff_by_id.get(doc_staff_id) if doc_staff_id else (db.get(models.Staff, doc_staff_id) if doc_staff_id else None)

            doc_name = doc_staff.name if doc_staff else (e.department and f"Dr. {e.department} Consultant" or "Attending Physician")
            if doc_name and not doc_name.startswith("Dr.") and not doc_name.startswith("dr."):
                doc_name = f"Dr. {doc_name}"
            doc_spec = doc_staff.specialty or doc_staff.department if doc_staff else (e.department or "General Medicine")
            doc_room = doc_staff.room if doc_staff else "Consultation Room"
            doc_floor = doc_staff.floor if doc_staff else "Floor 1"

            appt_date_str = (
                appt.scheduled_start.strftime("%d %b %Y, %I:%M %p") if (appt and appt.scheduled_start)
                else (e.arrival_ts.strftime("%d %b %Y, %I:%M %p") if e.arrival_ts else "")
            )
            appt_reason_str = (
                appt.reason if (appt and appt.reason)
                else (e.notes if (e.notes and not e.notes.startswith("parent:")) else f"{e.visit_type or 'OPD'} Consultation")
            )
            # Reconcile online prepayment sources (OPD booking, Pharmacy orders, Lab payments)
            opd_order = None
            if appt:
                opd_order = db.scalar(
                    select(models.RazorpayOrder)
                    .where(models.RazorpayOrder.appointment_id == appt.appointment_id)
                    .where(models.RazorpayOrder.status == "PAID")
                )
            if not opd_order and appt and appt.reason:
                opd_order = db.scalar(
                    select(models.RazorpayOrder)
                    .where(models.RazorpayOrder.patient_id == patient_id)
                    .where(models.RazorpayOrder.appointment_type == "OPD")
                    .where(models.RazorpayOrder.status == "PAID")
                    .where(models.RazorpayOrder.reason.ilike(f"%{appt.reason}%"))
                )

            # Check pharmacy prepayments for this encounter
            rx_records = db.scalars(
                select(models.Prescription).where(models.Prescription.encounter_id == e.encounter_id)
            ).all()
            is_rx_prepaid = any(rx.status in ["PREPAID", "DISPENSED", "COLLECTED"] for rx in rx_records)
            if not is_rx_prepaid:
                for rx in rx_records:
                    rx_ord = db.scalar(
                        select(models.RazorpayOrder)
                        .where(models.RazorpayOrder.patient_id == patient_id)
                        .where(models.RazorpayOrder.appointment_type == "PHARMACY")
                        .where(models.RazorpayOrder.status == "PAID")
                        .where(models.RazorpayOrder.reason == f"Prescription payment: {rx.rx_id}")
                    )
                    if rx_ord:
                        is_rx_prepaid = True
                        break

            # Check lab order prepayments
            patient_lab_orders = db.scalars(
                select(models.LabOrder).where(models.LabOrder.patient_id == patient_id)
            ).all()
            paid_lab_order_ids = set()
            for ro in db.scalars(
                select(models.RazorpayOrder)
                .where(models.RazorpayOrder.patient_id == patient_id)
                .where(models.RazorpayOrder.appointment_type == "LAB")
                .where(models.RazorpayOrder.status == "PAID")
            ).all():
                if ro.reason and "Lab orders payment:" in ro.reason:
                    raw_ids = ro.reason.split("Lab orders payment:", 1)[1].strip()
                    for oid in raw_ids.split(","):
                        paid_lab_order_ids.add(oid.strip())

            # Check direct invoice payments
            payments = db.scalars(select(models.Payment).where(models.Payment.invoice_id == inv.invoice_id)).all()
            direct_paid_total = sum(p.amount for p in payments if p.status == "COMPLETED")

            formatted_lines = []
            paid_lines_sum = direct_paid_total
            for line in inv.lines:
                line_total = round(line.amount * line.quantity, 2)
                line_paid = False
                if inv.status == "PAID" or inv.balance <= 0.01:
                    line_paid = True
                elif line.category == "CONSULT" and opd_order:
                    line_paid = True
                elif line.category == "PHARMACY" and is_rx_prepaid:
                    line_paid = True
                elif line.category == "LAB":
                    clean_test = line.description.replace("Lab: ", "").strip().lower()
                    matching = [lo for lo in patient_lab_orders if lo.test_name.strip().lower() == clean_test]
                    if matching:
                        for m in matching:
                            if m.lab_order_id in paid_lab_order_ids or m.status in ["CONFIRMED", "COLLECTED", "PROCESSING", "RESULTED", "COMPLETED", "PAID"]:
                                line_paid = True
                                break
                    elif paid_lab_order_ids:
                        line_paid = True
                
                if line_paid:
                    paid_lines_sum += line_total

                formatted_lines.append({
                    "line_id": line.line_id,
                    "category": line.category,
                    "description": line.description,
                    "amount": line.amount,
                    "quantity": line.quantity,
                    "total": line_total,
                    "is_paid": line_paid,
                    "status": "Paid" if line_paid else "Unpaid",
                })

            subtotal = round(inv.consultation_amt + inv.lab_amt + inv.pharmacy_amt, 2)
            calculated_due = max(0.0, round(inv.total - paid_lines_sum, 2))
            is_paid = calculated_due <= 0.01 or inv.status == "PAID"
            
            # Sync invoice balance and status in DB
            if is_paid and inv.status != "PAID":
                inv.status = "PAID"
                inv.balance = 0.0
            elif not is_paid:
                inv.balance = calculated_due
            
            # Format clean bill number like BIL-2026-0818-0012
            inv_created = inv.created_ts or e.arrival_ts or datetime.now()
            date_prefix = inv_created.strftime("%Y-%m%d")
            short_suffix = inv.invoice_id.replace("-", "")[:4].upper()
            bill_number = f"BIL-{date_prefix}-{short_suffix}"

            bills_list.append({
                "bill_id": inv.invoice_id,
                "invoice_id": inv.invoice_id,
                "bill_no": bill_number,
                "encounter_id": e.encounter_id,
                "status": "Paid" if is_paid else "Unpaid",
                "is_paid": is_paid,
                "date": appt_date_str,
                "billing_date": inv_created.strftime("%d %b %Y"),
                "doctor": {
                    "name": doc_name,
                    "specialty": doc_spec,
                    "room": doc_room,
                    "floor": doc_floor,
                },
                "appointment": {
                    "appointment_id": appt.appointment_id if appt else None,
                    "date": appt_date_str,
                    "reason": appt_reason_str,
                    "department": e.department or "Outpatient",
                    "visit_type": e.visit_type or "Consultation",
                    "status": e.status,
                    "location": f"{doc_room} / {doc_floor}",
                },
                "subtotal": subtotal,
                "tax": inv.tax,
                "total": inv.total,
                "consultation_amt": inv.consultation_amt,
                "lab_amt": inv.lab_amt,
                "pharmacy_amt": inv.pharmacy_amt,
                "due_amount": 0.0 if is_paid else calculated_due,
                "paid_amount": inv.total if is_paid else round(paid_lines_sum, 2),
                "balance": 0.0 if is_paid else calculated_due,
                "lines": formatted_lines,
                "created_ts": inv.created_ts.isoformat() if inv.created_ts else (e.arrival_ts.isoformat() if e.arrival_ts else None),
            })
        except Exception as ex:
            logger.warning(f"Failed to generate invoice for encounter {e.encounter_id}: {ex}")

    # Sort bills with latest visit on top
    bills_list.sort(key=lambda b: b.get("created_ts") or "", reverse=True)

    # All triages for encounters
    triages_for_encs = db.scalars(
        select(models.Triage).where(models.Triage.encounter_id.in_(enc_ids or [""]))
    ).all()
    triage_by_enc = {t.encounter_id: t for t in triages_for_encs}

    # Triage nurses lookup
    triage_staff_members = db.scalars(
        select(models.Staff).where(models.Staff.role == "NURSE")
    ).all()
    default_nurse_name = triage_staff_members[0].name if triage_staff_members else "Priya Sharma"

    vitals_history = []
    seen_vitals_appts = set()
    # Sort all vitals rows by captured_ts descending (latest first)
    sorted_vitals = sorted(
        all_vitals_rows,
        key=lambda v_row: v_row.captured_ts if v_row.captured_ts else datetime.min.replace(tzinfo=timezone.utc),
        reverse=True
    )

    for v in sorted_vitals:
        v_enc = db.get(models.Encounter, v.encounter_id) if v.encounter_id else None
        v_appt = encounter_appointments.get(v_enc.appointment_id) if (v_enc and v_enc.appointment_id) else None
        if not v_appt and v_enc and v_enc.appointment_id:
            v_appt = db.get(models.Appointment, v_enc.appointment_id)
        v_trg = triage_by_enc.get(v.encounter_id)

        # Per appointment / encounter, only show 1 vital (the latest one)
        v_key = v_appt.appointment_id if v_appt else (v.encounter_id or v.vital_id)
        if v_key in seen_vitals_appts:
            continue
        seen_vitals_appts.add(v_key)

        # Resolve nurse staff
        t_tok = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == v.encounter_id)
            .where(models.Token.token_number.like("T-%"))
        )
        assigned_nurse = None
        if t_tok and t_tok.room:
            nurse_for_room = next((ns for ns in triage_staff_members if ns.room == t_tok.room), None)
            if nurse_for_room:
                assigned_nurse = nurse_for_room.name
        if not assigned_nurse:
            assigned_nurse = default_nurse_name
        nurse_display_name = f"Nurse {assigned_nurse}" if not assigned_nurse.startswith("Nurse") else assigned_nurse

        v_doc_staff = None
        if v_enc and v_enc.doctor_id:
            v_doc_staff = staff_by_id.get(v_enc.doctor_id) or db.get(models.Staff, v_enc.doctor_id)
        if not v_doc_staff and v_appt and v_appt.doctor_id:
            v_doc_staff = staff_by_id.get(v_appt.doctor_id) or db.get(models.Staff, v_appt.doctor_id)
        if not v_doc_staff and v_trg and v_trg.recommended_doctor_id:
            v_doc_staff = staff_by_id.get(v_trg.recommended_doctor_id) or db.get(models.Staff, v_trg.recommended_doctor_id)

        doc_name = None
        doc_specialty = None
        doc_room = None
        doc_floor = None
        if v_doc_staff:
            doc_name = v_doc_staff.name
            if doc_name and not doc_name.startswith("Dr.") and not doc_name.startswith("dr.") and v_doc_staff.role == "DOCTOR":
                doc_name = f"Dr. {doc_name}"
            doc_specialty = v_doc_staff.specialty or v_doc_staff.department
            doc_room = v_doc_staff.room
            doc_floor = v_doc_staff.floor
        elif v_enc and v_enc.department:
            doc_specialty = v_enc.department
        elif v_appt and v_appt.specialty:
            doc_specialty = v_appt.specialty

        health_concern = (
            v_appt.reason if (v_appt and v_appt.reason)
            else (v_trg.chief_complaint if (v_trg and v_trg.chief_complaint)
            else (v_enc.notes if (v_enc and v_enc.notes and not v_enc.notes.startswith("parent:"))
            else None))
        )

        v_captured = v.captured_ts or (v_enc.arrival_ts if v_enc else None)
        v_date_str = v_captured.strftime("%d %b %Y, %I:%M %p") if v_captured else ""
        v_time_str = v_captured.strftime("%I:%M %p") if v_captured else ""

        vitals_history.append({
            "vital_id": v.vital_id,
            "encounter_id": v.encounter_id,
            "captured_ts": v_captured.isoformat() if v_captured else None,
            "date": v_date_str,
            "captured_time": v_time_str,
            "nurse_name": nurse_display_name,
            "bp": f"{v.bp_systolic}/{v.bp_diastolic}" if (v.bp_systolic and v.bp_diastolic) else None,
            "bp_systolic": v.bp_systolic,
            "bp_diastolic": v.bp_diastolic,
            "spo2": v.spo2,
            "heart_rate": v.heart_rate,
            "respiratory_rate": v.respiratory_rate,
            "temperature": v.temperature,
            "weight_kg": v.weight_kg,
            "height_cm": v.height_cm,
            "bmi": v.bmi,
            "doctor": {
                "name": doc_name,
                "specialty": doc_specialty,
                "room": doc_room,
                "floor": doc_floor,
            } if (doc_name or doc_specialty) else None,
            "appointment": {
                "appointment_id": v_appt.appointment_id if v_appt else None,
                "date": v_appt.scheduled_start.strftime("%d %b %Y, %I:%M %p") if (v_appt and v_appt.scheduled_start) else v_date_str,
                "reason": health_concern,
                "department": v_enc.department if v_enc else (v_appt.department if v_appt else None),
                "visit_type": v_enc.visit_type if v_enc else (v_appt.appointment_type if v_appt else "OPD"),
            } if (v_appt or health_concern) else None,
            "health_concern": health_concern,
            "department": v_enc.department if v_enc else (v_appt.department if v_appt else None),
        })

    # Build comprehensive doctor notes strictly from real DB records grouped by appointment
    doctor_notes_by_appointment = []
    for appt_group in care_team_by_appointment:
        appt_id = appt_group.get("appointment_id")
        enc_id = appt_group.get("encounter_id")
        appt_date = appt_group.get("date")
        doc_name = appt_group.get("doctor_name") or "Consultant"
        dept = appt_group.get("department") or "General Medicine"
        reason = appt_group.get("reason") or "Clinical Consultation"
        status = appt_group.get("status") or "COMPLETED"

        # 1. Real Clinical Note from DB (models.ClinicalNote)
        real_clinical_notes = []
        if enc_id:
            real_clinical_notes = db.scalars(
                select(models.ClinicalNote)
                .where(models.ClinicalNote.encounter_id == enc_id)
                .order_by(models.ClinicalNote.created_ts.desc())
            ).all()

        latest_clinical_note = real_clinical_notes[0] if real_clinical_notes else None
        raw_clinical_text = ""
        icd10_list = []
        if latest_clinical_note:
            raw_clinical_text = latest_clinical_note.final_text or latest_clinical_note.ai_draft or ""
            icd10_list = latest_clinical_note.icd10_codes or []

        # 2. Real Encounter notes / advice from DB (models.Encounter.notes)
        enc_obj = db.get(models.Encounter, enc_id) if enc_id else None
        enc_advice_raw = ""
        if enc_obj and enc_obj.notes and not enc_obj.notes.startswith("parent:"):
            # Exclude raw internal IDs
            if not (len(enc_obj.notes) > 30 and "-" in enc_obj.notes and "," in enc_obj.notes and " " not in enc_obj.notes):
                enc_advice_raw = enc_obj.notes

        # 3. Real Triage data from DB (models.Triage)
        trg_obj = db.scalar(select(models.Triage).where(models.Triage.encounter_id == enc_id)) if enc_id else None
        triage_complaint = trg_obj.chief_complaint if trg_obj else None
        triage_symptoms = trg_obj.symptom_summary if trg_obj else None

        # 4. Parse clinical assessment & advice strictly from stored DB text
        assessment_text = ""
        real_advice_items = []

        if raw_clinical_text:
            import re
            a_match = re.search(r'(?:^|\n)\s*A(?:ssessment)?\s*:\s*(.*?)(?=\n\s*P(?:lan)?\s*:|$)', raw_clinical_text, re.DOTALL | re.IGNORECASE)
            p_match = re.search(r'(?:^|\n)\s*P(?:lan)?\s*:\s*(.*?)$', raw_clinical_text, re.DOTALL | re.IGNORECASE)

            if a_match:
                assessment_text = a_match.group(1).strip()
            else:
                assessment_text = raw_clinical_text.strip()

            if p_match:
                plan_text = p_match.group(1).strip()
                for line in plan_text.split("\n"):
                    clean_line = line.strip().lstrip("*-•123456789.) ").strip()
                    if clean_line:
                        real_advice_items.append(clean_line)

        if enc_advice_raw:
            for line in enc_advice_raw.split("\n"):
                clean_line = line.strip().lstrip("*-•123456789.) ").strip()
                if clean_line and clean_line not in real_advice_items:
                    real_advice_items.append(clean_line)

        # If no explicit assessment is written yet, fallback to real appointment reason or triage complaint
        if not assessment_text:
            if triage_symptoms:
                assessment_text = triage_symptoms
            elif triage_complaint:
                assessment_text = f"Clinical assessment for: {triage_complaint}"
            elif reason:
                assessment_text = f"Consultation for: {reason}"

        # 5. Matching Prescriptions from DB
        rx_for_appt = [
            rx for rx in prescriptions_list
            if (enc_id and rx.get("encounter_id") == enc_id) or (appt_id and rx.get("appointment", {}).get("appointment_id") == appt_id)
        ]

        # 6. Matching Lab Orders / Scans from DB
        labs_for_appt = [
            l for l in (lab_reports_list + scans_list)
            if (enc_id and l.get("encounter_id") == enc_id) or (appt_id and l.get("appointment", {}).get("appointment_id") == appt_id)
        ]

        # 7. Matching Baseline Vitals from DB
        vitals_for_appt = next(
            (v for v in vitals_history if (appt_id and v.get("appointment", {}).get("appointment_id") == appt_id) or (enc_id and v.get("encounter_id") == enc_id)),
            None
        )

        doctor_notes_by_appointment.append({
            "appointment_id": appt_id,
            "encounter_id": enc_id,
            "date": appt_date,
            "doctor_name": doc_name,
            "department": dept,
            "specialty": dept,
            "reason": reason,
            "status": status,
            "clinical_note_raw": raw_clinical_text or None,
            "assessment": assessment_text,
            "advice": real_advice_items,
            "icd10_codes": icd10_list,
            "triage": {
                "chief_complaint": triage_complaint,
                "symptom_summary": triage_symptoms,
            } if (triage_complaint or triage_symptoms) else None,
            "prescriptions": [
                {
                    "drug_name": itm.get("drug_name"),
                    "dose": itm.get("dose"),
                    "frequency": itm.get("frequency"),
                    "instructions": itm.get("instructions"),
                    "duration_days": itm.get("duration_days"),
                }
                for rx in rx_for_appt for itm in rx.get("items", [])
            ],
            "ordered_investigations": [
                {
                    "test_name": l.get("name") or l.get("test"),
                    "category": l.get("panel") or l.get("modality"),
                    "status": l.get("status"),
                    "finding": l.get("finding") or l.get("value"),
                }
                for l in labs_for_appt
            ],
            "vitals_at_visit": vitals_for_appt,
        })

    return {
        "patient": brief,
        "active_token": active_tokens_list[0] if active_tokens_list else None,
        "active_tokens": active_tokens_list,
        "allergies": allergies_list,
        "issues": issues_list,
        "active_medications": active_meds,
        "medications": medications_detailed if medications_detailed else medications_list,
        "prescriptions": prescriptions_list,
        "bills": bills_list,
        "latest_vitals": vitals_payload,
        "vitals_history": vitals_history,
        "recent_notes": formatted_notes,
        "doctor_notes_by_appointment": doctor_notes_by_appointment,
        "care_team": care_team_list,
        "care_team_by_appointment": care_team_by_appointment,
        "past_doctors": [s for s in care_team_list if s.get("role") == "DOCTOR" or s.get("name", "").startswith("Dr.")],
        "lab_reports": lab_reports_list,
        "scans_diagnostics": scans_list,
        "pending_lab_orders": pending_orders_list,
        "clinical_summary": summary_text,
        "recent_results": [
            {
                "lab_order_id": order.lab_order_id,
                "test": order.test_name,
                "category": _lab_category(order.test_name),
                "analyte": result.analyte if result else "Lab Findings",
                "value": result.value if result else (order.notes or "Result completed"),
                "unit": result.unit if result else "",
                "flag": result.abnormal_flag if result else "N",
                "date": (result.resulted_ts if result else order.ordered_ts).date().isoformat(),
                "resulted_ts": (result.resulted_ts if result else (order.sample_collected_ts if order.sample_collected_ts else order.ordered_ts)).isoformat(),
                "attachment_name": order.attachment_name,
                "attachment_uri": order.attachment_uri,
            }
            for order, result in recent_results
        ],
        "all_appointments": [
            _appointment_brief(appt, staff_by_id.get(appt.doctor_id), db)
            for appt in all_patient_appts
        ],
        "encounters": [
            {"encounter_id": e.encounter_id, "date": e.arrival_ts.date().isoformat(),
             "arrival_ts": e.arrival_ts.isoformat(),
             "department": e.department, "status": e.status,
             "visit_type": e.visit_type,
             "doctor_id": e.doctor_id,
             "doctor_name": staff_by_id[e.doctor_id].name if e.doctor_id and e.doctor_id in staff_by_id else None,
             "appointment_id": e.appointment_id,
             "reason": encounter_appointments[e.appointment_id].reason
             if e.appointment_id in encounter_appointments else None}
            for e in encounters
        ],
        "episodes": episodes,
        "documents": documents_list,
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
        .order_by(models.Encounter.arrival_ts.desc()).limit(10)
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

    issues_str = ", ".join(f"{i.issue_name} ({i.onset_info or 'onset unknown'})" for i in patient.issues) or "No chronic issues recorded"

    summary_res = agents.patient_summary_agent(
        brief, allergies_list, active_meds, formatted_notes, vitals_payload, issues_str
    )
    
    # If it succeeded, save to database
    summary_text = summary_res.get("result", {}).get("summary")
    if summary_text and summary_text != "No response was returned":
        patient.summary = summary_text
        db.commit()

    return summary_res


class IssueCreateSchema(BaseModel):
    issue_name: str
    onset_info: str | None = None
    status: str = "ACTIVE"


@router.post("/patients/{patient_id}/issues")
def add_patient_issue(patient_id: str, body: IssueCreateSchema, db: Session = Depends(get_db)):
    patient = _get_patient(db, patient_id)
    issue = models.PatientIssue(
        patient_id=patient_id,
        issue_name=body.issue_name,
        onset_info=body.onset_info,
        status=body.status,
    )
    db.add(issue)
    db.commit()
    return {"status": "SUCCESS", "issue_id": issue.issue_id}


@router.delete("/patients/{patient_id}/issues/{issue_id}")
def delete_patient_issue(patient_id: str, issue_id: str, db: Session = Depends(get_db)):
    issue = db.scalar(
        select(models.PatientIssue)
        .where(models.PatientIssue.patient_id == patient_id)
        .where(models.PatientIssue.issue_id == issue_id)
    )
    if not issue:
        issue = db.scalar(
            select(models.PatientIssue)
            .where(models.PatientIssue.patient_id == patient_id)
            .where(models.PatientIssue.issue_name == issue_id)
        )
    if not issue:
        raise HTTPException(status_code=404, detail="Medical issue not found")
    db.delete(issue)
    db.commit()
    return {"status": "SUCCESS", "message": "Medical issue removed successfully"}


class AllergyCreateSchema(BaseModel):
    substance: str
    severity: str | None = "MILD"
    reaction: str | None = None
    drug_class: str | None = None


@router.post("/patients/{patient_id}/allergies")
def add_patient_allergy(patient_id: str, body: AllergyCreateSchema, db: Session = Depends(get_db)):
    patient = _get_patient(db, patient_id)
    allergy = models.Allergy(
        patient_id=patient_id,
        substance=body.substance.strip(),
        severity=body.severity or "MILD",
        reaction=body.reaction.strip() if body.reaction else None,
        drug_class=body.drug_class.strip() if body.drug_class else None,
    )
    db.add(allergy)
    db.commit()
    return {
        "status": "SUCCESS",
        "allergy_id": allergy.allergy_id,
        "substance": allergy.substance,
        "severity": allergy.severity,
        "reaction": allergy.reaction,
    }


@router.delete("/patients/{patient_id}/allergies/{allergy_id}")
def delete_patient_allergy(patient_id: str, allergy_id: str, db: Session = Depends(get_db)):
    allergy = db.scalar(
        select(models.Allergy)
        .where(models.Allergy.patient_id == patient_id)
        .where(models.Allergy.allergy_id == allergy_id)
    )
    if not allergy:
        allergy = db.scalar(
            select(models.Allergy)
            .where(models.Allergy.patient_id == patient_id)
            .where(models.Allergy.substance == allergy_id)
        )
    if not allergy:
        raise HTTPException(status_code=404, detail="Allergy record not found")
    db.delete(allergy)
    db.commit()
    return {"status": "SUCCESS", "message": "Allergy removed successfully"}


class MedicationCreateSchema(BaseModel):
    drug_name: str
    dosage: str | None = None
    status: str = "ACTIVE"


@router.post("/patients/{patient_id}/medications")
def add_patient_medication(patient_id: str, body: MedicationCreateSchema, db: Session = Depends(get_db)):
    patient = _get_patient(db, patient_id)
    med = models.PatientMedication(
        patient_id=patient_id,
        drug_name=body.drug_name.strip(),
        dosage=body.dosage.strip() if body.dosage else None,
        status=body.status,
    )
    db.add(med)
    db.commit()
    return {
        "status": "SUCCESS",
        "medication_id": med.medication_id,
        "drug_name": med.drug_name,
        "dosage": med.dosage
    }


@router.delete("/patients/{patient_id}/medications/{medication_id}")
def delete_patient_medication(patient_id: str, medication_id: str, db: Session = Depends(get_db)):
    med = db.scalar(
        select(models.PatientMedication)
        .where(models.PatientMedication.patient_id == patient_id)
        .where(models.PatientMedication.medication_id == medication_id)
    )
    if not med:
        raise HTTPException(status_code=404, detail="Medication record not found")
    db.delete(med)
    db.commit()
    return {"status": "SUCCESS", "message": "Medication removed successfully"}


# --------------------------------------------------------------------------------- Intake + Triage + Token
@router.post("/encounters/{encounter_id}/triage")
def run_triage(encounter_id: str, body: TriageRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _get_encounter(db, encounter_id)
    if encounter.visit_type in {"REVISIT", "E_CONSULT"}:
        raise HTTPException(409, "Follow-up consultations bypass triage and go directly to the assigned doctor")
    patient = _get_patient(db, encounter.patient_id)

    # Guard against duplicate triage submissions (e.g. double-click / retry on
    # a slow request): if this encounter has already been triaged within the last 5 seconds,
    # return the existing token instead of creating a second orphaned WAITING token.
    if encounter.status in ("TRIAGED", "EMERGENCY"):
        existing_triage = db.scalar(
            select(models.Triage)
            .where(models.Triage.encounter_id == encounter_id)
            .order_by(models.Triage.created_ts.desc())
        )
        existing_token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == encounter_id)
            .order_by(models.Token.token_id.desc())
        )
        if existing_triage and existing_token:
            created_utc = existing_triage.created_ts
            if created_utc.tzinfo is None:
                created_utc = created_utc.replace(tzinfo=timezone.utc)
            
            # If the request was made within 5 seconds, return duplicate response:
            if (datetime.now(timezone.utc) - created_utc).total_seconds() < 5:
                doctor = db.get(models.Staff, encounter.doctor_id) if encounter.doctor_id else None
                appt = db.get(models.Appointment, encounter.appointment_id) if encounter.appointment_id else None
                return {
                    "intake": {
                        "result": {
                            "chief_complaint": existing_triage.chief_complaint,
                            "symptom_summary": existing_triage.symptom_summary,
                            "duration": body.duration,
                        }
                    },
                    "triage": {
                        "result": {
                            "acuity_level": existing_triage.acuity_level,
                            "specialty": existing_triage.specialty,
                            "red_flag": existing_triage.red_flag,
                            "red_flag_reason": existing_triage.red_flag_reason,
                        }
                    },
                    "vitals": body.vitals.model_dump(exclude_none=True) if body.vitals else None,
                    "doctor": None if not doctor else {"id": doctor.staff_id, "name": doctor.name, "specialty": doctor.specialty},
                    "token": {"number": existing_token.token_number, "department": existing_token.department,
                              "room": existing_token.room, "floor": existing_token.floor,
                              "eta_minutes": _calculate_live_eta(db, encounter_id),
                              "patients_ahead": _calculate_patients_ahead(db, encounter_id)},
                    "encounter_status": encounter.status,
                    "scheduled_start": appt.scheduled_start.isoformat() if (appt and appt.scheduled_start) else None,
                }

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

    appointment = db.scalar(
        select(models.Appointment)
        .where(models.Appointment.encounter_id == encounter_id)
        .where(models.Appointment.status.in_(["BOOKED", "CHECKED_IN"]))
        .order_by(models.Appointment.created_ts.desc())
    )
    doctor = db.get(models.Staff, appointment.doctor_id) if appointment and appointment.specialty == tr["specialty"] else None
    doctor = doctor or db.scalar(
        select(models.Staff).where(models.Staff.role == "DOCTOR")
        .where(models.Staff.specialty == tr["specialty"]).where(models.Staff.available.is_(True))
    ) or db.scalar(select(models.Staff).where(models.Staff.role == "DOCTOR"))

    # Audit Logging: Track Patient Original Intake vs Nurse Triage Assessment
    existing_triage = db.scalar(
        select(models.Triage)
        .where(models.Triage.encounter_id == encounter_id)
        .order_by(models.Triage.created_ts.desc())
    )
    original_reason = appointment.reason if (appointment and appointment.reason) else encounter.notes

    has_audit = db.scalar(
        select(func.count())
        .select_from(models.EncounterAuditLog)
        .where(models.EncounterAuditLog.encounter_id == encounter_id)
    ) or 0

    if has_audit == 0 and original_reason:
        db.add(models.EncounterAuditLog(
            encounter_id=encounter_id,
            field_name="chief_complaint",
            old_value=None,
            new_value=original_reason.strip(),
            edited_by_role="PATIENT",
            edited_by_user=f"{patient.first_name} {patient.last_name}",
        ))

    prev_val = existing_triage.chief_complaint if existing_triage else original_reason
    if prev_val and chief and prev_val.strip() != chief.strip():
        db.add(models.EncounterAuditLog(
            encounter_id=encounter_id,
            field_name="chief_complaint",
            old_value=prev_val.strip(),
            new_value=chief.strip(),
            edited_by_role="NURSE",
            edited_by_user="Triage Assessment Nurse",
        ))

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

    # Synchronize linked appointment status to TRIAGED
    if encounter.appointment_id:
        linked_appt = db.get(models.Appointment, encounter.appointment_id)
        if linked_appt:
            linked_appt.status = encounter.status
            if encounter.doctor_id:
                linked_appt.doctor_id = encounter.doctor_id
            if encounter.department:
                linked_appt.specialty = encounter.department
    if appointment:
        appointment.status = encounter.status
        if encounter.doctor_id:
            appointment.doctor_id = encounter.doctor_id
        if encounter.department:
            appointment.specialty = encounter.department

    waiting = db.scalar(
        select(func.count()).select_from(models.Token).where(models.Token.status == "WAITING")
    ) or 0
    total_tokens = db.scalar(select(func.count()).select_from(models.Token)) or 0
    # Resolve room and floor using doctor's room/floor if available, else fallback to specialty _ROOMS map
    room = doctor.room if (doctor and doctor.room) else None
    floor = doctor.floor if (doctor and doctor.floor) else None
    if not room or not floor:
        s_room, s_floor = _ROOMS.get(tr["specialty"], ("Room 1", "Floor 1"))
        room = room or s_room
        floor = floor or s_floor

    # Mark any existing triage token(s) for this encounter as COMPLETED
    triage_tokens = db.scalars(
        select(models.Token)
        .where(models.Token.encounter_id == encounter_id)
        .where(
            or_(
                models.Token.token_number.like("T-%"),
                func.lower(models.Token.department) == "triage"
            )
        )
    ).all()
    for tt in triage_tokens:
        tt.status = "COMPLETED"

    # Check if a doctor consultation token already exists for this encounter
    existing_token = db.scalar(
        select(models.Token)
        .where(models.Token.encounter_id == encounter_id)
        .where(models.Token.token_number.like("A-%"))
    )
    if existing_token:
        existing_token.department = tr["specialty"]
        existing_token.room = room
        existing_token.floor = floor
        token = existing_token
    else:
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

    appt = db.get(models.Appointment, encounter.appointment_id) if encounter.appointment_id else None
    return {
        "intake": intake,
        "triage": triage,
        "vitals": vitals_dict or None,
        "doctor": None if not doctor else {"id": doctor.staff_id, "name": doctor.name, "specialty": doctor.specialty},
        "token": {"number": token.token_number, "department": token.department, "room": token.room,
                  "floor": token.floor, "eta_minutes": _calculate_live_eta(db, encounter_id),
                  "patients_ahead": _calculate_patients_ahead(db, encounter_id)},
        "encounter_status": encounter.status,
        "scheduled_start": appt.scheduled_start.isoformat() if (appt and appt.scheduled_start) else None,
    }


@router.post("/encounters/{encounter_id}/triage/override")
def override_triage(
    encounter_id: str,
    body: TriageOverrideRequest,
    db: Session = Depends(get_db),
) -> dict:
    encounter = _get_encounter(db, encounter_id)
    triage = db.scalar(
        select(models.Triage)
        .where(models.Triage.encounter_id == encounter_id)
        .order_by(models.Triage.created_ts.desc())
    )
    if not triage:
        raise HTTPException(404, "Complete triage before changing its routing")
    if body.acuity_level not in {"1", "2", "3", "4", "5"}:
        raise HTTPException(400, "Acuity level must be between 1 and 5")
    if not body.reason.strip():
        raise HTTPException(400, "An override reason is required")

    doctor = db.get(models.Staff, body.doctor_id)
    if not doctor or doctor.role != "DOCTOR":
        raise HTTPException(404, "Selected doctor was not found")
    if doctor.specialty != body.specialty:
        raise HTTPException(400, "Selected doctor does not belong to the selected specialty")
    if not doctor.available:
        raise HTTPException(400, "Selected doctor is not currently available")

    previous_acuity = triage.acuity_level
    previous_specialty = triage.specialty
    previous_doctor_id = triage.recommended_doctor_id

    triage.acuity_level = body.acuity_level
    triage.specialty = body.specialty
    triage.recommended_doctor_id = doctor.staff_id
    encounter.department = body.specialty
    encounter.doctor_id = doctor.staff_id
    encounter.status = (
        "EMERGENCY"
        if body.acuity_level == "1" and triage.red_flag
        else "TRIAGED"
    )

    if encounter.appointment_id:
        linked_appt = db.get(models.Appointment, encounter.appointment_id)
        if linked_appt:
            linked_appt.status = encounter.status
            linked_appt.doctor_id = doctor.staff_id
            linked_appt.specialty = body.specialty

    # Mark any existing triage token(s) for this encounter as COMPLETED
    triage_tokens = db.scalars(
        select(models.Token)
        .where(models.Token.encounter_id == encounter_id)
        .where(
            or_(
                models.Token.token_number.like("T-%"),
                func.lower(models.Token.department) == "triage"
            )
        )
    ).all()
    for tt in triage_tokens:
        tt.status = "COMPLETED"

    token = db.scalar(
        select(models.Token)
        .where(models.Token.encounter_id == encounter_id)
        .where(models.Token.token_number.like("A-%"))
        .order_by(models.Token.issued_ts.desc())
    )
    if token:
        token.department = body.specialty
        token.room = doctor.room or _ROOMS.get(body.specialty, ("Room 1", "Floor 1"))[0]
        token.floor = doctor.floor or _ROOMS.get(body.specialty, ("Room 1", "Floor 1"))[1]

    audit(
        db,
        actor_id=body.overridden_by,
        actor_role="NURSE",
        action="TRIAGE_OVERRIDDEN",
        entity_type="encounter",
        entity_id=encounter_id,
        metadata={
            "reason": body.reason.strip(),
            "previous_acuity": previous_acuity,
            "acuity": body.acuity_level,
            "previous_specialty": previous_specialty,
            "specialty": body.specialty,
            "previous_doctor_id": previous_doctor_id,
            "doctor_id": doctor.staff_id,
        },
    )
    db.commit()

    bus.publish(
        Topics.TRIAGE_COMPLETED,
        {
            "encounter_id": encounter_id,
            "acuity": body.acuity_level,
            "specialty": body.specialty,
            "red_flag": triage.red_flag,
            "overridden": True,
        },
    )

    return {
        "triage": {
            "acuity_level": triage.acuity_level,
            "ai_acuity_level": previous_acuity,
            "specialty": triage.specialty,
            "doctor": {
                "id": doctor.staff_id,
                "name": doctor.name,
                "specialty": doctor.specialty,
            },
            "override_reason": body.reason.strip(),
        },
        "token": None if not token else {
            "number": token.token_number,
            "department": token.department,
            "room": token.room,
            "floor": token.floor,
        },
        "encounter_status": encounter.status,
    }


@router.get("/encounters/{encounter_id}")
def get_encounter(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    e = _get_encounter(db, encounter_id)
    p = _get_patient(db, e.patient_id)
    appointment = db.get(models.Appointment, e.appointment_id) if e.appointment_id else None
    appointment_doctor = db.get(models.Staff, appointment.doctor_id) if appointment and appointment.doctor_id else None
    triage = db.scalar(select(models.Triage).where(models.Triage.encounter_id == encounter_id)
                       .order_by(models.Triage.created_ts.desc()))
    token = db.scalar(select(models.Token).where(models.Token.encounter_id == encounter_id)
                      .order_by(models.Token.issued_ts.desc()))
    recommended_doctor = (
        db.get(models.Staff, triage.recommended_doctor_id)
        if triage and triage.recommended_doctor_id else None
    )

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
    if e.visit_type == "LAB" and e.notes:
        order_ids = e.notes.split(",")
        lab_orders = db.scalars(
            select(models.LabOrder)
            .where(models.LabOrder.lab_order_id.in_(order_ids))
        ).all()
    else:
        lab_orders = db.scalars(select(models.LabOrder).where(models.LabOrder.encounter_id == encounter_id)).all()
    labs = []
    for lo in lab_orders:
        results = db.scalars(select(models.LabResult).where(models.LabResult.lab_order_id == lo.lab_order_id)).all()
        labs.append({
            "lab_order_id": lo.lab_order_id,
            "patient_id": lo.patient_id,
            "test": lo.test_name,
            "status": lo.status,
            "price": lo.price,
            "attachment_name": lo.attachment_name,
            "attachment_uri": lo.attachment_uri,
            "notes": lo.notes,
            "results": [
                {"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag}
                for r in results
            ]
        })

    # Parse parent_encounter_id if stored in notes
    parent_id = None
    clean_notes = e.notes
    if e.notes and "parent:" in e.notes:
        for part in e.notes.split(";"):
            if part.strip().startswith("parent:"):
                parent_id = part.strip().split("parent:")[-1].strip()
        parts = [p.strip() for p in e.notes.split(";") if not p.strip().startswith("parent:")]
        clean_notes = "; ".join(parts) if parts else None

    # Inherit parent vitals and labs if E-Consultation or Revisit
    if e.visit_type in ["E_CONSULT", "REVISIT"] and parent_id:
        if not vitals:
            vitals = db.scalar(select(models.Vitals).where(models.Vitals.encounter_id == parent_id).order_by(models.Vitals.captured_ts.desc()))
        if not labs:
            parent_lab_orders = db.scalars(select(models.LabOrder).where(models.LabOrder.encounter_id == parent_id)).all()
            for lo in parent_lab_orders:
                results = db.scalars(select(models.LabResult).where(models.LabResult.lab_order_id == lo.lab_order_id)).all()
                labs.append({
                    "lab_order_id": lo.lab_order_id,
                    "patient_id": lo.patient_id,
                    "test": lo.test_name,
                    "status": lo.status,
                    "price": lo.price,
                    "attachment_name": lo.attachment_name,
                    "attachment_uri": lo.attachment_uri,
                    "notes": lo.notes,
                    "results": [
                        {"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag}
                        for r in results
                    ]
                })

    audit_logs = db.scalars(
        select(models.EncounterAuditLog)
        .where(models.EncounterAuditLog.encounter_id == encounter_id)
        .order_by(models.EncounterAuditLog.created_ts.asc())
    ).all()
    routing_override_log = db.scalar(
        select(models.AuditLog)
        .where(models.AuditLog.entity_id == encounter_id)
        .where(models.AuditLog.action == "TRIAGE_OVERRIDDEN")
        .order_by(models.AuditLog.event_ts.desc())
    )
    routing_override = None
    if routing_override_log:
        override_metadata = routing_override_log.audit_metadata or {}
        previous_doctor_id = override_metadata.get("previous_doctor_id")
        updated_doctor_id = override_metadata.get("doctor_id")
        if previous_doctor_id != updated_doctor_id:
            override_nurse = (
                db.get(models.Staff, routing_override_log.actor_id)
                if routing_override_log.actor_id else None
            )
            updated_doctor = db.get(models.Staff, updated_doctor_id) if updated_doctor_id else None
            routing_override = {
                "doctor_changed": True,
                "doctor_name": updated_doctor.name if updated_doctor else "the assigned doctor",
                "specialty": override_metadata.get("specialty"),
                "changed_by": override_nurse.name if override_nurse else "the triage nurse",
                "reason": override_metadata.get("reason"),
                "changed_at": (
                    routing_override_log.event_ts.isoformat()
                    if routing_override_log.event_ts else None
                ),
            }

    return {
        "encounter_id": e.encounter_id, "appointment_id": e.appointment_id,
        "parent_encounter_id": parent_id,
        "doctor_id": e.doctor_id or (appointment.doctor_id if appointment else None),
        "visit_type": e.visit_type,
        "status": e.status, "department": e.department,
        "channel": e.channel, "arrival": e.arrival_ts.isoformat(),
        "notes": clean_notes,
        "patient_original_reason": appointment.reason if (appointment and appointment.reason) else clean_notes,
        "routing_override": routing_override,
        "audit_logs": [
            {
                "audit_id": log.audit_id,
                "field_name": log.field_name,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "edited_by_role": log.edited_by_role,
                "edited_by_user": log.edited_by_user,
                "created_ts": log.created_ts.isoformat() if log.created_ts else None,
            }
            for log in audit_logs
        ],
        "patient": _patient_brief(p),
        "appointment": _appointment_brief(appointment, appointment_doctor) if appointment else None,
        "triage": None if not triage else {
            "chief_complaint": triage.chief_complaint, "acuity": triage.acuity_level,
            "specialty": triage.specialty, "red_flag": triage.red_flag,
            "recommended_doctor": None if not recommended_doctor else {
                "doctor_id": recommended_doctor.staff_id,
                "name": recommended_doctor.name,
                "specialty": recommended_doctor.specialty,
                "room": recommended_doctor.room,
                "floor": recommended_doctor.floor,
                "opd_fee": recommended_doctor.opd_fee,
            }},
        "token": None if not token else {"number": token.token_number, "room": token.room,
                                         "floor": token.floor, "eta_minutes": _calculate_live_eta(db, e.encounter_id),
                                         "patients_ahead": _calculate_patients_ahead(db, e.encounter_id)},
        "vitals": None if not vitals else {
            "bp": f"{vitals.bp_systolic}/{vitals.bp_diastolic}", "spo2": vitals.spo2,
            "heart_rate": vitals.heart_rate, "temperature": vitals.temperature,
            "weight_kg": vitals.weight_kg, "height_cm": vitals.height_cm, "bmi": vitals.bmi
        },
        "note": None if not note else {
            "note_id": note.note_id, "note_type": note.note_type, "final_text": note.final_text,
            "icd10_codes": note.icd10_codes, "status": note.status,
            "approved_ts": note.approved_ts.isoformat() if note.approved_ts else None,
        },
        "prescription": None if not rx else {
            "rx_id": rx.rx_id, "status": rx.status,
            "approved_ts": rx.approved_ts.isoformat() if rx.approved_ts else None,
            "pickup_token": (lambda pt: {
                "number": pt.token_number,
                "status": pt.status,
                "room": pt.room,
                "floor": pt.floor
            } if pt else None)(
                db.scalar(
                    select(models.Token)
                    .where(models.Token.encounter_id == encounter_id)
                    .where(models.Token.department == "Pharmacy")
                    .order_by(models.Token.issued_ts.desc())
                )
            ),
            "items": [
                {"drug_name": i.drug_name, "dose": i.dose, "route": i.route,
                 "frequency": i.frequency, "duration_days": i.duration_days,
                 "instructions": i.instructions,
                 "quantity": i.quantity,
                 "unit_price": db.scalar(
                     select(models.PharmacyStock.unit_price)
                     .where(func.lower(models.PharmacyStock.drug_name) == i.drug_name.lower())
                 ) or 10.0}
                for i in rx_items
            ]
        },
        "labs": labs
    }


@router.get("/encounters/{encounter_id}/discharge-report", response_class=HTMLResponse)
def get_discharge_report(encounter_id: str, db: Session = Depends(get_db)):
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter:
        raise HTTPException(status_code=404, detail="Encounter not found")
    
    patient = db.get(models.Patient, encounter.patient_id)
    doctor = db.get(models.Staff, encounter.doctor_id) if encounter.doctor_id else None
    triage = db.scalar(
        select(models.Triage)
        .where(models.Triage.encounter_id == encounter_id)
        .order_by(models.Triage.created_ts.desc())
    )
    vitals = db.scalar(
        select(models.Vitals)
        .where(models.Vitals.encounter_id == encounter_id)
        .order_by(models.Vitals.captured_ts.desc())
    )
    note = db.scalar(
        select(models.ClinicalNote)
        .where(models.ClinicalNote.encounter_id == encounter_id)
        .where(models.ClinicalNote.status == "APPROVED")
    ) or db.scalar(
        select(models.ClinicalNote)
        .where(models.ClinicalNote.encounter_id == encounter_id)
        .order_by(models.ClinicalNote.created_ts.desc())
    )
    rx = db.scalar(
        select(models.Prescription)
        .where(models.Prescription.encounter_id == encounter_id)
        .order_by(models.Prescription.created_ts.desc())
    )
    rx_items = db.scalars(
        select(models.PrescriptionItem)
        .where(models.PrescriptionItem.rx_id == rx.rx_id)
    ).all() if rx else []

    lab_orders = db.scalars(
        select(models.LabOrder)
        .where(models.LabOrder.encounter_id == encounter_id)
    ).all()
    labs = []
    for lo in lab_orders:
        results = db.scalars(
            select(models.LabResult)
            .where(models.LabResult.lab_order_id == lo.lab_order_id)
        ).all()
        labs.append({
            "test_name": lo.test_name,
            "status": lo.status,
            "results": [{"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag} for r in results]
        })

    # Format dates
    admission_date = encounter.arrival_ts.strftime("%d-%b-%Y %I:%M %p")
    discharge_date = encounter.end_ts.strftime("%d-%b-%Y %I:%M %p") if encounter.end_ts else "N/A"
    
    # Construct details lists
    vitals_html = ""
    if vitals:
        vitals_html = f"""
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-top: 10px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">Temperature</span><br/><strong>{vitals.temperature or '--'} °F</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">Blood Pressure</span><br/><strong>{vitals.bp_systolic or '--'}/{vitals.bp_diastolic or '--'} mmHg</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">Pulse Rate</span><br/><strong>{vitals.heart_rate or '--'} bpm</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">SpO2</span><br/><strong>{vitals.spo2 or '--'} %</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">Weight</span><br/><strong>{vitals.weight_kg or '--'} kg</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">Height</span><br/><strong>{vitals.height_cm or '--'} cm</strong></div>
            <div><span style="color: #64748b; font-size: 11px; text-transform: uppercase;">BMI</span><br/><strong>{vitals.bmi or '--'}</strong></div>
        </div>
        """
    else:
        vitals_html = "<p style='color: #64748b;'>No vitals recorded for this encounter.</p>"

    rx_rows = ""
    if rx_items:
        for idx, item in enumerate(rx_items, 1):
            instructions = item.instructions or "Take as directed"
            rx_rows += f"""
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; text-align: left;">{idx}</td>
                <td style="padding: 10px; text-align: left;"><strong>{item.drug_name}</strong></td>
                <td style="padding: 10px; text-align: left;">{item.dose or '--'}</td>
                <td style="padding: 10px; text-align: left;">{item.route or '--'}</td>
                <td style="padding: 10px; text-align: left;">{item.frequency or '--'}</td>
                <td style="padding: 10px; text-align: left;">{item.duration_days or '--'} days</td>
                <td style="padding: 10px; text-align: left; color: #475569; font-size: 12px;">{instructions}</td>
            </tr>
            """
    else:
        rx_rows = """
        <tr>
            <td colspan="7" style="padding: 20px; text-align: center; color: #64748b;">No discharge medications prescribed.</td>
        </tr>
        """

    labs_html = ""
    if labs:
        for lab in labs:
            results_rows = ""
            if lab["results"]:
                for r in lab["results"]:
                    flag_style = "color: #ef4444; font-weight: bold;" if r["flag"] else "color: #1e293b;"
                    results_rows += f"""
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 6px 10px; text-align: left; width: 40%;">{r['analyte']}</td>
                        <td style="padding: 6px 10px; text-align: left; {flag_style}">{r['value']}</td>
                        <td style="padding: 6px 10px; text-align: left; color: #64748b;">{r['unit'] or '--'}</td>
                        <td style="padding: 6px 10px; text-align: left;">{'<span style="color: #ef4444; background: #fee2e2; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold;">ABNORMAL</span>' if r['flag'] else 'Normal'}</td>
                    </tr>
                    """
            else:
                results_rows = f"""
                <tr>
                    <td colspan="4" style="padding: 10px; text-align: center; color: #64748b;">Status: {lab['status']} (No resulted analytes yet)</td>
                </tr>
                """
            
            labs_html += f"""
            <div style="margin-bottom: 15px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <div style="background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #1e293b; font-size: 13px;">
                    🔬 {lab['test_name']}
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background: #ffffff; border-bottom: 1px solid #e2e8f0; color: #64748b;">
                            <th style="padding: 6px 10px; text-align: left;">Analyte</th>
                            <th style="padding: 6px 10px; text-align: left;">Value</th>
                            <th style="padding: 6px 10px; text-align: left;">Unit</th>
                            <th style="padding: 6px 10px; text-align: left;">Reference Flag</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results_rows}
                    </tbody>
                </table>
            </div>
            """
    else:
        labs_html = "<p style='color: #64748b;'>No diagnostic lab tests recorded for this visit.</p>"

    # Diagnosis codes
    diagnosis_html = ""
    if note and note.icd10_codes:
        for code_obj in note.icd10_codes:
            code = code_obj.get("code", "")
            label = code_obj.get("label", "")
            diagnosis_html += f"""
            <span style="display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; margin-right: 8px; margin-bottom: 8px; border: 1px solid #bae6fd;">
                🏷️ {code} - {label}
            </span>
            """
    else:
        diagnosis_html = "<span style='color: #64748b;'>No ICD-10 diagnosis codes recorded.</span>"

    clinical_course = note.final_text if note else (encounter.notes or "Patient presented for clinical consultation. Managed conservatively.")

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Discharge Summary - {patient.full_name}</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #1e293b;
                line-height: 1.5;
                margin: 0;
                padding: 40px;
                background-color: #f1f5f9;
            }}
            .report-card {{
                max-width: 850px;
                margin: 0 auto;
                background: #ffffff;
                padding: 40px;
                border-radius: 16px;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                border: 1px solid #e2e8f0;
            }}
            .header-table {{
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
            }}
            .section-title {{
                font-size: 14px;
                text-transform: uppercase;
                color: #0f172a;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 6px;
                margin-top: 25px;
                margin-bottom: 12px;
                font-weight: bold;
                letter-spacing: 0.5px;
            }}
            .info-grid {{
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 15px 40px;
                margin-bottom: 20px;
                font-size: 13px;
            }}
            .info-grid div {{
                border-bottom: 1px dashed #f1f5f9;
                padding-bottom: 4px;
            }}
            .info-grid span {{
                color: #64748b;
                font-weight: 500;
            }}
            .info-grid strong {{
                color: #0f172a;
                float: right;
            }}
            .med-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
                margin-top: 10px;
            }}
            .med-table th {{
                background: #f8fafc;
                padding: 10px;
                font-weight: bold;
                color: #475569;
                border-bottom: 2px solid #e2e8f0;
                text-align: left;
            }}
            @media print {{
                body {{
                    background: none;
                    padding: 0;
                }}
                .report-card {{
                    box-shadow: none;
                    border: none;
                    padding: 0;
                    max-width: 100%;
                }}
                .no-print {{
                    display: none;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="no-print" style="max-width: 850px; margin: 0 auto 20px auto; text-align: right;">
            <button onclick="window.print()" style="background: #2564cf; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(37,100,207,0.2);">
                🖨️ Print Summary
            </button>
        </div>

        <div class="report-card">
            <!-- Hospital Header -->
            <table class="header-table">
                <tr>
                    <td style="text-align: left; vertical-align: middle;">
                        <div style="font-size: 24px; font-weight: 800; color: #2564cf; display: flex; align-items: center; gap: 8px;">
                            🏥 ClinIQ Smart Hospital
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
                            ABDM Registered Digital Health Facility • Tel: +91 80 4910 2000
                        </div>
                    </td>
                    <td style="text-align: right; vertical-align: middle;">
                        <div style="background: #f1f5f9; padding: 10px 15px; border-radius: 8px; display: inline-block; border: 1px solid #e2e8f0;">
                            <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700;">DOCUMENT TYPE</div>
                            <div style="font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 2px;">DISCHARGE SUMMARY</div>
                        </div>
                    </td>
                </tr>
            </table>

            <!-- Patient and Visit Info -->
            <div class="info-grid">
                <div><span>Patient Name</span><strong>{patient.full_name}</strong></div>
                <div><span>Encounter ID</span><strong style="font-family: monospace; font-size: 11px;">{encounter.encounter_id}</strong></div>
                <div><span>Age / Gender</span><strong>{patient.age} Y / {patient.gender}</strong></div>
                <div><span>Primary Consultant</span><strong>{doctor.name if doctor else 'Hospitalist Team'}</strong></div>
                <div><span>Patient ID / MRN</span><strong style="font-family: monospace; font-size: 11px;">{patient.mrn or patient.patient_id[:8]}</strong></div>
                <div><span>Department / Specialty</span><strong>{encounter.department or 'General Medicine'}</strong></div>
                <div><span>Date of Admission</span><strong>{admission_date}</strong></div>
                <div><span>Date of Discharge</span><strong>{discharge_date}</strong></div>
            </div>

            <!-- Presenting Complaint & Triage Vitals -->
            <div class="section-title">Intake Assessment & Vitals</div>
            <div style="font-size: 13px; margin-bottom: 12px;">
                <strong>Reason for Visit / Complaint:</strong> "{triage.chief_complaint if triage else (encounter.notes or 'Routine clinical review')}"
            </div>
            {vitals_html}

            <!-- Diagnoses -->
            <div class="section-title">Clinical Diagnosis (ICD-10)</div>
            <div style="margin-bottom: 15px;">
                {diagnosis_html}
            </div>

            <!-- Course in Hospital / Clinical Notes -->
            <div class="section-title">Clinical Notes & Course in Hospital</div>
            <div style="font-size: 13px; text-align: justify; color: #334155; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px dashed #cbd5e1; margin-bottom: 20px; white-space: pre-line;">
                {clinical_course}
            </div>

            <!-- Lab Orders and Results -->
            <div class="section-title">Diagnostic Lab Investigations</div>
            {labs_html}

            <!-- Prescriptions -->
            <div class="section-title">Discharge Prescription & Treatment Plan</div>
            <table class="med-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">#</th>
                        <th style="width: 30%;">Medication</th>
                        <th style="width: 10%;">Dosage</th>
                        <th style="width: 12%;">Route</th>
                        <th style="width: 15%;">Frequency</th>
                        <th style="width: 10%;">Duration</th>
                        <th style="width: 18%;">Instructions</th>
                    </tr>
                </thead>
                <tbody>
                    {rx_rows}
                </tbody>
            </table>

            <!-- Follow-up Advice -->
            <div class="section-title">Advice on Discharge & Follow-up</div>
            <div style="font-size: 13px; color: #475569; padding: 12px 15px; background: #fffbeb; border-radius: 8px; border: 1px solid #fef3c7; display: flex; align-items: flex-start; gap: 10px;">
                <span style="font-size: 16px; line-height: 1;">⚠️</span>
                <div>
                    <strong>Follow-up Instructions:</strong> Review in 48 hours or earlier if symptoms worsen. Please seek immediate emergency medical care if you experience chest pain, sudden breathlessness, severe dizziness, or high fever.
                </div>
            </div>

            <!-- Signature Footer -->
            <div style="margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; color: #64748b;">
                <div>
                    <span style="font-size: 10px; text-transform: uppercase;">Digital Health Wallet Copy</span><br/>
                    ABDM Health ID: <strong>{patient.mrn or 'N/A'}</strong>
                </div>
                <div style="text-align: right;">
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #334155; margin-bottom: 5px; font-weight: bold; border-bottom: 1px solid #94a3b8; padding-bottom: 2px;">
                        Signed Electronically
                    </div>
                    <strong>{doctor.name if doctor else 'Consulting Physician'}</strong><br/>
                    {doctor.specialty if doctor else 'Clinical Services Director'}
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)


@router.get("/encounters/{encounter_id}/audit-logs")
def get_encounter_audit_logs(encounter_id: str, db: Session = Depends(get_db)) -> list[dict]:
    logs = db.scalars(
        select(models.EncounterAuditLog)
        .where(models.EncounterAuditLog.encounter_id == encounter_id)
        .order_by(models.EncounterAuditLog.created_ts.asc())
    ).all()
    return [
        {
            "audit_id": log.audit_id,
            "encounter_id": log.encounter_id,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "edited_by_role": log.edited_by_role,
            "edited_by_user": log.edited_by_user,
            "created_ts": log.created_ts.isoformat() if log.created_ts else None,
        }
        for log in logs
    ]



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


@router.get("/triage/encounters")
def list_pending_triage_encounters(db: Session = Depends(get_db)) -> list[dict]:
    """Hospital-wide checked-in queue for encounters not yet triaged."""
    has_triage = select(models.Triage.triage_id).where(
        models.Triage.encounter_id == models.Encounter.encounter_id
    ).exists()
    encounters = db.scalars(
        select(models.Encounter)
        .where(models.Encounter.status == "CHECKED_IN")
        .where(~has_triage)
        .order_by(models.Encounter.arrival_ts.asc())
    ).all()

    out = []
    for encounter in encounters:
        patient = db.get(models.Patient, encounter.patient_id)
        appt = db.get(models.Appointment, encounter.appointment_id) if encounter.appointment_id else None
        if not appt and encounter.patient_id:
            appt = db.scalar(
                select(models.Appointment)
                .where((models.Appointment.encounter_id == encounter.encounter_id) | (models.Appointment.patient_id == encounter.patient_id))
                .order_by(models.Appointment.scheduled_start.desc())
            )
        doc_id = encounter.doctor_id or (appt.doctor_id if appt else None)
        doc = db.get(models.Staff, doc_id) if doc_id else None

        out.append({
            "encounter_id": encounter.encounter_id,
            "appointment_id": encounter.appointment_id or (appt.appointment_id if appt else None),
            "doctor_id": doc_id,
            "doctor": {
                "doctor_id": doc.staff_id,
                "name": doc.name,
                "specialty": doc.specialty or (appt.specialty if appt else encounter.department),
                "room": doc.room or "Room 101",
                "floor": doc.floor or "Floor 1",
            } if doc else None,
            "appointment": {
                "appointment_id": appt.appointment_id,
                "doctor_id": appt.doctor_id,
                "specialty": appt.specialty or appt.department,
                "doctor_name": doc.name if doc else None,
                "reason": appt.reason,
                "scheduled_start": appt.scheduled_start.isoformat() if appt.scheduled_start else None,
            } if appt else None,
            "status": encounter.status,
            "visit_type": encounter.visit_type,
            "department": encounter.department or (appt.department if appt else None) or (doc.specialty if doc else None),
            "specialty": (appt.specialty if appt and appt.specialty else None) or encounter.department or (doc.specialty if doc else None),
            "channel": encounter.channel,
            "arrival": encounter.arrival_ts.isoformat(),
            "reason": appt.reason if appt else None,
            "patient": {
                "patient_id": patient.patient_id,
                "name": patient.full_name,
                "age": patient.age,
                "gender": patient.gender,
                "mobile": patient.mobile,
                "mrn": patient.mrn,
            } if patient else None,
        })
    return out


@router.get("/triage/recent")
def list_recently_triaged_encounters(db: Session = Depends(get_db)) -> list[dict]:
    """Hospital-wide encounters that have already been triaged."""
    has_triage = select(models.Triage.triage_id).where(
        models.Triage.encounter_id == models.Encounter.encounter_id
    ).exists()

    encounters = db.scalars(
        select(models.Encounter)
        .where(models.Encounter.status != "CHECKED_IN")  # TRIAGED, IN_CONSULT, etc.
        .where(has_triage)
        .order_by(models.Encounter.arrival_ts.desc())
        .limit(50)
    ).all()

    out = []
    for encounter in encounters:
        patient = db.get(models.Patient, encounter.patient_id)
        appt = db.get(models.Appointment, encounter.appointment_id) if encounter.appointment_id else None
        if not appt and encounter.patient_id:
            appt = db.scalar(
                select(models.Appointment)
                .where((models.Appointment.encounter_id == encounter.encounter_id) | (models.Appointment.patient_id == encounter.patient_id))
                .order_by(models.Appointment.scheduled_start.desc())
            )
        triage = db.scalar(
            select(models.Triage)
            .where(models.Triage.encounter_id == encounter.encounter_id)
            .order_by(models.Triage.created_ts.desc())
        )
        vitals = db.scalar(
            select(models.Vitals)
            .where(models.Vitals.encounter_id == encounter.encounter_id)
            .order_by(models.Vitals.captured_ts.desc())
        )

        token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == encounter.encounter_id)
            .where(models.Token.token_number.like("A-%"))
            .order_by(models.Token.issued_ts.desc())
        )

        doc_id = encounter.doctor_id or (triage.recommended_doctor_id if triage else None) or (appt.doctor_id if appt else None)
        doc = db.get(models.Staff, doc_id) if doc_id else None

        out.append({
            "encounter_id": encounter.encounter_id,
            "appointment_id": encounter.appointment_id or (appt.appointment_id if appt else None),
            "doctor_id": doc_id,
            "doctor": {
                "doctor_id": doc.staff_id,
                "name": doc.name,
                "specialty": doc.specialty or (triage.specialty if triage else None) or (appt.specialty if appt else encounter.department),
                "room": doc.room or "Room 101",
                "floor": doc.floor or "Floor 1",
            } if doc else None,
            "appointment": {
                "appointment_id": appt.appointment_id,
                "doctor_id": appt.doctor_id,
                "specialty": appt.specialty or appt.department,
                "doctor_name": doc.name if doc else None,
                "reason": appt.reason,
                "scheduled_start": appt.scheduled_start.isoformat() if appt.scheduled_start else None,
            } if appt else None,
            "status": encounter.status,
            "visit_type": encounter.visit_type,
            "department": encounter.department or (triage.specialty if triage else None) or (appt.department if appt else None),
            "specialty": (triage.specialty if triage and triage.specialty else None) or (appt.specialty if appt and appt.specialty else None) or encounter.department or (doc.specialty if doc else None),
            "channel": encounter.channel,
            "arrival": encounter.arrival_ts.isoformat(),
            "reason": appt.reason if appt else None,
            "patient": {
                "patient_id": patient.patient_id,
                "name": patient.full_name,
                "age": patient.age,
                "gender": patient.gender,
                "mobile": patient.mobile,
                "mrn": patient.mrn,
            } if patient else None,
            "token": {
                "number": token.token_number,
                "room": token.room,
                "floor": token.floor,
                "status": token.status,
                "eta_minutes": _calculate_live_eta(db, encounter.encounter_id)
            } if token else None,
            "triage": {
                "chief_complaint": triage.chief_complaint if triage else None,
                "symptom_summary": triage.symptom_summary if triage else None,
                "acuity_level": triage.acuity_level if triage else None,
                "specialty": triage.specialty if triage else None,
            } if triage else None,
            "vitals": {
                "bp_systolic": vitals.bp_systolic if vitals else None,
                "bp_diastolic": vitals.bp_diastolic if vitals else None,
                "spo2": vitals.spo2 if vitals else None,
                "heart_rate": vitals.heart_rate if vitals else None,
                "temperature": vitals.temperature if vitals else None,
                "weight_kg": vitals.weight_kg if vitals else None,
                "height_cm": vitals.height_cm if vitals else None,
                "bmi": vitals.bmi if vitals else None,
            } if vitals else None
        })
    return out


@router.get("/doctors/{doctor_id}/encounters")
def list_doctor_encounters(doctor_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all active encounters (queue) for a specific doctor, sorted by clinical priority and scheduled slot time."""
    doctor = db.get(models.Staff, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    stmt = (
        select(models.Encounter)
        .where(
            (models.Encounter.doctor_id == doctor_id) |
            ((models.Encounter.doctor_id.is_(None)) & (models.Encounter.department == doctor.department))
        )
        .where(models.Encounter.status.in_(["CHECKED_IN", "TRIAGED", "IN_CONSULT", "EMERGENCY", "COMPLETED", "DISCHARGED"]))
    )
    encounters = db.scalars(stmt).all()
    
    seen_ids = set()
    unique_encounters = []
    for e in encounters:
        if e.encounter_id not in seen_ids:
            seen_ids.add(e.encounter_id)
            unique_encounters.append(e)

    out = []
    for e in unique_encounters:
        p = db.get(models.Patient, e.patient_id)
        appt = db.get(models.Appointment, e.appointment_id) if e.appointment_id else None
        token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == e.encounter_id)
            .order_by(models.Token.issued_ts.desc())
            .limit(1)
        )
        triage = db.scalar(
            select(models.Triage)
            .where(models.Triage.encounter_id == e.encounter_id)
            .order_by(models.Triage.created_ts.desc())
            .limit(1)
        )
        has_results = db.scalar(
            select(models.LabOrder)
            .where(models.LabOrder.patient_id == e.patient_id)
            .where(models.LabOrder.status == "RESULTED")
            .limit(1)
        ) is not None

        out.append({
            "encounter_id": e.encounter_id,
            "status": e.status,
            "visit_type": e.visit_type,
            "arrival": e.arrival_ts.isoformat(),
            "is_reconsult": e.visit_type in ["REVISIT", "E_CONSULT"],
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
                "eta_minutes": _calculate_live_eta(db, e.encounter_id)
            } if token else None,
            "triage": {
                "chief_complaint": triage.chief_complaint if triage else None,
                "acuity": triage.acuity_level if triage else None,
                "red_flag": triage.red_flag if triage else False,
            } if triage else None,
            "scheduled_start": appt.scheduled_start.isoformat() if (appt and appt.scheduled_start) else None,
        })

    def sorting_key(item):
        tr = item["triage"]
        red_flag_val = 0 if (tr and tr["red_flag"]) else 1
        acuity_val = tr["acuity"] if (tr and tr["acuity"]) else "999"
        start_time_val = item["scheduled_start"] or item["arrival"]
        return (red_flag_val, acuity_val, start_time_val)

    out.sort(key=sorting_key)
    return out


@router.get("/triage/queue")
def list_triage_queue(db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all active encounters that have checked in but are not yet triaged."""
    stmt = (
        select(models.Encounter)
        .where(models.Encounter.status == "CHECKED_IN")
        .where(models.Encounter.visit_type.notin_(["REVISIT", "E_CONSULT", "LAB"]))
        .order_by(models.Encounter.arrival_ts.desc())
    )
    encounters = db.scalars(stmt).all()
    out = []
    for e in encounters:
        p = db.get(models.Patient, e.patient_id)
        appt = db.get(models.Appointment, e.appointment_id) if e.appointment_id else None
        out.append({
            "encounter_id": e.encounter_id,
            "status": e.status,
            "visit_type": e.visit_type,
            "arrival": e.arrival_ts.isoformat(),
            "reason": appt.reason if appt else None,
            "patient": {
                "patient_id": p.patient_id,
                "name": p.full_name,
                "age": p.age,
                "gender": p.gender,
                "mobile": p.mobile,
                "mrn": p.mrn,
            } if p else None,
        })
    return out


@router.get("/appointments/today")
def list_hospital_today_appointments(db: Session = Depends(get_db)) -> dict:
    """Retrieve all appointments booked or checked in for today, across all patients and doctors."""
    today = _hospital_today()
    hospital_tz = ZoneInfo("Asia/Kolkata")
    day_start = datetime.combine(today, time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
    day_end = (datetime.combine(today, time.min, tzinfo=hospital_tz) + timedelta(days=1)).astimezone(timezone.utc)
    
    appointments = db.scalars(
        select(models.Appointment)
        .where(models.Appointment.scheduled_start >= day_start)
        .where(models.Appointment.scheduled_start < day_end)
        .order_by(models.Appointment.scheduled_start.asc())
    ).all()
    
    out = []
    for appt in appointments:
        patient = db.get(models.Patient, appt.patient_id)
        doctor = db.get(models.Staff, appt.doctor_id)
        out.append({
            "appointment_id": appt.appointment_id,
            "encounter_id": appt.encounter_id,
            "patient_id": appt.patient_id,
            "patient_name": patient.full_name if patient else "Unknown Patient",
            "patient_mobile": patient.mobile if patient else "",
            "doctor_name": doctor.name if doctor else "General Practitioner",
            "department": appt.department,
            "specialty": appt.specialty,
            "reason": appt.reason,
            "scheduled_start": appt.scheduled_start.isoformat(),
            "scheduled_end": appt.scheduled_end.isoformat(),
            "status": appt.status,
            "channel": appt.channel,
        })
    return {"appointments": out}


class LabCheckInRequest(BaseModel):
    patient_id: str
    booking_date: date
    booking_slot: str


@router.post("/labs/check-in")
def lab_check_in(body: LabCheckInRequest, db: Session = Depends(get_db)) -> dict:
    patient = db.get(models.Patient, body.patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")

    try:
        time_part = datetime.strptime(body.booking_slot, "%I:%M %p").time()
    except ValueError:
        time_part = datetime.strptime(body.booking_slot, "%H:%M").time()
        
    dt_local = datetime.combine(body.booking_date, time_part, tzinfo=ZoneInfo("Asia/Kolkata"))
    dt_utc = dt_local.astimezone(timezone.utc)

    # Find confirmed/booked lab orders for this patient to track during check-in
    confirmed_orders = db.scalars(
        select(models.LabOrder)
        .where(models.LabOrder.patient_id == body.patient_id)
        .where(models.LabOrder.status.in_(["CONFIRMED", "BOOKED", "PREPAID", "CREATED", "PENDING", "CHECKED_IN"]))
    ).all()
    for o in confirmed_orders:
        o.status = "CHECKED_IN"
    confirmed_ids = [o.lab_order_id for o in confirmed_orders]
    notes_value = ",".join(confirmed_ids) if confirmed_ids else None

    # Guard against duplicate check-in: if the patient already has an active
    # (non-discharged) LAB visit tracking the exact same set of confirmed
    # orders (or the same no-orders state), reuse its existing token instead
    # of creating a second one. SQLAlchemy translates `== None` to `IS NULL`,
    # so this also de-dupes check-ins with no confirmed orders yet.
    existing_lab_enc = db.scalar(
        select(models.Encounter)
        .where(models.Encounter.patient_id == body.patient_id)
        .where(models.Encounter.visit_type == "LAB")
        .where(models.Encounter.status != "DISCHARGED")
        .where(models.Encounter.notes == notes_value)
        .order_by(models.Encounter.arrival_ts.desc())
    )
    if existing_lab_enc:
        existing_token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == existing_lab_enc.encounter_id)
            .order_by(models.Token.token_id.desc())
        )
        if existing_token:
            return {
                "encounter_id": existing_lab_enc.encounter_id,
                "token_number": existing_token.token_number,
                "status": existing_lab_enc.status,
            }

    # Create a mock appointment for the lab visit to store scheduled time
    appointment = models.Appointment(
        patient_id=body.patient_id,
        scheduled_start=dt_utc,
        scheduled_end=dt_utc + timedelta(minutes=30),
        reason="Laboratory Tests",
        status="CHECKED_IN",
        channel="PORTAL",
        department="Laboratory",
        specialty="Diagnostics",
    )
    db.add(appointment)
    db.flush()

    # Create a new encounter for the Lab visit
    encounter = models.Encounter(
        patient_id=body.patient_id,
        appointment_id=appointment.appointment_id,
        visit_type="LAB",
        department="Laboratory",
        status="CHECKED_IN",
        notes=notes_value,
    )
    db.add(encounter)
    db.flush()

    appointment.encounter_id = encounter.encounter_id

    # Generate a unique token for the laboratory, e.g. L-101
    total_tokens = db.scalar(
        select(func.count())
        .select_from(models.Token)
        .where(models.Token.token_number.like("L-%"))
    ) or 0

    token = models.Token(
        encounter_id=encounter.encounter_id,
        token_number=f"L-{total_tokens + 101:03d}",
        department="Laboratory",
        room="Lab Room 1",
        floor="Ground Floor",
        eta_minutes=15,
        status="WAITING",
    )
    db.add(token)
    db.commit()

    return {
        "encounter_id": encounter.encounter_id,
        "token_number": token.token_number,
        "status": encounter.status,
    }


class RevisitBookingPayload(BaseModel):
    doctor_id: str
    booking_date: date
    booking_slot: str
    parent_encounter_id: str
    attachment_name: str | None = None
    attachment_uri: str | None = None


class EconsultRequestPayload(BaseModel):
    doctor_id: str
    parent_encounter_id: str


@router.post("/patients/{patient_id}/upload-document")
def upload_patient_document(
    patient_id: str,
    file: UploadFile = File(...),
    doc_type: str | None = Form(None),
    title: str | None = Form(None),
    db: Session = Depends(get_db)
) -> dict:
    import os
    import shutil
    patient = db.get(models.Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
        
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = os.path.splitext(file.filename or "")[1]
    safe_filename = f"doc_{uuid.uuid4().hex[:12]}{file_ext}"
    file_path = os.path.join(upload_dir, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    attachment_uri = f"/uploads/{safe_filename}"
    
    doc = models.Document(
        patient_id=patient_id,
        doc_type=doc_type or "LAB_REPORT",
        title=title or file.filename or "Outside Health Document",
        uri=attachment_uri,
    )
    db.add(doc)
    db.commit()
    
    return {
        "document_id": doc.document_id,
        "title": doc.title,
        "doc_type": doc.doc_type,
        "uri": doc.uri,
        "created_ts": doc.created_ts.isoformat() if doc.created_ts else None,
    }


@router.get("/patients/{patient_id}/documents")
def get_patient_documents(patient_id: str, db: Session = Depends(get_db)) -> list[dict]:
    patient = _get_patient(db, patient_id)
    docs = db.scalars(
        select(models.Document)
        .where(models.Document.patient_id == patient_id)
        .order_by(models.Document.created_ts.desc())
    ).all()
    return [
        {
            "document_id": d.document_id,
            "title": d.title or "Medical Document",
            "doc_type": d.doc_type,
            "uri": d.uri,
            "created_ts": d.created_ts.isoformat() if d.created_ts else None,
            "encounter_id": d.encounter_id,
        }
        for d in docs
    ]


@router.delete("/patients/{patient_id}/documents/{document_id}")
def delete_patient_document(patient_id: str, document_id: str, db: Session = Depends(get_db)):
    doc = db.scalar(
        select(models.Document)
        .where(models.Document.patient_id == patient_id)
        .where(models.Document.document_id == document_id)
    )
    if not doc:
        raise HTTPException(404, "Document not found")
    db.delete(doc)
    db.commit()
    return {"status": "SUCCESS", "message": "Document deleted successfully"}


@router.post("/patients/{patient_id}/revisit/book")
def book_revisit(patient_id: str, body: RevisitBookingPayload, db: Session = Depends(get_db)) -> dict:
    patient = db.get(models.Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    doctor = db.get(models.Staff, body.doctor_id)
    if not doctor or doctor.role != "DOCTOR":
        raise HTTPException(404, "Doctor not found")
        
    try:
        time_part = datetime.strptime(body.booking_slot, "%I:%M %p").time()
    except ValueError:
        time_part = datetime.strptime(body.booking_slot, "%H:%M").time()
        
    dt_local = datetime.combine(body.booking_date, time_part, tzinfo=ZoneInfo("Asia/Kolkata"))
    dt_utc = dt_local.astimezone(timezone.utc)
    
    appointment = models.Appointment(
        patient_id=patient_id,
        doctor_id=body.doctor_id,
        department=doctor.department,
        specialty=doctor.specialty,
        reason=f"Re-visit follow-up for encounter {body.parent_encounter_id}",
        appointment_type="REVISIT",
        scheduled_start=dt_utc,
        scheduled_end=dt_utc + timedelta(minutes=15),
        status="BOOKED",
        channel="PORTAL",
    )
    db.add(appointment)
    db.commit()
    
    return {
        "appointment_id": appointment.appointment_id,
        "status": appointment.status,
    }


@router.post("/patients/{patient_id}/econsult/request")
def request_econsult(patient_id: str, body: EconsultRequestPayload, db: Session = Depends(get_db)) -> dict:
    patient = db.get(models.Patient, patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    doctor = db.get(models.Staff, body.doctor_id)
    if not doctor or doctor.role != "DOCTOR":
        raise HTTPException(404, "Doctor not found")

    # Guard against duplicate e-consult requests: reuse the existing active
    # E_CONSULT visit/token for this same parent encounter instead of
    # creating a second one (e.g. on a double-click / repeat submission).
    parent_notes = f"parent:{body.parent_encounter_id}"
    existing_econsult = db.scalar(
        select(models.Encounter)
        .where(models.Encounter.patient_id == patient_id)
        .where(models.Encounter.visit_type == "E_CONSULT")
        .where(models.Encounter.status != "DISCHARGED")
        .where(models.Encounter.notes == parent_notes)
        .order_by(models.Encounter.arrival_ts.desc())
    )
    if existing_econsult:
        if existing_econsult.status == "CHECKED_IN":
            existing_econsult.status = "TRIAGED"
        existing_token = db.scalar(
            select(models.Token)
            .where(models.Token.encounter_id == existing_econsult.encounter_id)
            .order_by(models.Token.token_id.desc())
        )
        existing_token = existing_token or _issue_doctor_token(
            db, existing_econsult, doctor, prefix="E"
        )
        db.commit()
        return {
            "encounter_id": existing_econsult.encounter_id,
            "token_number": existing_token.token_number,
            "status": existing_econsult.status,
        }

    encounter = models.Encounter(
        patient_id=patient_id,
        doctor_id=body.doctor_id,
        department=doctor.department,
        visit_type="E_CONSULT",
        status="TRIAGED",
        notes=parent_notes,
    )
    db.add(encounter)
    db.flush()
    
    token = _issue_doctor_token(db, encounter, doctor, prefix="E")
    db.commit()
    
    return {
        "encounter_id": encounter.encounter_id,
        "token_number": token.token_number,
        "status": encounter.status,
    }

