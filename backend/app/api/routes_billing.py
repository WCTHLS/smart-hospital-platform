"""Billing module — Billing & Payments, Insurance/TPA, Discharge (with compliance gate)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, services
from app.ai import agents
from app.core.database import get_db
from app.core.events import Topics, bus
from app.core.security import audit
from app.schemas import ClaimRequest, PayRequest

router = APIRouter(prefix="/api/v1", tags=["billing"])


def _invoice_dict(inv: models.Invoice) -> dict:
    return {
        "invoice_id": inv.invoice_id, "status": inv.status,
        "consultation_amt": inv.consultation_amt, "lab_amt": inv.lab_amt,
        "pharmacy_amt": inv.pharmacy_amt, "insurance_adj": inv.insurance_adj,
        "package_adj": inv.package_adj, "tax": inv.tax, "total": inv.total, "balance": inv.balance,
        "lines": [{"category": l.category, "description": l.description, "amount": l.amount,
                   "quantity": l.quantity} for l in inv.lines],
    }


@router.get("/encounters/{encounter_id}/invoice")
def get_invoice(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter:
        raise HTTPException(404, "Encounter not found")
    inv = services.get_or_create_invoice(db, encounter)
    db.commit()
    return _invoice_dict(inv)


@router.post("/invoices/{invoice_id}/pay")
def pay_invoice(invoice_id: str, body: PayRequest, db: Session = Depends(get_db)) -> dict:
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    amount = body.amount if body.amount is not None else inv.balance
    payment = models.Payment(invoice_id=invoice_id, method=body.method, amount=amount,
                             reference=body.reference or f"{body.method}-{datetime.now().strftime('%H%M%S')}",
                             status="COMPLETED")
    db.add(payment)
    db.flush()
    services.recalc_invoice(db, inv)
    if inv.balance <= 0.01:
        inv.status = "PAID"
    audit(db, actor_id=inv.patient_id, actor_role="PATIENT", action="PAYMENT_COMPLETED",
          entity_type="invoice", entity_id=invoice_id, metadata={"method": body.method, "amount": amount})
    db.commit()
    bus.publish(Topics.INVOICE_GENERATED, {"invoice_id": invoice_id, "total": inv.total,
                                           "encounter_id": inv.encounter_id})
    bus.publish(Topics.PAYMENT_COMPLETED, {"invoice_id": invoice_id, "amount": amount, "method": body.method,
                                           "encounter_id": inv.encounter_id})
    return {"payment_id": payment.payment_id, **_invoice_dict(inv)}


@router.post("/invoices/{invoice_id}/claim")
def start_claim(invoice_id: str, body: ClaimRequest, db: Session = Depends(get_db)) -> dict:
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    covered = round(inv.total * 0.8, 2)
    claim = models.InsuranceClaim(
        invoice_id=invoice_id, patient_id=inv.patient_id, payer=body.payer, tpa=body.tpa,
        policy_no=body.policy_no, claim_type=body.claim_type,
        preauth_no=f"PA-{datetime.now().strftime('%y%m%d%H%M')}", claim_amount=covered, status="INITIATED",
    )
    db.add(claim)
    inv.insurance_adj = covered
    services.recalc_invoice(db, inv)
    audit(db, actor_id="billing", actor_role="OPS", action="CLAIM_INITIATED",
          entity_type="insurance_claim", entity_id=claim.claim_id, metadata={"payer": body.payer, "amount": covered})
    db.commit()
    bus.publish(Topics.CLAIM_INITIATED, {"claim_id": claim.claim_id, "payer": body.payer, "amount": covered,
                                         "encounter_id": inv.encounter_id})
    return {"claim_id": claim.claim_id, "preauth_no": claim.preauth_no, "covered": covered,
            "invoice": _invoice_dict(inv)}


@router.put("/encounters/{encounter_id}/discharge")
def discharge(encounter_id: str, db: Session = Depends(get_db)) -> dict:
    encounter = db.get(models.Encounter, encounter_id)
    if not encounter:
        raise HTTPException(404, "Encounter not found")

    notes = db.scalars(select(models.ClinicalNote).where(models.ClinicalNote.encounter_id == encounter_id)).all()
    approved_note = next((n for n in notes if n.status == "APPROVED"), None)
    vitals = db.scalar(select(models.Vitals).where(models.Vitals.encounter_id == encounter_id))
    consent = db.scalar(select(models.ConsentArtifact).where(models.ConsentArtifact.patient_id == encounter.patient_id)
                        .where(models.ConsentArtifact.status == "GRANTED"))
    rx = db.scalar(select(models.Prescription).where(models.Prescription.encounter_id == encounter_id)
                   .order_by(models.Prescription.created_ts.desc()))

    bundle = {
        "has_consent": consent is not None,
        "has_vitals": vitals is not None,
        "note_approved": approved_note is not None,
        "has_diagnosis": bool(approved_note and approved_note.icd10_codes),
        "has_prescription": rx is not None,
        "rx_approved": bool(rx and rx.status == "APPROVED"),
    }
    compliance = agents.compliance_agent(bundle)
    if compliance["result"]["gaps"]:
        bus.publish(Topics.COMPLIANCE_FLAGGED, {"encounter_id": encounter_id,
                                                "gaps": len(compliance["result"]["gaps"])})

    encounter.status = "DISCHARGED"
    encounter.end_ts = datetime.now(timezone.utc)
    encounter.disposition = "Discharged — follow up in 48h"
    doc = models.Document(patient_id=encounter.patient_id, encounter_id=encounter_id,
                          doc_type="DISCHARGE", title="Discharge summary",
                          uri=f"phr://abdm/{encounter.patient_id}/discharge/{encounter_id}")
    db.add(doc)
    # close any waiting token
    for tk in db.scalars(select(models.Token).where(models.Token.encounter_id == encounter_id)):
        tk.status = "DONE"

    audit(db, actor_id="system", actor_role="SYSTEM", action="VISIT_DISCHARGED",
          entity_type="encounter", entity_id=encounter_id,
          metadata={"compliance_complete": compliance["result"]["complete"]})
    db.commit()
    bus.publish(Topics.VISIT_DISCHARGED, {"encounter_id": encounter_id})

    invoice = db.scalar(select(models.Invoice).where(models.Invoice.encounter_id == encounter_id))
    return {
        "encounter_id": encounter_id, "status": encounter.status,
        "discharge_summary": {
            "diagnosis": (approved_note.icd10_codes if approved_note else []),
            "note": approved_note.final_text if approved_note else None,
            "medications": [f"{i.drug_name} {i.dose or ''} {i.frequency or ''}".strip()
                            for i in (rx.items if rx else [])],
            "follow_up": "Review in 48 hours or earlier if symptoms worsen.",
            "phr_uri": doc.uri,
        },
        "compliance": compliance,
        "invoice": None if not invoice else _invoice_dict(invoice),
    }
