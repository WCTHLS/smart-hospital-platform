# Clinical Triage & ESI (Emergency Severity Index) Guide

This document explains the triage logic, ESI acuity levels, and clinical prioritization rules implemented in the Outpatient Department (OPD) queue manager.

---

## 1. OPD Urgency vs. Casualty (Emergency Room)

To understand clinic operations, we must separate true life-threatening emergencies from outpatient urgencies:

* **Casualty / Emergency Room (ER)**: High-acuity resuscitation cases (e.g., polytrauma, strokes, massive heart attacks, cardiac arrests) go straight to Casualty. They **never** register at the OPD desk.
* **OPD Urgencies ("Little Emergencies")**: Patients who present to the regular OPD clinic with severe, painful, or unstable symptoms. They cannot wait in the normal 1–2 hour queue without clinical risk, so they are prioritized dynamically by the triage desk.

---

## 2. ESI Acuity Levels & Queue Rules

The clinic uses the standard **ESI (Emergency Severity Index)**, a 5-level triage algorithm:

| ESI Level | Classification | Queue Priority | Action Taken |
| :---: | :--- | :---: | :--- |
| **1** | **Resuscitation** | Immediate | Critical condition. Redirected to Casualty/ER immediately. |
| **2** | **Emergent** | Top Priority | High-risk situation or abnormal vitals. Sent directly to doctor room next. |
| **3** | **Urgent** | High Priority | Stable vitals but severe symptoms (needs resources). Sorted at top of standard queue. |
| **4** | **Less Urgent** | Standard | Stable. Placed in standard queue based on appointment slot. |
| **5** | **Non-Urgent** | Standard | Routine checkups/refills. Placed in standard queue based on appointment slot. |

---

## 3. Real-World OPD Urgency Scenarios

Here are 5 common outpatient scenarios where patients are prioritized using this triage system:

### 🎒 Scenario A: Severe Dehydration (ESI Level 3)
* **Clinical Presentation**: A patient presenting with acute gastroenteritis, vomiting, and diarrhea for 24 hours.
* **Why it's urgent**: They are conscious and sitting in a wheelchair, but their Systolic Blood Pressure is low (90 mmHg) and pulse is high (110 bpm). 
* **Queue Action**: They are placed at the top of the queue so the doctor can immediately order IV fluids to prevent hypovolemic shock.

### 🎒 Scenario B: Hypertensive Urgency (ESI Level 2)
* **Clinical Presentation**: A patient walks in for a routine medicine refill. During vital checks, their Blood Pressure is found to be **195/115 mmHg**.
* **Why it's urgent**: Although they only complain of a mild headache, walking around with a BP this high places them at immediate risk of a stroke or aneurysm.
* **Queue Action**: Bypasses the waiting queue immediately to receive acute oral antihypertensive meds.

### 🎒 Scenario C: High-Grade Fever (ESI Level 3)
* **Clinical Presentation**: A patient presenting with a sudden temperature of **103.8°F** and severe chills (suspected Malaria/Dengue).
* **Why it's urgent**: Prolonged high fevers can lead to febrile seizures, severe dehydration, or sepsis.
* **Queue Action**: Prioritized so they can get fever-reducing medication and lab test orders right away.

### 🎒 Scenario D: Renal Colic / Kidney Stones (ESI Level 3)
* **Clinical Presentation**: A patient walking in clutching their flank, groaning in agonizing pain, sweating, and unable to sit still.
* **Why it's urgent**: While their vitals are stable (besides elevated heart rate due to pain), they are in severe pain distress.
* **Queue Action**: Bypassed for immediate pain relief orders (e.g. Diclofenac injection) on compassionate grounds.

### 🎒 Scenario E: Mild Bronchospasm (ESI Level 2)
* **Clinical Presentation**: An asthmatic patient presenting with moderate breathlessness, wheezing, and an SpO₂ level of **91%**.
* **Why it's urgent**: They are in respiratory distress and need nebulization before they progress to complete airway closure.
* **Queue Action**: Escalated to ESI 2 so they can get an immediate nebulizer order.

---

## 4. How the Smart Queue handles this in Code

The backend resolves this priority in [`list_doctor_encounters`](file:///c:/Project/smart-hospital-platform/backend/app/api/routes_journey.py) by sorting encounters dynamically:
1. **Red Flag / Emergency cases** (ESI 1 & 2) are placed at the very top.
2. **Acuity urgency** (ESI 3) is placed next.
3. **Appointment times** (earliest slot first) are respected for routine patients (ESI 4 & 5).
