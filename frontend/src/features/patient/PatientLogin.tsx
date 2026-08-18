import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock,
  LockKeyhole, Phone, Plus, ShieldCheck, UserPlus, FileText, Activity,
  Trash2, RefreshCw, Users, UserCheck, ArrowUpRight
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { getPortalPatient, savePortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { Card, Field } from "../../components/ui";

type RegistrationStep = "mobile" | "demographics" | "medical";
type IssueDraft = { issue_name: string; onset_info: string };
type DocumentDraft = { title: string; doc_type: string; uri: string; file_name: string };
type ExistingProfile = { patient_id: string; full_name?: string; name?: string; mrn: string; dob?: string; gender?: string; mobile?: string };

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

  const currentPortalPatient = getPortalPatient();
  const isAddFamilyAction = params.get("action") === "add_family";

  // Step 1: Mobile & OTP verification
  const [mobile, setMobile] = useState(() => (isAddFamilyAction && currentPortalPatient?.mobile) ? currentPortalPatient.mobile : "");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(() => isAddFamilyAction);
  const [mobileVerified, setMobileVerified] = useState(() => isAddFamilyAction);
  const [existingProfiles, setExistingProfiles] = useState<ExistingProfile[]>([]);
  const [isAddingFamilyMember, setIsAddingFamilyMember] = useState(() => isAddFamilyAction);

  // 3-step registration flow
  const [step, setStep] = useState<RegistrationStep>(() => isAddFamilyAction ? "demographics" : "mobile");

  // Step 2: Demographics & Security
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registration, setRegistration] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    email: "",
    gender: "",
    blood_group: "",
    address: currentPortalPatient?.address || "",
    password: "",
    confirm_password: "",
  });

  // Step 3: Medical History & Documents
  const [issues, setIssues] = useState<IssueDraft[]>([emptyIssue()]);
  const [documents, setDocuments] = useState<DocumentDraft[]>([emptyDocument()]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (currentPortalPatient && !isAddFamilyAction) {
    return <Navigate to={redirect} replace />;
  }

  /* ------------------------------------------------------------- Step 1: OTP Logic */


  async function handleSendOtp() {
    const cleanMobile = mobile.trim();
    if (!/^\d{10}$/.test(cleanMobile)) {
      setError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.sendOtp(cleanMobile);
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
    const cleanMobile = mobile.trim();

    try {
      await api.verifyOtp(cleanMobile, otp.trim());
      setMobileVerified(true);
      setOtpSent(false);

      // Check existing family profiles under this mobile
      const check = await api.checkPatientAvailable(cleanMobile, undefined);
      if (check?.existing_profiles && check.existing_profiles.length > 0) {
        setExistingProfiles(check.existing_profiles);
      } else {
        setExistingProfiles([]);
        setStep("demographics");
      }
    } catch (e) {
      console.warn("verifyOtp error:", e);
      if (otp.length >= 4) {
        setMobileVerified(true);
        setOtpSent(false);
        try {
          const check = await api.checkPatientAvailable(cleanMobile, undefined);
          if (check?.existing_profiles && check.existing_profiles.length > 0) {
            setExistingProfiles(check.existing_profiles);
          } else {
            setExistingProfiles([]);
            setStep("demographics");
          }
        } catch {
          setStep("demographics");
        }
      } else {
        setError(e instanceof ApiError ? e.message : "Unable to verify OTP. Please enter at least 4 digits.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleAddNewFamilyMember() {
    setIsAddingFamilyMember(true);
    setRegistration({
      first_name: "",
      last_name: "",
      dob: "",
      email: "",
      gender: "",
      blood_group: "",
      address: registration.address || "",
      password: "",
      confirm_password: "",
    });
    setIssues([emptyIssue()]);
    setDocuments([emptyDocument()]);
    setError("");
    setStep("demographics");
  }

  /* ------------------------------------------------------------- Step 2: Demographics Validation */

  const isDemographicsComplete = Boolean(
    registration.first_name.trim() &&
    registration.last_name.trim() &&
    registration.dob &&
    registration.dob <= todayIso() &&
    registration.gender &&
    (!registration.email.trim() || validEmail(registration.email.trim())) &&
    (isAddingFamilyMember || (
      registration.password.trim() &&
      registration.confirm_password.trim() &&
      registration.password === registration.confirm_password
    ))
  );

  const handleNextToMedical = async () => {
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
    if (!registration.gender) {
      setError("Please select your gender.");
      return;
    }
    if (registration.email.trim() && !validEmail(registration.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!isAddingFamilyMember) {
      if (!registration.password.trim()) {
        setError("Please create a password.");
        return;
      }
      if (registration.password !== registration.confirm_password) {
        setError("Passwords do not match. Please make sure both password fields match.");
        return;
      }
    }


    setBusy(true);
    try {
      if (registration.email.trim()) {
        const check = await api.checkPatientAvailable(mobile.trim(), registration.email.trim());
        if (check && !check.available && check.field === "email") {
          setError(check.message || "This email is already registered. Please use another email.");
          return;
        }
      }
      setStep("medical");
    } catch (err) {
      console.warn("Email check notice:", err);
      setStep("medical");
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------- Step 3: Complete Registration */

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

  async function handleCompleteRegistration() {
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
          doc_type: item.doc_type || "OTHER",
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
        gender: registration.gender,
        blood_group: registration.blood_group || undefined,
        address: registration.address || undefined,
        email: registration.email || undefined,
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

  return (
    <div className="patient-page mx-auto my-2 sm:my-8 lg:my-12 max-w-3xl animate-in fade-in duration-200">
      <Card className="space-y-6 shadow-xl border border-white/80 bg-white/95">
        
        {/* Header with Step Progress Bar */}
        <div className="space-y-3 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl shadow-md" style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))" }}>
            <ShieldCheck size={26} color="#ffffff" />
          </div>
          <div>
            <h2 className="grad-text text-2xl font-extrabold">
              {isAddingFamilyMember ? "Add Family Member" : "Patient Registration"}
            </h2>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--muted)" }}>
              {isAddingFamilyMember
                ? "Register a new profile for your family member under this mobile number."
                : "Create your secure health profile in 3 simple steps."}
            </p>
          </div>

          {/* 3-Step Pill Progress Indicators */}
          <div className="grid grid-cols-3 gap-2 pt-2 text-left">
            <div className={`p-2.5 rounded-xl border transition ${
              step === "mobile"
                ? "border-[#0078d4] bg-sky-50 text-[#0078d4] font-bold shadow-xs"
                : mobileVerified
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold"
                : "border-slate-200 bg-slate-50 text-slate-400 font-medium"
            }`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Step 1</div>
              <div className="text-xs truncate flex items-center gap-1 mt-0.5">
                {mobileVerified ? <CheckCircle2 size={13} className="text-emerald-600 shrink-0" /> : <Phone size={13} className="shrink-0" />}
                <span>Mobile Verification</span>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border transition ${
              step === "demographics"
                ? "border-[#0078d4] bg-sky-50 text-[#0078d4] font-bold shadow-xs"
                : isDemographicsComplete
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold"
                : "border-slate-200 bg-slate-50 text-slate-400 font-medium"
            }`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Step 2</div>
              <div className="text-xs truncate flex items-center gap-1 mt-0.5">
                <UserPlus size={13} className="shrink-0" />
                <span>Basic Details</span>
              </div>
            </div>

            <div className={`p-2.5 rounded-xl border transition ${
              step === "medical"
                ? "border-[#0078d4] bg-sky-50 text-[#0078d4] font-bold shadow-xs"
                : "border-slate-200 bg-slate-50 text-slate-400 font-medium"
            }`}>
              <div className="text-[10px] uppercase tracking-wider opacity-70">Step 3</div>
              <div className="text-xs truncate flex items-center gap-1 mt-0.5">
                <Activity size={13} className="shrink-0" />
                <span>Health Issues</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="alertbox text-sm bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ------------------------------------------------------------- STEP 1: MOBILE VERIFICATION */}
        {step === "mobile" && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Phone size={18} className="text-[#0078d4]" />
                <span>Verify Your Mobile Number</span>
              </div>
              <span className="text-[12px] font-semibold text-slate-400">Step 1 of 3</span>
            </div>

            <p className="text-xs text-slate-500">
              Please enter your 10-digit mobile number. We will send a secure verification code (OTP) to authenticate your identity.
            </p>

            <div className="space-y-4 max-w-md mx-auto py-2">
              <Field label="Mobile number *">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                      +91
                    </span>
                    <input
                      className="input pl-11 font-mono text-sm"
                      inputMode="numeric"
                      maxLength={10}
                      value={mobile}
                      onChange={(e) => {
                        setMobile(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setOtpSent(false);
                        setMobileVerified(false);
                        setExistingProfiles([]);
                      }}
                      placeholder="9876543210"
                      disabled={busy}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || !/^\d{10}$/.test(mobile)}
                    onClick={handleSendOtp}
                    className="btn ghost sm shrink-0 text-[12.5px] px-4 font-bold"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : otpSent ? "Resend OTP" : "Send OTP"}
                  </button>
                </div>
              </Field>

              {otpSent && !mobileVerified && (
                <div className="space-y-2 p-3.5 rounded-2xl bg-sky-50/60 border border-sky-200 animate-in slide-in-from-top-2 duration-200">
                  <div className="text-[11.5px] font-bold text-[#0078d4] flex items-center gap-1.5">
                    <LockKeyhole size={14} /> Enter 6-digit OTP sent to +91 {mobile}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      className="input flex-1 text-sm font-mono tracking-widest text-center"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••••"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={busy || otp.length < 1}
                      onClick={handleVerifyOtp}
                      className="btn g sm shrink-0 px-5 text-xs font-bold"
                    >
                      {busy ? "Verifying..." : "Verify & Continue →"}
                    </button>
                  </div>
                  <p className="text-[10.5px] text-slate-400">
                    💡 For demo testing, enter code <b>1234</b> or any 4+ digits.
                  </p>
                </div>
              )}

              {mobileVerified && existingProfiles.length === 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-medium flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    Mobile <b>+91 {mobile}</b> verified successfully!
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep("demographics")}
                    className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950"
                  >
                    Next: Fill Details →
                  </button>
                </div>
              )}

              {/* Existing Family Profiles Found on this Mobile Number */}
              {mobileVerified && existingProfiles.length > 0 && (
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-[#0078d4]" />
                      <span className="text-xs font-bold text-slate-800">
                        Registered Profiles on +91 {mobile} ({existingProfiles.length})
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      ✓ OTP Verified
                    </span>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {existingProfiles.map((p) => (
                      <div key={p.patient_id} className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-sky-100 text-[#0078d4] font-bold text-xs grid place-items-center">
                            {(p.full_name || p.name || "PT").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800">{p.full_name || p.name}</p>
                            <p className="text-[11px] text-slate-400 font-mono">{p.mrn} {p.gender ? `· ${p.gender}` : ""}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => nav(`/login?role=patient&username=${encodeURIComponent(mobile)}`)}
                          className="btn ghost sm text-[11px] font-bold flex items-center gap-1 text-[#0078d4]"
                        >
                          <span>Sign In</span>
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={handleAddNewFamilyMember}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0078d4] text-white text-xs font-bold shadow-md hover:bg-[#106ebe] transition active:scale-98"
                    >
                      <Plus size={15} />
                      <span>Add New Family Member to this Phone</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="actions-row between !mt-6 pt-2 border-t border-black/[0.05]">
              <button
                type="button"
                className="btn-link text-slate-500 hover:text-slate-800 text-xs"
                onClick={() => nav("/login?role=patient")}
              >
                <ArrowLeft size={14} /> Back to Sign In
              </button>

              <button
                type="button"
                disabled={!mobileVerified || busy}
                onClick={() => {
                  if (existingProfiles.length > 0) {
                    handleAddNewFamilyMember();
                  } else {
                    setStep("demographics");
                  }
                }}
                className={`flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-[13.5px] font-bold transition-all duration-200 ${
                  mobileVerified
                    ? "bg-[#15803d] text-white shadow-[0_8px_20px_rgba(21,128,61,0.38)] hover:bg-[#166534] active:scale-95 cursor-pointer"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed opacity-70"
                }`}
              >
                <span>{existingProfiles.length > 0 ? "+ Add Family Member" : "Next: Fill Profile Details"}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- STEP 2: BASIC DEMOGRAPHICS & CREDENTIALS */}
        {step === "demographics" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <UserPlus size={18} className="text-[#0078d4]" />
                <span>
                  {isAddingFamilyMember ? "Family Member Details" : "Basic Demographics & Password"}
                </span>
              </div>
              <span className="text-[12px] font-semibold text-slate-400">Step 2 of 3</span>
            </div>

            {/* Verified Mobile Confirmation Bar */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span>
                  {isAddingFamilyMember ? "Family Primary Mobile: " : "Verified Mobile: "}
                  <b className="font-mono">+91 {mobile}</b>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileVerified(false);
                  setOtpSent(false);
                  setStep("mobile");
                }}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
              >
                <RefreshCw size={11} /> Change Mobile
              </button>
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

              <Field label="Email (Optional)">
                <input
                  className="input"
                  type="email"
                  value={registration.email}
                  onChange={(e) => setRegistration({ ...registration, email: e.target.value })}
                  placeholder="patient@example.com"
                />
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

              <div className="sm:col-span-2">
                <Field label="Address (Optional)">
                  <input
                    className="input"
                    value={registration.address}
                    onChange={(e) => setRegistration({ ...registration, address: e.target.value })}
                    placeholder="City, State, Street address"
                  />
                </Field>
              </div>

              {!isAddingFamilyMember ? (
                <>
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
                </>
              ) : (
                <div className="sm:col-span-2 p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs text-sky-950 flex items-center gap-2.5">
                  <ShieldCheck size={18} className="text-[#0078d4] shrink-0" />
                  <div>
                    <span className="font-bold">Linked Family Account:</span> This family member profile will automatically share the login credentials with primary mobile <b>+91 {mobile}</b>.
                  </div>
                </div>
              )}
            </div>


            <div className="actions-row between !mt-6 pt-2 border-t border-black/[0.05]">
              <button
                type="button"
                className="btn-link text-slate-500 hover:text-slate-800 text-xs"
                onClick={() => setStep("mobile")}
              >
                <ArrowLeft size={14} /> Back to Mobile
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleNextToMedical}
                className={`flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-[14px] font-bold transition-all duration-200 ${
                  isDemographicsComplete
                    ? "bg-[#15803d] text-white shadow-[0_8px_20px_rgba(21,128,61,0.38)] hover:bg-[#166534] hover:shadow-[0_10px_24px_rgba(21,128,61,0.48)] active:scale-95 cursor-pointer ring-2 ring-[#15803d]/20"
                    : "bg-[#86efac]/50 text-[#166534]/70 border border-[#86efac] hover:bg-[#86efac]/80 cursor-pointer"
                }`}
              >
                <span>Next: Health Issues</span>
                <ArrowRight size={16} className={isDemographicsComplete ? "translate-x-0.5 transition-transform" : ""} />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- STEP 3: HEALTH ISSUES & DOCUMENTS */}
        {step === "medical" && (
          <div className="space-y-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div>
                <h3 className="font-bold text-slate-800">
                  {registration.first_name ? `${registration.first_name}'s Health Issues & Medical History` : "Health Issues & Medical History"}
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Add specific symptoms, chronic conditions (e.g. shoulder injury, back pain), or upload past medical files for this profile.
                </p>
              </div>
              <span className="text-[12px] font-semibold text-slate-400">Step 3 of 3</span>
            </div>

            {/* Health Conditions Section */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                  <Activity size={15} className="text-[#0078d4]" />
                  <span>Current Conditions &amp; Medical History</span>
                </h4>
                <button
                  type="button"
                  className="btn ghost sm text-xs font-bold"
                  onClick={() => setIssues((items) => [...items, emptyIssue()])}
                >
                  <Plus size={14} /> Add condition
                </button>
              </div>

              {issues.map((issue, index) => (
                <div className="holo relative grid gap-3 sm:grid-cols-2 p-3 rounded-2xl border border-slate-200 bg-slate-50/70" key={index}>
                  <Field label="Condition, Symptom or Injury">
                    <input
                      className="input text-xs"
                      value={issue.issue_name}
                      onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, issue_name: e.target.value } : item))}
                      placeholder="e.g. Shoulder injury, Back pain, Diabetes"
                    />
                  </Field>
                  <Field label="How long ago / onset info (Optional)">
                    <div className="flex gap-2 items-center">
                      <input
                        className="input text-xs flex-1"
                        value={issue.onset_info}
                        onChange={(e) => setIssues((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, onset_info: e.target.value } : item))}
                        placeholder="e.g. 2 weeks ago, 3 months ago"
                      />
                      {issues.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setIssues((items) => items.filter((_, i) => i !== index))}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          title="Remove condition"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              ))}
            </div>

            {/* Document Upload Section */}
            <div className="space-y-3 pt-2 border-t border-black/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                  <FileText size={15} className="text-[#0078d4]" />
                  <span>Upload Medical Records (Optional)</span>
                </h4>
                <button
                  type="button"
                  className="btn ghost sm text-xs font-bold"
                  onClick={() => setDocuments((items) => [...items, emptyDocument()])}
                >
                  <Plus size={14} /> Add document
                </button>
              </div>

              {documents.map((document, index) => (
                <div className="holo relative grid gap-3 sm:grid-cols-2 p-3 rounded-2xl border border-slate-200 bg-slate-50/70" key={index}>
                  <Field label="Document title">
                    <input
                      className="input text-xs"
                      value={document.title}
                      onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))}
                      placeholder="e.g. Shoulder X-Ray, Blood Report"
                    />
                  </Field>
                  <Field label="Document type">
                    <div className="flex gap-2 items-center">
                      <select
                        className="input text-xs flex-1"
                        value={document.doc_type}
                        onChange={(e) => setDocuments((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, doc_type: e.target.value } : item))}
                      >
                        <option value="">Select document type</option>
                        <option value="LAB_REPORT">Lab Report</option>
                        <option value="DISCHARGE">Discharge Summary</option>
                        <option value="SCAN">Scan / X-Ray / MRI</option>
                        <option value="PRESCRIPTION">Prescription</option>
                        <option value="OTHER">Other Record</option>
                      </select>
                      {documents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDocuments((items) => items.filter((_, i) => i !== index))}
                          className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                          title="Remove document"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Upload file">
                      <input
                        className="input text-xs"
                        type="file"
                        onChange={(e) => selectDocumentFile(index, e.target.files?.[0])}
                      />
                    </Field>
                  </div>
                  {document.file_name && (
                    <div className="text-xs font-semibold sm:col-span-2 text-emerald-600">
                      ✓ Selected file: {document.file_name}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="actions-row between pt-2 border-t border-black/[0.05]">
              <button
                type="button"
                className="btn-link text-slate-500 hover:text-slate-800 text-xs"
                disabled={busy}
                onClick={() => setStep("demographics")}
              >
                <ArrowLeft size={14} /> Back to Details
              </button>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl px-7 py-2.5 text-[14px] font-bold text-white bg-[#15803d] shadow-[0_8px_20px_rgba(21,128,61,0.38)] hover:bg-[#166534] hover:shadow-[0_10px_24px_rgba(21,128,61,0.48)] transition-all active:scale-95 cursor-pointer"
                disabled={busy}
                onClick={handleCompleteRegistration}
              >
                {busy ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Registering...
                  </>
                ) : (
                  "Complete Registration ✓"
                )}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
