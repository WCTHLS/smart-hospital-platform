import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardPlus,
  CreditCard,
  FileUp,
  LockKeyhole,
  Phone,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  UserRound,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useJourney } from "../lib/store";
import { DeviceBar, Field, SectionTitle } from "../components/ui";

type Msg = { who: "bot" | "me"; text: string };
type Profile = {
  patient_id: string;
  first_name: string;
  last_name?: string;
  dob?: string;
  mobile?: string;
  email?: string;
  gender?: string;
  blood_group?: string;
  address?: string;
  abha_number?: string;
  mrn?: string;
};
type AppointmentSlot = {
  doctor_id: string;
  doctor_name: string;
  department?: string;
  specialty: string;
  location?: string;
  room?: string;
  scheduled_start: string;
  scheduled_end: string;
};
type DoctorAvailability = {
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  department?: string;
  location?: string;
  room?: string;
  slots: AppointmentSlot[];
};
type Step =
  | "mobile"
  | "otp"
  | "profiles"
  | "existing-profile"
  | "existing-reason"
  | "register-basic"
  | "register-extended"
  | "register-verify"
  | "register-reason"
  | "appointment-date"
  | "appointment-slot"
  | "done";

type AllergyDraft = {
  substance: string;
  drug_class: string;
  severity: "Mild" | "Moderate" | "Severe";
  reaction: string;
};

type DocumentDraft = {
  doc_type: string;
  file_name: string;
};

const emptyAllergy = (): AllergyDraft => ({
  substance: "",
  drug_class: "",
  severity: "Mild",
  reaction: "",
});

const emptyDocument = (): DocumentDraft => ({
  doc_type: "Lab Report",
  file_name: "",
});

const docTypes = ["Lab Report", "Discharge Summary", "Scan", "Audio", "Other"];
const bloodGroups = [
  ["UNK", "Unknown"],
  ["A+", "A+"],
  ["A-", "A-"],
  ["B+", "B+"],
  ["B-", "B-"],
  ["AB+", "AB+"],
  ["AB-", "AB-"],
  ["O+", "O+"],
  ["O-", "O-"],
];

// Maps each granular Step to the high-level stage shown in the sidebar tracker,
// so the aside can highlight exactly where the person is in the flow.
const STAGE_BY_STEP: Record<Step, number> = {
  mobile: 0,
  otp: 0,
  profiles: 1,
  "existing-profile": 1,
  "register-basic": 1,
  "register-extended": 1,
  "register-verify": 1,
  "existing-reason": 2,
  "register-reason": 2,
  "appointment-date": 3,
  "appointment-slot": 3,
  done: 3,
};

const STAGES = [
  { title: "Mobile OTP", copy: "No patient details are shown before verification." },
  { title: "Profile choice", copy: "Only first name, last name, and DOB are listed." },
  { title: "Visit reason", copy: "Describe the current issue before booking." },
  { title: "Appointment", copy: "Choose an available doctor and time." },
];

function errorText(e: unknown) {
  return e instanceof ApiError ? String(e.message) : "Something went wrong";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  return value.slice(11, 16);
}

function slotTimeLabel(value: string) {
  const [hours, minutes] = timeLabel(value).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

export default function CheckIn() {
  const setJourney = useJourney((s) => s.set);
  const [step, setStep] = useState<Step>("mobile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState("9876500011");
  const [otp, setOtp] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [patient, setPatient] = useState<any>(null);
  const [encounterId, setEncounterId] = useState("");
  const [reason, setReason] = useState("Fever and cough for 3 days");
  const [appointmentDate, setAppointmentDate] = useState(todayIso());
  const [appointmentSpecialty, setAppointmentSpecialty] = useState("");
  const [appointmentSlots, setAppointmentSlots] = useState<AppointmentSlot[]>([]);
  const [appointment, setAppointment] = useState<any>(null);
  const [paymentDone, setPaymentDone] = useState(false);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [basic, setBasic] = useState({ first_name: "", last_name: "", dob: "" });
  const [extended, setExtended] = useState({
    email: "",
    gender: "",
    blood_group: "UNK",
    address: "",
  });
  const [allergies, setAllergies] = useState<AllergyDraft[]>([emptyAllergy()]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([emptyDocument()]);

  const progress = useMemo(() => {
    const order: Step[] = [
      "mobile",
      "otp",
      "profiles",
      "existing-profile",
      "existing-reason",
      "register-basic",
      "register-extended",
      "register-verify",
      "register-reason",
      "appointment-date",
      "appointment-slot",
      "done",
    ];
    return Math.max(12, Math.round(((order.indexOf(step) + 1) / order.length) * 100));
  }, [step]);

  const activeStage = STAGE_BY_STEP[step];

  const availableDoctors = useMemo<DoctorAvailability[]>(() => {
    const doctors = new Map<string, DoctorAvailability>();
    for (const slot of appointmentSlots) {
      const doctor = doctors.get(slot.doctor_id);
      if (doctor) {
        doctor.slots.push(slot);
      } else {
        doctors.set(slot.doctor_id, {
          doctor_id: slot.doctor_id,
          doctor_name: slot.doctor_name,
          specialty: slot.specialty,
          department: slot.department,
          location: slot.location,
          room: slot.room,
          slots: [slot],
        });
      }
    }
    return [...doctors.values()];
  }, [appointmentSlots]);

  async function verifyMobile() {
    setBusy(true);
    setError("");
    try {
      await api.verifyOtp(mobile);
      const res = await api.mobileProfiles(mobile);
      setProfiles(res.profiles ?? []);
      setStep("profiles");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function allergyPayload() {
    return allergies
      .filter((a) => a.substance.trim())
      .map((a) => ({
        substance: a.substance.trim(),
        drug_class: a.drug_class.trim() || null,
        severity: a.severity.toUpperCase(),
        reaction: a.reaction.trim() || null,
      }));
  }

  function documentPayload() {
    return documents
      .filter((document) => document.file_name)
      .map((document) => ({
        doc_type: document.doc_type.toUpperCase().replace(/ /g, "_"),
        title: document.file_name,
        uri: null,
      }));
  }

  async function createBasicPatient() {
    setBusy(true);
    setError("");
    try {
      const res = await api.registerBasicPatient({ ...basic, mobile });
      setPatient(res.patient);
      setSelected({
        patient_id: res.patient.patient_id,
        first_name: basic.first_name,
        last_name: basic.last_name,
        dob: basic.dob,
      });
      setStep("register-extended");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration() {
    const patientId = selected?.patient_id ?? patient?.patient_id;
    if (!patientId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.updatePatientProfile(patientId, {
        email: extended.email,
        gender: extended.gender,
        blood_group: extended.blood_group,
        address: extended.address,
        allergies: allergyPayload(),
        documents: documentPayload(),
      });
      setPatient(res.patient);
      setStep("register-verify");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function completeCheckIn() {
    const patientId = selected?.patient_id ?? patient?.patient_id;
    if (!patientId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.checkin({ patient_id: patientId, mobile, channel: "KIOSK", reason });
      setPatient(res.patient);
      setEncounterId(res.encounter_id);
      setJourney({
        patientId: res.patient.patient_id,
        patientName: res.patient.name,
        encounterId: res.encounter_id,
      });
      setStep("appointment-date");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchAppointmentSlots() {
    if (!encounterId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.appointmentSlots({
        encounter_id: encounterId,
        appointment_date: appointmentDate,
        reason,
      });
      setAppointmentSpecialty(res.specialty);
      setAppointmentSlots(res.slots ?? []);
      setStep("appointment-slot");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function bookAppointment(slot: AppointmentSlot) {
    const patientId = selected?.patient_id ?? patient?.patient_id;
    if (!patientId || !encounterId) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.bookAppointment({
        encounter_id: encounterId,
        patient_id: patientId,
        doctor_id: slot.doctor_id,
        scheduled_start: slot.scheduled_start,
        scheduled_end: slot.scheduled_end,
        reason,
        specialty: slot.specialty,
        appointment_type: "OPD",
        channel: "KIOSK",
      });
      setAppointment(res.appointment);
      setStep("done");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function payForAppointment() {
    if (paymentDone) return;
    setPaymentDone(true);
    setShowPaymentPopup(true);
    window.setTimeout(() => setShowPaymentPopup(false), 1000);
  }

  const disabledBasic = !basic.first_name || !basic.last_name || !basic.dob;
  const disabledExtended = !extended.email || !extended.gender || !extended.blood_group || !extended.address;

  return (
    <div className="checkin-page space-y-5">
      <SectionTitle sub="Verify identity before showing patient information.">
        Digital check-in
      </SectionTitle>

      <div className="bar-tk" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card h-fit">
          {error && <div className="alertbox mb-4">{error}</div>}

          {step === "mobile" && (
            <div className="space-y-4">
              <StepHeader icon={<Phone size={20} />} title="Enter registered mobile number" />
              <Field label="Mobile number">
                <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
              <div className="actions-row center">
                <button className="btn" disabled={busy || mobile.length < 8} onClick={() => setStep("otp")}>
                  Send OTP <Send size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <StepHeader icon={<LockKeyhole size={20} />} title="Verify OTP" />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Enter the OTP sent to {mobile}. Demo verification uses the registered mobile number.
              </p>
              <Field label="OTP">
                <input
                  className="input"
                  value={otp}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 digit OTP"
                />
              </Field>
              <div className="actions-row between">
                <button className="btn-link" disabled={busy} onClick={() => setStep("mobile")}>
                  <ArrowLeft size={14} /> Change number
                </button>
                <button className="btn g" disabled={busy || otp.length !== 4} onClick={verifyMobile}>
                  Verify and fetch profiles <ShieldCheck size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "profiles" && (
            <div className="space-y-4">
              <StepHeader icon={<UserRound size={20} />} title="Select patient profile" />
              <div className="grid gap-3 md:grid-cols-2">
                {profiles.map((p) => (
                  <button
                    key={p.patient_id}
                    className="holo text-left"
                    onClick={() => {
                      setSelected(p);
                      setStep("existing-profile");
                    }}
                  >
                    <b>{p.first_name} {p.last_name}</b>
                    <span className="mt-1 block text-[12px]" style={{ color: "var(--muted)" }}>
                      Date of birth: {p.dob ?? "Not available"}
                    </span>
                  </button>
                ))}
              </div>
              {!profiles.length && (
                <div className="holo">No existing profile was found for this mobile number.</div>
              )}
              <div className="divider-row">
                <span>or</span>
              </div>
              <div className="actions-row center" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
                <button className="btn ghost" onClick={() => setStep("register-basic")}>
                  <Plus size={16} /> Register a new patient
                </button>
              </div>
            </div>
          )}

          {step === "existing-profile" && selected && (
            <div className="space-y-4">
              <StepHeader icon={<UserRound size={20} />} title="Confirm patient details" />
              <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                <Detail label="Patient name" value={`${selected.first_name} ${selected.last_name ?? ""}`.trim()} />
                <Detail label="Date of birth" value={selected.dob} />
                <Detail label="Gender" value={selected.gender} />
                <Detail label="Blood group" value={selected.blood_group === "UNK" ? "Unknown" : selected.blood_group} />
                <Detail label="Mobile number" value={selected.mobile} />
                <Detail label="Email" value={selected.email} />
                <Detail label="Address" value={selected.address} />
                <Detail label="MRN" value={selected.mrn} />
                <Detail label="ABHA number" value={selected.abha_number} />
              </div>
              <div className="actions-row between">
                <button className="btn-link" onClick={() => setStep("profiles")}>
                  <ArrowLeft size={14} /> Back to profiles
                </button>
                <button className="btn g" onClick={() => setStep("existing-reason")}>
                  Proceed <CheckCircle2 size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "existing-reason" && (
            <ReasonPanel busy={busy} reason={reason} setReason={setReason} onSubmit={completeCheckIn} onBack={() => setStep("existing-profile")} />
          )}

          {step === "register-basic" && (
            <div className="space-y-4">
              <StepHeader icon={<UserRound size={20} />} title="Basic registration details" />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="First name">
                  <input className="input" value={basic.first_name} onChange={(e) => setBasic({ ...basic, first_name: e.target.value })} />
                </Field>
                <Field label="Last name">
                  <input className="input" value={basic.last_name} onChange={(e) => setBasic({ ...basic, last_name: e.target.value })} />
                </Field>
                <Field label="Date of birth">
                  <input className="input" type="date" value={basic.dob} onChange={(e) => setBasic({ ...basic, dob: e.target.value })} />
                </Field>
                <Field label="Mobile number">
                  <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </Field>
              </div>
              <div className="actions-row between">
                <button className="btn-link" disabled={busy} onClick={() => setStep("profiles")}>
                  <ArrowLeft size={14} /> Back
                </button>
                <button className="btn" disabled={busy || disabledBasic} onClick={createBasicPatient}>
                  Create patient record <ClipboardPlus size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "register-extended" && (
            <div className="space-y-5">
              <StepHeader icon={<ClipboardPlus size={20} />} title="Extended information" />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Email">
                  <input className="input" type="email" value={extended.email} onChange={(e) => setExtended({ ...extended, email: e.target.value })} />
                </Field>
                <Field label="Gender">
                  <select className="input" value={extended.gender} onChange={(e) => setExtended({ ...extended, gender: e.target.value })}>
                    <option value="">Select gender</option>
                    <option>Female</option>
                    <option>Male</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Blood group">
                  <select className="input" value={extended.blood_group} onChange={(e) => setExtended({ ...extended, blood_group: e.target.value })}>
                    {bloodGroups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Address">
                  <input className="input" value={extended.address} onChange={(e) => setExtended({ ...extended, address: e.target.value })} />
                </Field>
              </div>

              <div className="subsection">
                <div className="subsection-head">
                  <span className="font-bold" style={{ color: "#d7e5ff" }}>Allergies</span>
                  <span className="text-[11px]" style={{ color: "var(--dim)" }}>Optional</span>
                </div>
                <div className="space-y-3">
                  {allergies.map((allergy, index) => (
                    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-4" style={{ borderColor: "var(--line2)" }} key={index}>
                      <input className="input" placeholder="Substance" value={allergy.substance} onChange={(e) => updateAllergy(index, "substance", e.target.value)} />
                      <input className="input" placeholder="Drug class, if known" value={allergy.drug_class} onChange={(e) => updateAllergy(index, "drug_class", e.target.value)} />
                      <select className="input" value={allergy.severity} onChange={(e) => updateAllergy(index, "severity", e.target.value)}>
                        <option>Mild</option>
                        <option>Moderate</option>
                        <option>Severe</option>
                      </select>
                      <input className="input" placeholder="Reaction" value={allergy.reaction} onChange={(e) => updateAllergy(index, "reaction", e.target.value)} />
                    </div>
                  ))}
                  <button className="btn ghost sm" onClick={() => setAllergies((prev) => [...prev, emptyAllergy()])}>
                    <Plus size={14} /> Add allergy
                  </button>
                </div>
              </div>

              <div className="subsection">
                <div className="subsection-head">
                  <span className="font-bold" style={{ color: "#d7e5ff" }}>Documents</span>
                  <span className="text-[11px]" style={{ color: "var(--dim)" }}>Optional</span>
                </div>
                <div className="space-y-3">
                  {documents.map((document, index) => (
                    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-2" style={{ borderColor: "var(--line2)" }} key={index}>
                      <Field label="Document type">
                        <select className="input" value={document.doc_type} onChange={(e) => updateDocument(index, "doc_type", e.target.value)}>
                          {docTypes.map((d) => <option key={d}>{d}</option>)}
                        </select>
                      </Field>
                      <Field label="Upload file">
                        <input
                          className="input file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1 file:font-bold"
                          type="file"
                          onChange={(e) => updateDocument(index, "file_name", e.target.files?.[0]?.name ?? "")}
                        />
                      </Field>
                    </div>
                  ))}
                  <button className="btn ghost sm" onClick={() => setDocuments((prev) => [...prev, emptyDocument()])}>
                    <Plus size={14} /> Add document
                  </button>
                </div>
              </div>

              <div className="actions-row center">
                <button className="btn g" disabled={busy || disabledExtended} onClick={completeRegistration}>
                  Complete registration <FileUp size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "register-verify" && (
            <div className="space-y-4">
              <StepHeader icon={<ShieldCheck size={20} />} title="Identity verified" />
              <div className="holo">
                Mobile OTP was already verified before registration, so this patient can continue check-in.
              </div>
              <div className="actions-row center">
                <button className="btn g" onClick={() => setStep("register-reason")}>
                  Continue <CheckCircle2 size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "register-reason" && (
            <ReasonPanel busy={busy} reason={reason} setReason={setReason} onSubmit={completeCheckIn} onBack={() => setStep("register-verify")} />
          )}

          {step === "done" && (
            <div className="space-y-4">
              <StepHeader icon={<CheckCircle2 size={20} />} title="Check-in complete" />
              <div className="kv"><span>Patient</span><b>{patient?.name}</b></div>
              <div className="kv"><span>Status</span><b style={{ color: "var(--mint)" }}>Appointment booked</b></div>
              {appointment && (
                <div className="holo">
                  <b>{appointment.doctor?.name}</b>
                  <span className="mt-1 block text-[12px]" style={{ color: "var(--muted)" }}>
                    {appointment.specialty} · {timeLabel(appointment.scheduled_start)} on {appointment.scheduled_start.slice(0, 10)}
                  </span>
                </div>
              )}
              <button className="btn g w-full" disabled={paymentDone} onClick={payForAppointment}>
                <CreditCard size={16} /> {paymentDone ? "Paid" : "Pay"}
              </button>
            </div>
          )}

          {step === "appointment-date" && (
            <div className="space-y-4">
              <StepHeader icon={<ClipboardPlus size={20} />} title="Book appointment" />
              <Field label="Appointment date">
                <input className="input" type="date" min={todayIso()} value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
              </Field>
              <div className="actions-row center">
                <button className="btn g" disabled={busy || !appointmentDate} onClick={fetchAppointmentSlots}>
                  Show available doctors <CheckCircle2 size={16} />
                </button>
              </div>
            </div>
          )}

          {step === "appointment-slot" && (
            <div className="space-y-4">
              <StepHeader icon={<UserRound size={20} />} title="Available doctors" />
              <div className="grid gap-x-6 md:grid-cols-2">
                <Detail label="Selected date" value={appointmentDate} />
                <Detail label="Specialty" value={appointmentSpecialty} />
              </div>
              {!availableDoctors.length && (
                <div className="holo">No available slots for this specialty on the selected date.</div>
              )}
              <div className="space-y-3">
                {availableDoctors.map((doctor) => (
                  <div className="holo overflow-hidden" key={doctor.doctor_id}>
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <b className="block text-sm">{doctor.doctor_name}</b>
                        <span className="mt-0.5 block text-[12px]" style={{ color: "var(--muted)" }}>
                          {doctor.specialty}
                        </span>
                      </div>
                      {(doctor.room || doctor.location) && (
                        <span className="text-[11px]" style={{ color: "var(--dim)" }}>
                          {[doctor.room, doctor.location].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex min-w-max gap-2">
                        {doctor.slots.map((slot) => (
                          <button
                            key={slot.scheduled_start}
                            className="appointment-time-slot"
                            disabled={busy}
                            onClick={() => bookAppointment(slot)}
                          >
                            {slotTimeLabel(slot.scheduled_start)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="actions-row start">
                <button className="btn-link" disabled={busy} onClick={() => setStep("appointment-date")}>
                  <ArrowLeft size={14} /> Change date
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="card h-fit">
          <div className="space-y-3">
            {STAGES.map((s, i) => {
              const isActive = i === activeStage;
              const isDone = i < activeStage;
              return (
                <div key={s.title} className={`stage-item ${isActive ? "is-active" : ""}`}>
                  <span className={`stage-num ${isActive ? "is-active" : ""} ${isDone ? "is-done" : ""}`}>
                    {isDone ? <CheckCircle2 size={14} /> : i + 1}
                  </span>
                  <div>
                    <div className="font-bold" style={{ color: isActive ? "#eafcff" : "#d7e5ff" }}>{s.title}</div>
                    <div className="text-[12px]" style={{ color: "var(--muted)" }}>{s.copy}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {showPaymentPopup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="status" aria-live="polite">
          <div className="card w-full max-w-sm text-center">
            <CheckCircle2 className="mx-auto mb-3" size={44} color="var(--mint)" />
            <h3 className="text-lg font-extrabold" style={{ color: "#e8eefc" }}>Payment done</h3>
          </div>
        </div>
      )}
    </div>
  );

  function updateAllergy(index: number, key: keyof AllergyDraft, value: string) {
    setAllergies((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
  }

  function updateDocument(index: number, key: keyof DocumentDraft, value: string) {
    setDocuments((prev) => prev.map((document, i) => (i === index ? { ...document, [key]: value } : document)));
  }
}

function StepHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--panel2)", border: "1px solid var(--line2)", color: "var(--cyan)" }}>
        {icon}
      </span>
      <h3 className="text-lg font-extrabold" style={{ color: "#e8eefc" }}>{title}</h3>
    </div>
  );
}

function ReasonPanel({
  busy,
  reason,
  setReason,
  onSubmit,
  onBack,
}: {
  busy: boolean;
  reason: string;
  setReason: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="space-y-4">
      <StepHeader icon={<ClipboardPlus size={20} />} title="Current issue or reason for visit" />
      <textarea
        className="input min-h-[120px]"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Describe symptoms or reason for visit"
      />
      <div className="actions-row between">
        {onBack ? (
          <button className="btn-link" disabled={busy} onClick={onBack}>
            <ArrowLeft size={14} /> Back
          </button>
        ) : <span />}
        <button className="btn g" disabled={busy || !reason.trim()} onClick={onSubmit}>
          Book appointment <CheckCircle2 size={16} />
        </button>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="kv min-w-0">
      <span>{label}</span>
      <b className="truncate text-right">{value || "Not available"}</b>
    </div>
  );
}

function LegacyWhatsAppCheckIn() {
  const setJourney = useJourney((s) => s.set);
  const [abha, setAbha] = useState("91-2345-6789-0123");
  const [reason, setReason] = useState("Fever and cough for 3 days");
  const [step, setStep] = useState<"abha" | "reason" | "done">("abha");
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: "bot", text: "Welcome to Aarogya. Scan your ABHA QR or share your ABHA number to check in." },
  ]);

  const push = (m: Msg) => setMsgs((prev) => [...prev, m]);

  async function doCheckin() {
    setBusy(true);
    push({ who: "me", text: `ABHA: ${abha}` });
    try {
      const res = await api.checkin({ abha_number: abha, channel: "WHATSAPP", reason });
      setPatient(res.patient);
      setJourney({ patientId: res.patient.patient_id, patientName: res.patient.name, encounterId: res.encounter_id });
      push({ who: "bot", text: `Identity confirmed: ${res.patient.name} (${res.patient.gender}, ${res.patient.age}). What brings you in today?` });
      setStep("reason");
    } catch (e) {
      const msg = e instanceof ApiError ? String(e.message) : "Something went wrong";
      push({ who: "bot", text: `${msg}. Please register at the front desk.` });
    } finally {
      setBusy(false);
    }
  }

  async function doIntake() {
    setBusy(true);
    push({ who: "me", text: reason });
    try {
      const res = await api.intakePreview(reason);
      const r = res.result;
      push({ who: "bot", text: r.symptom_summary });
      if (r.red_flags?.length) {
        push({ who: "bot", text: `Red flag noted: ${r.red_flags.join(" ")} You'll be prioritised.` });
      }
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="device mx-auto max-w-[360px]" style={{ borderRadius: 30 }}>
      <DeviceBar right={<span className="ml-auto text-[11px]" style={{ color: "var(--mint)" }}>secure chat</span>} />
      <div className="p-4">
        <div className="flex flex-col">
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.who === "me" ? "me" : ""}`}>{m.text}</div>
          ))}
        </div>

        {step === "abha" && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-xl px-2 py-1" style={{ background: "rgba(0,0,0,.35)", border: "1px solid var(--line2)" }}>
              <QrCode size={18} color="var(--cyan)" />
              <input className="input !border-0 !bg-transparent" value={abha} onChange={(e) => setAbha(e.target.value)} />
            </div>
            <button className="btn g w-full" disabled={busy} onClick={doCheckin}>Check in</button>
          </div>
        )}

        {step === "reason" && (
          <div className="mt-3 space-y-2">
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe your symptoms" />
            <button className="btn w-full" disabled={busy} onClick={doIntake}>
              Send <Send size={15} />
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="mt-3 space-y-2">
            <div className="kv"><span>Status</span><b style={{ color: "var(--mint)" }}>Ready - no queue</b></div>
          </div>
        )}
      </div>
    </div>
  );
}