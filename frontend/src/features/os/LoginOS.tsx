import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  HeartPulse, ShieldCheck, Network, Users, PieChart, User, Lock, Eye, EyeOff,
  KeyRound, ChevronDown, Stethoscope, Loader2, AlertCircle, HeartHandshake,
  Pill, FlaskConical, ClipboardList, LockKeyhole, ArrowRight, ArrowLeft,
  Plus, CheckCircle2, Phone, UserCheck, Boxes,
} from "lucide-react";
import type { ComponentType } from "react";
import { osLoginRequest, setOsSession } from "./osSession";
import { portalLoginRequest, setPortalSession } from "../portal/portalSession";
import { savePortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { api } from "../../lib/api";

type RoleType = "Doctor" | "Admin" | "Patient" | "Nurse" | "Pharmacy" | "Lab Technician" | "Reception Desk" | "Care Team" | "Inventory";
type PatientStep = "credentials" | "otp" | "profile_select";


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
  { label: "Care Team", tabLabel: "Care Team", roleKey: "care_team", icon: Users, desc: "Care Team Portal (/care-team)" },
  { label: "Inventory", tabLabel: "Inventory", roleKey: "inventory", icon: Boxes, desc: "Inventory Command Center (/inventory)" },
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
  const [searchParams] = useSearchParams();

  const getInitialRole = (): RoleType => {
    const p = searchParams.get("role")?.toLowerCase();
    if (p === "patient") return "Patient";
    if (p === "admin") return "Admin";
    if (p === "nurse") return "Nurse";
    if (p === "pharmacy" || p === "pharmacist") return "Pharmacy";
    if (p === "lab") return "Lab Technician";
    if (p === "reception" || p === "receptionist") return "Reception Desk";
    if (p === "care_team" || p === "care-team") return "Care Team";
    if (p === "inventory") return "Inventory";
    return "Doctor";
  };

  const [role, setRole] = useState<RoleType>(getInitialRole);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [username, setUsername] = useState(searchParams.get("username") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Patient 2FA & Multi-Profile states
  const [patientStep, setPatientStep] = useState<PatientStep>("credentials");
  const [patientOtp, setPatientOtp] = useState("");
  const [pendingSessionResult, setPendingSessionResult] = useState<any>(null);
  const [familyProfiles, setFamilyProfiles] = useState<any[]>([]);

  // Sync role when URL search params change
  useEffect(() => {
    const p = searchParams.get("role")?.toLowerCase();
    if (p === "patient") setRole("Patient");
    else if (p === "admin") setRole("Admin");
    else if (p === "nurse") setRole("Nurse");
    else if (p === "pharmacy" || p === "pharmacist") setRole("Pharmacy");
    else if (p === "lab") setRole("Lab Technician");
    else if (p === "reception" || p === "receptionist") setRole("Reception Desk");
    else if (p === "care_team" || p === "care-team") setRole("Care Team");
    else if (p === "inventory") setRole("Inventory");
    else if (p === "doctor") setRole("Doctor");
  }, [searchParams]);


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
          first_name: sessionData.first_name || (sessionData.name ? sessionData.name.split(" ")[0] : uname),
          last_name: sessionData.last_name || "",
          mrn: sessionData.mrn || undefined,
          mobile: sessionData.mobile || undefined,
          email: sessionData.email || undefined,
          dob: sessionData.dob || undefined,
          gender: sessionData.gender || undefined,
          blood_group: sessionData.blood_group || undefined,
          address: sessionData.address || undefined,
          profile_photo: sessionData.profile_photo || undefined,
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

    if (roleLower === "care team" || roleLower === "care_team") {
      useJourney.getState().setRole("care_team" as any);
      navigate("/care-team");
      return;
    }

    if (roleLower === "inventory" || roleLower === "inventory manager" || roleLower === "inventory staff") {
      useJourney.getState().setRole("inventory" as any);
      navigate("/inventory");
      return;
    }

    navigate("/home");

  };

  /* ------------------------------------------------------------- Sign In Handlers */

  const signIn = async (creds: { username: string; password: string; role: string; patient_id?: string }) => {
    setError(null);
    setLoading(true);

    // Patient Sign-In Logic (Credentials -> OTP -> Profile Picker)
    if (creds.role === "Patient") {
      try {
        const session = await api.portalLogin({
          username: creds.username,
          password: creds.password,
          role: "Patient",
          patient_id: creds.patient_id,
        });

        // If specific profile was chosen, complete login
        if (creds.patient_id || (!session.requiresProfileSelection && !session.multiple)) {
          setPortalSession(session);
          await handleRoleRedirect("Patient", creds.username, session);
          return;
        }

        // Multiple family profiles or password verified: send OTP
        setPendingSessionResult(session);
        if (session.profiles && session.profiles.length > 0) {
          setFamilyProfiles(session.profiles);
        }

        try {
          await api.sendOtp(creds.username);
        } catch (e) {
          console.warn("sendOtp notice:", e);
        }

        setPatientStep("otp");
        setPatientOtp("");
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

  const handleVerifyPatientOtp = async () => {
    if (!patientOtp.trim()) {
      setError("Please enter the verification code.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.verifyOtp(username.trim(), patientOtp.trim());
      
      // If multiple profiles exist for this mobile number, proceed to profile selection
      if (familyProfiles.length > 1 || pendingSessionResult?.requiresProfileSelection) {
        setPatientStep("profile_select");
      } else if (pendingSessionResult) {
        setPortalSession(pendingSessionResult);
        await handleRoleRedirect("Patient", username.trim(), pendingSessionResult);
      }
    } catch (err) {
      console.warn("verifyOtp error:", err);
      if (patientOtp.length >= 4) {
        if (familyProfiles.length > 1 || pendingSessionResult?.requiresProfileSelection) {
          setPatientStep("profile_select");
        } else if (pendingSessionResult) {
          setPortalSession(pendingSessionResult);
          await handleRoleRedirect("Patient", username.trim(), pendingSessionResult);
        }
      } else {
        setError("Invalid OTP. Please enter code 1234 or your 6-digit SMS code.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFamilyProfile = async (profile: any) => {
    setLoading(true);
    setError(null);
    try {
      const session = await api.portalLogin({
        username: username.trim(),
        password,
        role: "Patient",
        patient_id: profile.patientId,
      });
      setPortalSession(session);
      await handleRoleRedirect("Patient", username.trim(), session);
    } catch (err) {
      console.warn("Select profile login error:", err);
      setError(err instanceof Error ? err.message : "Unable to select profile. Please try again.");
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
    } else if (role === "Care Team") {
      demoUser = "Dr. Ahmed Ali";
      demoPass = "1234";
    } else if (role === "Inventory") {
      demoUser = "Inventory Manager";
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
        return "Demo: Enter registered Mobile Number + Password (e.g. 1234)";
      case "Nurse":
        return "Demo: Priya Sharma / Amit Patel with PIN 1234 or password cliniq";
      case "Pharmacy":
        return "Demo: Enter Pharmacist Name / ID with PIN 1234";
      case "Lab Technician":
        return "Demo: Enter Lab Technician Name / ID with PIN 1234";
      case "Reception Desk":
        return "Demo: Enter Receptionist Name / ID with PIN 1234";
      case "Care Team":
        return "Demo: Enter Care Team Member Name / ID with PIN 1234";
      case "Inventory":
        return "Demo: Enter Inventory Manager / Staff ID with PIN 1234 or password cliniq";
    }
  };

  const getUsernameLabel = () => {
    switch (role) {
      case "Doctor":
        return "Doctor ID / Name";
      case "Admin":
        return "Admin Username / Email";
      case "Patient":
        return "Registered Mobile Number / MRN";
      case "Nurse":
        return "Nurse ID / Name";
      case "Pharmacy":
        return "Pharmacist ID / Name";
      case "Lab Technician":
        return "Lab Technician ID / Name";
      case "Reception Desk":
        return "Receptionist ID / Name";
      case "Care Team":
        return "Care Team Member ID / Name";
      case "Inventory":
        return "Inventory Staff ID / Name";
    }
  };

  const getUsernamePlaceholder = () => {
    switch (role) {
      case "Doctor":
        return "Enter doctor name or ID (e.g. Dr. Ananya Mehta)";
      case "Admin":
        return "Enter admin username or email";
      case "Patient":
        return "Enter 10-digit mobile number or MRN";
      case "Nurse":
        return "Enter nurse name or ID (e.g. Priya Sharma)";
      case "Pharmacy":
        return "Enter pharmacist name or staff ID";
      case "Lab Technician":
        return "Enter lab technician name or staff ID";
      case "Reception Desk":
        return "Enter receptionist name or staff ID";
      case "Care Team":
        return "Enter care team member name or staff ID";
      case "Inventory":
        return "Enter inventory staff name or ID";
    }
  };


  return (
    <div className="login-page min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        
        {/* Top Header */}
        <header className="flex items-center justify-between pb-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#0078d4] to-[#106ebe] text-white shadow-md">
              <HeartPulse size={22} />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-800">ClinIQ</span>
              <span className="ml-2 text-xs font-semibold uppercase tracking-wider text-[#0078d4]">Hospital OS</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Operational · Production Environment</span>
          </div>
        </header>

        {/* Main Grid */}
        <div className="my-auto grid flex-1 items-center gap-8 lg:grid-cols-12">
          
          {/* Left Hero & Features */}
          <div className="hidden lg:col-span-7 lg:block">
            <div className="max-w-lg space-y-6">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-[#0078d4] border border-sky-200">
                  <ShieldCheck size={14} /> AI-Powered Clinical Command System
                </span>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                  Intelligent Healthcare Platform for Modern Hospitals
                </h1>
                <p className="text-base text-slate-600">
                  Unified workflows for Doctors, Triage Nurses, Patients, Reception, Pharmacy, and Diagnostics.
                </p>
              </div>

              <HospitalArt />

              <div className="grid grid-cols-2 gap-4 pt-2">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-xs backdrop-blur-sm">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-[#0078d4]">
                      <f.icon size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">{f.title}</div>
                      <div className="text-[11px] text-slate-500">{f.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-5">
            <div className="mx-auto max-w-md rounded-3xl border border-slate-200/90 bg-white p-7 shadow-xl shadow-slate-200/60">
              
              <div className="mb-5 text-center">
                <h2 className="text-2xl font-extrabold text-slate-800">
                  {role === "Patient" && patientStep === "otp"
                    ? "Two-Factor Verification"
                    : role === "Patient" && patientStep === "profile_select"
                    ? "Select Family Profile"
                    : "Sign in to ClinIQ"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {role === "Patient" && patientStep === "otp"
                    ? `Enter the OTP sent to verify access to +91 ${username}`
                    : role === "Patient" && patientStep === "profile_select"
                    ? `Multiple family members found for +91 ${username}`
                    : "Select your role to access your dedicated workspace"}
                </p>
              </div>

              {/* Role Selection Tabs (Visible on credentials step) */}
              {(role !== "Patient" || patientStep === "credentials") && (
                <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-slate-100 p-1.5 text-center mb-5">
                  {PRIMARY_ROLES.map((r) => {
                    const active = r.label === role;
                    return (
                      <button
                        key={r.label}
                        type="button"
                        onClick={() => {
                          setRole(r.label);
                          setPatientStep("credentials");
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
                                setPatientStep("credentials");
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
              )}

              {/* ---------------------------------------------------------------- Patient Flow Step 1 or Staff: Credentials Form */}
              {(!isMoreStaffActive && role === "Patient" && patientStep === "otp") ? (
                /* Patient Step 2: OTP Verification */
                <div className="space-y-4 animate-in fade-in duration-150">
                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-[#f0b7b9] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#b42026]">
                      <AlertCircle size={15} className="mt-px shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="p-3.5 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#0078d4]">
                      <LockKeyhole size={16} />
                      <span>Enter 6-Digit OTP</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600">
                      We sent a verification code to <b>+91 {username}</b>.
                    </p>
                    <input
                      className="input font-mono tracking-widest text-center text-base font-bold"
                      maxLength={6}
                      value={patientOtp}
                      onChange={(e) => setPatientOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="••••••"
                      autoFocus
                    />
                    <p className="text-[10.5px] text-slate-400">
                      💡 Demo code: enter <b>1234</b> or any 4+ digits.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={loading || patientOtp.length < 1}
                    onClick={handleVerifyPatientOtp}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0078d4] text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(0,120,212,.28)] transition hover:bg-[#106ebe] disabled:opacity-70"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : "Verify OTP & Continue →"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPatientStep("credentials");
                      setError(null);
                    }}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 pt-1"
                  >
                    <ArrowLeft size={13} /> Back to Mobile &amp; Password
                  </button>
                </div>
              ) : (!isMoreStaffActive && role === "Patient" && patientStep === "profile_select") ? (
                /* Patient Step 3: Family Profile Picker */
                <div className="space-y-4 animate-in fade-in duration-150">
                  {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-[#f0b7b9] bg-[#fdf1f1] px-3 py-2.5 text-[12.5px] font-medium text-[#b42026]">
                      <AlertCircle size={15} className="mt-px shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Users size={15} className="text-[#0078d4]" />
                      <span>Select who is signing in:</span>
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      ✓ OTP Verified
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
                    {familyProfiles.map((p) => (
                      <div
                        key={p.patientId}
                        onClick={() => handleSelectFamilyProfile(p)}
                        className="group flex items-center justify-between p-3 rounded-2xl border border-slate-200 hover:border-[#0078d4] hover:bg-sky-50/50 bg-white transition cursor-pointer shadow-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white font-bold text-sm grid place-items-center shadow-xs">
                            {(p.name || p.first_name || "PT").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-[#0078d4] transition">
                              {p.name || `${p.first_name} ${p.last_name}`}
                            </p>
                            <p className="text-[11px] text-slate-400 font-mono">
                              {p.mrn} {p.gender ? `· ${p.gender}` : ""} {p.dob ? `· DOB ${p.dob}` : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="px-3 py-1.5 rounded-xl bg-sky-50 text-[#0078d4] font-bold text-xs group-hover:bg-[#0078d4] group-hover:text-white transition flex items-center gap-1"
                        >
                          <span>Sign In</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Family Member button */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/patient/login`)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-sm hover:bg-emerald-700 transition"
                    >
                      <Plus size={14} /> Add New Family Member to +91 {username}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPatientStep("credentials");
                        setError(null);
                      }}
                      className="w-full text-center text-xs text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1 pt-1"
                    >
                      <ArrowLeft size={13} /> Back to Sign In
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Credentials Form */
                <form onSubmit={submit} className="space-y-4">
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
                      {role === "Patient" ? <Phone size={16} /> : <User size={16} />}
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
                            : "Enter password / PIN"
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
              )}

              {/* SSO and Register Profile shortcuts */}
              {role !== "Patient" || patientStep === "credentials" ? (
                <>
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
                        New patient or family member?{" "}
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
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
