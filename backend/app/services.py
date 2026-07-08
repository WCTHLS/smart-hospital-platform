"""Shared domain services used across modules (billing helpers, lab catalog)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models

CONSULT_FEE = 500.0
GST_RATE = 0.0  # healthcare services are largely GST-exempt in India; kept explicit


def get_or_create_invoice(db: Session, encounter: models.Encounter) -> models.Invoice:
    inv = db.scalar(select(models.Invoice).where(models.Invoice.encounter_id == encounter.encounter_id))
    if inv:
        return inv
    inv = models.Invoice(
        encounter_id=encounter.encounter_id, patient_id=encounter.patient_id,
        consultation_amt=CONSULT_FEE, status="OPEN",
    )
    db.add(inv)
    db.flush()
    db.add(models.InvoiceLine(invoice_id=inv.invoice_id, category="CONSULT",
                              description="OPD consultation", amount=CONSULT_FEE))
    recalc_invoice(db, inv)
    return inv


def add_line(db: Session, invoice: models.Invoice, *, category: str, description: str,
             amount: float, quantity: int = 1) -> None:
    db.add(models.InvoiceLine(invoice_id=invoice.invoice_id, category=category,
                              description=description, amount=amount, quantity=quantity))
    db.flush()
    recalc_invoice(db, invoice)


def recalc_invoice(db: Session, invoice: models.Invoice) -> None:
    lines = db.scalars(select(models.InvoiceLine).where(models.InvoiceLine.invoice_id == invoice.invoice_id)).all()
    invoice.consultation_amt = sum(l.amount for l in lines if l.category == "CONSULT")
    invoice.lab_amt = sum(l.amount for l in lines if l.category == "LAB")
    invoice.pharmacy_amt = sum(l.amount for l in lines if l.category == "PHARMACY")
    gross = sum(l.amount for l in lines)
    invoice.tax = round(gross * GST_RATE, 2)
    invoice.total = round(gross + invoice.tax - invoice.package_adj - invoice.insurance_adj, 2)
    paid = sum(p.amount for p in invoice.payments if p.status == "COMPLETED")
    invoice.balance = round(invoice.total - paid, 2)
    db.flush()


# Illustrative lab catalog: test -> price + analytes (analyte, unit, ref_low, ref_high, demo_value)
LAB_CATALOG: dict[str, dict] = {
    "CBC": {"code": "58410-2", "price": 350.0, "analytes": [
        ("WBC", "x10⁹/L", 4.0, 11.0, 13.8),
        ("Hb", "g/dL", 12.0, 16.0, 12.6),
        ("Platelets", "x10⁹/L", 150.0, 410.0, 240.0),
    ]},
    "CRP": {"code": "1988-5", "price": 450.0, "analytes": [("CRP", "mg/L", 0.0, 5.0, 48.0)]},
    "HbA1c": {"code": "4548-4", "price": 500.0, "analytes": [("HbA1c", "%", 4.0, 5.7, 7.1)]},
    "Lipid Profile": {"code": "57698-3", "price": 700.0, "analytes": [
        ("Total Cholesterol", "mg/dL", 0.0, 200.0, 212.0),
        ("LDL", "mg/dL", 0.0, 100.0, 138.0),
        ("HDL", "mg/dL", 40.0, 60.0, 44.0),
    ]},
    "TSH": {"code": "3016-3", "price": 400.0, "analytes": [("TSH", "µIU/mL", 0.4, 4.0, 3.1)]},
    "RFT": {"code": "24362-6", "price": 600.0, "analytes": [
        ("Urea", "mg/dL", 15.0, 40.0, 32.0),
        ("Creatinine", "mg/dL", 0.6, 1.3, 1.1),
    ]},
    "Chest X-ray": {"code": "36643-5", "price": 800.0, "analytes": []},  # imaging
}


def catalog_for(test_name: str) -> dict:
    return LAB_CATALOG.get(test_name, {"code": "UNKNOWN", "price": 400.0, "analytes": []})
