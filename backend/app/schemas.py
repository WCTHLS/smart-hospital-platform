"""Pydantic request/response schemas (API boundary)."""
from __future__ import annotations

import re
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------------------------------------- Journey
class CheckInRequest(BaseModel):
    channel: str = Field(default="KIOSK", description="WHATSAPP / KIOSK / APP / WALKIN")
    patient_id: str | None = None
    abha_number: str | None = None
    mobile: str | None = None
    mrn: str | None = None
    first_name: str | None = None
    reason: str | None = None
    appointment_id: str | None = None


class MobileProfilesRequest(BaseModel):
    mobile: str


class OtpSendRequest(BaseModel):
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        value = value.strip()
        if len(value) != 10 or not value.isdigit():
            raise ValueError("mobile number must contain exactly 10 digits")
        return value


class OtpVerifyRequest(OtpSendRequest):
    code: str

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        value = value.strip()
        if not value.isdigit() or not 1 <= len(value) <= 10:
            raise ValueError("OTP must contain 1 to 10 digits")
        return value


class IdentityVerifyRequest(BaseModel):
    method: str = Field(description="ABHA / OTP / MRN")
    value: str


class PatientIssueIn(BaseModel):
    issue_name: str
    onset_info: str | None = None
    status: str = "ACTIVE"


class DocumentIn(BaseModel):
    doc_type: str
    title: str | None = None
    uri: str | None = None

    @field_validator("doc_type")
    @classmethod
    def validate_doc_type(cls, value: str) -> str:
        allowed = {"LAB_REPORT", "DISCHARGE", "SCAN", "AUDIO"}
        if value not in allowed:
            raise ValueError(f"doc_type must be one of {', '.join(sorted(allowed))}")
        return value


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
    email: str | None = None
    gender: str
    blood_group: str | None = None
    address: str | None = None
    issues: list[PatientIssueIn] = Field(default_factory=list)
    documents: list[DocumentIn] = Field(default_factory=list)

    @field_validator("dob")
    @classmethod
    def validate_dob(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("date of birth cannot be in the future")
        return value

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        if len(value) != 10 or not value.isdigit():
            raise ValueError("mobile number must contain exactly 10 digits")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if not value:
            return None
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value.strip()):
            raise ValueError("enter a valid email address")
        return value.strip()


class PatientProfileUpdateRequest(BaseModel):
    email: str
    gender: str
    blood_group: str
    address: str
    allergies: list[AllergyIn] = Field(default_factory=list)
    documents: list[DocumentIn] = Field(default_factory=list)


class PatientPhotoUpdateRequest(BaseModel):
    profile_photo: str | None = None

    @field_validator("profile_photo")
    @classmethod
    def validate_profile_photo(cls, value: str | None) -> str | None:
        if value is None:
            return None
        allowed = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")
        if not value.startswith(allowed):
            raise ValueError("profile photo must be a JPEG, PNG or WebP image")
        if len(value) > 2_800_000:
            raise ValueError("profile photo must be 2 MB or smaller")
        return value


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
    encounter_id: str | None = None
    patient_id: str | None = None
    appointment_date: date
    reason: str


class BookAppointmentRequest(BaseModel):
    encounter_id: str | None = None
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


class RazorpayOrderRequest(BaseModel):
    patient_id: str | None = None
    doctor_id: str | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    reason: str | None = None
    specialty: str | None = None
    appointment_type: str = "OPD"
    channel: str = "PORTAL"
    checkout_email: str | None = None


class RazorpayVerifyRequest(BaseModel):
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


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


class TriageStaffVerifyPinRequest(BaseModel):
    staff_id: str
    access_pin: str


class DoctorUpdateRequest(BaseModel):
    name: str | None = None
    role: str | None = None
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
