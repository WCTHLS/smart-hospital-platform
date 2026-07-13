# Gap Analysis — Doctor Workspace & Lab Portal

> Based on deep inspection of the actual code vs the documented flow in `WORKSPACE_DOCTOR.md` and `WORKSPACE_LAB.md`.
> Date: 13 July 2026

---

## 🩺 DOCTOR WORKSPACE (Copilot.tsx) — Gaps

### 🔴 CRITICAL — Wrong Behaviour (Must Fix)

#### 1. Billing Tab has Payment Buttons on Doctor Screen
**File:** `Copilot.tsx` → `Billing()` component (line 1364–1432)

**What exists:**
```
[Pay via UPI]   [Cashless claim]
```
Both buttons are fully functional and callable by the doctor — `pay()` and `claim()` functions exist.

**What should be:**
- Doctor screen should be **READ-ONLY**
- Show: ✅ PAID | Method | Time | Receipt No
- **Zero payment buttons.** Payment was done at booking time (online) or at reception (walk-in).
- The `pay()` and `claim()` functions should not exist on this screen at all.

---

#### 2. "Run Compliance & Discharge" is the ONLY Discharge Option in Billing Tab
**File:** `Copilot.tsx` → `Billing()` component (line 1411)

**What exists:** A single button "Run compliance & discharge" that does compliance check + discharge together.

**What should be:**
- Billing tab should just show the invoice read-only + a simple **"Discharge Patient"** button
- Compliance check should run silently in the background when discharge is clicked
- If compliance gaps found → show inline warning, let doctor proceed anyway or fix gaps
- No separate "Run compliance" step visible to doctor

---

#### 3. Discharge Button Also Exists in Prescription Tab (Duplicate Logic)
**File:** `Copilot.tsx` → `Rx()` component (lines 1333–1349)

**What exists:** After approving CDS, a "Complete Consultation & Discharge" button appears inside the Prescription tab.

**What should be:**
- Discharge should only happen from the **Billing & Discharge tab**
- Prescription tab's job ends after "Approve & e-sign"
- Having discharge in two places causes confusion and potential double-discharge bugs

---

### 🟡 IMPORTANT — Missing Features

#### 4. Patient 360 Tab — Missing Weight & Height from Triage
**File:** `Copilot.tsx` → `Patient360()` (line 797), vitals card (lines 918–928)

**What exists:** Shows BP, SpO2, Heart Rate, Temperature — 4 vitals only.

**What's missing:**
- **Weight** (kg) — captured at triage
- **Height** (cm) — captured at first visit triage
- **BMI** (auto-calculated) — important clinical indicator
- Triage sends `bp_systolic`, `bp_diastolic`, `spo2`, `heart_rate`, `temperature` — Weight is in the Triage form (`Triage.tsx` line 19) but NOT included in the API call or displayed in Patient 360

---

#### 5. Patient 360 Tab — No Critical Vitals Alert Highlighting
**File:** `Copilot.tsx` → Patient360 vitals card

**What exists:** Vitals shown as plain numbers in a grid, no color coding.

**What's missing:**
- 🔴 Red highlight if SpO2 < 90%
- 🔴 Red highlight if BP > 180/120
- 🟡 Yellow highlight if Temp > 104°F
- These flags exist in the queue card (triage red_flag) but NOT in the Patient 360 vitals display when doctor opens a patient

---

#### 6. Ambient SOAP Tab — Hardcoded Transcript & Doctor Name
**File:** `Copilot.tsx` → `Ambient()` (line 977–1040)

**What exists:**
- Transcript is pre-filled with a hardcoded string: `"Patient has fever and productive cough..."` (line 979)
- `approved_by: "Dr. Mehta"` is hardcoded string (line 996)

**What's missing:**
- Transcript should start EMPTY — doctor types or dictates the actual encounter notes
- `approved_by` should use the actual logged-in doctor's name from `activeDoc.name`

---

#### 7. Prescription Tab — Missing "Duration" and "Instructions" Fields
**File:** `Copilot.tsx` → `Rx()` (lines 1242–1277)

**What exists:** Drug name, Dose, Frequency — 3 fields per medicine.

**What's missing:**
- **Duration** (e.g., 5 days) — critical for patient to know how long to take
- **Instructions** (e.g., "After food", "Before food", "With warm water") — commonly required on Indian prescriptions
- Without these, the prescription PDF sent to patient is incomplete

---

#### 8. Billing Tab — No Payment Method/Time/Receipt Display When PAID
**File:** `Copilot.tsx` → `Billing()` (lines 1390–1402)

**What exists:** Shows invoice lines + Balance + a `Tag` with status (PAID/OPEN) + payment buttons.

**What's missing:**
- When status = PAID, should show:
  - ✅ PAID
  - Payment method (UPI / Cash / Card)
  - Payment timestamp
  - Receipt number
- This data exists in the backend but is not fetched/displayed

---

#### 9. E-Consult Queue — No Separate View from First Consultation Queue
**File:** `Copilot.tsx` → Queue section (lines 285–310)

**What exists:** Queue has two tabs — "First Consultation" and "Report Review" — this part is already implemented. ✅

**What's missing:**
- In "Report Review" tab — no display of which lab reports are pending review
- No way to view the uploaded lab report files from the queue card before opening the patient
- When doctor opens a Report Review patient, there's no dedicated "E-Consult" mode — it just opens the same 5-tab workspace (which is confusing since prescription is not yet written)

---

#### 10. After Discharge — No Success Confirmation / Patient Notification Status
**File:** `Copilot.tsx` → top-level discharge button (lines 431–447) and `Billing()` discharge

**What exists:** Doctor clicks discharge → API called → journey reset → queue refreshed.

**What's missing:**
- No success message shown to doctor: "Patient discharged. Prescription sent to patient app."
- No indication that ABDM PHR was updated
- No confirmation that patient notification was triggered
- Doctor just sees the queue again with no feedback

---

### 🔵 MINOR — UX Improvements Needed

#### 11. Queue Cards — No "Triage Done" vs "Booked" Status Distinction
**File:** `Copilot.tsx` → queue cards (lines 328–394)

**What exists:** All non-discharged patients appear in queue. Status (triage done, at triage, booked) is not clearly shown on card.

**What's missing:**
- Visual status badge on each queue card: `Triage Done` / `At Triage` / `Checked In`
- Doctor should only be able to click "Consult Patient" for patients with `Triage Done` status
- Patients still at triage should show as greyed-out / not yet callable

---

#### 12. Doctor Workspace Has No "Back to Queue Without Discharge" Warning
**File:** `Copilot.tsx` → "Back to Patient Queue" button (line 448–453)

**What exists:** Back button immediately resets journey and shows queue.

**What's missing:**
- If doctor clicks "Back" without discharging → should warn: "This patient's consultation is not closed yet. Are you sure?"
- Prevents accidentally abandoning an open consultation

---

## 🧪 LAB PORTAL (LabPortal.tsx) — Gaps

### 🔴 CRITICAL — Wrong / Missing Core Behaviour

#### 1. No Payment Confirmation Filter — All Orders Visible Regardless of Payment
**File:** `LabPortal.tsx` (lines 143–147)

**What exists:**
```typescript
const pending = orders?.filter((o: any) => o.status === "CREATED")
```
Shows ALL `CREATED` orders regardless of whether patient has paid.

**What should be:**
- Only show orders where **payment is confirmed**
- Pending payment orders should be a separate greyed-out section: "Waiting for patient payment"
- Technician cannot start a test without confirmed payment

---

#### 2. No "Mark Sample Collected" Step
**File:** `LabPortal.tsx` — entire file

**What exists:** Two states — CREATED (pending) → RESULTED (completed). Jump is direct.

**What's missing:** The intermediate step:
```
CREATED → SAMPLE_COLLECTED → RESULTED
```
- Technician must first click "Mark Sample Collected" when patient arrives at lab
- This updates patient app: "Sample collected, results coming soon"
- Only then does technician run the test and upload results

---

#### 3. No Patient Identity Verification Step
**File:** `LabPortal.tsx`

**What exists:** Technician just clicks on any pending order from the list.

**What's missing:**
- When patient arrives at lab, technician should verify: **Name + Mobile Number**
- Simple confirmation step: "Patient confirmed present — start test"
- Prevents technician from starting the wrong patient's test

---

#### 4. Completed Orders — No Patient Notification Status
**File:** `LabPortal.tsx` → completed section (lines 233–267)

**What exists:** Completed orders show with a green "COMPLETED" tag. That's it.

**What's missing:**
- Was patient notified? Show: "✅ Patient notified" or "⏳ Notification pending"
- Was doctor notified? Show: "✅ Doctor notified"
- These notifications are critical to the flow — technician should know they went out

---

#### 5. Hardcoded Analyte Map — Cannot Handle Unknown Tests
**File:** `LabPortal.tsx` → `ANALYTE_MAP` (lines 7–34)

**What exists:** Only 7 hardcoded tests (CBC, CRP, HbA1c, Lipid Profile, TSH, RFT, Chest X-ray).

**What's missing:**
- Doctor can order custom tests from Doctor Workspace (line 1059–1069 in Copilot.tsx)
- If a custom test is ordered (e.g. "Urinalysis", "Blood Culture"), the lab portal shows "No numerical inputs required for this order" (line 316–320) — technician cannot enter results
- Need either: a dynamic analyte entry UI, or a generic text-based result entry for unknown tests

---

### 🟡 IMPORTANT — Missing Features

#### 6. No Slot Time Display on Lab Orders
**File:** `LabPortal.tsx` → pending orders list (lines 205–230)

**What exists:** Shows patient name, test name, QR code.

**What's missing:**
- **Booked slot time** (e.g., "2:00 PM") — crucial for lab to prepare and manage flow
- Without slot time, technician doesn't know in what order to expect patients
- Orders should be sorted by slot time, not creation order

---

#### 7. No Department Routing for Results Upload
**File:** `LabPortal.tsx`

**What exists:** Department filter (Pathology / Radiology / Cardiology) for viewing orders.

**What's missing:**
- After results are uploaded, there's no routing confirmation
- Results should be tagged to the correct doctor (already exists in data but not shown)
- Technician cannot see which doctor ordered the test and confirm routing

---

#### 8. File Upload — No Preview of Uploaded File
**File:** `LabPortal.tsx` → file upload (lines 336–356)

**What exists:** File upload with name shown. Upload happens immediately on file select.

**What's missing:**
- After upload succeeds, show a preview or confirmation: "File uploaded ✅ — [filename]"
- Currently only shows filename in a text span — no visual confirmation the upload actually succeeded vs failed silently

---

## 📊 Summary Table

| # | Area | Issue | Severity |
|---|---|---|---|
| 1 | Doctor — Billing Tab | Payment buttons (UPI/Cashless) visible to doctor | 🔴 Critical |
| 2 | Doctor — Billing Tab | "Run Compliance" separate step confusing | 🔴 Critical |
| 3 | Doctor — Rx Tab | Discharge button duplicated in Prescription tab | 🔴 Critical |
| 4 | Doctor — Patient 360 | Weight, Height, BMI missing from vitals | 🟡 Important |
| 5 | Doctor — Patient 360 | No critical vital highlighting (red/yellow) | 🟡 Important |
| 6 | Doctor — SOAP Tab | Hardcoded transcript + hardcoded doctor name | 🟡 Important |
| 7 | Doctor — Rx Tab | Duration and Instructions fields missing | 🟡 Important |
| 8 | Doctor — Billing Tab | Payment method/time/receipt not shown when PAID | 🟡 Important |
| 9 | Doctor — E-Consult | No dedicated mode when opening Report Review patient | 🟡 Important |
| 10 | Doctor — Discharge | No success feedback after discharge | 🔵 Minor |
| 11 | Doctor — Queue | No triage status badge on queue cards | 🔵 Minor |
| 12 | Doctor — Queue | Back button has no unsaved-work warning | 🔵 Minor |
| 13 | Lab — Orders | No payment confirmation filter | 🔴 Critical |
| 14 | Lab — Workflow | No "Mark Sample Collected" intermediate step | 🔴 Critical |
| 15 | Lab — Workflow | No patient identity verification step | 🔴 Critical |
| 16 | Lab — Completed | No patient/doctor notification status shown | 🟡 Important |
| 17 | Lab — Analyte Map | Cannot handle custom/unknown tests | 🟡 Important |
| 18 | Lab — Orders | No slot time shown on order cards | 🟡 Important |
| 19 | Lab — Orders | No doctor name shown per order | 🟡 Important |
| 20 | Lab — Upload | No visual confirmation after file upload | 🔵 Minor |
