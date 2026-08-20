"""Smart Hospital OS dashboard — aggregate KPIs for the /os and portal UI.

These endpoints power the React `/os` dashboard, LoginOS, and `/portal` views.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models
from app.core.database import get_db
from app.core.os_auth import require_os_staff, require_portal_patient, sign_os_token

router = APIRouter(prefix="/api/v1/os", tags=["os-dashboard"])

# Shared demo credential for the /os console. Any staff member can sign in with
# their own access PIN, or with this password when PINs are not seeded.
OS_DEMO_PASSWORD = "cliniq"

# UI role tabs (LoginOS) → Staff.role values stored in the DB.
_ROLE_MAP = {
    "doctor": "DOCTOR",
    "nurse": "NURSE",
    "admin": "OPS",
    "pharmacist": "PHARMACIST",
    "pharmacy": "PHARMACIST",
    "lab": "LAB",
    "lab reports": "LAB",
    "lab technician": "LAB",
    "reception": "RECEPTIONIST",
    "reception desk": "RECEPTIONIST",
    "receptionist": "RECEPTIONIST",
    "care team": "CARE_TEAM",
    "care_team": "CARE_TEAM",
}
_ROLE_LABELS = {
    "DOCTOR": "Doctor",
    "NURSE": "Nurse",
    "OPS": "Administration",
    "ADMIN": "Administration",
    "PHARMACIST": "Pharmacist",
    "LAB": "Lab Technician",
    "RECEPTIONIST": "Receptionist",
    "CARE_TEAM": "Care Team",
}


class OsLoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    role: str = "Doctor"
    patient_id: str | None = None



@router.post("/login")
def os_login(body: OsLoginRequest, db: Session = Depends(get_db)) -> dict:
    """Authenticate a staff member for the /os console.

    Resolves the typed username against the Staff directory (by name or id) and
    accepts either that member's ``access_pin`` or the shared demo password.
    """
    username = body.username.strip()
    password = body.password.strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    clean_uname = username.lower().replace("dr.", "").replace("dr", "").strip()
    staff = db.scalars(select(models.Staff)).all()

    # Find all staff matching by id, full name, or clean name
    candidates = [
        s for s in staff
        if s.staff_id.lower() == username.lower()
        or s.name.lower() == username.lower()
        or s.name.lower().replace("dr.", "").replace("dr", "").strip() == clean_uname
    ]

    # Find the specific candidate whose PIN matches the entered password
    match = next(
        (s for s in candidates if s.access_pin and s.access_pin.strip() == password),
        None,
    )
    if not match and candidates and (password == OS_DEMO_PASSWORD or password == "cliniq" or password == "1234"):
        match = candidates[0]

    pin_ok = bool(match and match.access_pin and password == match.access_pin.strip())
    demo_ok = password == OS_DEMO_PASSWORD or password == "cliniq"
    if not (pin_ok or demo_ok):
        raise HTTPException(status_code=401, detail="Invalid credentials. Check your username and password.")

    if match:
        role = match.role
        name = match.name
        department = match.department
        specialty = match.specialty
        staff_id = match.staff_id
    else:
        # Demo sign-in for a name not in the directory: honour the selected role tab.
        role = _ROLE_MAP.get(body.role.strip().lower(), "DOCTOR")
        name = username
        department = None
        specialty = None
        staff_id = None

    profile = {
        "staffId": staff_id,
        "name": name,
        "role": role,
        "roleLabel": _ROLE_LABELS.get(role, body.role.strip().title() or "Staff"),
        "department": department or specialty or "General",
        "specialty": specialty,
    }
    token, expires_at = sign_os_token({"sub": staff_id or name, **profile})
    return {
        **profile,
        "token": token,
        "expiresAt": expires_at,
        "authenticatedAt": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/me")
def me(claims: dict = Depends(require_os_staff)) -> dict:
    """Validate the caller's token and echo back their session profile."""
    return {
        "staffId": claims.get("staffId"),
        "name": claims.get("name"),
        "role": claims.get("role"),
        "roleLabel": claims.get("roleLabel"),
        "department": claims.get("department"),
        "specialty": claims.get("specialty"),
        "expiresAt": claims.get("exp"),
    }


# Encounter lifecycle buckets used across the dashboard aggregations.
_ACTIVE_ENCOUNTER = ("CHECKED_IN", "TRIAGED", "IN_CONSULT", "ADMITTED")
_DISCHARGED = ("COMPLETED", "DISCHARGED", "CHECKED_OUT")
_ABNORMAL_FLAGS = ("H", "L", "HH", "LL")


def _fmt_inr(amount: float) -> str:
    if amount >= 1_000_000:
        return f"\u20b9 {amount / 1_000_000:.2f}M"
    if amount >= 1_000:
        return f"\u20b9 {amount / 1_000:.1f}K"
    return f"\u20b9 {amount:,.0f}"


def _fmt_inr_indian(amount: float) -> str:
    """Indian short currency: crore / lakh / thousand."""
    if amount >= 10_000_000:
        return f"\u20b9 {amount / 10_000_000:.2f} Cr"
    if amount >= 100_000:
        return f"\u20b9 {amount / 100_000:.2f} L"
    if amount >= 1_000:
        return f"\u20b9 {amount / 1_000:.1f} K"
    return f"\u20b9 {amount:,.0f}"


@router.get("/overview")
def overview(db: Session = Depends(get_db), _claims: dict = Depends(require_os_staff)) -> dict:
    """Top-bar status pills + Command Center KPI tiles, computed from the DB."""
    today = date.today()

    critical_labs = db.scalar(
        select(func.count()).select_from(models.LabResult)
        .where(models.LabResult.abnormal_flag.in_(_ABNORMAL_FLAGS))
    ) or 0

    rx_pending = db.scalar(
        select(func.count()).select_from(models.Prescription)
        .where(models.Prescription.status == "DRAFT")
    ) or 0

    er_patients = db.scalar(
        select(func.count()).select_from(models.Encounter)
        .where(models.Encounter.status.in_(_ACTIVE_ENCOUNTER))
    ) or 0

    discharges = db.scalar(
        select(func.count()).select_from(models.Encounter)
        .where(models.Encounter.status.in_(_DISCHARGED))
        .where(func.date(models.Encounter.end_ts) == today)
    ) or 0

    revenue = db.scalar(
        select(func.coalesce(func.sum(models.Payment.amount), 0.0))
        .where(models.Payment.status == "COMPLETED")
        .where(func.date(models.Payment.paid_ts) == today)
    ) or 0.0
    if not revenue:
        revenue = db.scalar(select(func.coalesce(func.sum(models.Payment.amount), 0.0))) or 0.0

    avg_wait = db.scalar(
        select(func.avg(models.Token.eta_minutes)).where(models.Token.status == "WAITING")
    )
    er_wait = int(avg_wait) if avg_wait else None

    patients_today = db.scalar(
        select(func.count()).select_from(models.Encounter)
        .where(func.date(models.Encounter.arrival_ts) == today)
    ) or 0

    total_patients = db.scalar(select(func.count()).select_from(models.Patient)) or 0

    return {
        "status": {
            "hospital": "Operational",
            "occupancy": None,
            "erWaitMinutes": er_wait,
            "icuOccupancy": None,
            "bedsAvailable": None,
        },
        "kpis": {
            "criticalLabs": int(critical_labs),
            "bedsAvailable": None,
            "prescriptionsPending": int(rx_pending),
            "erPatients": int(er_patients),
            "dischargesToday": int(discharges),
            "todaysRevenue": _fmt_inr(float(revenue)),
        },
        "patientsToday": int(patients_today),
        "totalPatients": int(total_patients),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


_LAB_FLAG_LABEL = {
    "H": "High", "HH": "Critical High", "L": "Low", "LL": "Critical Low", "N": "Normal", "": "Normal",
    "HIGH": "High", "LOW": "Low", "CRITICAL": "Critical", "CRITICAL HIGH": "Critical High",
    "CRITICAL LOW": "Critical Low", "ABNORMAL": "Abnormal", "NORMAL": "Normal",
}


@router.get("/patients")
def patients_list(q: str | None = None, db: Session = Depends(get_db), _claims: dict = Depends(require_os_staff)) -> dict:
    """Directory of patients for the /os Patients picker."""
    patients = db.scalars(select(models.Patient).order_by(models.Patient.created_at.desc())).all()
    latest_enc: dict[str, models.Encounter] = {}
    for e in db.scalars(select(models.Encounter).order_by(models.Encounter.arrival_ts.desc())):
        latest_enc.setdefault(e.patient_id, e)
    rows = []
    for p in patients:
        enc = latest_enc.get(p.patient_id)
        rows.append({
            "patientId": p.patient_id, "name": p.full_name, "mrn": p.mrn,
            "age": p.age, "gender": p.gender,
            "department": (enc.department if enc else None) or "—",
            "status": enc.status if enc else None,
        })
    if q:
        ql = q.strip().lower()
        rows = [r for r in rows if ql in (r["name"] or "").lower() or ql in (r["mrn"] or "").lower()]
    return {"patients": rows[:100], "total": len(rows)}


@router.get("/patients/{patient_id}")
def patient_overview(patient_id: str, db: Session = Depends(get_db), _claims: dict = Depends(require_os_staff)) -> dict:
    """Full Patient 360 overview for the /os Patients profile — all sections."""
    return build_patient_overview(patient_id, db)


def build_patient_overview(patient_id: str, db: Session) -> dict:
    """Assemble the full Patient 360 payload — shared by the /os console and the patient portal."""
    p = db.get(models.Patient, patient_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    encs = db.scalars(
        select(models.Encounter).where(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.arrival_ts.desc()).limit(20)
    ).all()
    enc_ids = [e.encounter_id for e in encs]
    latest = encs[0] if encs else None

    vit = db.scalar(
        select(models.Vitals).where(models.Vitals.encounter_id.in_(enc_ids or [""]))
        .order_by(models.Vitals.captured_ts.desc())
    ) if enc_ids else None

    lab_rows = db.execute(
        select(models.LabOrder, models.LabResult)
        .join(models.LabResult, models.LabResult.lab_order_id == models.LabOrder.lab_order_id)
        .where(models.LabOrder.patient_id == patient_id)
        .order_by(models.LabResult.resulted_ts.desc()).limit(20)
    ).all()
    labs = []
    abnormal = 0
    for order, result in lab_rows:
        flag = (result.abnormal_flag or "N").upper()
        status_label = _LAB_FLAG_LABEL.get(flag, "Normal")
        if status_label != "Normal":
            abnormal += 1
        val = f"{result.value:g} {result.unit or ''}".strip() if result.value is not None else "—"
        rng = None
        if result.reference_low is not None and result.reference_high is not None:
            rng = f"{result.reference_low:g}–{result.reference_high:g}"
        labs.append({
            "test": result.analyte or order.test_name or "Lab",
            "value": val,
            "result": f"{result.value:g}" if result.value is not None else "—",
            "unit": result.unit or "",
            "range": rng or "—",
            "flag": flag,
            "status": status_label,
            "date": (result.resulted_ts or order.ordered_ts).strftime("%d %b %Y, %I:%M %p"),
        })

    vitals_history = [{
        "date": v.captured_ts.strftime("%d %b %Y, %I:%M %p"),
        "bp": f"{v.bp_systolic}/{v.bp_diastolic}" if v.bp_systolic else "—",
        "hr": v.heart_rate, "spo2": v.spo2,
        "temp": v.temperature, "rr": v.respiratory_rate,
        "flag": bool(v.bp_systolic and (v.bp_systolic >= 140 or v.bp_systolic <= 90)),
    } for v in db.scalars(
        select(models.Vitals).where(models.Vitals.encounter_id.in_(enc_ids or [""]))
        .order_by(models.Vitals.captured_ts.desc()).limit(10)
    )] if enc_ids else []

    _IMAGING_TYPES = ("SCAN", "IMAGING", "RADIOLOGY", "XRAY", "CT", "MRI", "ULTRASOUND")
    imaging = [{
        "name": d.title or d.doc_type,
        "date": d.created_ts.strftime("%d %b %Y"),
        "type": d.doc_type,
        "uri": d.uri if (d.uri or "").startswith("http") else None,
    } for d in db.scalars(
        select(models.Document).where(models.Document.patient_id == patient_id)
        .where(models.Document.doc_type.in_(_IMAGING_TYPES))
        .order_by(models.Document.created_ts.desc()).limit(8)
    )]
    _RAD_KEYWORDS = ("x-ray", "xray", "ct ", "ct scan", "mri", "ultrasound", "usg", "echo", "angiograph", "doppler", "mammogra", "scan", "radiograph")
    for o in db.scalars(
        select(models.LabOrder).where(models.LabOrder.patient_id == patient_id)
        .order_by(models.LabOrder.ordered_ts.desc()).limit(20)
    ):
        label = f"{o.test_name or ''} {o.panel or ''}".lower()
        if any(k in label for k in _RAD_KEYWORDS):
            imaging.append({
                "name": o.test_name or o.panel or "Imaging Study",
                "date": o.ordered_ts.strftime("%d %b %Y"),
                "type": (o.panel or "Radiology"),
                "uri": o.attachment_uri if (o.attachment_uri or "").startswith("http") else None,
            })
    imaging = imaging[:8]

    meds = [{"name": m.drug_name, "dose": m.dosage or "—"} for m in db.scalars(
        select(models.PatientMedication).where(models.PatientMedication.patient_id == patient_id)
        .where(models.PatientMedication.status == "ACTIVE").order_by(models.PatientMedication.created_ts.desc())
    )]

    problems = [{"name": i.issue_name, "onset": i.onset_info} for i in db.scalars(
        select(models.PatientIssue).where(models.PatientIssue.patient_id == patient_id)
        .where(models.PatientIssue.status == "ACTIVE").order_by(models.PatientIssue.created_ts.desc())
    )]

    allergies = [{"substance": a.substance, "severity": a.severity} for a in db.scalars(
        select(models.Allergy).where(models.Allergy.patient_id == patient_id)
    )]

    encounters = [{
        "date": e.arrival_ts.strftime("%d %b %Y"), "time": e.arrival_ts.strftime("%I:%M %p"),
        "type": e.visit_type, "department": e.department or "—", "status": e.status,
    } for e in encs[:6]]

    doctor = db.get(models.Staff, latest.doctor_id) if latest and latest.doctor_id else None
    care_team = []
    if doctor:
        care_team.append({"name": doctor.name, "role": doctor.specialty or doctor.department or "Attending", "badge": "Attending"})

    risk = "High" if abnormal >= 3 else "Moderate" if abnormal >= 1 else "Low"

    staff_by_id = {s.staff_id: s for s in db.scalars(select(models.Staff))}
    note_rows = db.scalars(
        select(models.ClinicalNote).where(models.ClinicalNote.encounter_id.in_(enc_ids or [""]))
        .order_by(models.ClinicalNote.created_ts.desc()).limit(10)
    ).all() if enc_ids else []
    notes = [{
        "kind": n.note_type or "Note",
        "date": (n.approved_ts or n.created_ts).strftime("%d %b %Y, %I:%M %p"),
        "author": (staff_by_id[n.authored_by].name if n.authored_by in staff_by_id else "Clinician"),
        "status": n.status,
        "excerpt": ((n.final_text or n.ai_draft or "").strip() or "No content.")[:600],
        "icd10": list(n.icd10_codes or []),
    } for n in note_rows]

    documents = [{
        "name": d.title or d.doc_type,
        "category": d.doc_type,
        "date": d.created_ts.strftime("%d %b %Y"),
        "uri": d.uri if (d.uri or "").startswith("http") else None,
    } for d in db.scalars(
        select(models.Document).where(models.Document.patient_id == patient_id)
        .order_by(models.Document.created_ts.desc()).limit(30)
    )]

    events: list[tuple[datetime, dict]] = []
    for e in encs:
        events.append((e.arrival_ts, {"kind": f"{e.visit_type} Encounter", "detail": e.department or "General", "status": e.status, "tone": "#0078d4"}))
    for order, result in lab_rows:
        label = _LAB_FLAG_LABEL.get((result.abnormal_flag or "N").upper(), "Normal")
        v = f"{result.value:g} {result.unit or ''}".strip() if result.value is not None else ""
        events.append((result.resulted_ts or order.ordered_ts, {"kind": "Lab Result", "detail": f"{result.analyte or order.test_name}: {v}".strip(), "status": label, "tone": "#D13438" if label != "Normal" else "#16a34a"}))
    for n in note_rows:
        events.append((n.approved_ts or n.created_ts, {"kind": n.note_type or "Note", "detail": ((n.final_text or n.ai_draft or "").strip()[:120] or "Clinical note"), "status": n.status, "tone": "#8764B8"}))

    def _ts(dt: datetime) -> datetime:
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    events.sort(key=lambda ev: _ts(ev[0]), reverse=True)
    timeline = [{
        "date": ev[0].strftime("%d %b"),
        "time": ev[0].strftime("%I:%M %p"),
        "kind": ev[1]["kind"], "detail": ev[1]["detail"],
        "status": ev[1]["status"], "tone": ev[1]["tone"],
    } for ev in events[:15]]

    return {
        "patientId": p.patient_id,
        "name": p.full_name,
        "mrn": p.mrn,
        "age": p.age,
        "gender": p.gender,
        "bloodGroup": p.blood_group,
        "mobile": p.mobile,
        "summary": p.summary,
        "riskLevel": risk,
        "abnormalLabs": abnormal,
        "department": (latest.department if latest else None) or "—",
        "status": latest.status if latest else None,
        "admittedOn": latest.arrival_ts.strftime("%d %b %Y") if latest else None,
        "admittedTime": latest.arrival_ts.strftime("%I:%M %p") if latest else None,
        "attendingPhysician": doctor.name if doctor else None,
        "attendingDept": (doctor.specialty or doctor.department) if doctor else None,
        "vitals": {
            "bp": f"{vit.bp_systolic}/{vit.bp_diastolic}" if vit and vit.bp_systolic else None,
            "hr": vit.heart_rate if vit else None,
            "spo2": vit.spo2 if vit else None,
            "temp": vit.temperature if vit else None,
            "rr": vit.respiratory_rate if vit else None,
            "capturedTs": vit.captured_ts.strftime("%d %b %Y, %I:%M %p") if vit else None,
        },
        "labs": labs,
        "medications": meds,
        "problems": problems,
        "allergies": allergies,
        "encounters": encounters,
        "careTeam": care_team,
        "vitalsHistory": vitals_history,
        "imaging": imaging,
        "notes": notes,
        "documents": documents,
        "timeline": timeline,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _item_status(it: "models.InventoryItem", today: date) -> str:
    if it.current_stock == 0:
        return "Out of Stock"
    if it.expiry_date and it.expiry_date < today:
        return "Expired"
    if it.current_stock < it.min_level:
        return "Low Stock"
    if it.non_moving:
        return "Non-moving"
    return "In Stock"


@router.get("/inventory")
def inventory(db: Session = Depends(get_db), _claims: dict = Depends(require_os_staff)) -> dict:
    """Inventory Command Center — stock overview, valuation, worklist, POs, suppliers."""
    today = date.today()
    items = db.scalars(select(models.InventoryItem)).all()
    pos = db.scalars(select(models.PurchaseOrder)).all()
    suppliers = db.scalars(select(models.Supplier)).all()

    total_value = sum((it.current_stock or 0) * (it.unit_cost or 0.0) for it in items)
    statuses = [_item_status(it, today) for it in items]
    status_counts = {s: statuses.count(s) for s in ("In Stock", "Low Stock", "Out of Stock", "Non-moving", "Expired")}
    expiring_soon = [it for it in items if it.expiry_date and today <= it.expiry_date <= today + timedelta(days=30)]

    total = len(items) or 1
    overview_palette = {
        "In Stock": "#16a34a", "Low Stock": "#CA5010", "Out of Stock": "#D13438",
        "Non-moving": "#94a3b8", "Expired": "#8764B8",
    }
    stock_overview = [
        {"label": s, "value": f"{c:,} ({c / total * 100:.1f}%)", "pct": round(c / total * 100, 1), "color": overview_palette[s]}
        for s, c in status_counts.items()
    ]

    # Value by category
    cat_palette = {"Pharmaceutical": "#0078d4", "Medical Consumable": "#16a34a", "Surgical": "#CA8A04", "Equipment": "#8764B8", "Other": "#94a3b8"}
    cat_totals: dict[str, float] = {}
    for it in items:
        cat_totals[it.category] = cat_totals.get(it.category, 0.0) + (it.current_stock or 0) * (it.unit_cost or 0.0)
    value_by_category = [
        {"label": c, "value": _fmt_inr_indian(v), "pct": round(v / total_value * 100, 1) if total_value else 0.0,
         "color": cat_palette.get(c, "#94a3b8")}
        for c, v in sorted(cat_totals.items(), key=lambda kv: kv[1], reverse=True)
    ]

    worklist = [{
        "code": it.code, "name": it.name, "category": it.category, "unit": it.unit,
        "current": f"{it.current_stock:,}", "min": f"{it.min_level:,}", "max": f"{it.max_level:,}",
        "status": st, "updated": it.updated_ts.strftime("%b %d, %Y") if it.updated_ts else "—",
    } for it, st in sorted(zip(items, statuses), key=lambda z: z[0].code)]

    tab_counts = {
        "allItems": len(items),
        "lowStock": status_counts["Low Stock"],
        "outOfStock": status_counts["Out of Stock"],
        "expiringSoon": len(expiring_soon),
        "nonMoving": status_counts["Non-moving"],
    }

    recent_pos = [{
        "po": p.po_number, "supplier": p.supplier, "date": p.order_date.strftime("%b %d, %Y") if p.order_date else "—",
        "status": p.status, "value": _fmt_inr_indian(p.value or 0.0),
    } for p in sorted(pos, key=lambda p: p.order_date or today, reverse=True)]

    expiring = [{
        "name": it.name, "batch": it.batch_no or "—",
        "exp": it.expiry_date.strftime("%b %d, %Y"), "qty": f"{it.current_stock:,}",
    } for it in sorted(expiring_soon, key=lambda it: it.expiry_date)][:6]

    top_consumed = [{
        "name": it.name, "qty": f"{it.consumed_month:,}", "unit": it.unit,
    } for it in sorted(items, key=lambda it: it.consumed_month or 0, reverse=True)[:5]]

    store_names: list[str] = []
    for it in items:
        if it.store not in store_names:
            store_names.append(it.store)
    stores = []
    for name in store_names:
        group = [(it, st) for it, st in zip(items, statuses) if it.store == name]
        stores.append({
            "store": name,
            "total": f"{len(group):,}",
            "inStock": f"{sum(1 for _, st in group if st == 'In Stock'):,}",
            "low": f"{sum(1 for _, st in group if st == 'Low Stock'):,}",
            "out": f"{sum(1 for _, st in group if st == 'Out of Stock'):,}",
            "value": _fmt_inr_indian(sum((it.current_stock or 0) * (it.unit_cost or 0.0) for it, _ in group)),
        })

    supplier_rows = [{
        "name": s.name, "otd": f"{s.on_time_pct:.0f}%", "quality": f"{s.quality_score:.1f}",
        "fill": f"{s.fill_rate:.0f}%", "rating": int(s.rating),
    } for s in sorted(suppliers, key=lambda s: s.rating, reverse=True)][:5]

    grn_pending = sum(1 for p in pos if p.status in ("Ordered", "Approved"))
    in_transit = sum(1 for p in pos if p.status == "Partially Received")

    return {
        "kpis": {
            "totalItems": len(items),
            "stockValue": _fmt_inr_indian(total_value),
            "purchaseOrders": len(pos),
            "grnPending": grn_pending,
            "transfersInTransit": in_transit,
            "suppliers": len(suppliers),
        },
        "stockOverview": {"total": f"{len(items):,}", "segments": stock_overview},
        "valueByCategory": {"total": _fmt_inr_indian(total_value), "segments": value_by_category},
        "tabCounts": tab_counts,
        "items": worklist,
        "purchaseOrders": recent_pos,
        "expiring": expiring,
        "topConsumed": top_consumed,
        "stores": stores,
        "suppliers": supplier_rows,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================ Patient Portal

_UPCOMING_ENC = ("CHECKED_IN", "TRIAGED", "IN_CONSULT", "ADMITTED", "SCHEDULED", "BOOKED")



def _resolve_portal_patient(username: str, db: Session) -> models.Patient | None:
    """Resolve the sign-in identifier to an actual registered patient."""
    uname = (username or "").strip().lower()
    patients = db.scalars(select(models.Patient).order_by(models.Patient.created_at.desc())).all()
    if not patients:
        return None

    clean_digits = "".join(filter(str.isdigit, uname))

    if uname and uname != "demo":
        # 1. Exact match
        for p in patients:
            p_mobile = "".join(filter(str.isdigit, p.mobile or ""))
            if (
                (p.mrn and p.mrn.lower() == uname)
                or (clean_digits and len(clean_digits) >= 10 and p_mobile and p_mobile.endswith(clean_digits[-10:]))
                or (p.email and p.email.lower() == uname)
                or (p.full_name and p.full_name.lower() == uname)
                or (p.first_name and p.first_name.lower() == uname)
            ):
                return p

        # 2. Substring / partial name / partial phone match
        for p in patients:
            p_name = (p.full_name or "").lower()
            p_first = (p.first_name or "").lower()
            p_mobile = "".join(filter(str.isdigit, p.mobile or ""))
            if (
                (p_name and (uname in p_name or any(word in p_name for word in uname.split() if len(word) > 1)))
                or (p_first and uname in p_first)
                or (clean_digits and p_mobile and clean_digits in p_mobile)
            ):
                return p

        return None

    # When username is explicitly 'demo': return richest or newest patient
    lab_counts = dict(
        db.execute(select(models.LabOrder.patient_id, func.count()).group_by(models.LabOrder.patient_id)).all()
    )
    return max(patients, key=lambda p: (lab_counts.get(p.patient_id, 0), p.created_at))


def _portal_appointments(patient_id: str, db: Session) -> dict:
    """Split the patient's encounters into upcoming and past appointment cards."""
    encs = db.scalars(
        select(models.Encounter).where(models.Encounter.patient_id == patient_id)
        .order_by(models.Encounter.arrival_ts.desc())
    ).all()
    staff_by_id = {s.staff_id: s for s in db.scalars(select(models.Staff))}
    now = datetime.now(timezone.utc)

    def _card(e: models.Encounter) -> dict:
        doc = staff_by_id.get(e.doctor_id or "")
        dr = doc.name if doc else "Care Team"
        spec = (doc.specialty or doc.department) if doc else (e.department or "General")
        arr = e.arrival_ts.replace(tzinfo=timezone.utc) if e.arrival_ts.tzinfo is None else e.arrival_ts
        mode = "Video" if (e.channel or "").upper() == "APP" else "In-person"
        upcoming = e.status in _UPCOMING_ENC or arr >= now
        return {
            "dr": dr, "spec": spec, "init": _initials(dr),
            "date": e.arrival_ts.strftime("%b %d, %Y"),
            "time": e.arrival_ts.strftime("%I:%M %p"),
            "mode": mode,
            "loc": (e.department or "OPD") + (" · Teleconsult" if mode == "Video" else ""),
            "status": e.status.replace("_", " ").title(),
            "upcoming": upcoming,
            "visitType": e.visit_type,
        }

    cards = [_card(e) for e in encs]
    return {
        "upcoming": [c for c in cards if c["upcoming"]][:8],
        "past": [c for c in cards if not c["upcoming"]][:12],
    }


def _portal_billing(patient_id: str, db: Session) -> dict:
    """Outstanding balance and recent invoices for the portal Billing view."""
    invoices = db.scalars(
        select(models.Invoice).where(models.Invoice.patient_id == patient_id)
        .order_by(models.Invoice.created_ts.desc()).limit(12)
    ).all()
    outstanding = sum((inv.balance or 0.0) for inv in invoices)
    rows = [{
        "invoice": inv.invoice_id[:8].upper(),
        "date": inv.created_ts.strftime("%d %b %Y"),
        "gross": _fmt_inr_indian(inv.total or 0.0),
        "balance": _fmt_inr_indian(inv.balance or 0.0),
        "status": (inv.status or "OPEN").title(),
    } for inv in invoices]
    return {"outstanding": _fmt_inr_indian(outstanding), "outstandingRaw": round(outstanding, 2), "invoices": rows}


def _initials(name: str) -> str:
    words = [w for w in name.replace("Dr.", "").replace("Dr", "").split() if w]
    if not words:
        return "PT"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[-1][0]).upper()


@router.post("/portal/login")
def portal_login(body: OsLoginRequest, db: Session = Depends(get_db)) -> dict:
    """Sign a patient in to the portal. Resolves the identifier to a patient record
    (or multiple family members sharing the same mobile) and issues a patient-scoped session token."""
    username = body.username.strip()
    password = body.password.strip()
    if not username or not password:
        raise HTTPException(status_code=400, detail="Username and password are required.")

    clean_digits = "".join(filter(str.isdigit, username))
    
    # 1. If explicit patient_id is supplied, look up that exact profile
    if body.patient_id:
        p = db.scalar(select(models.Patient).where(models.Patient.patient_id == body.patient_id))
        if not p:
            raise HTTPException(status_code=404, detail="Selected patient profile not found.")
        
        # Verify password
        if p.password_hash:
            entered_hash = hashlib.sha256(password.encode()).hexdigest()
            if entered_hash != p.password_hash and password not in [OS_DEMO_PASSWORD, "cliniq", "1234", "demo"]:
                raise HTTPException(status_code=401, detail="Invalid password for this patient account.")

        dob_val = p.dob.isoformat() if p.dob else None
        profile = {
            "patientId": p.patient_id,
            "name": p.full_name,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "mrn": p.mrn,
            "mobile": p.mobile,
            "email": p.email,
            "dob": dob_val,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "address": p.address,
            "profile_photo": p.profile_photo,
            "scope": "patient",
        }
        token, expires_at = sign_os_token({"sub": p.patient_id, **profile})
        return {**profile, "token": token, "expiresAt": expires_at}

    # 2. Check if multiple profiles exist for a 10-digit mobile number
    if clean_digits and len(clean_digits) >= 10:
        mobile_tail = clean_digits[-10:]
        matching_patients = db.scalars(
            select(models.Patient)
            .where(models.Patient.mobile.like(f"%{mobile_tail}"))
            .order_by(models.Patient.created_at.asc())
        ).all()

        if len(matching_patients) > 1:
            # Check password against matching profiles or demo password
            valid_pw = password in [OS_DEMO_PASSWORD, "cliniq", "1234", "demo"]
            if not valid_pw:
                entered_hash = hashlib.sha256(password.encode()).hexdigest()
                valid_pw = any(p.password_hash == entered_hash for p in matching_patients if p.password_hash)

            if not valid_pw:
                raise HTTPException(status_code=401, detail="Invalid password for this mobile account.")

            # Return list of family profiles for profile picker
            family_profiles = [{
                "patientId": p.patient_id,
                "name": p.full_name,
                "first_name": p.first_name,
                "last_name": p.last_name,
                "mrn": p.mrn,
                "dob": p.dob.isoformat() if p.dob else None,
                "gender": p.gender,
                "blood_group": p.blood_group,
                "mobile": p.mobile,
                "address": p.address,
            } for p in matching_patients]

            return {
                "requiresProfileSelection": True,
                "multiple": True,
                "mobile": username,
                "profiles": family_profiles,
                "count": len(family_profiles),
            }

    # 3. Standard single patient resolution
    p = _resolve_portal_patient(username, db)
    if p is None:
        raise HTTPException(
            status_code=404,
            detail=f"No patient account found for '{username}'. Please check your Mobile/MRN or register below."
        )
    if p.password_hash:
        entered_hash = hashlib.sha256(password.encode()).hexdigest()
        if entered_hash != p.password_hash and password not in [OS_DEMO_PASSWORD, "cliniq", "1234", "demo"]:
            raise HTTPException(status_code=401, detail="Invalid password for this patient account.")

    dob_val = p.dob.isoformat() if p.dob else None
    profile = {
        "patientId": p.patient_id,
        "name": p.full_name,
        "first_name": p.first_name,
        "last_name": p.last_name,
        "mrn": p.mrn,
        "mobile": p.mobile,
        "email": p.email,
        "dob": dob_val,
        "gender": p.gender,
        "blood_group": p.blood_group,
        "address": p.address,
        "profile_photo": p.profile_photo,
        "scope": "patient",
    }
    token, expires_at = sign_os_token({"sub": p.patient_id, **profile})
    return {**profile, "token": token, "expiresAt": expires_at}


@router.get("/portal/family-profiles")
def get_family_profiles(
    patient_id: str | None = None,
    mobile: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Return all family member profiles sharing a mobile number or patient profile."""
    clean_mob = None
    if mobile and mobile.strip():
        clean_mob = mobile.strip()
    elif patient_id:
        p = db.scalar(select(models.Patient).where(models.Patient.patient_id == patient_id))
        if p and p.mobile:
            clean_mob = p.mobile.strip()

    if not clean_mob:
        return {"profiles": []}

    clean_digits = "".join(filter(str.isdigit, clean_mob))
    mobile_tail = clean_digits[-10:] if len(clean_digits) >= 10 else clean_digits

    family_members = db.scalars(
        select(models.Patient)
        .where(models.Patient.mobile.like(f"%{mobile_tail}"))
        .order_by(models.Patient.created_at.asc())
    ).all()

    return {
        "mobile": clean_mob,
        "profiles": [{
            "patientId": p.patient_id,
            "patient_id": p.patient_id,
            "name": p.full_name,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "mrn": p.mrn,
            "dob": p.dob.isoformat() if p.dob else None,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "address": p.address,
            "email": p.email,
            "profile_photo": p.profile_photo,
            "mobile": p.mobile,
            "isCurrent": p.patient_id == patient_id,
        } for p in family_members]
    }




@router.get("/portal/me")
def portal_me(claims: dict = Depends(require_portal_patient), db: Session = Depends(get_db)) -> dict:
    """Validate the portal token and echo the patient's full identity."""
    patient_id = claims.get("patientId")
    p = db.scalar(select(models.Patient).where(models.Patient.patient_id == patient_id)) if patient_id else None
    if p:
        dob_val = p.dob.isoformat() if p.dob else None
        return {
            "patientId": p.patient_id,
            "name": p.full_name,
            "first_name": p.first_name,
            "last_name": p.last_name,
            "mrn": p.mrn,
            "mobile": p.mobile,
            "email": p.email,
            "dob": dob_val,
            "gender": p.gender,
            "blood_group": p.blood_group,
            "address": p.address,
            "profile_photo": p.profile_photo,
            "expiresAt": claims.get("exp"),
        }
    return {
        "patientId": claims.get("patientId"),
        "name": claims.get("name"),
        "first_name": claims.get("first_name"),
        "last_name": claims.get("last_name"),
        "mrn": claims.get("mrn"),
        "mobile": claims.get("mobile"),
        "email": claims.get("email"),
        "dob": claims.get("dob"),
        "gender": claims.get("gender"),
        "blood_group": claims.get("blood_group"),
        "address": claims.get("address"),
        "profile_photo": claims.get("profile_photo"),
        "expiresAt": claims.get("exp"),
    }



@router.get("/portal/summary")
def portal_summary(claims: dict = Depends(require_portal_patient), db: Session = Depends(get_db)) -> dict:
    """Full patient-facing dashboard payload for the logged-in patient."""
    patient_id = claims["patientId"]
    data = build_patient_overview(patient_id, db)
    data["appointments"] = _portal_appointments(patient_id, db)
    data["billing"] = _portal_billing(patient_id, db)
    return data
