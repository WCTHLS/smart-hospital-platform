"""Oncology module — cancer diagnoses, biomarkers, chemotherapy regimens, tumor board,
radiology/pathology reports and survivorship plans.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.core.database import get_db
from app.core.security import audit
from app.schemas import (
    BiomarkerTestCreateRequest,
    ChemoCycleCreateRequest,
    ChemoCycleUpdateRequest,
    ChemoRegimenCreateRequest,
    ChemoRegimenUpdateRequest,
    DiagnosisCreateRequest,
    DiagnosisUpdateRequest,
    PathologyReportCreateRequest,
    RadiologyReportCreateRequest,
    SurvivorshipPlanCreateRequest,
    TumorBoardCaseCreateRequest,
    TumorBoardCaseUpdateRequest,
)

router = APIRouter(prefix="/api/v1/oncology", tags=["oncology"])


def _diagnosis(db: Session, diagnosis_id: str) -> models.Diagnosis:
    diagnosis = db.get(models.Diagnosis, diagnosis_id)
    if not diagnosis:
        raise HTTPException(404, "Diagnosis not found")
    return diagnosis


def _regimen(db: Session, regimen_id: str) -> models.ChemoRegimen:
    regimen = db.get(models.ChemoRegimen, regimen_id)
    if not regimen:
        raise HTTPException(404, "Chemo regimen not found")
    return regimen


def _tumor_board_case(db: Session, case_id: str) -> models.TumorBoardCase:
    case = db.get(models.TumorBoardCase, case_id)
    if not case:
        raise HTTPException(404, "Tumor board case not found")
    return case


def _serialize_biomarker(b: models.BiomarkerTest) -> dict:
    return {
        "biomarker_id": b.biomarker_id, "diagnosis_id": b.diagnosis_id, "patient_id": b.patient_id,
        "marker_name": b.marker_name, "result": b.result, "value": b.value, "method": b.method,
        "lab_name": b.lab_name, "tested_date": b.tested_date, "report_uri": b.report_uri,
        "notes": b.notes, "created_ts": b.created_ts,
    }


def _serialize_cycle(c: models.ChemoCycle) -> dict:
    return {
        "cycle_id": c.cycle_id, "regimen_id": c.regimen_id, "cycle_number": c.cycle_number,
        "scheduled_date": c.scheduled_date, "administered_date": c.administered_date,
        "status": c.status, "delay_reason": c.delay_reason, "weight_kg": c.weight_kg,
        "bsa_m2": c.bsa_m2, "toxicities": c.toxicities or [], "administered_by": c.administered_by,
        "notes": c.notes,
    }


def _serialize_regimen(r: models.ChemoRegimen, *, with_cycles: bool = True) -> dict:
    out = {
        "regimen_id": r.regimen_id, "diagnosis_id": r.diagnosis_id, "patient_id": r.patient_id,
        "protocol_name": r.protocol_name, "intent": r.intent, "line_of_therapy": r.line_of_therapy,
        "drugs": r.drugs or [], "cycle_length_days": r.cycle_length_days,
        "planned_cycles": r.planned_cycles, "prescribed_by": r.prescribed_by,
        "start_date": r.start_date, "end_date": r.end_date, "status": r.status,
        "discontinued_reason": r.discontinued_reason,
    }
    if with_cycles:
        out["cycles"] = [_serialize_cycle(c) for c in r.cycles]
    return out


def _serialize_tumor_board_case(c: models.TumorBoardCase) -> dict:
    return {
        "case_id": c.case_id, "diagnosis_id": c.diagnosis_id, "patient_id": c.patient_id,
        "scheduled_date": c.scheduled_date, "presenting_doctor_id": c.presenting_doctor_id,
        "attendees": c.attendees or [], "case_summary": c.case_summary,
        "recommendation": c.recommendation, "status": c.status,
    }


def _serialize_diagnosis(d: models.Diagnosis, *, with_children: bool = True) -> dict:
    out = {
        "diagnosis_id": d.diagnosis_id, "patient_id": d.patient_id, "encounter_id": d.encounter_id,
        "cancer_type": d.cancer_type, "primary_site": d.primary_site, "histology": d.histology,
        "icd10_code": d.icd10_code, "icdo_morphology_code": d.icdo_morphology_code,
        "grade": d.grade, "stage_group": d.stage_group,
        "tnm": {"t": d.tnm_t, "n": d.tnm_n, "m": d.tnm_m},
        "metastatic": d.metastatic, "metastatic_sites": d.metastatic_sites or [],
        "diagnosed_by": d.diagnosed_by, "diagnosed_date": d.diagnosed_date,
        "status": d.status, "notes": d.notes, "created_ts": d.created_ts,
    }
    if with_children:
        out["biomarkers"] = [_serialize_biomarker(b) for b in d.biomarkers]
        out["chemo_regimens"] = [_serialize_regimen(r) for r in d.chemo_regimens]
        out["tumor_board_cases"] = [_serialize_tumor_board_case(c) for c in d.tumor_board_cases]
    return out


def _serialize_radiology_report(r: models.RadiologyReport) -> dict:
    return {
        "report_id": r.report_id, "patient_id": r.patient_id, "diagnosis_id": r.diagnosis_id,
        "lab_order_id": r.lab_order_id, "modality": r.modality, "body_region": r.body_region,
        "findings": r.findings, "impression": r.impression, "recist_response": r.recist_response,
        "reported_by": r.reported_by, "attachment_uri": r.attachment_uri, "reported_ts": r.reported_ts,
    }


def _serialize_pathology_report(r: models.PathologyReport) -> dict:
    return {
        "report_id": r.report_id, "patient_id": r.patient_id, "diagnosis_id": r.diagnosis_id,
        "lab_order_id": r.lab_order_id, "specimen_type": r.specimen_type,
        "specimen_site": r.specimen_site, "gross_description": r.gross_description,
        "microscopic_description": r.microscopic_description, "diagnosis_text": r.diagnosis_text,
        "margins_status": r.margins_status, "lymph_nodes_examined": r.lymph_nodes_examined,
        "lymph_nodes_positive": r.lymph_nodes_positive, "reported_by": r.reported_by,
        "attachment_uri": r.attachment_uri, "reported_ts": r.reported_ts,
    }


def _serialize_survivorship_plan(p: models.SurvivorshipPlan) -> dict:
    return {
        "plan_id": p.plan_id, "patient_id": p.patient_id, "diagnosis_id": p.diagnosis_id,
        "treatment_summary": p.treatment_summary, "surveillance_schedule": p.surveillance_schedule or [],
        "late_effects_risks": p.late_effects_risks or [], "next_followup_date": p.next_followup_date,
        "lifestyle_recommendations": p.lifestyle_recommendations, "created_by": p.created_by,
        "status": p.status, "created_ts": p.created_ts,
    }


# ------------------------------------------------------------------------------------- Patients
@router.get("/patients")
def list_oncology_patients(db: Session = Depends(get_db)) -> list[dict]:
    """Patients who have at least one oncology diagnosis on file."""
    rows = db.scalars(
        select(models.Patient)
        .join(models.Diagnosis, models.Diagnosis.patient_id == models.Patient.patient_id)
        .distinct()
        .order_by(models.Patient.first_name)
    ).all()
    out = []
    for p in rows:
        cancer_types = db.scalars(
            select(models.Diagnosis.cancer_type).where(models.Diagnosis.patient_id == p.patient_id).distinct()
        ).all()
        out.append({
            "patient_id": p.patient_id, "name": p.full_name, "mrn": p.mrn, "age": p.age,
            "gender": p.gender, "mobile": p.mobile, "cancer_types": sorted(cancer_types),
        })
    return out


@router.get("/patients/search")
def search_all_patients(q: str, db: Session = Depends(get_db)) -> list[dict]:
    """Search across ALL patients (not just existing oncology patients) by name or MRN, so a
    new diagnosis can be registered for a patient who isn't in the oncology module yet."""
    if not q or len(q.strip()) < 2:
        return []
    like = f"%{q.strip()}%"
    rows = db.scalars(
        select(models.Patient)
        .where(
            (models.Patient.first_name.ilike(like))
            | (models.Patient.last_name.ilike(like))
            | (models.Patient.mrn.ilike(like))
            | (models.Patient.mobile.ilike(like))
        )
        .order_by(models.Patient.first_name)
        .limit(15)
    ).all()
    return [
        {"patient_id": p.patient_id, "name": p.full_name, "mrn": p.mrn, "age": p.age, "gender": p.gender}
        for p in rows
    ]


# ------------------------------------------------------------------------------------ Diagnosis
@router.post("/diagnoses")
def create_diagnosis(body: DiagnosisCreateRequest, db: Session = Depends(get_db)) -> dict:
    if not db.get(models.Patient, body.patient_id):
        raise HTTPException(404, "Patient not found")
    diagnosis = models.Diagnosis(**body.model_dump())
    db.add(diagnosis)
    audit(db, actor_id=body.diagnosed_by, actor_role="DOCTOR", action="DIAGNOSIS_CREATED",
          entity_type="patient", entity_id=body.patient_id, metadata={"cancer_type": body.cancer_type})
    db.commit()
    db.refresh(diagnosis)
    return _serialize_diagnosis(diagnosis)


@router.get("/patients/{patient_id}/diagnoses")
def list_diagnoses(patient_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.Diagnosis).where(models.Diagnosis.patient_id == patient_id)
        .order_by(models.Diagnosis.created_ts.desc())
    ).all()
    return [_serialize_diagnosis(d, with_children=False) for d in rows]


@router.get("/diagnoses/{diagnosis_id}")
def get_diagnosis(diagnosis_id: str, db: Session = Depends(get_db)) -> dict:
    return _serialize_diagnosis(_diagnosis(db, diagnosis_id))


@router.put("/diagnoses/{diagnosis_id}")
def update_diagnosis(diagnosis_id: str, body: DiagnosisUpdateRequest, db: Session = Depends(get_db)) -> dict:
    diagnosis = _diagnosis(db, diagnosis_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(diagnosis, field, value)
    audit(db, actor_id=None, actor_role="DOCTOR", action="DIAGNOSIS_UPDATED",
          entity_type="diagnosis", entity_id=diagnosis_id)
    db.commit()
    db.refresh(diagnosis)
    return _serialize_diagnosis(diagnosis)


# ----------------------------------------------------------------------------------- Biomarkers
@router.post("/diagnoses/{diagnosis_id}/biomarkers")
def add_biomarker(diagnosis_id: str, body: BiomarkerTestCreateRequest, db: Session = Depends(get_db)) -> dict:
    diagnosis = _diagnosis(db, diagnosis_id)
    biomarker = models.BiomarkerTest(diagnosis_id=diagnosis.diagnosis_id, **body.model_dump())
    db.add(biomarker)
    audit(db, actor_id=None, actor_role="LAB", action="BIOMARKER_RECORDED",
          entity_type="diagnosis", entity_id=diagnosis_id, metadata={"marker": body.marker_name})
    db.commit()
    db.refresh(biomarker)
    return _serialize_biomarker(biomarker)


@router.get("/diagnoses/{diagnosis_id}/biomarkers")
def list_biomarkers(diagnosis_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.BiomarkerTest).where(models.BiomarkerTest.diagnosis_id == diagnosis_id)
        .order_by(models.BiomarkerTest.created_ts.desc())
    ).all()
    return [_serialize_biomarker(b) for b in rows]


# ------------------------------------------------------------------------------- Chemo regimens
@router.post("/diagnoses/{diagnosis_id}/chemo-regimens")
def create_chemo_regimen(diagnosis_id: str, body: ChemoRegimenCreateRequest, db: Session = Depends(get_db)) -> dict:
    diagnosis = _diagnosis(db, diagnosis_id)
    regimen = models.ChemoRegimen(diagnosis_id=diagnosis.diagnosis_id, **body.model_dump())
    db.add(regimen)
    audit(db, actor_id=body.prescribed_by, actor_role="DOCTOR", action="CHEMO_REGIMEN_CREATED",
          entity_type="diagnosis", entity_id=diagnosis_id, metadata={"protocol": body.protocol_name})
    db.commit()
    db.refresh(regimen)
    return _serialize_regimen(regimen)


@router.get("/diagnoses/{diagnosis_id}/chemo-regimens")
def list_chemo_regimens(diagnosis_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.ChemoRegimen).where(models.ChemoRegimen.diagnosis_id == diagnosis_id)
        .order_by(models.ChemoRegimen.created_ts.desc())
    ).all()
    return [_serialize_regimen(r) for r in rows]


@router.put("/chemo-regimens/{regimen_id}")
def update_chemo_regimen(regimen_id: str, body: ChemoRegimenUpdateRequest, db: Session = Depends(get_db)) -> dict:
    regimen = _regimen(db, regimen_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(regimen, field, value)
    audit(db, actor_id=None, actor_role="DOCTOR", action="CHEMO_REGIMEN_UPDATED",
          entity_type="chemo_regimen", entity_id=regimen_id)
    db.commit()
    db.refresh(regimen)
    return _serialize_regimen(regimen)


@router.post("/chemo-regimens/{regimen_id}/cycles")
def add_chemo_cycle(regimen_id: str, body: ChemoCycleCreateRequest, db: Session = Depends(get_db)) -> dict:
    regimen = _regimen(db, regimen_id)
    cycle = models.ChemoCycle(regimen_id=regimen.regimen_id, **body.model_dump())
    db.add(cycle)
    audit(db, actor_id=None, actor_role="DOCTOR", action="CHEMO_CYCLE_SCHEDULED",
          entity_type="chemo_regimen", entity_id=regimen_id, metadata={"cycle_number": body.cycle_number})
    db.commit()
    db.refresh(cycle)
    return _serialize_cycle(cycle)


@router.put("/chemo-cycles/{cycle_id}")
def update_chemo_cycle(cycle_id: str, body: ChemoCycleUpdateRequest, db: Session = Depends(get_db)) -> dict:
    cycle = db.get(models.ChemoCycle, cycle_id)
    if not cycle:
        raise HTTPException(404, "Chemo cycle not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cycle, field, value)
    audit(db, actor_id=body.administered_by, actor_role="DOCTOR", action="CHEMO_CYCLE_UPDATED",
          entity_type="chemo_cycle", entity_id=cycle_id, metadata={"status": cycle.status})
    db.commit()
    db.refresh(cycle)
    return _serialize_cycle(cycle)


# ------------------------------------------------------------------------------ Tumor board (MDT)
@router.post("/diagnoses/{diagnosis_id}/tumor-board")
def create_tumor_board_case(diagnosis_id: str, body: TumorBoardCaseCreateRequest, db: Session = Depends(get_db)) -> dict:
    diagnosis = _diagnosis(db, diagnosis_id)
    case = models.TumorBoardCase(diagnosis_id=diagnosis.diagnosis_id, **body.model_dump())
    db.add(case)
    audit(db, actor_id=body.presenting_doctor_id, actor_role="DOCTOR", action="TUMOR_BOARD_CASE_CREATED",
          entity_type="diagnosis", entity_id=diagnosis_id)
    db.commit()
    db.refresh(case)
    return _serialize_tumor_board_case(case)


@router.get("/diagnoses/{diagnosis_id}/tumor-board")
def list_tumor_board_cases(diagnosis_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.TumorBoardCase).where(models.TumorBoardCase.diagnosis_id == diagnosis_id)
        .order_by(models.TumorBoardCase.created_ts.desc())
    ).all()
    return [_serialize_tumor_board_case(c) for c in rows]


@router.put("/tumor-board/{case_id}")
def update_tumor_board_case(case_id: str, body: TumorBoardCaseUpdateRequest, db: Session = Depends(get_db)) -> dict:
    case = _tumor_board_case(db, case_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(case, field, value)
    audit(db, actor_id=None, actor_role="DOCTOR", action="TUMOR_BOARD_CASE_UPDATED",
          entity_type="tumor_board_case", entity_id=case_id)
    db.commit()
    db.refresh(case)
    return _serialize_tumor_board_case(case)


# ------------------------------------------------------------------------- Radiology / Pathology
@router.post("/radiology-reports")
def create_radiology_report(body: RadiologyReportCreateRequest, db: Session = Depends(get_db)) -> dict:
    if not db.get(models.Patient, body.patient_id):
        raise HTTPException(404, "Patient not found")
    report = models.RadiologyReport(**body.model_dump())
    db.add(report)
    audit(db, actor_id=body.reported_by, actor_role="DOCTOR", action="RADIOLOGY_REPORT_CREATED",
          entity_type="patient", entity_id=body.patient_id, metadata={"modality": body.modality})
    db.commit()
    db.refresh(report)
    return _serialize_radiology_report(report)


@router.get("/patients/{patient_id}/radiology-reports")
def list_radiology_reports(patient_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.RadiologyReport).where(models.RadiologyReport.patient_id == patient_id)
        .order_by(models.RadiologyReport.reported_ts.desc())
    ).all()
    return [_serialize_radiology_report(r) for r in rows]


@router.post("/pathology-reports")
def create_pathology_report(body: PathologyReportCreateRequest, db: Session = Depends(get_db)) -> dict:
    if not db.get(models.Patient, body.patient_id):
        raise HTTPException(404, "Patient not found")
    report = models.PathologyReport(**body.model_dump())
    db.add(report)
    audit(db, actor_id=body.reported_by, actor_role="LAB", action="PATHOLOGY_REPORT_CREATED",
          entity_type="patient", entity_id=body.patient_id, metadata={"specimen_type": body.specimen_type})
    db.commit()
    db.refresh(report)
    return _serialize_pathology_report(report)


@router.get("/patients/{patient_id}/pathology-reports")
def list_pathology_reports(patient_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.PathologyReport).where(models.PathologyReport.patient_id == patient_id)
        .order_by(models.PathologyReport.reported_ts.desc())
    ).all()
    return [_serialize_pathology_report(r) for r in rows]


# --------------------------------------------------------------------------- Survivorship plan
@router.post("/diagnoses/{diagnosis_id}/survivorship-plan")
def create_survivorship_plan(diagnosis_id: str, body: SurvivorshipPlanCreateRequest, db: Session = Depends(get_db)) -> dict:
    diagnosis = _diagnosis(db, diagnosis_id)
    plan = models.SurvivorshipPlan(diagnosis_id=diagnosis.diagnosis_id, **body.model_dump())
    db.add(plan)
    audit(db, actor_id=body.created_by, actor_role="DOCTOR", action="SURVIVORSHIP_PLAN_CREATED",
          entity_type="diagnosis", entity_id=diagnosis_id)
    db.commit()
    db.refresh(plan)
    return _serialize_survivorship_plan(plan)


@router.get("/patients/{patient_id}/survivorship-plans")
def list_survivorship_plans(patient_id: str, db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(
        select(models.SurvivorshipPlan).where(models.SurvivorshipPlan.patient_id == patient_id)
        .order_by(models.SurvivorshipPlan.created_ts.desc())
    ).all()
    return [_serialize_survivorship_plan(p) for p in rows]
