import sys
from datetime import date
from sqlalchemy import select
from app import models
from app.core.database import SessionLocal

def seed_patients():
    db = SessionLocal()
    try:
        # 1. Swagath Reddy
        swagath = db.scalar(select(models.Patient).where(models.Patient.abha_number == "91-2345-6789-0123"))
        if not swagath:
            swagath = models.Patient(
                first_name="Swagath",
                last_name="Reddy",
                dob=date(1996, 7, 14),
                gender="Male",
                abha_number="91-2345-6789-0123",
                abha_address="swagath.reddy@abdm",
                mrn="MRN-100234",
                empi_id="EMPI-100234",
                mobile="6281116923",
                blood_group="O+",
                address="12 MG Road, Pune, Maharashtra",
            )
            db.add(swagath)
            db.flush()
            db.add(models.Allergy(patient_id=swagath.patient_id, substance="Penicillin",
                                  drug_class="penicillin", severity="SEVERE", reaction="Urticaria"))
            db.add(models.PatientIssue(patient_id=swagath.patient_id, issue_name="Hypertension",
                                       onset_info="1 year ago", status="ACTIVE"))
            print("Seeded Swagath Reddy.")
        else:
            print("Swagath Reddy already exists in DB.")
        
        # 2. Rohan Reddy (knee pain)
        rohan = db.scalar(select(models.Patient).where(models.Patient.abha_number == "91-2345-6789-0124"))
        if not rohan:
            rohan = models.Patient(
                first_name="Rohan",
                last_name="Reddy",
                dob=date(1991, 5, 20),
                gender="Male",
                abha_number="91-2345-6789-0124",
                abha_address="rohan.reddy@abdm",
                mrn="MRN-100235",
                empi_id="EMPI-100235",
                mobile="6281116923",
                blood_group="A+",
                address="12 MG Road, Pune, Maharashtra",
            )
            db.add(rohan)
            db.flush()
            db.add(models.PatientIssue(patient_id=rohan.patient_id, issue_name="Knee pain",
                                       onset_info="2 weeks ago", status="ACTIVE"))
            print("Seeded Rohan Reddy (Knee pain).")
        else:
            print("Rohan Reddy already exists in DB.")

        # 3. Divya Reddy (migraine)
        divya = db.scalar(select(models.Patient).where(models.Patient.abha_number == "91-2345-6789-0125"))
        if not divya:
            divya = models.Patient(
                first_name="Divya",
                last_name="Reddy",
                dob=date(1998, 11, 2),
                gender="Female",
                abha_number="91-2345-6789-0125",
                abha_address="divya.reddy@abdm",
                mrn="MRN-100236",
                empi_id="EMPI-100236",
                mobile="6281116923",
                blood_group="B+",
                address="12 MG Road, Pune, Maharashtra",
            )
            db.add(divya)
            db.flush()
            db.add(models.PatientIssue(patient_id=divya.patient_id, issue_name="Migraine",
                                       onset_info="3 months ago", status="ACTIVE"))
            print("Seeded Divya Reddy (Migraine).")
        else:
            print("Divya Reddy already exists in DB.")

        # 4. Sunita Sharma (High fever)
        sunita = db.scalar(select(models.Patient).where(models.Patient.abha_number == "91-9999-9999-0001"))
        if not sunita:
            sunita = models.Patient(
                first_name="Sunita",
                last_name="Sharma",
                dob=date(1985, 4, 15),
                gender="Female",
                abha_number="91-9999-9999-0001",
                abha_address="sunita.sharma@abdm",
                mrn="MRN-200301",
                empi_id="EMPI-200301",
                mobile="9999999999",
                blood_group="O-",
                address="45 Residency Road, Pune, Maharashtra",
            )
            db.add(sunita)
            db.flush()
            db.add(models.PatientIssue(patient_id=sunita.patient_id, issue_name="High fever",
                                       onset_info="3 days ago", status="ACTIVE"))
            print("Seeded Sunita Sharma (High fever).")
        else:
            print("Sunita Sharma already exists in DB.")

        # 5. Amit Kumar (Chest congestion)
        amit = db.scalar(select(models.Patient).where(models.Patient.abha_number == "91-9999-9999-0002"))
        if not amit:
            amit = models.Patient(
                first_name="Amit",
                last_name="Kumar",
                dob=date(1989, 9, 22),
                gender="Male",
                abha_number="91-9999-9999-0002",
                abha_address="amit.kumar@abdm",
                mrn="MRN-200302",
                empi_id="EMPI-200302",
                mobile="9999999999",
                blood_group="AB+",
                address="22 Senapati Bapat Road, Pune, Maharashtra",
            )
            db.add(amit)
            db.flush()
            db.add(models.PatientIssue(patient_id=amit.patient_id, issue_name="Chest congestion",
                                       onset_info="5 days ago", status="ACTIVE"))
            print("Seeded Amit Kumar (Chest congestion).")
        else:
            print("Amit Kumar already exists in DB.")

        db.commit()
        print("Success: Demo patients seeded on Supabase.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding patients: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_patients()
