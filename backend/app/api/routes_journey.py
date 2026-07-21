"""Journey module — Access & Identity, Consent, Patient 360, Intake & Triage, Queue & Token.

Maps to services: Identity & Consent, Registration/EMPI, Patient 360, Intake & Triage, Queue & Token.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
import uuid
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, select, case, nulls_last
from sqlalchemy.orm import Session

from app import models
from app.ai import agents
from app.ai.knowledge import route_specialty
from app.core.database import get_db
from app.core.events import Topics, bus
from app.core.security import audit, require_active_consent
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
    PatientPhotoUpdateRequest,
    PatientProfileUpdateRequest,
    PatientRegistrationRequest,
    TriageRequest,
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
}

# Cache to prevent hitting Gemini API 429 Rate Limits
_SUMMARY_CACHE: dict[str, dict] = {}


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


def _appointment_brief(appointment: models.Appointment, doctor: models.Staff | None) -> dict:
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
        "status": appointment.status,
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

    triage_staff = db.scalar(
        select(models.Staff)
        .where(models.Staff.role == "NURSE")
        .where(models.Staff.department == "Triage")
        .where(models.Staff.available.is_(True))
        .order_by(models.Staff.name)
    )

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
        "triage_location": {
            "room": triage_staff.room if triage_staff else "Triage Room",
            "floor": triage_staff.floor if triage_staff else "Ground Floor",
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


@router.post("/patients/register")
def register_patient(body: PatientRegistrationRequest, db: Session = Depends(get_db)) -> dict:
    patient = models.Patient(
        first_name=body.first_name,
        last_name=body.last_name,
        dob=body.dob,
        mobile=body.mobile,
        email=body.email,
        gender=body.gender,
        blood_group=_blood_group_value(body.blood_group) if body.blood_group else "UNK",
        address=body.address,
        mrn=body.mrn or _generate_unique_mrn(db),
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
    patient = models.Patient(
        first_name=body.first_name,
        last_name=body.last_name,
        dob=body.dob,
        mobile=body.mobile,
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
    patient.email = body.email
    patient.gender = body.gender
    patient.blood_group = _blood_group_value(body.blood_group)
    patient.address = body.address
    _add_profile_details(db, patient, body.allergies, body.documents)
    audit(
        db,
        actor_id=patient.patient_id,
        actor_role="PATIENT",
        action="PATIENT_PROFILE_COMPLETED",
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
        action="PATIENT_PROFILE_PHOTO_UPDATED",
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
        .where(models.Appointment.status == "BOOKED")
        .where(models.Appointment.scheduled_start >= day_start)
        .where(models.Appointment.scheduled_start < day_end)
        .order_by(models.Appointment.scheduled_start)
    ).all()
    return {
        "appointments": [
            _appointment_brief(appointment, db.get(models.Staff, appointment.doctor_id))
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
        .where(models.Appointment.status == "BOOKED")
        .where(models.Appointment.scheduled_start >= day_start)
        .order_by(models.Appointment.scheduled_start)
    ).all()
    return {
        "appointments": [
            _appointment_brief(appointment, db.get(models.Staff, appointment.doctor_id))
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
    encounter = _get_encounter(db, body.encounter_id) if body.encounter_id else None
    if encounter and encounter.patient_id != body.patient_id:
        raise HTTPException(400, "Encounter does not belong to this patient")
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

    audit(db, actor_id="copilot", actor_role="SYSTEM", action="PATIENT360_READ",
          entity_type="patient", entity_id=patient_id, consent_id=consent_id)
    db.commit()
    bus.publish(Topics.PATIENT360_ASSEMBLED, {"patient_id": patient_id})

    brief = _patient_brief(patient)
    allergies_list = [
        {"substance": a.substance, "drug_class": a.drug_class, "severity": a.severity, "reaction": a.reaction}
        for a in patient.allergies
    ]
    issues_list = [
        {"issue_id": i.issue_id, "issue_name": i.issue_name, "onset_info": i.onset_info, "status": i.status}
        for i in patient.issues
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
        "issues": issues_list,
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
             "department": e.department, "status": e.status,
             "visit_type": e.visit_type,
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
    if summary_text and summary_text != "AI responses did not give any response":
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
    # Resolve room and floor using doctor's room/floor if available, else fallback to specialty _ROOMS map
    room = doctor.room if (doctor and doctor.room) else None
    floor = doctor.floor if (doctor and doctor.floor) else None
    if not room or not floor:
        s_room, s_floor = _ROOMS.get(tr["specialty"], ("Room 1", "Floor 1"))
        room = room or s_room
        floor = floor or s_floor

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
                  "floor": token.floor, "eta_minutes": _calculate_live_eta(db, encounter_id)},
        "encounter_status": encounter.status,
        "scheduled_start": appt.scheduled_start.isoformat() if (appt and appt.scheduled_start) else None,
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

    return {
        "encounter_id": e.encounter_id, "appointment_id": e.appointment_id,
        "parent_encounter_id": parent_id,
        "doctor_id": e.doctor_id or (appointment.doctor_id if appointment else None),
        "visit_type": e.visit_type,
        "status": e.status, "department": e.department,
        "channel": e.channel, "arrival": e.arrival_ts.isoformat(),
        "notes": clean_notes,
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
                                         "floor": token.floor, "eta_minutes": _calculate_live_eta(db, e.encounter_id)},
        "vitals": None if not vitals else {
            "bp": f"{vitals.bp_systolic}/{vitals.bp_diastolic}", "spo2": vitals.spo2,
            "heart_rate": vitals.heart_rate, "temperature": vitals.temperature, "bmi": vitals.bmi
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
    """Today's hospital-wide checked-in queue for encounters not yet triaged."""
    hospital_tz = ZoneInfo("Asia/Kolkata")
    today = datetime.now(hospital_tz).date()
    day_start = datetime.combine(today, time.min, tzinfo=hospital_tz).astimezone(timezone.utc)
    day_end = (datetime.combine(today, time.min, tzinfo=hospital_tz) + timedelta(days=1)).astimezone(timezone.utc)
    has_triage = select(models.Triage.triage_id).where(
        models.Triage.encounter_id == models.Encounter.encounter_id
    ).exists()
    encounters = db.scalars(
        select(models.Encounter)
        .where(models.Encounter.arrival_ts >= day_start)
        .where(models.Encounter.arrival_ts < day_end)
        .where(models.Encounter.status == "CHECKED_IN")
        .where(~has_triage)
        .order_by(models.Encounter.arrival_ts.asc())
    ).all()

    out = []
    for encounter in encounters:
        patient = db.get(models.Patient, encounter.patient_id)
        appt = db.get(models.Appointment, encounter.appointment_id) if encounter.appointment_id else None
        out.append({
            "encounter_id": encounter.encounter_id,
            "appointment_id": encounter.appointment_id,
            "status": encounter.status,
            "visit_type": encounter.visit_type,
            "department": encounter.department,
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


@router.get("/doctors/{doctor_id}/encounters")
def list_doctor_encounters(doctor_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all active encounters (queue) for a specific doctor, sorted by clinical priority and scheduled slot time."""
    doctor = db.get(models.Staff, doctor_id)
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    stmt = (
        select(models.Encounter)
        .outerjoin(models.Appointment, models.Appointment.appointment_id == models.Encounter.appointment_id)
        .outerjoin(models.Triage, models.Triage.encounter_id == models.Encounter.encounter_id)
        .where(
            (models.Encounter.doctor_id == doctor_id) |
            ((models.Encounter.doctor_id.is_(None)) & (models.Encounter.department == doctor.department))
        )
        .where(models.Encounter.status.in_(["CHECKED_IN", "TRIAGED", "IN_CONSULT", "EMERGENCY"]))
        .order_by(
            case((models.Triage.red_flag == True, 0), else_=1),
            nulls_last(models.Triage.acuity_level.asc()),
            case(
                (models.Appointment.scheduled_start.isnot(None), models.Appointment.scheduled_start),
                else_=models.Encounter.arrival_ts
            ).asc()
        )
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
        })
    return out


@router.get("/triage/queue")
def list_triage_queue(db: Session = Depends(get_db)) -> list[dict]:
    """Retrieve all active encounters that have checked in but are not yet triaged."""
    stmt = (
        select(models.Encounter)
        .where(models.Encounter.status == "CHECKED_IN")
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

    # Find confirmed lab orders for this patient to track during check-in
    confirmed_orders = db.scalars(
        select(models.LabOrder)
        .where(models.LabOrder.patient_id == body.patient_id)
        .where(models.LabOrder.status == "CONFIRMED")
    ).all()
    confirmed_ids = [o.lab_order_id for o in confirmed_orders]

    # Create a new encounter for the Lab visit
    encounter = models.Encounter(
        patient_id=body.patient_id,
        appointment_id=appointment.appointment_id,
        visit_type="LAB",
        department="Laboratory",
        status="CHECKED_IN",
        notes=",".join(confirmed_ids) if confirmed_ids else None,
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
        doc_type="LAB_REPORT",
        title=file.filename or "Outside Lab Report",
        uri=attachment_uri,
    )
    db.add(doc)
    db.commit()
    
    return {"document_id": doc.document_id, "title": doc.title, "uri": doc.uri}


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
        
    encounter = models.Encounter(
        patient_id=patient_id,
        doctor_id=body.doctor_id,
        department=doctor.department,
        visit_type="E_CONSULT",
        status="CHECKED_IN",
        notes=f"parent:{body.parent_encounter_id}",
    )
    db.add(encounter)
    db.flush()
    
    total_tokens = db.scalar(
        select(func.count())
        .select_from(models.Token)
        .where(models.Token.token_number.like("E-%"))
    ) or 0
    
    token = models.Token(
        encounter_id=encounter.encounter_id,
        token_number=f"E-{total_tokens + 501:03d}",
        department=doctor.department or "Outpatient",
        room=doctor.room or "Tele-Consult",
        floor=doctor.floor or "Ground Floor",
        eta_minutes=10,
        status="WAITING",
    )
    db.add(token)
    db.commit()
    
    return {
        "encounter_id": encounter.encounter_id,
        "token_number": token.token_number,
        "status": encounter.status,
    }

