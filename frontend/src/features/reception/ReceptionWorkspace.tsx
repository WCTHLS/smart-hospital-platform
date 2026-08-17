import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, ClipboardList, BedDouble, TriangleAlert, LogOut, Filter, RefreshCw,
  MoreHorizontal, Eye, EyeOff, Pencil, CheckSquare, Sparkles, Send, Clock, Stethoscope,
  HeartPulse, UserPlus, Search, ArrowRight, CheckCircle, ShieldAlert,
  ChevronDown, Check, Building2, User, Activity, AlertCircle, Plus, Lock
} from "lucide-react";
import { api } from "../../lib/api";
import WalkInModal from "./components/WalkInModal";
import LabPaymentCounter from "./components/LabPaymentCounter";

/* ------------------------------------------------------------------ Static Demo Data from ClinIQ --- */

const ADM_KPIS = [
  { value: "24", label: "Admissions Today", sub: "↑ 12% vs yesterday", icon: Users, color: "#0078d4" },
  { value: "11", label: "Pending Admissions", sub: "Needs bed assignment", icon: ClipboardList, color: "#CA5010" },
  { value: "18", label: "Bed Availability", sub: "Across all floors", icon: BedDouble, color: "#107C10" },
  { value: "16", label: "Waiting Queue (ER)", sub: "Avg. wait time 28 min", icon: TriangleAlert, color: "#D13438" },
  { value: "12", label: "Discharges Today", sub: "↑ 5% vs yesterday", icon: LogOut, color: "#8764B8" },
];

const INITIAL_QUEUE = [
  { priority: "High", name: "Ahmed Khan", sex: "♂", age: "58 Y / Male", mrn: "CLN-00012345", source: "ER", reason: "Chest pain, NSTEMI", wait: "45 min", status: "Bed Pending", first_name: "Ahmed", last_name: "Khan", dob: "1966-05-12", dob_display: "12 May 1966", gender: "Male", mobile: "0300-1234567", email: "ahmed.khan@example.com", blood_group: "B+", address: "House 45, Street 12, F-8/2, Islamabad" },
  { priority: "High", name: "Sara Noor", sex: "♀", age: "44 Y / Female", mrn: "CLN-00012346", source: "ER", reason: "Severe Breathlessness", wait: "32 min", status: "Triage", first_name: "Sara", last_name: "Noor", dob: "1980-08-19", dob_display: "19 Aug 1980", gender: "Female", mobile: "0300-9876543", email: "sara.noor@example.com", blood_group: "O+", address: "Apt 4B, Blue Area, Islamabad" },
  { priority: "Medium", name: "Imran Ali", sex: "♂", age: "63 Y / Male", mrn: "CLN-00012347", source: "Ref.", reason: "Uncontrolled Diabetes", wait: "25 min", status: "Registration", first_name: "Imran", last_name: "Ali", dob: "1961-03-22", dob_display: "22 Mar 1961", gender: "Male", mobile: "0300-5551234", email: "imran.ali@example.com", blood_group: "A+", address: "Sector G-9/1, Islamabad" },
  { priority: "Medium", name: "Fatima Zahra", sex: "♀", age: "37 Y / Female", mrn: "CLN-00012348", source: "OPD", reason: "Abdominal Pain", wait: "18 min", status: "Bed Pending", first_name: "Fatima", last_name: "Zahra", dob: "1987-11-05", dob_display: "05 Nov 1987", gender: "Female", mobile: "0300-7778899", email: "fatima.z@example.com", blood_group: "AB+", address: "Sector F-10/3, Islamabad" },
  { priority: "Low", name: "Bilal Ahmed", sex: "♂", age: "29 Y / Male", mrn: "CLN-00012349", source: "ER", reason: "Fever, Viral Infection", wait: "10 min", status: "Triage", first_name: "Bilal", last_name: "Ahmed", dob: "1995-02-14", dob_display: "14 Feb 1995", gender: "Male", mobile: "0300-3334455", email: "bilal.ahmed@example.com", blood_group: "O-", address: "Sector I-8/4, Islamabad" },
];

const INITIAL_BEDS = [
  { bed: "ICU-07", loc: "ICU - Floor 3", status: "Available", sex: "Male", match: 95 },
  { bed: "ICU-09", loc: "ICU - Floor 3", status: "Available", sex: "Male", match: 88 },
  { bed: "HDU-04", loc: "HDU - Floor 2", status: "Available", sex: "Male", match: 80 },
];

const TRIAGE_STATUS = [
  { label: "Red (Critical)", count: 2, sub: "Immediate attention", tone: "#D13438" },
  { label: "Yellow (High)", count: 5, sub: "Within 30 min", tone: "#CA8A04" },
  { label: "Green (Stable)", count: 7, sub: "Within 120 min", tone: "#16a34a" },
  { label: "Blue (Low)", count: 2, sub: "Non-urgent", tone: "#0078d4" },
];

const INITIAL_CHECKLIST = [
  { label: "Patient Registration", time: "09:10 AM", done: true },
  { label: "Insurance Verification", time: "09:12 AM", done: true },
  { label: "Initial Assessment", time: "09:15 AM", done: true },
  { label: "Consent Form", time: "09:18 AM", done: true },
  { label: "Bed Assignment", time: "", done: false },
  { label: "Admission Orders", time: "", done: false },
  { label: "Welcome Kit Provided", time: "", done: false },
];

const ADM_TIMELINE = [
  { time: "09:05 AM", kind: "Registered", by: "ER Reception", done: true },
  { time: "09:10 AM", kind: "Triage", by: "Dr. Sara Malik", done: true },
  { time: "09:15 AM", kind: "Assessment", by: "Dr. Ahmed Ali", done: true },
  { time: "09:18 AM", kind: "Insurance Verified", by: "System", done: true },
  { time: "09:22 AM", kind: "Bed Assigned", by: "ICU-07", done: true },
  { time: "", kind: "Pending", by: "Admission Orders", done: false },
];

const TRANSFERS = [
  { name: "Fatima Zahra", from: "Ward B-12", to: "ICU-07", reason: "Clinical Deterioration", on: "10 May 09:25 AM", status: "Pending", tone: "#CA5010" },
  { name: "Kashif Ali", from: "HDU-02", to: "Ward A-08", reason: "Step Down", on: "10 May 08:40 AM", status: "Approved", tone: "#16a34a" },
];

const ADM_INSIGHTS = [
  { title: "High Troponin Cases", body: "5 patients admitted. Monitor and review ECGs.", time: "5 min ago", icon: TriangleAlert, tone: "#D13438" },
  { title: "Bed Demand Alert", body: "ICU occupancy is 87%. Consider step-down planning.", time: "12 min ago", icon: BedDouble, tone: "#CA5010" },
  { title: "Discharge Delays", body: "4 patients delayed >24h. Review and take action.", time: "18 min ago", icon: Clock, tone: "#CA8A04" },
];

const ADM_ACTIONS = [
  { label: "Assign Bed for Patient", cta: "Open" },
  { label: "Generate Admission Orders", cta: "Create" },
  { label: "Review Consent Form", cta: "Open" },
  { label: "Notify Care Team", cta: "Send" },
];

/* ------------------------------------------------------------------ UI Helpers --- */

const card =
  "rounded-2xl border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,253,.9),rgba(250,248,243,.74))] shadow-[0_10px_26px_rgba(28,33,51,.07),inset_0_1px_0_rgba(255,255,255,.9)]";

function Spark({ color = "#0078d4" }: { color?: string }) {
  return (
    <svg width="66" height="20" viewBox="0 0 66 20" fill="none" className="shrink-0">
      <polyline
        points="0,14 10,10 18,13 26,6 34,9 42,4 50,8 58,5 66,7"
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

function PillBadge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={{ background: `${tone}1a`, color: tone }}
    >
      {children}
    </span>
  );
}

function ProgressBar({ pct, tone = "#16a34a" }: { pct: number; tone?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07]">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

function calculateAge(dobStr: string): number {
  if (!dobStr) return 30;
  const birth = new Date(dobStr);
  if (isNaN(birth.getTime())) return 30;
  const diff = Date.now() - birth.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

/* ------------------------------------------------------------------ Main Component --- */

export default function ReceptionWorkspace() {
  const qc = useQueryClient();

  // Active top tab view: "admissions" | "liveQueue" | "labCounter"
  const [activeTab, setActiveTab] = useState<"admissions" | "liveQueue" | "labCounter">("admissions");
  
  // Copilot sidebar visibility and tab
  const [showCopilot, setShowCopilot] = useState(true);
  const [copilotTab, setCopilotTab] = useState<"Insights" | "Tasks" | "Ask Copilot">("Insights");
  const [copilotQuery, setCopilotQuery] = useState("");
  const [copilotHistory, setCopilotHistory] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);

  // Queue state (allows dynamically registering new patients and adding to queue)
  const [queuePatients, setQueuePatients] = useState(INITIAL_QUEUE);
  const [selectedQueuePatient, setSelectedQueuePatient] = useState<any | null>(null);

  // Operational Patient Registration Form State (Defaults empty as requested)
  const [isEditingReg, setIsEditingReg] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);
  const [regErrorMsg, setRegErrorMsg] = useState<string | null>(null);

  const [regForm, setRegForm] = useState({
    first_name: "",
    last_name: "",
    dob: "",
    gender: "",
    mobile: "",
    email: "",
    blood_group: "",
    address: "",
    password: "",
    confirm_password: "",
  });

  // Insurance Details
  const [insuranceData, setInsuranceData] = useState({
    provider: "Jubilee Health Insurance",
    policyNo: "JH-78654321",
    planType: "Health Plus",
    expiry: "31 Dec 2025",
    verified: true,
  });

  // Bed Assignment & Checklist Interactive State
  const [beds, setBeds] = useState(INITIAL_BEDS);
  const [assignedBed, setAssignedBed] = useState<string | null>("ICU-07");
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);

  // Modals & Real Data States for Walk-in & Check-in Assistant
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [searchMobile, setSearchMobile] = useState("");
  const [selectedRealPatient, setSelectedRealPatient] = useState<any | null>(null);
  const [busyCheckinId, setBusyCheckinId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ token: string; name: string } | null>(null);

  // Live hospital metrics
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["reception-metrics"],
    queryFn: api.metrics,
    refetchInterval: 10000,
  });

  // Mobile profile search
  const { data: searchResults, refetch: triggerSearch, isFetching: searching } = useQuery({
    queryKey: ["patient-search", searchMobile],
    queryFn: () => api.mobileProfiles(searchMobile),
    enabled: searchMobile.length === 10,
  });

  // Hospital-wide today's appointments (all patients)
  const { data: hospitalAppointmentsData, refetch: refetchHospitalAppointments, isFetching: loadingHospitalAppts } = useQuery({
    queryKey: ["hospital-appointments-today"],
    queryFn: api.hospitalTodayAppointments,
  });
  const hospitalAppointments = hospitalAppointmentsData?.appointments || [];

  // Toggle checklist item
  const toggleChecklist = (index: number) => {
    setChecklist((prev) =>
      prev.map((c, i) => (i === index ? { ...c, done: !c.done, time: !c.done ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" } : c))
    );
  };

  // Handle bed assignment
  const handleAssignBed = (bedName: string) => {
    setAssignedBed(bedName);
    setChecklist((prev) =>
      prev.map((c) => (c.label === "Bed Assignment" ? { ...c, done: true, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } : c))
    );
    const pName = regForm.first_name ? `${regForm.first_name} ${regForm.last_name}` : selectedQueuePatient?.name || "Patient";
    alert(`Bed ${bedName} successfully assigned to ${pName}!`);
  };

  // Handle patient selection from queue
  const handleSelectQueuePatient = (p: typeof INITIAL_QUEUE[0]) => {
    setSelectedQueuePatient(p);
    setRegForm({
      first_name: p.first_name || p.name.split(" ")[0] || "",
      last_name: p.last_name || p.name.split(" ").slice(1).join(" ") || "",
      dob: p.dob || "",
      gender: p.gender || (p.sex === "♂" ? "Male" : "Female"),
      mobile: p.mobile || "",
      email: p.email || "",
      blood_group: p.blood_group || "",
      address: p.address || "",
      password: "1234",
      confirm_password: "1234",
    });
    setIsEditingReg(false);
    setRegSuccessMsg(null);
    setRegErrorMsg(null);
  };

  // Switch to clean New Patient Registration form
  const handleStartNewRegistration = () => {
    setSelectedQueuePatient(null);
    setRegForm({
      first_name: "",
      last_name: "",
      dob: "",
      gender: "",
      mobile: "",
      email: "",
      blood_group: "",
      address: "",
      password: "",
      confirm_password: "",
    });
    setIsEditingReg(true);
    setRegSuccessMsg(null);
    setRegErrorMsg(null);
  };

  // Operational Patient Registration API submit
  const handleRegisterPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErrorMsg(null);
    setRegSuccessMsg(null);

    // Validation
    if (!regForm.first_name.trim()) {
      setRegErrorMsg("Please enter first name.");
      return;
    }
    if (!regForm.last_name.trim()) {
      setRegErrorMsg("Please enter last name.");
      return;
    }
    if (!regForm.dob) {
      setRegErrorMsg("Please enter date of birth.");
      return;
    }
    const cleanMob = regForm.mobile.replace(/\D/g, "");
    if (cleanMob.length !== 10) {
      setRegErrorMsg("Please enter a valid 10-digit mobile number.");
      return;
    }
    if (!regForm.gender) {
      setRegErrorMsg("Please select gender.");
      return;
    }
    if (regForm.password && regForm.confirm_password && regForm.password !== regForm.confirm_password) {
      setRegErrorMsg("Passwords do not match. Please re-enter.");
      return;
    }

    setRegBusy(true);
    try {
      // 1. Call real backend registration API
      const res = await api.registerPatient({
        first_name: regForm.first_name.trim(),
        last_name: regForm.last_name.trim(),
        dob: regForm.dob,
        mobile: cleanMob,
        email: regForm.email.trim() || undefined,
        gender: regForm.gender,
        blood_group: regForm.blood_group || undefined,
        address: regForm.address.trim() || undefined,
        password: regForm.password.trim() || "1234",
        confirm_password: regForm.confirm_password.trim() || regForm.password.trim() || "1234",
        issues: [],
        documents: [],
      });

      const profile = res.patient;
      const assignedMrn = profile?.mrn || `MRN-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      const fullName = `${regForm.first_name.trim()} ${regForm.last_name.trim()}`;
      const patientAge = `${calculateAge(regForm.dob)} Y / ${regForm.gender}`;

      // 2. Add to live queue
      const newQueueItem = {
        priority: "Medium",
        name: fullName,
        sex: regForm.gender === "Male" ? "♂" : regForm.gender === "Female" ? "♀" : "⚧",
        age: patientAge,
        mrn: assignedMrn,
        source: "Reception",
        reason: "General Admission",
        wait: "Just now",
        status: "Bed Pending",
        first_name: regForm.first_name.trim(),
        last_name: regForm.last_name.trim(),
        dob: regForm.dob,
        dob_display: new Date(regForm.dob).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        gender: regForm.gender,
        mobile: cleanMob,
        email: regForm.email.trim(),
        blood_group: regForm.blood_group,
        address: regForm.address.trim(),
      };

      setQueuePatients((prev) => [newQueueItem, ...prev]);
      setSelectedQueuePatient(newQueueItem);
      setIsEditingReg(false);
      setRegSuccessMsg(`Patient ${fullName} successfully registered! MRN: ${assignedMrn}`);

      // Refresh queries
      refetchMetrics();
      refetchHospitalAppointments();
      qc.invalidateQueries({ queryKey: ["triage-queue"] });
    } catch (err: any) {
      console.warn("Registration API error:", err);
      const detail = err?.message || "Registration failed. Please verify details.";
      setRegErrorMsg(detail);
    } finally {
      setRegBusy(false);
    }
  };

  // Copilot Ask handler
  const handleCopilotSubmit = (qText?: string) => {
    const q = (qText || copilotQuery).trim();
    if (!q) return;
    const userMsg = { role: "user" as const, text: q };
    let reply = "11 pending admissions today; 2 high-priority awaiting a bed. Average ER wait time is 28 min.";
    const s = q.toLowerCase();
    if (s.includes("bed") || s.includes("availability")) {
      reply = "3 ICU/HDU beds are available right now (ICU-07, ICU-09, HDU-04). With planned discharges, ~2 more beds will free up within 2 hours.";
    } else if (s.includes("high risk") || s.includes("critical") || s.includes("priority")) {
      reply = "High-risk admissions flagged today prioritized for immediate ICU bed assignment.";
    } else if (s.includes("troponin") || s.includes("cardiac")) {
      reply = "High Troponin cases: 5 patients admitted in the last 4 hours. ECG reviews and continuous telemonitoring recommended.";
    } else if (s.includes("insurance") || s.includes("policy")) {
      reply = "Insurance pre-authorization active. All emergency inpatient coverages confirmed.";
    }
    setCopilotHistory((prev) => [...prev, userMsg, { role: "ai" as const, text: reply }]);
    setCopilotQuery("");
  };

  // Live Check-in handler
  const handleCheckIn = async (appointmentId: string, patientId?: string) => {
    try {
      setBusyCheckinId(appointmentId);
      setSuccessInfo(null);
      const resolvedPatientId = patientId || selectedRealPatient?.patient_id;
      if (!resolvedPatientId) throw new Error("Patient ID not resolved for check-in");

      const res = await api.checkin({
        appointment_id: appointmentId,
        patient_id: resolvedPatientId,
        channel: "WALKIN",
      });
      refetchHospitalAppointments();
      refetchMetrics();
      qc.invalidateQueries({ queryKey: ["triage-queue"] });

      let patientName = "Patient";
      const apptObj = hospitalAppointments.find((a: any) => a.appointment_id === appointmentId);
      if (apptObj) patientName = apptObj.patient_name;

      setSuccessInfo({
        token: res.token?.number || "A-000",
        name: patientName,
      });
    } catch (err: any) {
      alert(err.message || "Failed to check-in patient");
    } finally {
      setBusyCheckinId(null);
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    if (!confirm("Are you sure you want to cancel this appointment? This action cannot be undone.")) return;
    try {
      setCancellingId(appointmentId);
      await api.cancelAppointment(appointmentId);
      alert("Appointment has been cancelled.");
      refetchHospitalAppointments();
      refetchMetrics();
    } catch (err: any) {
      alert(err.message || "Failed to cancel appointment");
    } finally {
      setCancellingId(null);
    }
  };

  const handleWalkInSuccess = (token: string, name: string) => {
    setShowWalkInModal(false);
    setSuccessInfo({ token, name });
    refetchMetrics();
    refetchHospitalAppointments();
    qc.invalidateQueries({ queryKey: ["triage-queue"] });
  };

  const prioColor = (p: string) => (p === "High" ? "#D13438" : p === "Medium" ? "#CA5010" : "#16a34a");
  const qstatColor = (s: string) => (s === "Bed Pending" ? "#CA5010" : s === "Triage" ? "#0078d4" : "#8764B8");
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ------------------------------------------------------------- TOP HOSPITAL BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.07] bg-white/80 p-3 backdrop-blur-md shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="font-bold text-slate-800">Operational</span>
          </div>
          <div className="pr-3 border-r border-slate-200">
            Occupancy: <span className="font-bold text-slate-800">72% ↗</span>
          </div>
          <div className="pr-3 border-r border-slate-200">
            ER Wait Time: <span className="font-bold text-slate-800">11 min ↗</span>
          </div>
          <div className="pr-3 border-r border-slate-200">
            ICU Occupancy: <span className="font-bold text-slate-800">87% ↗</span>
          </div>
          <div>
            Beds Available: <span className="font-bold text-emerald-600">18</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Main workspace view switchers */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("admissions")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                activeTab === "admissions"
                  ? "bg-white text-[#0078d4] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <ClipboardList size={14} /> Admissions &amp; Bed Intake
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("liveQueue")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                activeTab === "liveQueue"
                  ? "bg-white text-[#0078d4] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Users size={14} /> Today's Live Queue ({hospitalAppointments.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("labCounter")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                activeTab === "labCounter"
                  ? "bg-white text-[#0078d4] shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Activity size={14} /> Lab Payment Counter
            </button>
          </div>

          <button
            type="button"
            onClick={handleStartNewRegistration}
            className="flex items-center gap-1.5 rounded-xl bg-[#0078d4] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#106ebe]"
          >
            <UserPlus size={14} /> + New Patient Registration
          </button>

          <button
            type="button"
            onClick={() => setShowCopilot((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
              showCopilot
                ? "border-sky-500/30 bg-sky-50 text-[#0078d4]"
                : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={14} /> Copilot
          </button>
        </div>
      </div>

      {/* Success Notification / Printed Token */}
      {successInfo && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-4 duration-300">
          <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={18} />
          <div>
            <div className="font-extrabold text-sm text-white">Check-In Successful!</div>
            <div className="text-xs mt-1">
              Token <b>{successInfo.token}</b> generated for <b>{successInfo.name}</b>.
            </div>
            <div className="mt-2.5">
              <span className="tag mint font-bold uppercase text-[10px]">Token {successInfo.token}</span>
              <span className="text-[11px] text-[var(--muted)] ml-2">Direct patient to Triage Desk for initial vital assessment.</span>
            </div>
          </div>
          <button
            onClick={() => setSuccessInfo(null)}
            className="ml-auto text-[var(--muted)] hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- MAIN CONTENT + COPILOT GRID */}
      <div className={`grid gap-4 ${showCopilot ? "xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_390px]" : "grid-cols-1"}`}>
        
        {/* LEFT COLUMN: ACTIVE VIEW CONTENT */}
        <div className="space-y-4 min-w-0">

          {activeTab === "admissions" && (
            <>
              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {ADM_KPIS.map((k) => (
                  <div key={k.label} className={`${card} relative overflow-hidden p-3.5`}>
                    <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.color }} />
                    <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${k.color}1a`, color: k.color }}>
                      <k.icon size={18} />
                    </div>
                    <div className="text-[22px] font-extrabold leading-none text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {k.value}
                    </div>
                    <div className="mt-1 text-[11.5px] font-medium text-slate-500">{k.label}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
                    <div className="mt-1">
                      <Spark color={k.color} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Admission Queue + Registration/Insurance */}
              <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr]">
                {/* Admission Queue Table */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0c3b63]">
                      Admission Queue <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{queuePatients.length}</span>
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <button type="button" className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600">
                        <Filter size={12} /> Filters
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          refetchHospitalAppointments();
                          refetchMetrics();
                        }}
                        className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600"
                      >
                        <RefreshCw size={12} /> Refresh
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-left text-[11.5px]">
                      <thead>
                        <tr className="border-b border-black/[0.06] text-[10px] uppercase tracking-wide text-slate-400">
                          <th className="pb-2 pr-3 font-bold">Priority</th>
                          <th className="pb-2 pr-3 font-bold">Patient</th>
                          <th className="pb-2 pr-3 font-bold">Age / Gender</th>
                          <th className="pb-2 pr-3 font-bold">MRN</th>
                          <th className="pb-2 pr-3 font-bold">Source</th>
                          <th className="pb-2 pr-3 font-bold">Diagnosis / Reason</th>
                          <th className="pb-2 pr-3 font-bold">Waiting</th>
                          <th className="pb-2 pr-3 font-bold">Status</th>
                          <th className="pb-2 font-bold text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queuePatients.map((r) => {
                          const isSelected = selectedQueuePatient?.mrn === r.mrn;
                          return (
                            <tr
                              key={r.mrn}
                              onClick={() => handleSelectQueuePatient(r)}
                              className={`border-t border-black/[0.05] cursor-pointer transition ${
                                isSelected ? "bg-sky-500/10 font-medium" : "hover:bg-black/[0.02]"
                              }`}
                            >
                              <td className="py-2 pr-3">
                                <PillBadge tone={prioColor(r.priority)}>{r.priority}</PillBadge>
                              </td>
                              <td className="py-2 pr-3">
                                <span className="font-bold text-slate-800">
                                  {r.name} <span className="text-slate-400 text-[10px]">{r.sex}</span>
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-slate-500">{r.age}</td>
                              <td className="py-2 pr-3 font-mono text-[11px] text-slate-500">{r.mrn}</td>
                              <td className="py-2 pr-3">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{r.source}</span>
                              </td>
                              <td className="py-2 pr-3 text-slate-600">{r.reason}</td>
                              <td className="py-2 pr-3 text-slate-500">{r.wait}</td>
                              <td className="py-2 pr-3">
                                <PillBadge tone={qstatColor(r.status)}>{r.status}</PillBadge>
                              </td>
                              <td className="py-2 text-center">
                                <div className="inline-flex gap-2 text-slate-400">
                                  <Eye size={14} className="hover:text-slate-700" />
                                  <MoreHorizontal size={14} className="hover:text-slate-700" />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("liveQueue")}
                    className="mx-auto mt-3 block text-[11px] font-bold text-[#0078d4] hover:underline"
                  >
                    View All Queue &amp; Appointments →
                  </button>
                </div>

                {/* Patient Registration & Insurance Verification */}
                <div className="space-y-3">
                  {/* Patient Registration (Exact fields matching Patient Registration form, 1 Page) */}
                  <div className={`${card} p-3.5`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <UserPlus size={15} className="text-[#0078d4]" />
                        <h3 className="text-[13px] font-bold text-[#0c3b63]">Patient Registration</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditingReg ? (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingReg(false);
                              setRegErrorMsg(null);
                            }}
                            className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleStartNewRegistration}
                              className="flex items-center gap-1 text-[10.5px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md"
                            >
                              <Plus size={11} /> New
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingReg(true)}
                              className="flex items-center gap-1 text-[11px] font-bold text-[#0078d4] hover:text-[#106ebe]"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Operational Feedback Alerts */}
                    {regSuccessMsg && (
                      <div className="mb-2.5 rounded-lg border border-emerald-300 bg-emerald-50/80 p-2 text-[11px] text-emerald-800 font-medium flex items-center gap-1.5">
                        <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                        <span>{regSuccessMsg}</span>
                      </div>
                    )}
                    {regErrorMsg && (
                      <div className="mb-2.5 rounded-lg border border-rose-300 bg-rose-50/80 p-2 text-[11px] text-rose-800 font-medium flex items-center gap-1.5">
                        <AlertCircle size={14} className="text-rose-600 shrink-0" />
                        <span>{regErrorMsg}</span>
                      </div>
                    )}

                    {isEditingReg ? (
                      /* Operational Registration Form with EXACT same fields from Patient Registration */
                      <form onSubmit={handleRegisterPatientSubmit} className="space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              First name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Enter first name"
                              value={regForm.first_name}
                              onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2.5"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Last name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Enter last name"
                              value={regForm.last_name}
                              onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2.5"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Date of birth *
                            </label>
                            <input
                              type="date"
                              required
                              value={regForm.dob}
                              onChange={(e) => setRegForm({ ...regForm, dob: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Mobile number *
                            </label>
                            <input
                              type="tel"
                              required
                              maxLength={10}
                              placeholder="10-digit mobile number"
                              value={regForm.mobile}
                              onChange={(e) => setRegForm({ ...regForm, mobile: e.target.value.replace(/\D/g, "") })}
                              className="input w-full font-mono text-xs py-1.5 px-2.5"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Email (Optional)
                            </label>
                            <input
                              type="email"
                              placeholder="patient@example.com"
                              value={regForm.email}
                              onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2.5"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Gender *
                            </label>
                            <select
                              required
                              value={regForm.gender}
                              onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2"
                            >
                              <option value="">Select gender</option>
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Blood group (Optional)
                            </label>
                            <select
                              value={regForm.blood_group}
                              onChange={(e) => setRegForm({ ...regForm, blood_group: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2"
                            >
                              <option value="">Select blood group</option>
                              {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-", "UNK"].map((bg) => (
                                <option key={bg} value={bg}>{bg}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Address (Optional)
                            </label>
                            <input
                              type="text"
                              placeholder="City, State"
                              value={regForm.address}
                              onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                              className="input w-full text-xs py-1.5 px-2.5"
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Password *
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                placeholder="Create a password"
                                value={regForm.password}
                                onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                                className="input w-full text-xs py-1.5 pl-2.5 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[9.5px] font-bold uppercase tracking-wide text-slate-400">
                              Confirm Password *
                            </label>
                            <div className="relative">
                              <input
                                type={showConfirmPassword ? "text" : "password"}
                                required
                                placeholder="Re-enter password"
                                value={regForm.confirm_password}
                                onChange={(e) => setRegForm({ ...regForm, confirm_password: e.target.value })}
                                className="input w-full text-xs py-1.5 pl-2.5 pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                {showConfirmPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={regBusy}
                            className="flex-1 rounded-xl bg-[#0078d4] py-2 text-xs font-bold text-white shadow-sm hover:bg-[#106ebe] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {regBusy ? (
                              <span>Registering Patient...</span>
                            ) : (
                              <>
                                <Check size={14} /> Register Patient
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Display View matching Screenshot 2 with empty states */
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">First Name</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] ${regForm.first_name ? "font-semibold text-slate-700" : "text-slate-400 italic"}`}>
                            {regForm.first_name || "Enter first name"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Last Name</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] ${regForm.last_name ? "font-semibold text-slate-700" : "text-slate-400 italic"}`}>
                            {regForm.last_name || "Enter last name"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Date of Birth</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] ${regForm.dob ? "text-slate-700 font-medium" : "text-slate-400 italic"}`}>
                            {regForm.dob ? new Date(regForm.dob).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "dd-mm-yyyy"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Mobile Number</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] font-mono ${regForm.mobile ? "text-slate-700 font-medium" : "text-slate-400 italic"}`}>
                            {regForm.mobile || "Enter mobile number"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Email</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] truncate ${regForm.email ? "text-slate-700 font-medium" : "text-slate-400 italic"}`}>
                            {regForm.email || "patient@example.com"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Gender</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] ${regForm.gender ? "text-slate-700 font-medium" : "text-slate-400 italic"}`}>
                            {regForm.gender || "Select gender"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Blood Group</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] ${regForm.blood_group ? "font-bold text-rose-600" : "text-slate-400 italic"}`}>
                            {regForm.blood_group || "Select blood group"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Address</div>
                          <div className={`rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] truncate ${regForm.address ? "text-slate-700 font-medium" : "text-slate-400 italic"}`}>
                            {regForm.address || "City, State"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Password</div>
                          <div className="rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] font-mono text-slate-500">
                            {regForm.password ? "••••••••" : "Create a password"}
                          </div>
                        </div>

                        <div>
                          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Confirm Password</div>
                          <div className="rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1.5 text-[11.5px] font-mono text-slate-500">
                            {regForm.confirm_password || regForm.password ? "••••••••" : "Re-enter password"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Insurance Verification */}
                  <div className={`${card} p-3.5`}>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[13px] font-bold text-[#0c3b63]">Insurance Verification</h3>
                      <PillBadge tone="#16a34a">
                        <span className="flex items-center gap-1">
                          <CheckSquare size={11} /> Verified
                        </span>
                      </PillBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Provider</div>
                        <div className="text-[12px] font-bold text-slate-800">{insuranceData.provider}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Policy No.</div>
                        <div className="text-[12px] font-mono font-bold text-slate-800">{insuranceData.policyNo}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Plan Type</div>
                        <div className="text-[12px] font-semibold text-slate-700">{insuranceData.planType}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400">Expiry</div>
                        <div className="text-[12px] font-semibold text-slate-700">{insuranceData.expiry}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => alert(`Active Insurance Policy: ${insuranceData.provider} · Coverage limit up to ₹500,000.`)}
                      className="mt-2 text-[11px] font-bold text-[#0078d4] hover:underline"
                    >
                      View Policy Details →
                    </button>
                  </div>
                </div>
              </div>

              {/* Bed Assignment + Triage + Checklist */}
              <div className="grid gap-3 lg:grid-cols-3">
                {/* Bed Assignment */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-2 flex items-center gap-2">
                    <BedDouble size={15} className="text-[#0078d4]" />
                    <h3 className="text-[13px] font-bold text-[#0c3b63]">Bed Assignment</h3>
                  </div>
                  <div className="mb-2 flex gap-3 border-b border-black/[0.06] text-[11.5px]">
                    <span className="border-b-2 border-[#0078d4] pb-1 font-bold text-[#0078d4]">Suggested Beds (3)</span>
                    <span className="pb-1 text-slate-400">All Floors</span>
                  </div>
                  <div className="space-y-2">
                    {beds.map((b) => {
                      const isAssigned = assignedBed === b.bed;
                      return (
                        <div key={b.bed} className="flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white/70 p-2 shadow-xs">
                          <BedDouble size={16} className={isAssigned ? "text-emerald-600" : "text-slate-400"} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-bold text-slate-800">{b.bed}</div>
                            <div className="text-[10px] text-slate-400">{b.loc}</div>
                          </div>
                          <PillBadge tone="#16a34a">{b.status}</PillBadge>
                          <span className="text-[10px] text-slate-400 font-semibold">{b.sex}</span>
                          <button
                            type="button"
                            onClick={() => handleAssignBed(b.bed)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold text-white transition ${
                              isAssigned ? "bg-emerald-600" : "bg-[#0078d4] hover:bg-[#106ebe]"
                            }`}
                          >
                            {isAssigned ? "Assigned ✓" : "Assign"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => alert("Bed Management: 18 beds available across Floor 1, 2, and 3.")}
                    className="mt-2 text-[11px] font-bold text-[#0078d4] hover:underline"
                  >
                    View All Available Beds →
                  </button>
                </div>

                {/* Triage Status */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-2 flex items-center gap-2">
                    <TriangleAlert size={15} className="text-[#CA5010]" />
                    <h3 className="text-[13px] font-bold text-[#0c3b63]">Triage Status</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {TRIAGE_STATUS.map((t) => (
                      <div
                        key={t.label}
                        className="rounded-xl border p-2.5"
                        style={{ borderColor: `${t.tone}30`, background: `${t.tone}0d` }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: t.tone }} />
                          <span className="text-[10.5px] font-bold" style={{ color: t.tone }}>
                            {t.label}
                          </span>
                        </div>
                        <div className="mt-1 text-[20px] font-extrabold text-slate-800">{t.count}</div>
                        <div className="text-[9.5px] text-slate-400">{t.sub}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => alert("Triage Board: 2 Red critical cases are under active care in ER.")}
                    className="mt-2 text-[11px] font-bold text-[#0078d4] hover:underline"
                  >
                    View Triage Board →
                  </button>
                </div>

                {/* Admission Checklist */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-[#0c3b63]">Admission Checklist</h3>
                    <span className="text-[10.5px] font-bold text-slate-500">
                      {doneCount} / {checklist.length} Completed
                    </span>
                  </div>
                  <div className="mb-2.5">
                    <ProgressBar pct={Math.round((doneCount / checklist.length) * 100)} tone="#16a34a" />
                  </div>
                  <div className="space-y-2">
                    {checklist.map((c, idx) => (
                      <div
                        key={c.label}
                        onClick={() => toggleChecklist(idx)}
                        className="flex items-center gap-2 cursor-pointer rounded-lg p-1 hover:bg-black/[0.02] transition"
                      >
                        {c.done ? (
                          <CheckSquare size={15} className="text-[#16a34a]" />
                        ) : (
                          <span className="h-4 w-4 rounded border border-slate-300" />
                        )}
                        <span className={`flex-1 text-[11.5px] font-medium ${c.done ? "text-slate-700 line-through opacity-80" : "text-slate-600"}`}>
                          {c.label}
                        </span>
                        {c.time && <span className="text-[10px] text-slate-400 font-mono">{c.time}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timeline + Transfers */}
              <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                {/* Timeline */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[13px] font-bold text-[#0c3b63]">Admission Timeline</h3>
                    <span className="text-[11px] font-bold text-[#0078d4]">Live Patient Flow</span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {ADM_TIMELINE.map((e, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <div className="w-[110px] shrink-0 text-center">
                          <div className="text-[9.5px] text-slate-400 font-mono">{e.time || "—"}</div>
                          <div className="my-1 flex justify-center">
                            {e.done ? (
                              <span className="grid h-6 w-6 place-items-center rounded-full bg-[#16a34a] text-white shadow-xs">
                                <Check size={13} />
                              </span>
                            ) : (
                              <span className="h-6 w-6 rounded-full border-2 border-slate-300" />
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-slate-700">{e.kind}</div>
                          <div className="text-[9.5px] text-slate-400">{e.by}</div>
                        </div>
                        {i < ADM_TIMELINE.length - 1 && (
                          <div className="mt-[26px] h-0.5 w-4 shrink-0" style={{ background: e.done ? "#16a34a" : "#e2e8f0" }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transfer Requests */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0c3b63]">
                      Transfer Requests <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">2</span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[380px] text-left text-[11.5px]">
                      <thead>
                        <tr className="border-b border-black/[0.06] text-[10px] uppercase tracking-wide text-slate-400">
                          <th className="pb-1.5 pr-2 font-bold">Patient</th>
                          <th className="pb-1.5 pr-2 font-bold">From</th>
                          <th className="pb-1.5 pr-2 font-bold">To</th>
                          <th className="pb-1.5 pr-2 font-bold">Reason</th>
                          <th className="pb-1.5 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {TRANSFERS.map((t) => (
                          <tr key={t.name} className="border-t border-black/[0.05]">
                            <td className="py-2 pr-2 font-bold text-slate-800">{t.name}</td>
                            <td className="py-2 pr-2 text-slate-500">{t.from}</td>
                            <td className="py-2 pr-2 font-semibold text-slate-700">{t.to}</td>
                            <td className="py-2 pr-2 text-slate-500">{t.reason}</td>
                            <td className="py-2">
                              <PillBadge tone={t.tone}>{t.status}</PillBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "liveQueue" && (
            <div className="space-y-4">
              {/* Check-In Assistant & Patient Lookup */}
              <div className={`${card} p-4 space-y-4`}>
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#0c3b63] flex items-center gap-2">
                      <Search size={16} className="text-[#0078d4]" /> Mobile Patient Lookup &amp; Fast Check-In
                    </h3>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      Search existing patient records by 10-digit mobile number to check them in directly.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="tel"
                      maxLength={10}
                      className="input font-mono pl-9 w-full text-xs"
                      placeholder="Enter patient 10-digit mobile number (e.g. 9876543211)..."
                      value={searchMobile}
                      onChange={(e) => setSearchMobile(e.target.value.replace(/\D/g, ""))}
                    />
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerSearch()}
                    disabled={searchMobile.length !== 10 || searching}
                    className="rounded-xl bg-[#0078d4] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#106ebe] transition disabled:opacity-50"
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>

                {/* Profile Results */}
                {searchMobile.length === 10 && searchResults && (
                  <div className="space-y-2 border-t border-black/[0.06] pt-3">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Matching Patients ({searchResults.profiles?.length || 0})
                    </div>
                    {searchResults.profiles?.length === 0 ? (
                      <div className="text-xs text-slate-500 py-3 text-center">
                        No patient registered with mobile <b>{searchMobile}</b>.{" "}
                        <button
                          onClick={() => {
                            setSuccessInfo(null);
                            setShowWalkInModal(true);
                          }}
                          className="text-[#0078d4] font-bold underline ml-1 hover:text-[#106ebe]"
                        >
                          Register Walk-In Patient →
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {searchResults.profiles?.map((p: any) => {
                          const isSelected = selectedRealPatient?.patient_id === p.patient_id;
                          return (
                            <div
                              key={p.patient_id}
                              onClick={() => {
                                setSelectedRealPatient(p);
                                setRegForm({
                                  first_name: p.first_name || "",
                                  last_name: p.last_name || "",
                                  dob: p.dob || "1980-01-01",
                                  gender: p.gender || "Male",
                                  mobile: p.mobile || searchMobile,
                                  email: p.email || "",
                                  blood_group: p.blood_group || "B+",
                                  address: p.address || "",
                                  password: "1234",
                                  confirm_password: "1234",
                                });
                              }}
                              className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                                isSelected
                                  ? "bg-sky-50 border-[#0078d4] text-slate-900 font-bold shadow-xs"
                                  : "bg-white/80 border-black/[0.08] hover:bg-white text-slate-700"
                              }`}
                            >
                              <div className="font-bold text-slate-800">
                                👤 {p.first_name} {p.last_name || ""}
                              </div>
                              <div className="text-[10.5px] mt-1 text-slate-500 flex justify-between">
                                <span>Gender: {p.gender}</span>
                                <span className="font-mono">MRN: {p.mrn || "Pending"}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Today's Schedule & Live Queue */}
              <div className={`${card} p-4 space-y-3`}>
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#0c3b63] flex items-center gap-2">
                      📅 Today's Reception Queue &amp; Appointments ({hospitalAppointments.length})
                    </h3>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      Live schedule of all appointments booked through the portal, app, or reception desk.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refetchHospitalAppointments()}
                    className="p-1.5 rounded-lg border border-black/[0.08] hover:bg-black/5 text-[#0078d4]"
                    title="Reload queue"
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                {loadingHospitalAppts ? (
                  <div className="text-xs text-slate-400 py-8 text-center">Loading appointments queue...</div>
                ) : hospitalAppointments.length === 0 ? (
                  <div className="text-xs text-slate-500 py-8 text-center">
                    No appointments booked for today.
                    <button
                      onClick={() => {
                        setSuccessInfo(null);
                        setShowWalkInModal(true);
                      }}
                      className="block mx-auto mt-2 text-xs font-bold text-[#0078d4] underline"
                    >
                      + Register Walk-In Patient
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {hospitalAppointments.map((appt: any) => {
                      const startTime = new Date(appt.scheduled_start).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const isBooked = appt.status === "BOOKED";
                      const isChecking = busyCheckinId === appt.appointment_id;

                      return (
                        <div
                          key={appt.appointment_id}
                          className="p-3 bg-white/90 border border-black/[0.07] rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-white transition shadow-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-800">
                              👤 {appt.patient_name}{" "}
                              <span className="font-normal text-slate-400 text-[11px] font-mono">
                                ({appt.patient_mobile})
                              </span>
                            </div>
                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                              Dr. {appt.doctor_name} · {appt.department} · Scheduled {startTime}
                            </div>
                            <div className="mt-1.5 flex gap-1.5 items-center">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold ${
                                  appt.status === "BOOKED"
                                    ? "bg-sky-100 text-sky-700"
                                    : appt.status === "CHECKED_IN"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-emerald-100 text-emerald-700"
                                }`}
                              >
                                {appt.status}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                via {appt.channel || "Portal"}
                              </span>
                            </div>
                          </div>

                          {isBooked ? (
                            <div className="flex gap-2 items-center shrink-0">
                              <button
                                disabled={cancellingId === appt.appointment_id}
                                onClick={() => handleCancelAppointment(appt.appointment_id)}
                                className="text-[10.5px] text-rose-600 hover:text-rose-700 font-bold border border-rose-200 px-2 py-1 rounded-lg transition"
                                type="button"
                              >
                                Cancel
                              </button>
                              <button
                                disabled={isChecking}
                                onClick={() => handleCheckIn(appt.appointment_id, appt.patient_id)}
                                className="rounded-lg bg-[#0078d4] px-3 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-[#106ebe] transition flex items-center gap-1"
                              >
                                {isChecking ? "Checking In..." : <>Check In <ArrowRight size={12} /></>}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                              ✓ Arrived
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "labCounter" && (
            <div className="space-y-4">
              <LabPaymentCounter />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: AI COPILOT SIDEPANE (From ClinIQ) */}
        {showCopilot && (
          <aside className={`${card} p-3.5 space-y-4 self-start`}>
            {/* Copilot Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-[#0078d4]" />
                <h3 className="text-[13px] font-bold text-[#0c3b63]">AI Copilot</h3>
              </div>
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[10.5px] font-bold">
                {(["Insights", "Tasks", "Ask Copilot"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setCopilotTab(tab)}
                    className={`rounded-md px-2 py-1 transition ${
                      copilotTab === tab ? "bg-white text-[#0078d4] shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {tab === "Tasks" ? "Tasks (4)" : tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Copilot Tab Content */}
            {copilotTab === "Insights" && (
              <div className="space-y-3 text-xs">
                {/* Admission Insights */}
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Admission Insights
                  </div>
                  <div className="space-y-2">
                    {ADM_INSIGHTS.map((n) => (
                      <div key={n.title} className="flex gap-2.5 rounded-xl border border-black/[0.06] bg-white/80 p-2.5 shadow-xs">
                        <span
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                          style={{ background: `${n.tone}1a`, color: n.tone }}
                        >
                          <n.icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 text-[11.5px]">{n.title}</span>
                            <span className="text-[9.5px] text-slate-400">{n.time}</span>
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-slate-600 leading-snug">{n.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bed Suggestions */}
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Bed Suggestions
                  </div>
                  <div className="rounded-xl border border-black/[0.06] bg-white/80 p-2.5 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11.5px]">
                        Best match for {regForm.first_name ? `${regForm.first_name} ${regForm.last_name}` : "Patient"}
                      </span>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        95% Match
                      </span>
                    </div>
                    <div className="text-[10.5px] text-slate-600">
                      <b>ICU-07 · Floor 3</b> · Available · Male Bed
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAssignBed("ICU-07")}
                      className="w-full mt-1 rounded-lg bg-[#0078d4] py-1.5 text-[11px] font-bold text-white hover:bg-[#106ebe] transition"
                    >
                      Assign ICU-07
                    </button>
                  </div>
                </div>

                {/* Insurance Alerts */}
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Insurance Alerts
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 space-y-1">
                    <div className="font-bold">Jubilee Health Insurance</div>
                    <p className="text-[10px] text-amber-800">
                      Pre-authorization required for Angiography on inpatient basis.
                    </p>
                    <button
                      type="button"
                      onClick={() => alert("Pre-authorization verified online with Jubilee Health Insurance.")}
                      className="text-[10px] font-bold text-[#0078d4] underline"
                    >
                      View Details →
                    </button>
                  </div>
                </div>

                {/* Recommended Next Actions */}
                <div className="border-t border-black/[0.06] pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Recommended Next Actions
                  </div>
                  <div className="space-y-1.5">
                    {ADM_ACTIONS.map((a) => (
                      <div
                        key={a.label}
                        className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white/70 px-2.5 py-1.5"
                      >
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
                          <CheckSquare size={13} className="text-[#0078d4]" /> {a.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (a.cta === "Open" && a.label.includes("Bed")) handleAssignBed("ICU-07");
                            else alert(`${a.label} initiated.`);
                          }}
                          className="rounded border border-[#0078d4]/30 bg-white px-2 py-0.5 text-[10px] font-bold text-[#0078d4] hover:bg-sky-50"
                        >
                          {a.cta}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {copilotTab === "Tasks" && (
              <div className="space-y-2 text-xs">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Pending Admission Tasks
                </div>
                {[
                  { title: "Assign Bed for Intake", sub: "Priority High", tag: "ICU" },
                  { title: "Verify Star Health Insurance", sub: "Policy #ST-9912", tag: "Insurance" },
                  { title: "Print Triage Token", sub: "Ref. OPD", tag: "Reception" },
                  { title: "Collect Lab Copay", sub: "₹500", tag: "Cashier" },
                ].map((t, idx) => (
                  <div key={idx} className="rounded-xl border border-black/[0.06] bg-white/80 p-2.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11.5px]">{t.title}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-bold text-slate-600">{t.tag}</span>
                    </div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5">{t.sub}</div>
                  </div>
                ))}
              </div>
            )}

            {copilotTab === "Ask Copilot" && (
              <div className="space-y-3 text-xs">
                {/* Chat History */}
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                  {copilotHistory.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[11px]">
                      Ask Copilot anything about bed availability, pending admissions, or triage queue.
                    </div>
                  ) : (
                    copilotHistory.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-xl p-2.5 text-[11.5px] leading-relaxed ${
                          msg.role === "user"
                            ? "bg-sky-50 text-slate-800 border border-sky-100 font-medium ml-4"
                            : "bg-white text-slate-700 border border-black/[0.06] shadow-xs mr-4"
                        }`}
                      >
                        <b>{msg.role === "user" ? "You: " : "ClinIQ Copilot: "}</b>
                        {msg.text}
                      </div>
                    ))
                  )}
                </div>

                {/* Quick Prompts */}
                <div className="space-y-1">
                  {["Show high risk admissions", "Which beds will be free in 2 hrs?", "Show pending admissions"].map((qp) => (
                    <button
                      key={qp}
                      type="button"
                      onClick={() => handleCopilotSubmit(qp)}
                      className="w-full text-left rounded-lg border border-black/[0.06] bg-white/60 px-2 py-1 text-[10.5px] text-slate-600 hover:bg-white hover:text-slate-900 transition truncate"
                    >
                      💡 {qp}
                    </button>
                  ))}
                </div>

                {/* Ask Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCopilotSubmit();
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    type="text"
                    value={copilotQuery}
                    onChange={(e) => setCopilotQuery(e.target.value)}
                    placeholder="Ask anything about admissions..."
                    className="input flex-1 text-xs py-1.5 px-2.5"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-[#0078d4] px-3 py-1.5 text-white shadow-xs hover:bg-[#106ebe]"
                  >
                    <Send size={13} />
                  </button>
                </form>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Walk-in Registration Modal Wizard */}
      {showWalkInModal && (
        <WalkInModal
          onClose={() => setShowWalkInModal(false)}
          onSuccess={handleWalkInSuccess}
        />
      )}
    </div>
  );
}
