# Development Setup & Patient Portal Integration Guide

Welcome to the team! This document outlines how to set up your local database with the fresh seed data and provides the specifications for integrating the **Patient Intake & Portal** section.

---

## 💾 Part 1: Local Database Setup & Seeding

Whenever you pull changes from the repository, you need to sync your local database. Run the following commands in the `backend` folder:

1. **Activate Virtual Environment**:
   ```powershell
   # Windows
   .venv\Scripts\Activate.ps1
   ```

2. **Reset and Run Core Seeds** (drops existing schemas and initializes master tables like staff, doctors, and pharmacy stock):
   ```bash
   python -m app.seed --force
   ```

3. **Seed Demo Patients Queue** (seeds 5 active patients with diverse clinical complaints, vitals, and histories into the doctor and lab queues for testing):
   ```bash
   python seed_demo_patients.py
   ```

---

## 🏥 Part 2: Patient Portal & Intake Workflow Specs
*(Task details for teammate building the Patient Intake/Portal section)*

Please ensure that your frontend inputs map directly to the backend database columns. The patient workflow should follow these three phases:

### Phase 1: Mobile-First Login/Lookup
1. The landing screen must prompt the patient to enter their **Mobile Number**.
2. Query the backend to look up the patient:
   * If they are a **New Patient**, proceed to the **New Registration / Appointment Booking Form**.
   * If they are a **Returning Patient**, display their **Patient Dashboard** showing existing records, along with an option to book a new slot.

---

### Phase 2: Returning Patient Dashboard (Existing Records)
For patients with existing records associated with their mobile number, show a comprehensive history dashboard containing:

1. **Prescription History**:
   * Show full details of past prescriptions (approved by the doctor).
   * Include drug name, dosage, timing/relation to food, and duration.
2. **Lab Reports**:
   * Show complete lab results (test name, analyzed value, reference range, and high/low flags).
3. **Re-consultation / Follow-Up Option**:
   * If the patient has a recent visit, provide an option to book a **Re-consultation** with the **same doctor**.
   * The patient must be able to choose:
     * **Live (In-Hospital)** re-consultation slot.
     * **Virtual** re-consultation (for checking reports and receiving updated prescriptions).

---

### Phase 3: New Patient Registration & Booking Form
Ensure the form collects the following details and maps them to the corresponding DB schema:

| Form Field | Database Table | Database Column | Notes / Validation |
| :--- | :--- | :--- | :--- |
| **First Name** | `Patient` | `first_name` | String (Required) |
| **Last Name** | `Patient` | `last_name` | String (Required) |
| **Mobile Number** | `Patient` | `mobile` | String (Used as lookup key) |
| **Age / DOB** | `Patient` | `dob` | Calculate `dob` (Date) based on entered Age |
| **Gender** | `Patient` | `gender` | Enum / String (`Male`, `Female`, `Other`) |
| **Blood Group** | `Patient` | `blood_group` | String (`A+`, `B+`, etc.) |
| **Chief Complaint** | `Triage` | `chief_complaint` | Text (Reason for visit, e.g., *"fever and dry cough"*) |
| **Preferred Doctor** | `Encounter` | `assigned_doctor_id` | Select from list of active doctors fetched from API |
| **Slot Selection** | `Appointment` | `slot_time` / `status` | Slot timing and walk-in/scheduled flag |

### DB Schema References to Keep in Mind:
* **`Patient`** details should go to `/api/v1/patients`.
* **`Triage`** details (symptom summary, chief complaint) must map to the `triage` table attached to the active `Encounter`.
* **`Encounter`** status must start as `REGISTERED` or `CHECKED_IN` before transitioning to `TRIAGED` after the nurse records vitals.

---

## 🔑 Part 3: Pre-seeded Doctor Profiles & Credentials

For local testing in the **Doctor Workspace**, use the following pre-seeded credentials and details:

| Doctor Name | Department / Specialty | Room | Floor | OPD Fee | Access PIN |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dr. Ananya Mehta** | General Medicine | Room 101 | Floor 1 | ₹500 | `1234` |
| **Dr. Vikram Rao** | Cardiology | Room 102 | Floor 1 | ₹600 | `1234` |
| **Dr. Priya Iyer** | Pulmonology | Room 103 | Floor 1 | ₹700 | `1234` |
| **Dr. Sameer Kapoor** | Paediatrics | Room 104 | Floor 2 | ₹800 | `1234` |
| **Dr. Neha Nair** | Orthopaedics | Room 105 | Floor 2 | ₹900 | `1234` |
| **Dr. Arjun Shah** | Dermatology | Room 106 | Floor 2 | ₹1000 | `1234` |

> [!NOTE]
> Any new doctors registered via the **Admin Workspace** will be saved with the Room, Floor, OPD Fee, and Access PIN configured during onboarding. You can lookup newly registered doctor PINs directly in the **Admin Workspace Directory table**.
