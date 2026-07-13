"""Seed the database with demo staff, pharmacy stock and patients.

Run once:  python -m app.seed
Idempotent: exits early if patients already exist (pass --force to reseed a fresh DB file).
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app import models
from app.core.database import SessionLocal, init_db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_doctor_schedules(db) -> None:
    if db.scalar(select(models.DoctorSchedule).limit(1)):
        return
    doctors = db.scalars(select(models.Staff).where(models.Staff.role == "DOCTOR")).all()
    for index, doctor in enumerate(doctors):
        for day in range(0, 6):
            db.add(models.DoctorSchedule(
                doctor_id=doctor.staff_id,
                day_of_week=day,
                start_time="09:00",
                end_time="13:00",
                slot_duration_minutes=15,
                department=doctor.department,
                location="OPD Block",
                room=f"Room {index + 1}",
                active=True,
            ))


def _add_encounter_with_appointment(
    db,
    *,
    patient: models.Patient,
    doctor: models.Staff,
    reason: str,
    appointment_status: str,
    **encounter_values,
) -> models.Encounter:
    """Seed both sides of the encounter/appointment link introduced in the journey flow."""
    scheduled_start = encounter_values.get("arrival_ts") or _utcnow()
    appointment = models.Appointment(
        patient_id=patient.patient_id,
        doctor_id=doctor.staff_id,
        department=encounter_values.get("department") or doctor.department,
        specialty=encounter_values.get("department") or doctor.specialty,
        reason=reason,
        appointment_type=encounter_values.get("visit_type", "OPD"),
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_start + timedelta(minutes=15),
        status=appointment_status,
        channel=encounter_values.get("channel"),
    )
    db.add(appointment)
    db.flush()
    encounter = models.Encounter(
        patient_id=patient.patient_id,
        appointment_id=appointment.appointment_id,
        doctor_id=doctor.staff_id,
        **encounter_values,
    )
    db.add(encounter)
    db.flush()
    appointment.encounter_id = encounter.encounter_id
    return encounter


def seed() -> None:
    if "--force" in sys.argv:
        from app.core.database import engine, Base
        import app.models  # Ensure all models are registered
        Base.metadata.drop_all(bind=engine)
        print("Dropped all tables for clean reseed.")
    init_db()
    db = SessionLocal()
    try:
        if db.scalar(select(models.Patient).limit(1)) and "--force" not in sys.argv:
            _ensure_doctor_schedules(db)
            db.commit()
            print("Database already seeded. Use --force on a fresh DB to reseed.")
            return

        # ---------------------------------------------------------------- Staff (doctors)
        # At least 2 doctors per specialty so the appointment-slot picker on the
        # check-in flow always has a real choice of doctor/time to show.
        doctors = [
            ("Dr. Ananya Mehta", "General Medicine"),
            ("Dr. Rohan Verma", "General Medicine"),
            ("Dr. Vikram Rao", "Cardiology"),
            ("Dr. Kavita Joshi", "Cardiology"),
            ("Dr. Priya Iyer", "Pulmonology"),
            ("Dr. Sanjay Gupta", "Pulmonology"),
            ("Dr. Sameer Kapoor", "Paediatrics"),
            ("Dr. Ritu Malhotra", "Paediatrics"),
            ("Dr. Neha Nair", "Orthopaedics"),
            ("Dr. Arvind Menon", "Orthopaedics"),
            ("Dr. Arjun Shah", "Dermatology"),
            ("Dr. Divya Reddy", "Dermatology"),
        ]
        doctor_by_name: dict[str, models.Staff] = {}
        for i, (name, spec) in enumerate(doctors):
            staff = models.Staff(
                hpr_id=f"HPR-{1000 + i}",
                name=name,
                role="DOCTOR",
                department=spec,
                specialty=spec,
                available=True,
                experience_years=6 + (i % 6) * 3,
                room=f"Room {101 + i}",
                floor=f"Floor {1 + (i // 4)}",
                access_pin="1234",
                opd_fee=400.0 + (i % 6) * 100.0,
            )
            db.add(staff)
            doctor_by_name[name] = staff

        db.add(models.Staff(
            hpr_id="HPR-2001",
            name="Priya Sharma",
            role="NURSE",
            department="Triage",
            specialty="Triage Nursing",
            available=True,
            experience_years=6,
            room="Triage Room 1",
            floor="Ground Floor",
            access_pin="1234",
            opd_fee=0.0,
        ))

        # ---------------------------------------------------------------- Pharmacy stock
        stock = [
            # name, salt, class, available, price, formulary
            ("Azithromycin 500mg", "Azithromycin", "macrolide", 120, 18.0, True),
            ("Amoxicillin 500mg", "Amoxicillin", "penicillin", 80, 12.0, True),
            ("Cefixime 200mg", "Cefixime", "cephalosporin", 90, 15.0, True),
            ("Paracetamol 650mg", "Paracetamol", "analgesic", 500, 2.0, True),
            ("Ibuprofen 400mg", "Ibuprofen", "nsaid", 300, 3.0, True),
            ("Amlodipine 5mg", "Amlodipine", "ccb", 200, 3.0, True),
            ("Metformin 500mg", "Metformin", "biguanide", 300, 2.0, True),
            ("Pantoprazole 40mg", "Pantoprazole", "ppi", 150, 4.0, True),
            ("Cetirizine 10mg", "Cetirizine", "antihistamine", 150, 5.0, True),
            ("Dextromethorphan Syrup X", "Dextromethorphan", "antitussive", 0, 60.0, True),
            ("Dextromethorphan Syrup Y", "Dextromethorphan", "antitussive", 60, 55.0, True),
            ("Insulin Glargine", "Insulin Glargine", "insulin", 8, 320.0, True),
        ]
        for name, salt, cls, qty, price, form in stock:
            db.add(models.PharmacyStock(
                drug_name=name, salt=salt, drug_class=cls, quantity_available=qty,
                unit_price=price, formulary=form, batch="B-2026-01",
                expiry_date=date(2027, 12, 31), location="Pharmacy 1",
            ))

        db.flush()  # staff_id / stock_id now available for foreign keys below

        # ---------------------------------------------------------------- Hero patient (matches mockups)
        rimjhim = models.Patient(
            first_name="Rimjhim", last_name="Sharma", dob=date(1992, 4, 18), gender="Female",
            abha_number="91-2345-6789-0123", abha_address="rimjhim.sharma@abdm", mrn="MRN-100234",
            empi_id="EMPI-100234", mobile="9876500011", blood_group="O+",
            address="12 MG Road, Pune, Maharashtra",
        )
        db.add(rimjhim)
        db.flush()
        db.add(models.Allergy(patient_id=rimjhim.patient_id, substance="Penicillin",
                              drug_class="penicillin", severity="SEVERE", reaction="Urticaria, angioedema"))

        # Active consent so Patient 360 works immediately in the demo
        now = _utcnow()
        consent = models.ConsentArtifact(patient_id=rimjhim.patient_id, purpose="CARE_MGMT",
                                      hip_id="aarogya-hip", hiu_id="aarogya-hiu", status="GRANTED",
                                      valid_from=now, valid_to=now + timedelta(days=1))
        db.add(consent)

        # Past encounter with approved note + labs + active meds (history for Patient 360)
        past = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Ananya Mehta"],
            reason="Routine diabetes review", appointment_status="COMPLETED",
            visit_type="OPD", department="Endocrinology", channel="APP", status="DISCHARGED",
            arrival_ts=now - timedelta(days=60), end_ts=now - timedelta(days=60),
        )
        db.add(models.Vitals(encounter_id=past.encounter_id, bp_systolic=130, bp_diastolic=84, spo2=98, heart_rate=78, temperature=98.6, bmi=24.2, captured_ts=now - timedelta(days=60)))
        note = models.ClinicalNote(
            encounter_id=past.encounter_id, note_type="SOAP",
            ai_draft="S: Routine diabetes review...", final_text="S: Routine diabetes review. O: Stable. "
            "A: T2DM (E11.9), HTN (I10). P: Continue Metformin + Amlodipine; recheck HbA1c in 3 months.",
            icd10_codes=[{"code": "E11.9", "label": "Type 2 diabetes mellitus"},
                         {"code": "I10", "label": "Essential hypertension"}],
            status="APPROVED", authored_by="ambient-agent", approved_by="Dr. Ananya Mehta",
            approved_ts=now - timedelta(days=60),
        )
        db.add(note)
        rx = models.Prescription(encounter_id=past.encounter_id, patient_id=rimjhim.patient_id,
                                 status="APPROVED", prescribed_by="Dr. Ananya Mehta",
                                 approved_ts=now - timedelta(days=60), created_ts=now - timedelta(days=60))
        db.add(rx)
        db.flush()
        db.add(models.PrescriptionItem(rx_id=rx.rx_id, drug_name="Metformin 500mg", dose="500 mg",
                                       route="PO", frequency="1-0-1", duration_days=90, quantity=180))
        db.add(models.PrescriptionItem(rx_id=rx.rx_id, drug_name="Amlodipine 5mg", dose="5 mg",
                                       route="PO", frequency="1-0-0", duration_days=90, quantity=90))
        past_order = models.LabOrder(encounter_id=past.encounter_id, patient_id=rimjhim.patient_id,
                                     test_code="4548-4", test_name="HbA1c", panel="HbA1c",
                                     status="RESULTED", qr_code="LAB-SEED0001", price=500.0,
                                     ordered_ts=now - timedelta(days=60))
        db.add(past_order)
        db.flush()
        db.add(models.LabResult(lab_order_id=past_order.lab_order_id, test_code="4548-4", analyte="HbA1c",
                                value=7.1, unit="%", reference_low=4.0, reference_high=5.7,
                                abnormal_flag="H", resulted_ts=now - timedelta(days=60)))

        # Past Encounter 2 (30 days ago) - Cardiology for Palpitations & Lipid Profile
        past2 = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Vikram Rao"],
            reason="Palpitations and lipid profile", appointment_status="COMPLETED",
            visit_type="OPD", department="Cardiology", channel="APP", status="DISCHARGED",
            arrival_ts=now - timedelta(days=30), end_ts=now - timedelta(days=30),
        )
        db.add(models.Vitals(encounter_id=past2.encounter_id, bp_systolic=132, bp_diastolic=82, spo2=97, heart_rate=92, temperature=98.8, bmi=24.5, captured_ts=now - timedelta(days=30)))
        note2 = models.ClinicalNote(
            encounter_id=past2.encounter_id, note_type="SOAP",
            ai_draft="S: Palpitations for 2 weeks...", final_text="S: Patient reports mild palpitations and occasional shortness of breath. O: Heart rate 92 bpm, BP 132/82. Lungs clear. A: Mild sinus tachycardia, borderline hyperlipidemia. P: Prescribe exercise regimen and check lipid profile. Continue amlodipine.",
            icd10_codes=[{"code": "R00.2", "label": "Palpitations"},
                         {"code": "E78.5", "label": "Hyperlipidemia, unspecified"}],
            status="APPROVED", authored_by="ambient-agent", approved_by="Dr. Vikram Rao",
            approved_ts=now - timedelta(days=30),
        )
        db.add(note2)
        rx2 = models.Prescription(encounter_id=past2.encounter_id, patient_id=rimjhim.patient_id,
                                  status="APPROVED", prescribed_by="Dr. Vikram Rao",
                                  approved_ts=now - timedelta(days=30), created_ts=now - timedelta(days=30))
        db.add(rx2)
        db.flush()
        db.add(models.PrescriptionItem(rx_id=rx2.rx_id, drug_name="Amlodipine 5mg", dose="5 mg",
                                       route="PO", frequency="1-0-0", duration_days=30, quantity=30))
        past2_order = models.LabOrder(encounter_id=past2.encounter_id, patient_id=rimjhim.patient_id,
                                      test_code="9606-2", test_name="Lipid Profile", panel="Lipid Profile",
                                      status="RESULTED", qr_code="LAB-SEED0002", price=600.0,
                                      ordered_ts=now - timedelta(days=30))
        db.add(past2_order)
        db.flush()
        db.add(models.LabResult(lab_order_id=past2_order.lab_order_id, test_code="9606-2", analyte="Cholesterol",
                                value=210.0, unit="mg/dL", reference_low=100.0, reference_high=200.0,
                                abnormal_flag="H", resulted_ts=now - timedelta(days=30)))
        db.add(models.LabResult(lab_order_id=past2_order.lab_order_id, test_code="9606-2", analyte="LDL",
                                value=135.0, unit="mg/dL", reference_low=0.0, reference_high=100.0,
                                abnormal_flag="H", resulted_ts=now - timedelta(days=30)))

        # Past Encounter 3 (15 days ago) - Dermatology for Rash
        past3 = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Arjun Shah"],
            reason="Itchy rash on arms", appointment_status="COMPLETED",
            visit_type="OPD", department="Dermatology", channel="WALKIN", status="DISCHARGED",
            arrival_ts=now - timedelta(days=15), end_ts=now - timedelta(days=15),
        )
        db.add(models.Vitals(encounter_id=past3.encounter_id, bp_systolic=120, bp_diastolic=80, spo2=99, heart_rate=72, temperature=98.4, bmi=24.4, captured_ts=now - timedelta(days=15)))
        note3 = models.ClinicalNote(
            encounter_id=past3.encounter_id, note_type="SOAP",
            ai_draft="S: Contact dermatitis...", final_text="S: Patient reports intensely itchy red rash on arms for 3 days after contact with cleaning agent. O: Erythematous rash with excoriations on bilateral forearms. A: Contact dermatitis (L23.9). P: Avoid strong detergents, take anti-histamines. Apply soothing lotion.",
            icd10_codes=[{"code": "L23.9", "label": "Allergic contact dermatitis"}],
            status="APPROVED", authored_by="ambient-agent", approved_by="Dr. Arjun Shah",
            approved_ts=now - timedelta(days=15),
        )
        db.add(note3)
        rx3 = models.Prescription(encounter_id=past3.encounter_id, patient_id=rimjhim.patient_id,
                                  status="APPROVED", prescribed_by="Dr. Arjun Shah",
                                  approved_ts=now - timedelta(days=15), created_ts=now - timedelta(days=15))
        db.add(rx3)
        db.flush()
        db.add(models.PrescriptionItem(rx_id=rx3.rx_id, drug_name="Cetirizine 10mg", dose="10 mg",
                                       route="PO", frequency="0-0-1", duration_days=10, quantity=10))

        # Past Encounter 4 (10 days ago) - Gastroenterology for Gastritis
        past4 = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Ananya Mehta"],
            reason="Acute gastritis", appointment_status="COMPLETED",
            visit_type="OPD", department="Gastroenterology", channel="WALKIN", status="DISCHARGED",
            arrival_ts=now - timedelta(days=10), end_ts=now - timedelta(days=10),
        )
        db.add(models.Vitals(encounter_id=past4.encounter_id, bp_systolic=118, bp_diastolic=78, spo2=98, heart_rate=80, temperature=99.1, bmi=24.1, captured_ts=now - timedelta(days=10)))
        note4 = models.ClinicalNote(
            encounter_id=past4.encounter_id, note_type="SOAP",
            ai_draft="S: Epigastric burning...", final_text="S: Patient reports burning upper abdominal pain for 4 days, worse after spicy food. O: Epigastric tenderness on palpation. Bowel sounds normal. A: Acute gastritis (K29.7). P: Avoid spicy/fatty foods, prescribe Pantoprazole.",
            icd10_codes=[{"code": "K29.7", "label": "Gastritis, unspecified"}],
            status="APPROVED", authored_by="ambient-agent", approved_by="Dr. Ananya Mehta",
            approved_ts=now - timedelta(days=10),
        )
        db.add(note4)
        rx4 = models.Prescription(encounter_id=past4.encounter_id, patient_id=rimjhim.patient_id,
                                  status="APPROVED", prescribed_by="Dr. Ananya Mehta",
                                  approved_ts=now - timedelta(days=10), created_ts=now - timedelta(days=10))
        db.add(rx4)
        db.flush()
        db.add(models.PrescriptionItem(rx_id=rx4.rx_id, drug_name="Pantoprazole 40mg", dose="40 mg",
                                       route="PO", frequency="1-0-0", duration_days=14, quantity=14))

        # Document produced from encounter 4 (discharge summary) - exercises the Documents table.
        db.add(models.Document(
            patient_id=rimjhim.patient_id, encounter_id=past4.encounter_id, doc_type="DISCHARGE_SUMMARY",
            title="Gastritis - discharge summary", uri=None, created_ts=now - timedelta(days=10),
        ))

        # Past Encounter 5 (5 days ago) - Pulmonology for Asthma
        past5 = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Priya Iyer"],
            reason="Cough and wheezing", appointment_status="COMPLETED",
            visit_type="OPD", department="Pulmonology", channel="APP", status="DISCHARGED",
            arrival_ts=now - timedelta(days=5), end_ts=now - timedelta(days=5),
        )
        db.add(models.Vitals(encounter_id=past5.encounter_id, bp_systolic=122, bp_diastolic=80, spo2=96, heart_rate=84, temperature=98.7, bmi=24.3, captured_ts=now - timedelta(days=5)))
        note5 = models.ClinicalNote(
            encounter_id=past5.encounter_id, note_type="SOAP",
            ai_draft="S: Cough and wheezing...", final_text="S: Patient reports dry cough and occasional wheezing for 5 days, worse at night. O: Scattered bilateral wheeze on auscultation. SpO2 96%. A: Mild intermittent asthma (J45.20). P: Avoid triggers, stay hydrated, start bronchodilator if symptoms persist.",
            icd10_codes=[{"code": "J45.20", "label": "Mild intermittent asthma, uncomplicated"}],
            status="APPROVED", authored_by="ambient-agent", approved_by="Dr. Priya Iyer",
            approved_ts=now - timedelta(days=5),
        )
        db.add(note5)

        # ------------------------------------------------------------ Billing: Invoice, InvoiceLine, Payment
        # Fully settled invoice for the Pulmonology visit (past5): consult only, paid via UPI.
        invoice1 = models.Invoice(
            encounter_id=past5.encounter_id, patient_id=rimjhim.patient_id,
            consultation_amt=500.0, lab_amt=0.0, pharmacy_amt=0.0, package_adj=0.0,
            insurance_adj=0.0, tax=25.0, total=525.0, balance=0.0, status="PAID",
            created_ts=now - timedelta(days=5),
        )
        db.add(invoice1)
        db.flush()
        db.add(models.InvoiceLine(invoice_id=invoice1.invoice_id, category="CONSULT",
                                  description="Pulmonology consultation - Dr. Priya Iyer",
                                  quantity=1, amount=500.0))
        db.add(models.Payment(invoice_id=invoice1.invoice_id, method="UPI", amount=525.0,
                              reference="PAY-SEED0001", status="COMPLETED",
                              paid_ts=now - timedelta(days=5)))

        # Insurance-linked invoice for the Cardiology visit (past2): consult + lab, cashless claim pending.
        invoice2 = models.Invoice(
            encounter_id=past2.encounter_id, patient_id=rimjhim.patient_id,
            consultation_amt=600.0, lab_amt=600.0, pharmacy_amt=0.0, package_adj=0.0,
            insurance_adj=480.0, tax=36.0, total=756.0, balance=756.0, status="OPEN",
            created_ts=now - timedelta(days=30),
        )
        db.add(invoice2)
        db.flush()
        db.add(models.InvoiceLine(invoice_id=invoice2.invoice_id, category="CONSULT",
                                  description="Cardiology consultation - Dr. Vikram Rao",
                                  quantity=1, amount=600.0))
        db.add(models.InvoiceLine(invoice_id=invoice2.invoice_id, category="LAB",
                                  description="Lipid Profile", quantity=1, amount=600.0))
        db.add(models.InsuranceClaim(
            invoice_id=invoice2.invoice_id, patient_id=rimjhim.patient_id,
            payer="Star Health", tpa="MediAssist", policy_no="STAR-2024-88231",
            claim_type="CASHLESS", preauth_no="PA-99213", claim_amount=756.0,
            status="SUBMITTED", submitted_ts=now - timedelta(days=29),
        ))

        # Today's unlinked booking is shown after profile confirmation and is
        # linked to a new encounter only when the patient taps Check in.
        appt_start = now.replace(hour=10, minute=0, second=0, microsecond=0)
        db.add(models.Appointment(
            patient_id=rimjhim.patient_id, doctor_id=doctor_by_name["Dr. Ananya Mehta"].staff_id,
            department="General Medicine", specialty="General Medicine",
            reason="Follow-up diabetes and hypertension review",
            appointment_type="OPD", scheduled_start=appt_start, scheduled_end=appt_start + timedelta(minutes=15),
            status="BOOKED", channel="APP",
        ))

        # ------------------------------------------------------------ Audit trail (AuditLog table)
        db.add(models.AuditLog(actor_id="system", actor_role="SYSTEM", action="CONSENT_GRANTED",
                               entity_type="CONSENT_ARTIFACT", entity_id=consent.consent_id,
                               consent_id=consent.consent_id, ip_address="127.0.0.1",
                               audit_metadata={"purpose": "CARE_MGMT"}, event_ts=now))
        db.add(models.AuditLog(actor_id=doctor_by_name["Dr. Ananya Mehta"].staff_id, actor_role="DOCTOR",
                               action="NOTE_APPROVED", entity_type="CLINICAL_NOTE", entity_id=note.note_id,
                               consent_id=consent.consent_id, ip_address="10.0.0.14",
                               audit_metadata={"encounter_id": past.encounter_id}, event_ts=now - timedelta(days=60)))

        # Seed active waiting encounter for Rimjhim Sharma (Token A-045, General Medicine)
        active_enc = _add_encounter_with_appointment(
            db, patient=rimjhim, doctor=doctor_by_name["Dr. Ananya Mehta"],
            reason="Follow-up diabetes and persistent fatigue", appointment_status="CHECKED_IN",
            visit_type="OPD", department="General Medicine", channel="WALKIN", status="TRIAGED",
            arrival_ts=now - timedelta(minutes=10),
        )
        db.add(models.Vitals(encounter_id=active_enc.encounter_id, bp_systolic=128, bp_diastolic=82, spo2=97, heart_rate=76, temperature=98.6, bmi=24.4, captured_ts=now - timedelta(minutes=10)))
        db.add(models.Triage(encounter_id=active_enc.encounter_id, chief_complaint="Follow-up diabetes and persistent fatigue",
                             acuity_level="3", specialty="General Medicine", red_flag=False))
        db.add(models.Token(encounter_id=active_enc.encounter_id, token_number="A-045",
                            department="General Medicine", room="Room 3", floor="Floor 2", eta_minutes=5, status="WAITING"))


        # ---------------------------------------------------------------- Live waiting patients (Command Center)
        waiting = [
            ("Aarav", "Patel", "Male", 41, "General Medicine", "Room 3", "Floor 2", "3", 12),
            ("Meera", "Nair", "Female", 6, "Paediatrics", "Room 2", "Floor 1", "3", 18),
            ("Vikram", "Singh", "Male", 58, "Cardiology", "Room 7", "Floor 3", "2", 8),
        ]
        for i, (fn, ln, g, age, dept, room, floor, acuity, eta) in enumerate(waiting):
            p = models.Patient(first_name=fn, last_name=ln, gender=g,
                               dob=date(2026 - age, 6, 1), mrn=f"MRN-2003{i}0", mobile=f"98765111{i}0")
            db.add(p)
            db.flush()
            seeded_doctor = next(doctor for doctor in doctor_by_name.values() if doctor.specialty == dept)
            enc = _add_encounter_with_appointment(
                db, patient=p, doctor=seeded_doctor, reason="See intake",
                appointment_status="CHECKED_IN", visit_type="OPD", department=dept,
                channel="WALKIN", status="TRIAGED",
            )
            db.add(models.Triage(encounter_id=enc.encounter_id, chief_complaint="See intake",
                                 acuity_level=acuity, specialty=dept, red_flag=(acuity == "2")))
            db.add(models.Token(encounter_id=enc.encounter_id, token_number=f"A-{100 + i:03d}",
                                department=dept, room=room, floor=floor, eta_minutes=eta, status="WAITING"))

        # Doctor availability (DoctorSchedule) for every seeded doctor, across specialties.
        _ensure_doctor_schedules(db)

        db.commit()

        specialties = sorted({spec for _, spec in doctors})
        print("Seed complete.")
        print(f"  Hero patient : Rimjhim Sharma  ·  patient_id={rimjhim.patient_id}")
        print(f"  ABHA         : 91-2345-6789-0123  (allergic to Penicillin)")
        print(f"  Doctors      : {len(doctors)} across {len(specialties)} specialties (>=2 each)   "
              f"Pharmacy items: {len(stock)}   Waiting patients: {len(waiting)}")
        print("  Try: POST /api/v1/checkin  {\"abha_number\":\"91-2345-6789-0123\",\"channel\":\"WHATSAPP\"}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
