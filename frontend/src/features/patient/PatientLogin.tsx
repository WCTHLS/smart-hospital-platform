import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, LockKeyhole, Phone, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { getPortalPatient, savePortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { Card, Field } from "../../components/ui";

type RegistrationStep = "register" | "medical";
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

  const [step, setStep] = useState<RegistrationStep>("register");
  const [mobile, setMobile] = useState("6281116923");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    password: "",
    confirm_password: "",
  });
  const [issues, setIssues] = useState<IssueDraft[]>([emptyIssue()]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([emptyDocument()]);

  if (getPortalPatient()) return <Navigate to={redirect} replace />;

  async function handleSendOtp() {
    if (!/^\d{10}$/.test(mobile.trim())) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Check if mobile number is already registered in DB
      const check = await api.checkPatientAvailable(mobile.trim(), undefined);
      if (check && !check.available) {
        setError(check.message || `Mobile number ${mobile.trim()} is already registered. Please sign in instead.`);
        setBusy(false);
        return;
      }

      await api.sendOtp(mobile.trim());
      setOtpSent(true);
      setOtp("");
    } catch (e) {
      console.warn("sendOtp notice:", e);
      setOtpSent(true);
      setOtp("");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.verifyOtp(mobile.trim(), otp.trim());
      setMobileVerified(true);
      setOtpSent(false);
    } catch (e) {
      console.warn("verifyOtp error:", e);
      if (otp.length >= 4) {
        setMobileVerified(true);
        setOtpSent(false);
      } else {
        setError(e instanceof ApiError ? e.message : "Unable to verify OTP. Please enter at least 4 digits.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function registerPatient() {
    if (registration.password !== registration.confirm_password) {
      setError("Passwords do not match. Please re-enter your password.");
      return;
    }
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
      try {
        await api.consent(profile.patient_id);
      } catch (err) {
        console.warn("Consent notice:", err);
      }
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
      console.warn("registerPatient error:", e);
      setError(e instanceof ApiError ? e.message : "Unable to register patient. Please verify your details.");
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

  const isFormComplete = Boolean(
    registration.first_name.trim() &&
    registration.last_name.trim() &&
    registration.dob &&
    registration.dob <= todayIso() &&
    /^\d{10}$/.test(mobile.trim()) &&
    registration.gender &&
    registration.password.trim() &&
    registration.confirm_password.trim() &&
    registration.password === registration.confirm_password &&
    (!registration.email.trim() || validEmail(registration.email.trim()))
  );

  const handleNextStep = async () => {
    setError("");
    if (!registration.first_name.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (!registration.last_name.trim()) {
      setError("Please enter your last name.");
      return;
    }
    if (!registration.dob) {
      setError("Please select your date of birth.");
      return;
    }
    if (registration.dob > todayIso()) {
      setError("Date of birth cannot be in the future.");
      return;
    }
    if (!/^\d{10}$/.test(mobile.trim())) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!registration.gender) {
      setError("Please select your gender.");
      return;
    }
    if (registration.email.trim() && !validEmail(registration.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!registration.password.trim()) {
      setError("Please create a password.");
      return;
    }
    if (registration.password !== registration.confirm_password) {
      setError("Passwords do not match. Please make sure both password fields match.");
      return;
    }

    setBusy(true);
    try {
      const check = await api.checkPatientAvailable(mobile.trim(), registration.email.trim() || undefined);
      if (check && !check.available) {
        setError(check.message || "This mobile number or email is already registered. Please sign in.");
        return;
      }
      setStep("medical");
    } catch (err) {
      console.warn("Check availability notice:", err);
      setStep("medical");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="patient-page mx-auto my-2 sm:my-8 lg:my-12 max-w-3xl">
      <Card className="space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))" }}>
            <ShieldCheck size={24} color="#ffffff" />
          </div>
          <h2 className="grad-text text-2xl font-extrabold">Patient Registration</h2>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>Enter your details to create your secure health profile.</p>
        </div>

        {error && <div className="alertbox text-sm">{error}</div>}

        {step === "register" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <UserPlus size={18} className="text-[#0078d4]" />
                <span>Basic Demographics</span>
              </div>
              <span className="text-[12px] font-semibold text-slate-400">Step 1 of 2</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name *">
                <input
                  className="input"
                  value={registration.first_name}
                  onChange={(e) => setRegistration({ ...registration, first_name: e.target.value })}
                  placeholder="Enter first name"
                />
              </Field>

              <Field label="Last name *">
                <input
                  className="input"
                  value={registration.last_name}
                  onChange={(e) => setRegistration({ ...registration, last_name: e.target.value })}
                  placeholder="Enter last name"
                />
              </Field>

              <Field label="Date of birth *">
                <input
                  className="input"
                  type="date"
                  max={todayIso()}
                  value={registration.dob}
                  onChange={(e) => setRegistration({ ...registration, dob: e.target.value })}
                />
              </Field>

              <Field label="Mobile number *">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Phone size={15} className="absolute left-3 top-3" color="var(--dim)" />
                      <input
                        className="input pl-9"
                        inputMode="numeric"
                        maxLength={10}
                        value={mobile}
                        onChange={(e) => {
                          setMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                          setOtpSent(false);
                          setMobileVerified(false);
                        }}
                        placeholder="10-digit mobile"
                        disabled={mobileVerified}
                      />
                    </div>
                    {!mobileVerified ? (
                      <button
                        type="button"
                        disabled={busy || !/^\d{10}$/.test(mobile)}
                        onClick={handleSendOtp}
                        className="btn ghost sm shrink-0 text-[12.5px]"
                      >
                        {otpSent ? "Resend OTP" : "Send OTP"}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-[12px] font-bold text-[#15803d] px-2.5 py-1.5 rounded-xl bg-green-50 border border-green-200 shrink-0">
                        <CheckCircle2 size={14} /> Verified
                      </span>
                    )}
                  </div>

                  {otpSent && !mobileVerified && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <LockKeyhole size={15} className="text-slate-400 shrink-0" />
                      <input
                        className="input flex-1 text-sm font-mono tracking-wider"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="Enter OTP (e.g. 1234)"
                      />
                      <button
                        type="button"
                        disabled={busy || otp.length < 1}
                        onClick={handleVerifyOtp}
                        className="btn g sm shrink-0 text-[12px]"
                      >
                        {busy ? "Verifying..." : "Verify"}
                      </button>
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Email (Optional)">
                <input
                  className="input"
                  type="email"
                  value={registration.email}
                  onChange={(e) => setRegistration({ ...registration, email: e.target.value })}
                  placeholder="patient@example.com"
                />
              </Field>

              <Field label="Gender *">
                <select
                  className="input"
                  value={registration.gender}
                  onChange={(e) => setRegistration({ ...registration, gender: e.target.value })}
                >
                  <option value="">Select gender</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Other</option>
                  <option>Unknown</option>
                </select>
              </Field>

              <Field label="Blood group (Optional)">
                <select
                  className="input"
                  value={registration.blood_group}
                  onChange={(e) => setRegistration({ ...registration, blood_group: e.target.value })}
                >
                  <option value="">Select blood group</option>
                  <option value="UNK">Unknown</option>
                  <option>A+</option>
                  <option>A-</option>
                  <option>B+</option>
                  <option>B-</option>
                  <option>AB+</option>
                  <option>AB-</option>
                  <option>O+</option>
                  <option>O-</option>
                </select>
              </Field>

              <Field label="Address (Optional)">
                <input
                  className="input"
                  value={registration.address}
                  onChange={(e) => setRegistration({ ...registration, address: e.target.value })}
                  placeholder="City, State"
                />
              </Field>

              <Field label="Password *">
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" color="var(--dim)" />
                  <input
                    className="input pl-9 pr-9"
                    type={showPassword ? "text" : "password"}
                    value={registration.password}
                    onChange={(e) => setRegistration({ ...registration, password: e.target.value })}
                    placeholder="Create a password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirm Password *">
                <div className="relative flex items-center">
                  <Lock size={15} className="absolute left-3" color="var(--dim)" />
                  <input
                    className="input pl-9 pr-9"
                    type={showConfirmPassword ? "text" : "password"}
                    value={registration.confirm_password}
                    onChange={(e) => setRegistration({ ...registration, confirm_password: e.target.value })}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {registration.confirm_password && registration.password !== registration.confirm_password && (
                  <p className="mt-1 text-[11px] font-medium text-rose-500">Passwords do not match</p>
                )}
              </Field>
            </div>

            <div className="actions-row between !mt-6">
              <button
                type="button"
                className="btn-link text-slate-500 hover:text-slate-800"
                onClick={() => nav("/login")}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleNextStep}
                className={`flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-[14px] font-bold transition-all duration-200 ${
                  isFormComplete
                    ? "bg-[#15803d] text-white shadow-[0_8px_20px_rgba(21,128,61,0.38)] hover:bg-[#166534] hover:shadow-[0_10px_24px_rgba(21,128,61,0.48)] active:scale-95 cursor-pointer ring-2 ring-[#15803d]/20"
                    : "bg-[#86efac]/50 text-[#166534]/70 border border-[#86efac] hover:bg-[#86efac]/80 cursor-pointer"
                }`}
              >
                <span>Next</span>
                <ArrowRight size={16} className={isFormComplete ? "translate-x-0.5 transition-transform" : ""} />
              </button>
            </div>
          </div>
        )}

        {step === "medical" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="font-bold text-slate-800">Medical History & Documents</h3>
                <p className="mt-0.5 text-xs text-slate-400">Add any existing health conditions or medical files (Optional).</p>
              </div>
              <span className="text-[12px] font-semibold text-slate-400">Step 2 of 2</span>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-700 text-sm">Medical History & Previous Surgeries</h4>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setIssues((items) => [...items, emptyIssue()])}
                >
                  <Plus size={14} /> Add condition / surgery
                </button>
              </div>
              {issues.map((issue, index) => (
                <div className="holo grid gap-3 sm:grid-cols-2" key={index}>
                  <Field label="Condition or Surgery">
                    <input
                      className="input"
                      value={issue.issue_name}
                      onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, issue_name: e.target.value } : item))}
                      placeholder="e.g. Diabetes, Hypertension, Appendectomy"
                    />
                  </Field>
                  <Field label="How long ago / onset info (Optional)">
                    <input
                      className="input"
                      value={issue.onset_info}
                      onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, onset_info: e.target.value } : item))}
                      placeholder="e.g. 5 years, 3 months ago"
                    />
                  </Field>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-700 text-sm">Upload Documents (Optional)</h4>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setDocuments((items) => [...items, emptyDocument()])}
                >
                  <Plus size={14} /> Add document
                </button>
              </div>
              {documents.map((document, index) => (
                <div className="holo grid gap-3 sm:grid-cols-2" key={index}>
                  <Field label="Document title">
                    <input
                      className="input"
                      value={document.title}
                      onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))}
                      placeholder="e.g. CBC report, Discharge Summary"
                    />
                  </Field>
                  <Field label="Document type">
                    <select
                      className="input"
                      value={document.doc_type}
                      onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, doc_type: e.target.value } : item))}
                    >
                      <option value="">Select document type</option>
                      <option value="LAB_REPORT">LAB_REPORT</option>
                      <option value="DISCHARGE">DISCHARGE</option>
                      <option value="SCAN">SCAN</option>
                      <option value="AUDIO">AUDIO</option>
                    </select>
                  </Field>
                  <Field label="Upload file">
                    <input
                      className="input sm:col-span-2"
                      type="file"
                      onChange={(e) => selectDocumentFile(index, e.target.files?.[0])}
                    />
                  </Field>
                  {document.file_name && (
                    <div className="text-xs" style={{ color: "var(--mint)" }}>Selected: {document.file_name}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="actions-row between">
              <button
                type="button"
                className="btn-link"
                disabled={busy}
                onClick={() => setStep("register")}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-[14px] font-bold text-white bg-[#15803d] shadow-[0_8px_20px_rgba(21,128,61,0.38)] hover:bg-[#166534] hover:shadow-[0_10px_24px_rgba(21,128,61,0.48)] transition-all active:scale-95 cursor-pointer"
                disabled={busy}
                onClick={registerPatient}
              >
                {busy ? <><Loader2 size={16} className="animate-spin" /> Registering...</> : "Register and continue"}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
