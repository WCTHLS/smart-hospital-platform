import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LockKeyhole, Phone, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { getPortalPatient, savePortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { Card, Field } from "../../components/ui";

type LoginStep = "mobile" | "otp" | "profiles" | "register" | "medical";
type IssueDraft = { issue_name: string; onset_info: string };
type DocumentDraft = { title: string; doc_type: string; uri: string; file_name: string };

const emptyIssue = (): IssueDraft => ({ issue_name: "", onset_info: "" });
const emptyDocument = (): DocumentDraft => ({ title: "", doc_type: "", uri: "", file_name: "" });

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function safeRedirect(value: string | null) {
  const path = value?.split("?")[0];
  return path === "/patient" || path === "/patient/checkin" ? value! : "/patient";
}

export default function PatientLogin() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const setJourney = useJourney((state) => state.set);
  const redirect = safeRedirect(params.get("redirect"));
  const [step, setStep] = useState<LoginStep>("mobile");
  const [mobile, setMobile] = useState("6281116923");
  const [otp, setOtp] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registration, setRegistration] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    email: "",
    gender: "",
    blood_group: "",
    address: "",
  });
  const [issues, setIssues] = useState<IssueDraft[]>([emptyIssue()]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([emptyDocument()]);

  if (getPortalPatient()) return <Navigate to={redirect} replace />;

  async function sendOtp() {
    setBusy(true);
    setError("");
    try {
      await api.sendOtp(mobile.trim());
      setOtp("");
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError("");
    try {
      await api.verifyOtp(mobile.trim(), otp);
      const result = await api.mobileProfiles(mobile.trim());
      const matches = result.profiles ?? [];
      setProfiles(matches);
      setStep(matches.length ? "profiles" : "register");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to verify OTP");
    } finally {
      setBusy(false);
    }
  }

  async function registerPatient() {
    setBusy(true);
    setError("");
    try {
      const result = await api.registerPatient({
        ...registration,
        mobile: mobile.trim(),
        issues: issues.filter((item) => item.issue_name.trim()).map((item) => ({
          issue_name: item.issue_name.trim(),
          onset_info: item.onset_info.trim() || null,
          status: "ACTIVE",
        })),
        documents: documents.filter((item) => item.title.trim() && item.uri).map((item) => ({
          title: item.title.trim(),
          doc_type: item.doc_type,
          uri: item.uri,
        })),
      });
      const profile = result.patient;
      const name = profile.name || `${registration.first_name} ${registration.last_name}`.trim();
      await api.consent(profile.patient_id);
      savePortalPatient({
        patient_id: profile.patient_id,
        name,
        mobile: mobile.trim(),
        first_name: registration.first_name,
        last_name: registration.last_name,
        dob: registration.dob,
        email: registration.email,
      });
      setJourney({ patientId: profile.patient_id, patientName: name });
      nav(redirect, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to register patient");
    } finally {
      setBusy(false);
    }
  }

  async function selectDocumentFile(index: number, file?: File) {
    if (!file) return;
    const uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setDocuments((items) => items.map((item, itemIndex) => itemIndex === index
      ? { ...item, uri, file_name: file.name }
      : item));
  }

  const demographicsValid = Boolean(
    registration.first_name.trim()
    && registration.last_name.trim()
    && registration.dob
    && registration.dob <= todayIso()
    && (!registration.email.trim() || validEmail(registration.email))
    && registration.gender
    && /^\d{10}$/.test(mobile.trim())
  );

  const medicalDetailsValid = documents.every((item) => (!item.title.trim() && !item.uri && !item.doc_type)
      || Boolean(item.title.trim() && item.doc_type && item.uri));

  async function login(profile: any) {
    setBusy(true);
    setError("");
    try {
      const name = `${profile.first_name} ${profile.last_name ?? ""}`.trim();
      await api.consent(profile.patient_id);
      savePortalPatient({ ...profile, name, mobile });
      setJourney({ patientId: profile.patient_id, patientName: name });
      nav(redirect, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Unable to open this patient profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`patient-page mx-auto my-2 sm:my-8 lg:my-12 ${step === "register" || step === "medical" ? "max-w-3xl" : "max-w-md"}`}>
      <Card className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))" }}>
            <ShieldCheck size={24} color="#04121a" />
          </div>
          <h2 className="grad-text text-2xl font-extrabold">Patient login</h2>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>Verify your mobile number to continue securely.</p>
        </div>

        {error && <div className="alertbox text-sm">{error}</div>}

        {step === "mobile" && <div className="space-y-4">
          <label className="block text-sm font-semibold">Registered mobile number</label>
          <div className="relative">
            <Phone size={15} className="absolute left-3 top-3" color="var(--dim)" />
            <input className="input pl-9" inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="6281116923" />
          </div>
          <button className="btn w-full" disabled={busy || !/^\d{10}$/.test(mobile)} onClick={sendOtp}>{busy ? "Sending..." : "Send OTP"}</button>
        </div>}

        {step === "otp" && <div className="space-y-4">
          <div className="flex items-center gap-2"><LockKeyhole size={16} /> OTP sent to {mobile}</div>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter OTP" />
          <div className="actions-row between !mt-0 !border-0 !pt-0">
            <button className="btn-link" disabled={busy} onClick={() => setStep("mobile")}><ArrowLeft size={14} /> Change number</button>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button className="btn ghost sm" disabled={busy} onClick={sendOtp}>Resend OTP</button>
              <button className="btn g" disabled={busy || otp.length < 1} onClick={verifyOtp}>{busy ? "Verifying..." : "Verify OTP"}</button>
            </div>
          </div>
        </div>}

        {step === "profiles" && <div className="space-y-3">
          <h3 className="font-bold">Select patient profile</h3>
          {!profiles.length && <div className="holo text-sm">No profile was found for this mobile number.</div>}
          {profiles.map((profile) => <button key={profile.patient_id} className="holo w-full text-left" disabled={busy} onClick={() => login(profile)}>
            <b>{profile.first_name} {profile.last_name}</b>
            <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>DOB: {profile.dob ?? "Not available"}</span>
          </button>)}
          <button className="btn ghost w-full" disabled={busy} onClick={() => setStep("register")}>
            <UserPlus size={16} /> Register new patient
          </button>
        </div>}

        {step === "register" && <div className="space-y-4">
          <div className="holo text-sm">
            {profiles.length
              ? `Register another patient with mobile number ${mobile}.`
              : `No patient profile was found for ${mobile}. Register a new patient to continue.`}
          </div>
          <div className="flex items-center gap-2 font-bold"><UserPlus size={18} /> New patient registration</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name"><input className="input" value={registration.first_name} onChange={(e) => setRegistration({ ...registration, first_name: e.target.value })} /></Field>
            <Field label="Last name"><input className="input" value={registration.last_name} onChange={(e) => setRegistration({ ...registration, last_name: e.target.value })} /></Field>
            <Field label="Date of birth"><input className="input" type="date" max={todayIso()} value={registration.dob} onChange={(e) => setRegistration({ ...registration, dob: e.target.value })} /></Field>
            <Field label="Mobile number"><input className="input" value={mobile} disabled /></Field>
            <Field label="Email (Optional)"><input className="input" type="email" value={registration.email} onChange={(e) => setRegistration({ ...registration, email: e.target.value })} placeholder="patient@example.com" /></Field>
            <Field label="Gender"><select className="input" value={registration.gender} onChange={(e) => setRegistration({ ...registration, gender: e.target.value })}><option value="">Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Unknown</option></select></Field>
            <Field label="Blood group (Optional)"><select className="input" value={registration.blood_group} onChange={(e) => setRegistration({ ...registration, blood_group: e.target.value })}><option value="">Select blood group</option><option value="UNK">Unknown</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></select></Field>
            <Field label="Address (Optional)"><input className="input" value={registration.address} onChange={(e) => setRegistration({ ...registration, address: e.target.value })} /></Field>
          </div>
          <div className="actions-row between">
            <button className="btn-link" disabled={busy} onClick={() => setStep(profiles.length ? "profiles" : "mobile")}>
              <ArrowLeft size={14} /> {profiles.length ? "Back to profiles" : "Change number"}
            </button>
            <button
              className="btn g"
              disabled={busy || !demographicsValid}
              onClick={() => setStep("medical")}
            >
              Next
            </button>
          </div>
        </div>}

        {step === "medical" && <div className="space-y-6">
          <div>
            <h3 className="font-bold">Medical History & Documents</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Add any existing health conditions, previous major surgeries, or relevant medical files. Leave empty if none apply.</p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold">Medical History & Previous Surgeries</h4>
              <button className="btn ghost sm" onClick={() => setIssues((items) => [...items, emptyIssue()])}><Plus size={14} /> Add condition / surgery</button>
            </div>
            {issues.map((issue, index) => <div className="holo grid gap-3 sm:grid-cols-2" key={index}>
              <Field label="Condition or Surgery"><input className="input" value={issue.issue_name} onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, issue_name: e.target.value } : item))} placeholder="e.g. Diabetes, BP, Heart surgery" /></Field>
              <Field label="How long ago / onset info (Optional)"><input className="input" value={issue.onset_info} onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, onset_info: e.target.value } : item))} placeholder="e.g. 5 years, 3 months ago, 2024" /></Field>
            </div>)}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold">Documents</h4>
              <button className="btn ghost sm" onClick={() => setDocuments((items) => [...items, emptyDocument()])}><Plus size={14} /> Add document</button>
            </div>
            {documents.map((document, index) => <div className="holo grid gap-3 sm:grid-cols-2" key={index}>
              <Field label="Document title"><input className="input" value={document.title} onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} placeholder="e.g. CBC report" /></Field>
              <Field label="Document type"><select className="input" value={document.doc_type} onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, doc_type: e.target.value } : item))}><option value="">Select document type</option><option value="LAB_REPORT">LAB_REPORT</option><option value="DISCHARGE">DISCHARGE</option><option value="SCAN">SCAN</option><option value="AUDIO">AUDIO</option></select></Field>
              <Field label="Upload file"><input className="input sm:col-span-2" type="file" onChange={(e) => selectDocumentFile(index, e.target.files?.[0])} /></Field>
              {document.file_name && <div className="text-xs" style={{ color: "var(--mint)" }}>Selected: {document.file_name}</div>}
            </div>)}
          </div>

          <div className="actions-row between">
            <button className="btn-link" disabled={busy} onClick={() => setStep("register")}><ArrowLeft size={14} /> Back</button>
            <button className="btn g" disabled={busy || !medicalDetailsValid} onClick={registerPatient}>{busy ? "Registering..." : "Register and continue"}</button>
          </div>
        </div>}
      </Card>
    </div>
  );
}
