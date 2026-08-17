import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  HeartPulse, ShieldCheck, Network, Users, PieChart, User, Lock, Eye, EyeOff,
  KeyRound, ChevronDown, Stethoscope, Loader2, AlertCircle, HeartHandshake,
  Pill, FlaskConical, ClipboardList,
} from "lucide-react";
import type { ComponentType } from "react";
import { osLoginRequest, setOsSession } from "./osSession";
import { portalLoginRequest, setPortalSession } from "../portal/portalSession";
import { savePortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { api } from "../../lib/api";

type RoleType = "Doctor" | "Admin" | "Patient" | "Nurse" | "Pharmacy" | "Lab Technician" | "Reception Desk";

const PRIMARY_ROLES: { label: RoleType; roleKey: string; icon: ComponentType<{ size?: number | string }> }[] = [
  { label: "Doctor", roleKey: "doctor", icon: Stethoscope },
  { label: "Admin", roleKey: "admin", icon: ShieldCheck },
  { label: "Patient", roleKey: "patient", icon: HeartHandshake },
];

const MORE_STAFF_ROLES: {
  label: RoleType;
  tabLabel: string;
  roleKey: string;
  icon: ComponentType<{ size?: number | string }>;
  desc: string;
}[] = [
  { label: "Nurse", tabLabel: "Nurse", roleKey: "nurse", icon: User, desc: "Triage & Intake Desk (/triage)" },
  { label: "Pharmacy", tabLabel: "Pharmacy", roleKey: "pharmacy", icon: Pill, desc: "Pharmacy Desk (/pharmacy)" },
  { label: "Lab Technician", tabLabel: "Lab Tech", roleKey: "lab", icon: FlaskConical, desc: "Lab Diagnostics & Reports (/lab)" },
  { label: "Reception Desk", tabLabel: "Reception", roleKey: "reception", icon: ClipboardList, desc: "Front Desk & Check-in (/reception)" },
];

const FEATURES = [
  { icon: ShieldCheck, title: "Secure", body: "Enterprise-grade security & privacy" },
  { icon: Network, title: "Connected", body: "Unified data across departments" },
  { icon: Users, title: "Collaborative", body: "Empower your care teams" },
  { icon: PieChart, title: "Insightful", body: "Real-time insights for better decisions" },
];

function HospitalArt() {
  const cols3 = [196, 240, 284];
  return (
    <svg viewBox="0 0 520 260" fill="none" className="mx-auto w-full max-w-[520px]">
      {/* clouds */}
      <g stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round">
        <path d="M64 66 q10 -20 30 -11 q9 -15 27 -4 q17 -1 14 14" />
        <path d="M398 48 q9 -16 27 -8 q10 -12 26 -2" />
      </g>
      {/* trees */}
      <g stroke="#cbd5e1" strokeWidth="2" fill="#eef2f7">
        <circle cx="44" cy="182" r="17" />
        <line x1="44" y1="199" x2="44" y2="214" />
        <circle cx="478" cy="186" r="15" />
        <line x1="478" y1="201" x2="478" y2="214" />
      </g>
      {/* buildings */}
      <rect x="64" y="132" width="96" height="82" fill="#eef2f7" stroke="#cbd5e1" strokeWidth="2" rx="3" />
      <rect x="350" y="118" width="96" height="96" fill="#eef2f7" stroke="#cbd5e1" strokeWidth="2" rx="3" />
      <rect x="180" y="90" width="150" height="124" fill="#f2f6fb" stroke="#cbd5e1" strokeWidth="2" rx="3" />
      {/* cross sign */}
      <rect x="238" y="60" width="34" height="26" rx="4" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M255 66 v14 M248 73 h14" stroke="#0078d4" strokeWidth="3.2" strokeLinecap="round" />
      {/* windows */}
      <g fill="#fff" stroke="#cbd5e1" strokeWidth="1.5">
        {[0, 1].map((r) => cols3.map((x, c) => <rect key={`m${r}${c}`} x={x} y={104 + r * 30} width="28" height="18" rx="2" />))}
        {[0, 1].map((r) => [78, 122].map((x, c) => <rect key={`l${r}${c}`} x={x} y={146 + r * 30} width="26" height="18" rx="2" />))}
        {[0, 1].map((r) => [364, 408].map((x, c) => <rect key={`ri${r}${c}`} x={x} y={132 + r * 32} width="26" height="18" rx="2" />))}
      </g>
      {/* entrance */}
      <rect x="238" y="168" width="34" height="46" rx="2" fill="#fff" stroke="#cbd5e1" strokeWidth="2" />
      <line x1="255" y1="168" x2="255" y2="214" stroke="#cbd5e1" strokeWidth="1.5" />
      {/* ground */}
      <line x1="18" y1="214" x2="502" y2="214" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginOS() {
  const navigate = useNavigate();
  const [role, setRole] = useState<RoleType>("Doctor");
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMoreDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isMoreStaffActive = MORE_STAFF_ROLES.some((r) => r.label === role);
  const selectedMoreRole = MORE_STAFF_ROLES.find((r) => r.label === role);

  const handleRoleRedirect = async (selectedRole: string, uname: string, sessionData?: any) => {
    const roleLower = selectedRole.toLowerCase();

    if (roleLower === "doctor") {
      useJourney.getState().setRole("doctor");
      let docId = sessionData?.staffId;
      if (!docId) {
        try {
          const docs = await api.doctors();
          const match = docs?.find((d: any) =>
            d.name.toLowerCase().includes(uname.toLowerCase()) ||
            uname.toLowerCase().includes(d.name.toLowerCase()) ||
            d.doctor_id === uname
          );
          docId = match?.doctor_id || docs?.[0]?.doctor_id || "HPR-1000";
        } catch {
          docId = "HPR-1000";
        }
      }
      if (docId) {
        localStorage.setItem("selected_doctor_id", docId);
      }
      navigate("/copilot");
      return;
    }

    if (roleLower === "nurse") {
      useJourney.getState().setRole("nurse");
      let nurseId = sessionData?.staffId;
      if (!nurseId) {
        try {
          const staffList = await api.triageStaff();
          const match = staffList?.find((s: any) =>
            s.name.toLowerCase().includes(uname.toLowerCase()) ||
            uname.toLowerCase().includes(s.name.toLowerCase()) ||
            s.staff_id === uname
          );
          nurseId = match?.staff_id || staffList?.[0]?.staff_id || "HPR-2001";
        } catch {
          nurseId = "HPR-2001";
        }
      }
      if (nurseId) {
        localStorage.setItem("selected_triage_staff_id", nurseId);
      }
      navigate("/triage");
      return;
    }

    if (roleLower === "patient") {
      useJourney.getState().setRole("patient");
      if (sessionData?.patientId) {
        savePortalPatient({
          patient_id: sessionData.patientId,
          name: sessionData.name || uname,
          mrn: sessionData.mrn || undefined,
          mobile: sessionData.mobile || undefined,
        });
      } else {
        savePortalPatient({
          patient_id: "demo-patient",
          name: uname || "Patient User",
        });
      }
      navigate("/patient");
      return;
    }

    if (roleLower === "admin") {
      useJourney.getState().setRole("admin");
      navigate("/admin");
      return;
    }

    if (roleLower === "pharmacy" || roleLower === "pharmacist") {
      useJourney.getState().setRole("pharmacist");
      navigate("/pharmacy");
      return;
    }

    if (roleLower === "lab reports" || roleLower === "lab" || roleLower === "lab technician") {
      useJourney.getState().setRole("lab");
      navigate("/lab");
      return;
    }

    if (roleLower === "reception desk" || roleLower === "reception" || roleLower === "receptionist") {
      useJourney.getState().setRole("receptionist");
      navigate("/reception");
      return;
    }

    navigate("/home");
  };

  const signIn = async (creds: { username: string; password: string; role: string }) => {
    setError(null);
    setLoading(true);

    // Patient sign-in
    if (creds.role === "Patient") {
      try {
        const session = await portalLoginRequest({ username: creds.username, password: creds.password });
        setPortalSession(session);
        await handleRoleRedirect(creds.role, creds.username, session);
      } catch (err) {
        console.warn("Portal API login error:", err);
        setError(err instanceof Error ? err.message : "No patient account found matching these details. Please register below.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Staff sign-in (Doctor, Admin, Nurse, Pharmacy, Lab, Reception)
    try {
      const session = await osLoginRequest(creds);
      setOsSession(session);
      await handleRoleRedirect(creds.role, creds.username, session);
    } catch (err) {
      console.warn("OS API login error:", err);
      setError(err instanceof Error ? err.message : "Sign-in failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both your username and password.");
      return;
    }
    void signIn({ username: username.trim(), password, role });
  };

  const handleSsoDemo = () => {
    if (role === "Patient") {
      void signIn({ username: "demo", password: "demo-password", role: "Patient" });
      return;
    }

    let demoUser = "Dr. Ananya Mehta";
    let demoPass = "1234";

    if (role === "Nurse") {
      demoUser = "Priya Sharma";
      demoPass = "1234";
    } else if (role === "Admin") {
      demoUser = "Administrator";
      demoPass = "cliniq";
    } else if (role === "Pharmacy") {
      demoUser = "Pharmacy Desk";
      demoPass = "1234";
    } else if (role === "Lab Technician") {
      demoUser = "Lab Technician";
      demoPass = "1234";
    } else if (role === "Reception Desk") {
      demoUser = "Reception Desk";
      demoPass = "1234";
    }

    void signIn({ username: demoUser, password: demoPass, role });
  };

  const getDemoHint = () => {
    switch (role) {
      case "Doctor":
        return "Demo: Dr. Ananya Mehta / Dr. Rohan Verma with PIN 1234 or password cliniq";
      case "Admin":
        return "Demo: Administrator with password cliniq";
      case "Patient":
        return "Demo: Enter registered Mobile Number / Name + Password";
      case "Nurse":
        return "Demo: Priya Sharma / Amit Patel with PIN 1234 or password cliniq";
      case "Pharmacy":
        return "Demo: Enter Pharmacist Name / ID with PIN 1234";
      case "Lab Technician":
        return "Demo: Enter Lab Technician Name / ID with PIN 1234";
      case "Reception Desk":
        return "Demo: Enter Receptionist Name / ID with PIN 1234";
    }
  };

  const getUsernameLabel = () => {
    switch (role) {
      case "Doctor":
        return "Doctor ID / Name";
      case "Admin":
        return "Admin Username / Email";
      case "Patient":
        return "Mobile / MRN / Name";
      case "Nurse":
        return "Nurse ID / Name";
      case "Pharmacy":
        return "Pharmacist ID / Name";
      case "Lab Technician":
        return "Lab Technician ID / Name";
      case "Reception Desk":
        return "Receptionist ID / Name";
    }
  };

  const getUsernamePlaceholder = () => {
    switch (role) {
      case "Doctor":
        return "Enter doctor name or ID (e.g. Dr. Ananya Mehta)";
      case "Admin":
        return "Enter admin username or email";
      case "Patient":
        return "Enter mobile number, MRN, or patient name";
      case "Nurse":
        return "Enter nurse name or ID (e.g. Priya Sharma)";
      case "Pharmacy":
        return "Enter pharmacist name or staff ID";
      case "Lab Technician":
        return "Enter lab technician name or staff ID";
      case "Reception Desk":
        return "Enter receptionist name or staff ID";
    }
  };

  return (
    <div
      className="grid min-h-screen place-items-center p-4 text-slate-800 sm:p-6"
      style={{
        fontFamily: '"Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif',
        background:
          "radial-gradient(1100px 760px at 4% -10%, rgba(23,58,110,.07), transparent 60%)," +
          "radial-gradient(1000px 720px at 99% 0%, rgba(184,148,95,.06), transparent 60%)," +
          "linear-gradient(180deg,#f4f6fa,#fbfcfe)",
      }}
    >
      <div className="flex w-full max-w-[1140px] flex-col overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-[0_30px_80px_rgba(28,33,51,.12)]">
        <div className="grid lg:grid-cols-2">
          {/* ------------------------------------------------- brand panel */}
          <div className="hidden flex-col border-r border-black/[0.06] bg-[linear-gradient(180deg,#f7f9fc,#eef2f8)] p-9 lg:flex xl:p-11">
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-11 w-11 place-items-center rounded-2xl text-white"
                style={{ background: "linear-gradient(150deg,#3a96e0,#0078d4)", boxShadow: "0 8px 18px rgba(0,120,212,.28)" }}
              >
                <HeartPulse size={22} />
              </span>
              <div className="leading-tight">
                <div className="text-[22px] font-extrabold tracking-tight text-[#0c3b63]">ClinIQ</div>
                <div className="text-[12px] text-slate-400">Smart Hospital OS</div>
              </div>
            </div>

            <div className="mt-10">
              <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-tight text-[#0c3b63]">
                Intelligent Care.<br />Better Outcomes.
              </h1>
              <p className="mt-3 max-w-[380px] text-[14px] leading-relaxed text-slate-500">
                ClinIQ connects your teams, patients and data in one unified hospital platform.
              </p>
            </div>

            <div className="my-8"><HospitalArt /></div>

            <div className="grid grid-cols-4 gap-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="text-center">
                  <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl border border-black/[0.06] bg-white text-[#0078d4] shadow-[0_6px_16px_rgba(28,33,51,.06)]">
                    <f.icon size={20} />
                  </span>
                  <div className="text-[12.5px] font-bold text-slate-700">{f.title}</div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{f.body}</div>
                </div>
              ))}
            </div>

            <div className="mt-auto flex items-center gap-4 pt-9 text-[11px] text-slate-400">
              <span>© 2026 ClinIQ Technologies. All rights reserved.</span>
              <button type="button" className="hover:text-slate-600">Privacy Policy</button>
              <button type="button" className="hover:text-slate-600">Terms of Use</button>
            </div>
          </div>

          {/* -------------------------------------------------- form panel */}
          <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
            <div className="mx-auto w-full max-w-[400px]">
              {/* mobile logo */}
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{ background: "linear-gradient(150deg,#3a96e0,#0078d4)" }}
                >
                  <HeartPulse size={20} />
                </span>
                <div className="leading-tight">
                  <div className="text-[18px] font-extrabold text-[#0c3b63]">ClinIQ</div>
                  <div className="text-[10.5px] text-slate-400">Smart Hospital OS</div>
                </div>
              </div>

              <h2 className="text-[27px] font-extrabold tracking-tight text-[#0c3b63]">Welcome back</h2>
              <p className="mt-1 text-[13.5px] text-slate-500">Sign in to access your account</p>

              {/* role selector with 3 Main Tabs + 4th More Staff Dropdown */}
              <div className="mt-6 grid grid-cols-4 gap-1 rounded-xl border border-black/[0.08] bg-slate-50/80 p-1 relative">
                {PRIMARY_ROLES.map((r) => {
                  const active = r.label === role;
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => {
                        setRole(r.label);
                        setMoreDropdownOpen(false);
                        setError(null);
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition"
                      style={{
                        background: active ? "#fff" : "transparent",
                        color: active ? "#0a5aa8" : "#64748b",
                        boxShadow: active ? "0 2px 8px rgba(28,33,51,.08)" : "none",
                        border: active ? "1px solid rgba(0,120,212,.22)" : "1px solid transparent",
                      }}
                    >
                      <r.icon size={14} /> {r.label}
                    </button>
                  );
                })}

                {/* 4th Item: More Staff Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setMoreDropdownOpen((prev) => !prev)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg py-2 text-[11.5px] font-semibold transition"
                    style={{
                      background: isMoreStaffActive ? "#fff" : "transparent",
                      color: isMoreStaffActive ? "#0a5aa8" : "#64748b",
                      boxShadow: isMoreStaffActive ? "0 2px 8px rgba(28,33,51,.08)" : "none",
                      border: isMoreStaffActive ? "1px solid rgba(0,120,212,.22)" : "1px solid transparent",
                    }}
                  >
                    {selectedMoreRole ? (
                      <>
                        <selectedMoreRole.icon size={13} />
                        <span className="truncate">{selectedMoreRole.tabLabel}</span>
                      </>
                    ) : (
                      <span>More Staff</span>
                    )}
                    <ChevronDown size={12} className={`shrink-0 transition-transform ${moreDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {moreDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-2xl z-50">
                      <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Hospital Departments</span>
                      </div>
                      {MORE_STAFF_ROLES.map((mr) => {
                        const isSelected = mr.label === role;
                        return (
                          <button
                            key={mr.label}
                            type="button"
                            onClick={() => {
                              setRole(mr.label);
                              setMoreDropdownOpen(false);
                              setError(null);
                            }}
                            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold transition ${
                              isSelected
                                ? "bg-sky-50 text-[#0078d4] font-bold"
                                : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <span className={`grid h-7 w-7 place-items-center rounded-lg ${isSelected ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                              <mr.icon size={14} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="leading-snug">{mr.label}</div>
                              <div className="text-[10px] text-slate-400 font-normal truncate">{mr.desc}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-4">
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-[#f0b7b9] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#b42026]">
                    <AlertCircle size={15} className="mt-px shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                    {getUsernameLabel()}
                  </label>
                  <div className="flex h-11 items-center gap-2.5 rounded-xl border border-black/[0.1] bg-white px-3 text-slate-400 transition focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-[rgba(0,120,212,.14)]">
                    <User size={16} />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      type="text"
                      autoComplete="username"
                      placeholder={getUsernamePlaceholder()}
                      className="w-full bg-transparent text-[13.5px] text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-slate-600">
                    {role === "Doctor" || role === "Nurse" || role === "Pharmacy" || role === "Lab Technician" || role === "Reception Desk"
                      ? "Security PIN / Password"
                      : role === "Admin"
                      ? "Admin Password"
                      : "Password"}
                  </label>
                  <div className="flex h-11 items-center gap-2.5 rounded-xl border border-black/[0.1] bg-white px-3 text-slate-400 transition focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-[rgba(0,120,212,.14)]">
                    <Lock size={16} />
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder={
                        role === "Admin"
                          ? "Enter admin password (cliniq)"
                          : "Enter access PIN (e.g. 1234) or password"
                      }
                      className="w-full bg-transparent text-[13.5px] text-slate-700 outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="shrink-0 text-slate-400 hover:text-slate-600"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0078d4]" defaultChecked />
                    Remember me
                  </label>
                  <button type="button" className="text-[12.5px] font-semibold text-[#0a5aa8] hover:underline">Forgot password?</button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0078d4] text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(0,120,212,.28)] transition hover:bg-[#106ebe] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : `Sign In as ${role}`}
                </button>

                <p className="text-center text-[11.5px] text-slate-400">
                  {getDemoHint()}
                </p>
              </form>

              <div className="my-5 flex items-center gap-3 text-[11px] font-medium text-slate-400">
                <span className="h-px flex-1 bg-black/[0.08]" /> or <span className="h-px flex-1 bg-black/[0.08]" />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleSsoDemo}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/[0.1] bg-white text-[13.5px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
              >
                <KeyRound size={16} className="text-slate-500" /> Sign in as {role} (Demo SSO)
              </button>

              <p className="mt-6 text-center text-[12.5px] text-slate-500">
                {role === "Patient" ? (
                  <>
                    New patient?{" "}
                    <button
                      type="button"
                      onClick={() => navigate("/patient/login")}
                      className="font-semibold text-[#0a5aa8] hover:underline"
                    >
                      Register Profile
                    </button>
                  </>
                ) : (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setRole("Admin");
                        setUsername("Administrator");
                        setPassword("cliniq");
                      }}
                      className="font-semibold text-[#0a5aa8] hover:underline"
                    >
                      Contact IT Admin
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
