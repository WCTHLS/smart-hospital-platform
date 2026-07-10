import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardPlus,
  FileUp,
  LockKeyhole,
  Phone,
  Plus,
  QrCode,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useJourney } from "../lib/store";
import { DeviceBar, Field, SectionTitle } from "../components/ui";

type Msg = { who: "bot" | "me"; text: string };
type Profile = { patient_id: string; first_name: string; last_name?: string; dob?: string };
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
type Step =
  | "mobile"
  | "otp"
  | "profiles"
  | "existing-consent"
  | "existing-reason"
  | "register-consent"
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

const emptyAllergy = (): AllergyDraft => ({
  substance: "",
  drug_class: "",
  severity: "Mild",
  reaction: "",
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

function errorText(e: unknown) {
  return e instanceof ApiError ? String(e.message) : "Something went wrong";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  return value.slice(11, 16);
}

export default function CheckIn() {
  const nav = useNavigate();
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
  const [basic, setBasic] = useState({ first_name: "", last_name: "", dob: "" });
  const [extended, setExtended] = useState({
    email: "",
    gender: "",
    blood_group: "UNK",
    address: "",
    doc_type: "Lab Report",
    doc_title: "",
    doc_uri: "",
  });
  const [allergies, setAllergies] = useState<AllergyDraft[]>([emptyAllergy()]);

  const progress = useMemo(() => {
    const order: Step[] = [
      "mobile",
      "otp",
      "profiles",
      "existing-consent",
      "existing-reason",
      "register-consent",
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

  async function grantExistingConsent() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.consent(selected.patient_id);
      setStep("existing-reason");
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
    if (!extended.doc_title.trim() && !extended.doc_uri.trim()) return [];
    return [{
      doc_type: extended.doc_type.toUpperCase().replace(/ /g, "_"),
      title: extended.doc_title.trim() || extended.doc_type,
      uri: extended.doc_uri.trim() || null,
    }];
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

  const disabledBasic = !basic.first_name || !basic.last_name || !basic.dob;
  const disabledExtended = !extended.email || !extended.gender || !extended.blood_group || !extended.address;

  return (
    <div className="space-y-5">
      <SectionTitle sub="Verify identity before showing patient information.">
        Digital check-in
      </SectionTitle>

      <div className="bar-tk" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card">
          {error && <div className="alertbox mb-4">{error}</div>}

          {step === "mobile" && (
            <div className="space-y-4">
              <StepHeader icon={<Phone size={20} />} title="Enter registered mobile number" />
              <Field label="Mobile number">
                <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
              <button className="btn" disabled={busy || mobile.length < 8} onClick={() => setStep("otp")}>
                Send OTP <Send size={16} />
              </button>
            </div>
          )}

          {step === "otp" && (
            <div className="space-y-4">
              <StepHeader icon={<LockKeyhole size={20} />} title="Verify OTP" />
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Enter the OTP sent to {mobile}. Demo verification uses the registered mobile number.
              </p>
              <Field label="OTP">
                <input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6 digit OTP" />
              </Field>
              <button className="btn g" disabled={busy || otp.length < 4} onClick={verifyMobile}>
                Verify and fetch profiles <ShieldCheck size={16} />
              </button>
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
                      setStep("existing-consent");
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
              <button className="btn ghost" onClick={() => setStep("register-consent")}>
                <Plus size={16} /> Register
              </button>
            </div>
          )}

          {step === "existing-consent" && selected && (
            <ConsentPanel
              title={`Grant access for ${selected.first_name} ${selected.last_name ?? ""}`}
              copy="Allow the care team to access existing health records for this visit."
              busy={busy}
              onGrant={grantExistingConsent}
            />
          )}

          {step === "existing-reason" && (
            <ReasonPanel busy={busy} reason={reason} setReason={setReason} onSubmit={completeCheckIn} />
          )}

          {step === "register-consent" && (
            <ConsentPanel
              title="Consent to store health records"
              copy="Allow this hospital to create and store a patient health record."
              busy={busy}
              onGrant={() => setStep("register-basic")}
            />
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
              <button className="btn" disabled={busy || disabledBasic} onClick={createBasicPatient}>
                Create patient record <ClipboardPlus size={16} />
              </button>
            </div>
          )}

          {step === "register-extended" && (
            <div className="space-y-4">
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

              <div className="space-y-3">
                <div className="font-bold" style={{ color: "#d7e5ff" }}>Allergies</div>
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
                <button className="btn ghost" onClick={() => setAllergies((prev) => [...prev, emptyAllergy()])}>
                  <Plus size={16} /> Allergy
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Document type">
                  <select className="input" value={extended.doc_type} onChange={(e) => setExtended({ ...extended, doc_type: e.target.value })}>
                    {docTypes.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Document title">
                  <input className="input" value={extended.doc_title} onChange={(e) => setExtended({ ...extended, doc_title: e.target.value })} />
                </Field>
                <Field label="Document link">
                  <input className="input" value={extended.doc_uri} onChange={(e) => setExtended({ ...extended, doc_uri: e.target.value })} />
                </Field>
              </div>

              <button className="btn g" disabled={busy || disabledExtended} onClick={completeRegistration}>
                Complete registration <FileUp size={16} />
              </button>
            </div>
          )}

          {step === "register-verify" && (
            <div className="space-y-4">
              <StepHeader icon={<ShieldCheck size={20} />} title="Identity verified" />
              <div className="holo">
                Mobile OTP was already verified before registration, so this patient can continue check-in.
              </div>
              <button className="btn g" onClick={() => setStep("register-reason")}>
                Continue <CheckCircle2 size={16} />
              </button>
            </div>
          )}

          {step === "register-reason" && (
            <ReasonPanel busy={busy} reason={reason} setReason={setReason} onSubmit={completeCheckIn} />
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
              <button className="btn w-full" onClick={() => nav("/triage", { state: { symptom: reason } })}>
                Proceed to triage
              </button>
            </div>
          )}

          {step === "appointment-date" && (
            <div className="space-y-4">
              <StepHeader icon={<ClipboardPlus size={20} />} title="Book appointment" />
              <div className="holo">
                The visit reason will be mapped to the right specialty before showing doctors.
              </div>
              <Field label="Appointment date">
                <input className="input" type="date" min={todayIso()} value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
              </Field>
              <button className="btn g" disabled={busy || !appointmentDate} onClick={fetchAppointmentSlots}>
                Show available doctors <CheckCircle2 size={16} />
              </button>
            </div>
          )}

          {step === "appointment-slot" && (
            <div className="space-y-4">
              <StepHeader icon={<UserRound size={20} />} title="Select doctor and time" />
              <div className="kv"><span>Mapped specialty</span><b>{appointmentSpecialty}</b></div>
              {!appointmentSlots.length && (
                <div className="holo">No available slots for this specialty on the selected date.</div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {appointmentSlots.map((slot) => (
                  <button
                    key={`${slot.doctor_id}-${slot.scheduled_start}`}
                    className="holo text-left"
                    disabled={busy}
                    onClick={() => bookAppointment(slot)}
                  >
                    <b>{slot.doctor_name}</b>
                    <span className="mt-1 block text-[12px]" style={{ color: "var(--muted)" }}>
                      {timeLabel(slot.scheduled_start)} - {timeLabel(slot.scheduled_end)}
                      {slot.room ? ` · ${slot.room}` : ""}
                    </span>
                  </button>
                ))}
              </div>
              <button className="btn ghost" disabled={busy} onClick={() => setStep("appointment-date")}>
                Change date
              </button>
            </div>
          )}
        </section>

        <aside className="card h-fit">
          <div className="space-y-3">
            {[
              ["1", "Mobile OTP", "No patient details are shown before verification."],
              ["2", "Profile choice", "Only first name, last name, and DOB are listed."],
              ["3", "Consent", "Existing records are accessed only after consent."],
              ["4", "Appointment", "Reason maps to specialty before triage."],
            ].map(([n, title, copy]) => (
              <div key={n} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--panel2)", border: "1px solid var(--line2)" }}>{n}</span>
                <div>
                  <div className="font-bold" style={{ color: "#d7e5ff" }}>{title}</div>
                  <div className="text-[12px]" style={{ color: "var(--muted)" }}>{copy}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );

  function updateAllergy(index: number, key: keyof AllergyDraft, value: string) {
    setAllergies((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
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

function ConsentPanel({ title, copy, busy, onGrant }: { title: string; copy: string; busy: boolean; onGrant: () => void }) {
  return (
    <div className="space-y-4">
      <StepHeader icon={<ShieldCheck size={20} />} title={title} />
      <div className="holo">{copy}</div>
      <button className="btn g" disabled={busy} onClick={onGrant}>
        Grant consent <ShieldCheck size={16} />
      </button>
    </div>
  );
}

function ReasonPanel({
  busy,
  reason,
  setReason,
  onSubmit,
}: {
  busy: boolean;
  reason: string;
  setReason: (value: string) => void;
  onSubmit: () => void;
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
      <button className="btn g" disabled={busy || !reason.trim()} onClick={onSubmit}>
        Complete check-in <CheckCircle2 size={16} />
      </button>
    </div>
  );
}

function LegacyWhatsAppCheckIn() {
  const nav = useNavigate();
  const setJourney = useJourney((s) => s.set);
  const [abha, setAbha] = useState("91-2345-6789-0123");
  const [reason, setReason] = useState("Fever and cough for 3 days");
  const [step, setStep] = useState<"abha" | "reason" | "consent" | "done">("abha");
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
      setStep("consent");
    } finally {
      setBusy(false);
    }
  }

  async function doConsent() {
    if (!patient) return;
    setBusy(true);
    try {
      await api.consent(patient.patient_id);
      push({ who: "bot", text: "Consent granted. Your records are available to your care team for this visit only." });
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

        {step === "consent" && (
          <div className="mt-3">
            <div className="holo mb-2 flex items-center gap-2">
              <ShieldCheck size={16} color="var(--cyan)" />
              <span>Grant access to your health records for this visit.</span>
            </div>
            <button className="btn g w-full" disabled={busy} onClick={doConsent}>Grant consent</button>
          </div>
        )}

        {step === "done" && (
          <div className="mt-3 space-y-2">
            <div className="kv"><span>Status</span><b style={{ color: "var(--mint)" }}>Ready - no queue</b></div>
            <button className="btn w-full" onClick={() => nav("/triage", { state: { symptom: reason } })}>
              Proceed to triage
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
