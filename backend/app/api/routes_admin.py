"""Admin API module — Doctor profile management and scheduling."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.core.database import get_db

router = APIRouter(prefix="/api/v1", tags=["admin"])


@router.post("/admin/doctors")
def register_doctor(body: schemas.DoctorRegisterRequest, db: Session = Depends(get_db)) -> dict:
    # Generate unique HPR ID
    hpr_id = f"HPR-{1000 + db.query(models.Staff).count()}"
    new_doc = models.Staff(
        name=body.name,
        role=body.role or "DOCTOR",
        department=body.department or body.specialty or "General Medicine",
        specialty=body.specialty or "General Medicine",
        hpr_id=hpr_id,
        available=True,
        experience_years=body.experience_years,
        room=body.room,
        floor=body.floor,
        access_pin=body.access_pin or "1234",
        opd_fee=body.opd_fee,
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    
    return {
        "doctor_id": new_doc.staff_id,
        "name": new_doc.name,
        "role": new_doc.role,
        "specialty": new_doc.specialty,
        "room": new_doc.room,
        "floor": new_doc.floor,
        "access_pin": new_doc.access_pin,
        "opd_fee": new_doc.opd_fee,
    }


@router.get("/admin/doctors")
def list_doctors(db: Session = Depends(get_db)) -> list[dict]:
    doctors = db.scalars(
        select(models.Staff)
        .where(models.Staff.role.in_(["DOCTOR", "NURSE"]))
        .where(models.Staff.available.is_(True))
        .order_by(models.Staff.role.asc(), models.Staff.name.asc())
    ).all()
    
    out = []
    for d in doctors:
        out.append({
            "doctor_id": d.staff_id,
            "name": d.name,
            "role": d.role,
            "specialty": d.specialty,
            "department": d.department,
            "experience_years": d.experience_years or 0,
            "room": d.room or "Room 1",
            "floor": d.floor or "Floor 1",
            "access_pin": d.access_pin or "1234",
            "opd_fee": d.opd_fee or 500.0,
            "available": d.available,
        })
    return out


@router.post("/doctors/verify-pin")
def verify_doctor_pin(body: schemas.DoctorVerifyPinRequest, db: Session = Depends(get_db)) -> dict:
    doc = db.get(models.Staff, body.doctor_id)
    if not doc or doc.role != "DOCTOR":
        raise HTTPException(404, "Doctor not found")
        
    expected_pin = doc.access_pin or "1234"
    if body.access_pin != expected_pin:
        raise HTTPException(401, "Invalid access PIN code")
        
    return {"verified": True, "doctor_id": doc.staff_id, "name": doc.name}


@router.get("/triage/staff")
def list_triage_staff(db: Session = Depends(get_db)) -> list[dict]:
    staff = db.scalars(
        select(models.Staff)
        .where(models.Staff.role == "NURSE")
        .where(models.Staff.department == "Triage")
        .where(models.Staff.available.is_(True))
        .order_by(models.Staff.name.asc())
    ).all()
    return [{
        "staff_id": member.staff_id,
        "role": member.role,
        "available": member.available,
        "hpr_id": member.hpr_id,
        "name": member.name,
        "department": member.department,
        "specialty": member.specialty,
        "experience_years": member.experience_years or 0,
        "room": member.room,
        "floor": member.floor,
    } for member in staff]


@router.post("/triage/verify-pin")
def verify_triage_pin(body: schemas.TriageStaffVerifyPinRequest, db: Session = Depends(get_db)) -> dict:
    member = db.get(models.Staff, body.staff_id)
    if not member or member.role != "NURSE" or member.department != "Triage":
        raise HTTPException(404, "Triage clinical profile not found")
    if not member.available:
        raise HTTPException(403, "Triage clinical profile is unavailable")
    if body.access_pin != member.access_pin:
        raise HTTPException(401, "Invalid access PIN code")
    return {"verified": True, "staff_id": member.staff_id, "name": member.name}


@router.put("/admin/doctors/{doctor_id}")
def update_doctor(doctor_id: str, body: schemas.DoctorUpdateRequest, db: Session = Depends(get_db)) -> dict:
    doc = db.get(models.Staff, doctor_id)
    if not doc or doc.role not in ["DOCTOR", "NURSE"]:
        raise HTTPException(404, "Practitioner not found")
        
    if body.name is not None:
        doc.name = body.name
    if body.role is not None:
        doc.role = body.role
    if body.department is not None:
        doc.department = body.department
    if body.specialty is not None:
        doc.specialty = body.specialty
    if body.experience_years is not None:
        doc.experience_years = body.experience_years
    if body.room is not None:
        doc.room = body.room
    if body.floor is not None:
        doc.floor = body.floor
    if body.access_pin is not None:
        doc.access_pin = body.access_pin
    if body.opd_fee is not None:
        doc.opd_fee = body.opd_fee
        
    db.commit()
    db.refresh(doc)
    
    return {
        "doctor_id": doc.staff_id,
        "name": doc.name,
        "role": doc.role,
        "specialty": doc.specialty,
        "room": doc.room,
        "floor": doc.floor,
        "access_pin": doc.access_pin,
        "opd_fee": doc.opd_fee,
    }


@router.delete("/admin/doctors/{doctor_id}")
def remove_doctor(doctor_id: str, db: Session = Depends(get_db)) -> dict:
    practitioner = db.get(models.Staff, doctor_id)
    if not practitioner or practitioner.role not in ["DOCTOR", "NURSE"] or not practitioner.available:
        raise HTTPException(404, "Practitioner not found")

    # Preserve historical appointments, billing, and clinical records while
    # removing the practitioner from active directories and login workflows.
    practitioner.available = False
    db.commit()
    return {"status": "success", "message": f"{practitioner.name} removed from the clinical directory"}


@router.get("/admin/doctors/{doctor_id}/schedule")
def list_doctor_schedule(doctor_id: str, db: Session = Depends(get_db)) -> list[dict]:
    schedules = db.scalars(
        select(models.DoctorSchedule)
        .where(models.DoctorSchedule.doctor_id == doctor_id)
        .order_by(models.DoctorSchedule.day_of_week.asc())
    ).all()
    
    return [{
        "schedule_id": s.schedule_id,
        "day_of_week": s.day_of_week,
        "start_time": s.start_time,
        "end_time": s.end_time,
        "slot_duration_minutes": s.slot_duration_minutes,
        "active": s.active,
    } for s in schedules]


@router.post("/admin/doctors/{doctor_id}/schedule")
def update_doctor_schedule(
    doctor_id: str,
    body: list[schemas.DoctorScheduleRequest],
    db: Session = Depends(get_db)
) -> dict:
    doc = db.get(models.Staff, doctor_id)
    if not doc or doc.role != "DOCTOR":
        raise HTTPException(404, "Doctor not found")
        
    # Delete existing schedule items for clean overwrite
    db.query(models.DoctorSchedule).filter(models.DoctorSchedule.doctor_id == doctor_id).delete()
    
    for item in body:
        new_sched = models.DoctorSchedule(
            doctor_id=doctor_id,
            day_of_week=item.day_of_week,
            start_time=item.start_time,
            end_time=item.end_time,
            slot_duration_minutes=item.slot_duration_minutes,
            department=doc.department,
            room=doc.room,
            active=True
        )
        db.add(new_sched)
        
    db.commit()
    return {"status": "success", "message": "Doctor schedule updated successfully"}
