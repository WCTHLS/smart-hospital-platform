"""Pydantic request/response schemas (API boundary)."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------------- Journey
class CheckInRequest(BaseModel):
    channel: str = Field(default="KIOSK", description="WHATSAPP / KIOSK / APP / WALKIN")
    patient_id: str | None = None
    abha_number: str | None = None
    mobile: str | None = None
    mrn: str | None = None
    first_name: str | None = None
    reason: str | None = None


class MobileProfilesRequest(BaseModel):
    mobile: str


class IdentityVerifyRequest(BaseModel):
    method: str = Field(description="ABHA / OTP / MRN")
    value: str


class AllergyIn(BaseModel):
    substance: str
    drug_class: str | None = None
    severity: str | None = None
    reaction: str | None = None


class DocumentIn(BaseModel):
    doc_type: str
    title: str | None = None
    uri: str | None = None


class PatientBasicRegistrationRequest(BaseModel):
    first_name: str
    last_name: str
    dob: date
    mobile: str


class PatientRegistrationRequest(BaseModel):
    first_name: str
    last_name: str
    dob: date
    mobile: str
    email: str
    gender: str
    blood_group: str
    address: str
    allergies: list[AllergyIn] = Field(default_factory=list)
    documents: list[DocumentIn] = Field(default_factory=list)


class PatientProfileUpdateRequest(BaseModel):
    email: str
    gender: str
    blood_group: str
    address: str
    allergies: list[AllergyIn] = Field(default_factory=list)
    documents: list[DocumentIn] = Field(default_factory=list)


class ConsentRequest(BaseModel):
    patient_id: str
    purpose: str = "CARE_MGMT"
    hours: int = 24
    hiu_id: str | None = "aarogya-hiu"
    hip_id: str | None = "aarogya-hip"


class VitalsIn(BaseModel):
    bp_systolic: int | None = None
    bp_diastolic: int | None = None
    spo2: int | None = None
    heart_rate: int | None = None
    respiratory_rate: int | None = None
    temperature: float | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


class TriageRequest(BaseModel):
    encounter_id: str
    symptom_text: str
    duration: str | None = None
    vitals: VitalsIn | None = None


class AppointmentSlotsRequest(BaseModel):
    encounter_id: str
    appointment_date: date
    reason: str


class BookAppointmentRequest(BaseModel):
    encounter_id: str
    patient_id: str
    doctor_id: str
    scheduled_start: datetime
    scheduled_end: datetime
    reason: str
    specialty: str
    appointment_type: str = "OPD"
    channel: str = "KIOSK"


class IntakeRequest(BaseModel):
    symptom_text: str
    duration: str | None = None


# --------------------------------------------------------------------------------- Clinical
class AmbientRequest(BaseModel):
    encounter_id: str
    transcript: str


class ApproveNoteRequest(BaseModel):
    final_text: str
    icd10_codes: list[dict] | None = None
    approved_by: str | None = None


class LabOrderRequest(BaseModel):
    encounter_id: str
    tests: list[str]
    priority: str = "ROUTINE"
    ordered_by: str | None = None


class RxItemIn(BaseModel):
    drug_name: str
    dose: str | None = None
    route: str | None = "PO"
    frequency: str | None = None
    duration_days: int | None = None
    quantity: int | None = None


class PrescriptionCreateRequest(BaseModel):
    encounter_id: str
    items: list[RxItemIn]
    current_meds: list[str] = []
    prescribed_by: str | None = None


class ApproveRxRequest(BaseModel):
    approved_by: str | None = None
    accept_substitutions: bool = False
    override_warnings: bool = False


# --------------------------------------------------------------------------------- Billing
class PayRequest(BaseModel):
    method: str = "UPI"
    amount: float | None = None
    reference: str | None = None


class ClaimRequest(BaseModel):
    payer: str
    tpa: str | None = None
    policy_no: str | None = None
    claim_type: str = "CASHLESS"


# --------------------------------------------------------------------------------- Custom Lab Results
class LabResultSubmitItem(BaseModel):
    analyte: str
    value: float


class LabResultSubmitRequest(BaseModel):
    results: list[LabResultSubmitItem]
    notes: str | None = None
    attachment_name: str | None = None
    attachment_uri: str | None = None


# --------------------------------------------------------------------------------- Admin & Auth
class DoctorRegisterRequest(BaseModel):
    name: str
    role: str = "DOCTOR"
    department: str | None = None
    specialty: str | None = None
    experience_years: int | None = None
    room: str | None = None
    floor: str | None = None
    access_pin: str | None = None
    opd_fee: float = 500.0


class DoctorVerifyPinRequest(BaseModel):
    doctor_id: str
    access_pin: str


class DoctorUpdateRequest(BaseModel):
    name: str | None = None
    department: str | None = None
    specialty: str | None = None
    experience_years: int | None = None
    room: str | None = None
    floor: str | None = None
    access_pin: str | None = None
    opd_fee: float | None = None


class DoctorScheduleRequest(BaseModel):
    day_of_week: int
    start_time: str
    end_time: str
    slot_duration_minutes: int = 15


class EncounterNotesAdviceRequest(BaseModel):
    notes: str


class DoctorAvailabilityRequest(BaseModel):
    available: bool
