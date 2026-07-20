# Implementation Plan: 100% Private Local ML Diagnostics & Hospital DICOM Integration

This document outlines how real-world hospital scanning workflows operate and details how to implement a **completely private, local-running ML/rules engine** on your machine.

---

## 1. How Modern Hospital Imaging Works (PACS & DICOM Modality Workflow)

In a real-world hospital, the lab technician **does not** manually download files from scanners and upload them through a website. Instead, the process is automated over a secure Local Area Network (LAN):

```
+------------------+                   +--------------------+                   +--------------------+
|  X-Ray / CT/ MRI |  DICOM C-STORE    |    PACS Server     |  DICOMweb WADO-RS  |  Doctor Workspace  |
|  Scanner Machine | ----------------> |  (Local Database)  | -----------------> |   CornerstoneJS    |
|   (Modality)     |  TCP/IP (Port 104)|  (e.g., Orthanc)   |   HTTP/JSON (LAN)  |  Viewer in Browser |
+------------------+                   +--------------------+                   +--------------------+
                                                |
                                                | HL7 ORU Message (Scan Completed)
                                                v
                                       +--------------------+
                                       | Hospital EMR (DB)  |
                                       +--------------------+
```

1. **Patient Booking & Modality Worklist (MWL)**:
   * When a patient is checked in for an X-ray, the EMR transmits the patient's ID and MRN to the X-ray machine over the network.
   * The technician sees the patient's name directly on the scanner screen.
2. **Scanning & C-STORE Push**:
   * The technician takes the scan.
   * Once finalized, the technician clicks **"Send to PACS"** on the machine's console.
   * The scanner transmits the raw DICOM file over the hospital LAN to the local **PACS (Picture Archiving and Communication System)** server (e.g., Orthanc or dcm4chee) using the standard **DICOM C-STORE** protocol on TCP port 104.
3. **EMR Linking**:
   * The PACS server notifies the EMR system (via an **HL7** message or webhook) that a new scan is linked to the patient's MRN.
   * The EMR stores the PACS study instance UID.
4. **Direct Doctor Review**:
   * When the doctor opens the patient's records, a browser-based viewer (like CornerstoneJS) fetches the raw DICOM slices directly from the PACS server via the secure HTTP **DICOMweb** standard (`WADO-RS`).

---

## 2. 100% Offline Local ML Implementation Design

To guarantee **data privacy**, we will avoid any cloud API calls. All analysis will run locally on your system using:
1. **Local Bio-chemistry Reference Interval Parser**: A deterministic rules engine comparing blood report values against reference ranges.
2. **Local Image Analyzer**: A lightweight Python helper using **ONNX Runtime** (or a local tiny model) to run scan classifications locally.

### Technical Stack
* **`pydicom`**: A python library to parse metadata directly from local DICOM files (to read Patient Name, study details, and image arrays offline).
* **`onnxruntime`**: A fast, lightweight CPU-optimized local inference runtime (~15MB library) to execute machine learning models without needing heavy PyTorch/TensorFlow frameworks.
* **Model**: A pre-trained `MobileNetV2` or `ResNet18` converted to ONNX format (only **~13MB to ~45MB** in size), loaded locally from the disk to scan images for structural abnormalities.

---

## 3. Step-by-Step Local Implementation Plan

### Step 1: Add a Local Upload Folder & DICOM Parser
* Setup a `/backend/uploads/` directory to store uploaded files.
* Write a python utility `dicom_helper.py` using `pydicom`. If a file is uploaded in `.dcm` format:
  * Extract patient info from the file header to verify it matches the active patient records (safety gate).
  * Convert the raw DICOM pixel array into a standard format (`PNG`/`JPEG`) so the web browser can render it.

### Step 2: Implement the Local AI/ML Engine
Create `backend/app/ai/local_analyzer.py`:
* **Text Diagnostics**: Compares numeric laboratory results (like Hemoglobin, TSH, Creatinine) against biological normal ranges.
* **Image Diagnostics**:
  * Loads the MobileNetV2 ONNX model from `backend/app/resources/models/`.
  * Pre-processes the X-ray/scan image (resizes to 224x224, normalizes pixels).
  * Executes local inference completely offline.
  * Outputs diagnostic categories (e.g., abnormal vs. normal chest structures) along with a localized warning flag if density abnormalities are found.

### Step 3: Create the Local Analyze API
Add `POST /api/v1/labs/orders/{lab_order_id}/local-analyze` in `routes_clinical.py`:
* Triggers the offline `local_analyzer.py`.
* Saves the structured results (e.g., list of flagged values, image classification output) to a local JSON column in the `lab_orders` table.

### Step 4: Doctor Workspace Diagnostics Panel
* Add an **AI Scan & Lab report Copilot** panel inside the doctor's EMR interface.
* Displays the local ML output (e.g., *"Local ML scan suggests Density anomalies. Abnormal Hb: 9.5 detected locally."*).
* Includes a **"Copy to EMR Notes"** button so the doctor can write the findings into the active encounter note with one click.
