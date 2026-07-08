"""Clinical module — Encounter & Docs, Order Mgmt (CPOE), Lab, Prescription & CDS, Pharmacy.

Every AI output is a draft requiring an explicit human approval call. Approval endpoints are the
only places state becomes clinically effective.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, services
from app.ai import agents
from app.core.database import get_db
from app.core.events import Topics, bus
from app.core.security import audit
from app.schemas import (
    AmbientRequest,
    ApproveNoteRequest,
    ApproveRxRequest,
    LabOrderRequest,
    PrescriptionCreateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["clinical"])


def _encounter(db: Session, eid: str) -> models.Encounter:
    e = db.get(models.Encounter, eid)
    if not e:
        raise HTTPException(404, "Encounter not found")
    return e


# ------------------------------------------------------------------------- Ambient documentation
@router.post("/encounters/{encounter_id}/ambient")
def ambient_note(encounter_id: str, body: AmbientRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _encounter(db, encounter_id)
    patient = db.get(models.Patient, encounter.patient_id)
    triage = db.scalar(select(models.Triage).where(models.Triage.encounter_id == encounter_id)
                       .order_by(models.Triage.created_ts.desc()))
    vitals = db.scalar(select(models.Vitals).where(models.Vitals.encounter_id == encounter_id)
                       .order_by(models.Vitals.captured_ts.desc()))
    vitals_line = ""
    if vitals:
        vitals_line = (f"Temp {vitals.temperature}°F, SpO₂ {vitals.spo2}%, "
                       f"BP {vitals.bp_systolic}/{vitals.bp_diastolic}, HR {vitals.heart_rate}.")

    context = {
        "age": patient.age if patient else "",
        "gender": (patient.gender or "")[:1] if patient else "",
        "chief_complaint": triage.chief_complaint if triage else "",
        "problems": ", ".join(a.substance for a in patient.allergies) if patient and patient.allergies else "none recorded",
        "vitals_line": vitals_line,
    }

    result = agents.ambient_docs_agent(body.transcript, context)
    note = models.ClinicalNote(
        encounter_id=encounter_id, note_type="SOAP",
        ai_draft=result["result"]["draft_text"], final_text=result["result"]["draft_text"],
        icd10_codes=result["result"]["icd10"], status="DRAFT", authored_by="ambient-agent",
    )
    db.add(note)
    encounter.status = "IN_CONSULT"
    db.commit()
    return {"note_id": note.note_id, **result}


@router.post("/notes/{note_id}/approve")
def approve_note(note_id: str, body: ApproveNoteRequest, db: Session = Depends(get_db)) -> dict:
    note = db.get(models.ClinicalNote, note_id)
    if not note:
        raise HTTPException(404, "Note not found")
    note.final_text = body.final_text
    if body.icd10_codes is not None:
        note.icd10_codes = body.icd10_codes
    note.status = "APPROVED"
    note.approved_by = body.approved_by or "doctor"
    note.approved_ts = datetime.now(timezone.utc)
    audit(db, actor_id=note.approved_by, actor_role="DOCTOR", action="NOTE_APPROVED",
          entity_type="clinical_note", entity_id=note.note_id,
          metadata={"had_ai_draft": bool(note.ai_draft)})
    db.commit()
    bus.publish(Topics.NOTE_APPROVED, {"encounter_id": note.encounter_id, "note_id": note.note_id})
    return {"note_id": note.note_id, "status": note.status, "approved_ts": note.approved_ts.isoformat()}


@router.get("/encounters/{encounter_id}/notes")
def list_notes(encounter_id: str, db: Session = Depends(get_db)) -> list[dict]:
    notes = db.scalars(select(models.ClinicalNote).where(models.ClinicalNote.encounter_id == encounter_id)
                       .order_by(models.ClinicalNote.created_ts.desc())).all()
    return [{"note_id": n.note_id, "status": n.status, "text": n.final_text,
             "icd10": n.icd10_codes, "approved_by": n.approved_by} for n in notes]


# --------------------------------------------------------------------------------- Lab orders (CPOE)
@router.post("/lab-orders")
def create_lab_orders(body: LabOrderRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _encounter(db, body.encounter_id)
    invoice = services.get_or_create_invoice(db, encounter)

    # Duplicate / appropriateness check (Lab Intelligence agent pre-order guard)
    existing = {o.test_name for o in db.scalars(
        select(models.LabOrder).where(models.LabOrder.encounter_id == body.encounter_id))}
    duplicates = [t for t in body.tests if t in existing]

    created = []
    for test in body.tests:
        if test in existing:
            continue
        cat = services.catalog_for(test)
        order = models.LabOrder(
            encounter_id=body.encounter_id, patient_id=encounter.patient_id,
            test_code=cat["code"], test_name=test, panel=test, priority=body.priority,
            status="CREATED", ordered_by=body.ordered_by or "doctor",
            qr_code=f"LAB-{secrets.token_hex(4).upper()}", price=cat["price"],
        )
        db.add(order)
        db.flush()
        services.add_line(db, invoice, category="LAB", description=f"Lab: {test}", amount=cat["price"])
        created.append(order)

    audit(db, actor_id=body.ordered_by or "doctor", actor_role="DOCTOR", action="LABORDER_CREATED",
          entity_type="encounter", entity_id=body.encounter_id, metadata={"tests": body.tests})
    db.commit()
    for o in created:
        bus.publish(Topics.LABORDER_CREATED, {"lab_order_id": o.lab_order_id, "test": o.test_name,
                                              "encounter_id": body.encounter_id})

    return {
        "orders": [{"lab_order_id": o.lab_order_id, "test": o.test_name, "qr_code": o.qr_code,
                    "price": o.price, "status": o.status} for o in created],
        "duplicate_warning": duplicates or None,
        "invoice_id": invoice.invoice_id,
    }


@router.post("/lab-orders/{lab_order_id}/publish-result")
def publish_result(lab_order_id: str, db: Session = Depends(get_db)) -> dict:
    order = db.get(models.LabOrder, lab_order_id)
    if not order:
        raise HTTPException(404, "Lab order not found")
    cat = services.catalog_for(order.test_name or "")
    results_payload = []
    for analyte, unit, low, high, demo in cat["analytes"]:
        res = models.LabResult(
            lab_order_id=lab_order_id, test_code=cat["code"], analyte=analyte,
            value=demo, unit=unit, reference_low=low, reference_high=high, status="FINAL",
        )
        db.add(res)
        results_payload.append({"analyte": analyte, "value": demo, "unit": unit,
                                "reference_low": low, "reference_high": high})
    order.status = "RESULTED"

    ai = agents.lab_intelligence_agent(results_payload)
    # persist computed flags back
    for res_row, structured in zip(
        db.scalars(select(models.LabResult).where(models.LabResult.lab_order_id == lab_order_id)),
        ai["result"]["structured"],
    ):
        res_row.abnormal_flag = structured["abnormal_flag"]

    db.commit()
    bus.publish(Topics.LABRESULT_PUBLISHED, {"lab_order_id": lab_order_id, "test": order.test_name,
                                             "encounter_id": order.encounter_id})
    if ai["result"]["abnormal"]:
        bus.publish(Topics.RESULT_ABNORMAL, {"lab_order_id": lab_order_id, "test": order.test_name,
                                             "encounter_id": order.encounter_id,
                                             "count": len(ai["result"]["abnormal"])})
    return {"lab_order_id": lab_order_id, "test": order.test_name, **ai}


@router.get("/encounters/{encounter_id}/lab")
def encounter_lab(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    orders = db.scalars(select(models.LabOrder).where(models.LabOrder.encounter_id == encounter_id)).all()
    out = []
    for o in orders:
        results = db.scalars(select(models.LabResult).where(models.LabResult.lab_order_id == o.lab_order_id)).all()
        out.append({
            "lab_order_id": o.lab_order_id, "test": o.test_name, "status": o.status, "qr_code": o.qr_code,
            "results": [{"analyte": r.analyte, "value": r.value, "unit": r.unit, "flag": r.abnormal_flag,
                         "reference_low": r.reference_low, "reference_high": r.reference_high} for r in results],
        })
    return {"orders": out}


# --------------------------------------------------------------------------------- Prescription & CDS
def _stock_index(db: Session) -> dict[str, dict]:
    idx: dict[str, dict] = {}
    for s in db.scalars(select(models.PharmacyStock)):
        idx[s.drug_name.lower()] = {
            "available": s.quantity_available - s.quantity_reserved,
            "formulary": s.formulary, "salt": s.salt, "display": s.drug_name,
            "unit_price": s.unit_price,
        }
    return idx


@router.post("/prescriptions")
def create_prescription(body: PrescriptionCreateRequest, db: Session = Depends(get_db)) -> dict:
    encounter = _encounter(db, body.encounter_id)
    patient = db.get(models.Patient, encounter.patient_id)
    allergies = [{"substance": a.substance, "drug_class": a.drug_class} for a in patient.allergies]
    proposed = [i.model_dump() for i in body.items]
    stock_index = _stock_index(db)

    cds = agents.rx_cds_agent(allergies, body.current_meds, proposed, stock_index)

    rx = models.Prescription(encounter_id=body.encounter_id, patient_id=encounter.patient_id,
                             status="DRAFT", prescribed_by=body.prescribed_by or "doctor")
    db.add(rx)
    db.flush()
    for item in body.items:
        db.add(models.PrescriptionItem(
            rx_id=rx.rx_id, drug_name=item.drug_name, dose=item.dose, route=item.route,
            frequency=item.frequency, duration_days=item.duration_days, quantity=item.quantity or 1,
        ))
    db.commit()
    return {"rx_id": rx.rx_id, "status": rx.status, **cds}


@router.post("/prescriptions/{rx_id}/approve")
def approve_prescription(rx_id: str, body: ApproveRxRequest, db: Session = Depends(get_db)) -> dict:
    rx = db.get(models.Prescription, rx_id)
    if not rx:
        raise HTTPException(404, "Prescription not found")
    encounter = _encounter(db, rx.encounter_id)
    patient = db.get(models.Patient, rx.patient_id)
    allergies = [{"substance": a.substance, "drug_class": a.drug_class} for a in patient.allergies]
    stock_index = _stock_index(db)

    items = db.scalars(select(models.PrescriptionItem).where(models.PrescriptionItem.rx_id == rx_id)).all()

    # Optionally auto-substitute blocked / out-of-stock items with a safe suggestion
    if body.accept_substitutions:
        pre = agents.rx_cds_agent(allergies, [], [{"drug_name": i.drug_name} for i in items], stock_index)
        sugg = {s["for"]: s["suggestion"] for s in pre["result"]["suggestions"]}
        for i in items:
            if i.drug_name in sugg:
                i.substituted_from = i.drug_name
                i.drug_name = sugg[i.drug_name]

    # Re-run CDS as the safety gate — allergy conflicts BLOCK approval
    cds = agents.rx_cds_agent(allergies, [], [{"drug_name": i.drug_name} for i in items], stock_index)
    if cds["result"]["block"]:
        raise HTTPException(status_code=409, detail={"message": "Prescription blocked by CDS — resolve conflicts.",
                                                     "cds": cds})

    invoice = services.get_or_create_invoice(db, encounter)
    for i in items:
        rec = stock_index.get(i.drug_name.lower())
        if rec and rec["available"] > 0:
            stock = db.scalar(select(models.PharmacyStock).where(func.lower(models.PharmacyStock.drug_name) == i.drug_name.lower()))
            if stock:
                stock.quantity_reserved += (i.quantity or 1)
                price = (rec.get("unit_price") or 20.0) * (i.quantity or 1)
                services.add_line(db, invoice, category="PHARMACY", description=f"Rx: {i.drug_name}", amount=round(price, 2))

    rx.status = "APPROVED"
    rx.approved_ts = datetime.now(timezone.utc)
    rx.prescribed_by = body.approved_by or rx.prescribed_by
    audit(db, actor_id=rx.prescribed_by, actor_role="DOCTOR", action="PRESCRIPTION_APPROVED",
          entity_type="prescription", entity_id=rx.rx_id, metadata={"items": len(items)})
    db.commit()
    bus.publish(Topics.PRESCRIPTION_APPROVED, {"rx_id": rx.rx_id, "encounter_id": rx.encounter_id})
    return {
        "rx_id": rx.rx_id, "status": rx.status,
        "items": [{"drug_name": i.drug_name, "dose": i.dose, "frequency": i.frequency,
                   "substituted_from": i.substituted_from} for i in items],
        "cds": cds,
    }


@router.get("/pharmacy/stock")
def pharmacy_stock(drug: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    stmt = select(models.PharmacyStock)
    if drug:
        stmt = stmt.where(func.lower(models.PharmacyStock.drug_name).like(f"%{drug.lower()}%"))
    rows = db.scalars(stmt.limit(50)).all()
    return [{"drug_name": s.drug_name, "salt": s.salt, "drug_class": s.drug_class,
             "available": s.quantity_available - s.quantity_reserved, "unit_price": s.unit_price,
             "formulary": s.formulary, "expiry": s.expiry_date.isoformat() if s.expiry_date else None}
            for s in rows]
