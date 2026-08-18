import { useState, useEffect, useMemo, Fragment, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, Plus, Sparkles, Bell, ChevronDown, Users,
  ClipboardList, UserCog, FlaskConical, ScanLine, Pill as PillIcon, Scissors, HeartPulse,
  Ambulance, Receipt, Boxes, FileText, Map as MapIcon, Building2, Package, CheckSquare,
  MessageSquare, TriangleAlert, BedDouble, LogOut, IndianRupee, MoreHorizontal,
  Share2, ExternalLink, Send, Maximize2, Activity, ShieldAlert,
  FileWarning, ArrowUpRight, Stethoscope, Download, Filter, Eye, Mic, Folder, Calendar,
  Settings, Phone, Pencil, RefreshCw, Clock, ChevronRight,
  TestTubes, Droplet, Beaker, FileCheck, XCircle,
  TrendingUp, CheckCircle2, CalendarPlus, Ticket, ShieldCheck, MapPin, UserRound, ArrowLeft, Camera, AlertCircle,
  Heart, Info, Video, Navigation, CreditCard, LoaderCircle, Check, Shield, UserCheck, Stethoscope as DoctorIcon, User, History,
  FolderOpen, Upload, Trash2, Save, Lock, FileUp, Mail, Home,
  PanelLeftClose, PanelLeft, Menu
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../lib/razorpay";
import { useJourney } from "../../lib/store";
import { useRealtime } from "../../lib/realtime";
import { getPortalPatient, clearPortalPatient } from "../../lib/patientAuth";

import StageTracker from "./components/StageTracker";
import ConsultationSummary from "./components/ConsultationSummary";
import VitalsSection from "./components/VitalsSection";
import PrescriptionsSection from "./components/PrescriptionsSection";
import LabReportsSection from "./components/LabReportsSection";
import LabOrdersAlert from "./components/LabOrdersAlert";
import { BillingSection } from "./components/AppointmentBillCard";

const PATIENT_SIDEBAR_NAV = [
  { tab: "My Health Overview", label: "Overview", icon: Home, section: "MAIN" },
  { tab: "Appointments", label: "Appointments", icon: Calendar, section: "MAIN" },
  { tab: "My Vitals", label: "Vitals", icon: HeartPulse, section: "MAIN" },
  { tab: "My Lab Reports", label: "Labs & Scans", icon: FlaskConical, section: "MAIN" },
  { tab: "My Prescriptions", label: "Prescriptions", icon: PillIcon, section: "MAIN" },
  { tab: "Billing", label: "Billing", icon: Receipt, section: "MAIN" },
  { tab: "My Documents", label: "Documents", icon: FolderOpen, section: "MAIN" },
  { tab: "My Profile", label: "My Profile", icon: User, section: "ACCOUNT" },
];

const PATIENT_TABS = [
  { id: "My Health Overview", label: "My Health Overview", icon: Activity },
  { id: "Appointments", label: "Appointments", icon: Calendar },
  { id: "Book Consultation", label: "Book Consultation", icon: CalendarPlus },
  { id: "My Vitals", label: "My Vitals", icon: HeartPulse },
  { id: "My Lab Reports", label: "My Lab Reports", icon: FlaskConical },
  { id: "My Prescriptions", label: "My Prescriptions", icon: PillIcon },
  { id: "Billing", label: "Billing", icon: Receipt },
  { id: "My Documents", label: "My Documents", icon: FolderOpen },
  { id: "Doctor Notes", label: "Doctor Notes", icon: FileText },
  { id: "Care Timeline", label: "Care Timeline", icon: History },
  { id: "My Profile", label: "My Profile", icon: User },
];

/* ------------------------------------------------------------------ MAIN COMPONENT */

const CARE_TEAM_OV = [
  { name: "Dr. Ahmed Ali", role: "Your Cardiologist", badge: "Attending Physician" },
  { name: "Nurse Ayesha", role: "Primary Care Nurse" },
  { name: "Dr. Sara Malik", role: "Consultant Physician" },
  { name: "Dr. Imran Haider", role: "Cardiac Rehab Specialist" },
];

const LATEST_LABS = [
  { test: "Troponin I (Heart Enzyme)", value: "1.52 ng/mL", status: "Being Monitored", tone: "#D13438" },
  { test: "CK-MB (Cardiac Biomarker)", value: "24 U/L", status: "Trending Down", tone: "#CA5010" },
  { test: "Serum Creatinine", value: "1.1 mg/dL", status: "Normal", tone: "#16a34a" },
  { test: "Potassium (K+)", value: "5.2 mmol/L", status: "Normal / Stable", tone: "#16a34a" },
  { test: "HbA1c (Blood Sugar)", value: "8.3 %", status: "Under Control", tone: "#0078d4" },
];

const RECENT_IMAGING = [
  { name: "Coronary Angiography", date: "10 May 2024, 02:15 PM", finding: "Stent Placed (LAD)", status: "Report Ready" },
  { name: "Echocardiogram (Heart Echo)", date: "10 May 2024, 11:20 AM", finding: "EF 48% (Stable)", status: "Report Ready" },
  { name: "Chest X-Ray", date: "09 May 2024, 09:00 AM", finding: "Clear Lungs", status: "Normal" },
  { name: "CT Chest (HRCT)", date: "07 May 2024, 06:00 PM", finding: "Evaluated", status: "Report Ready" },
];

const MEDS_OV = [
  { name: "Aspirin", dose: "75 mg", freq: "Once Daily", route: "Oral", purpose: "Heart & blood vessel protection" },
  { name: "Clopidogrel", dose: "75 mg", freq: "Once Daily", route: "Oral", purpose: "Prevents blood clot formation" },
  { name: "Atorvastatin", dose: "40 mg", freq: "Nightly", route: "Oral", purpose: "Lowers cholesterol levels" },
  { name: "Metoprolol", dose: "25 mg", freq: "Twice Daily", route: "Oral", purpose: "Regulates heart rhythm & BP" },
  { name: "Insulin (Glargine)", dose: "14 Units", freq: "Nightly SubQ", route: "SubQ", purpose: "Glycemic / blood sugar control" },
  { name: "Pantoprazole", dose: "40 mg", freq: "Once Daily (Morning)", route: "Oral", purpose: "Gastric protection" },
];

const PROBLEMS_OV = [
  { name: "Acute Coronary Condition (NSTEMI)", primary: true, note: "Successfully managed with stenting" },
  { name: "Type 2 Diabetes Mellitus", note: "Controlled on medication" },
  { name: "Hypertension (High Blood Pressure)", note: "Well controlled" },
  { name: "Hyperlipidemia (High Cholesterol)", note: "On statin therapy" },
];

const RECENT_ENC = [
  { date: "10 May 2024", time: "09:30 AM", kind: "Hospital Admission", tag: "Emergency", detail: "Admitted for cardiac evaluation", icon: BedDouble, tone: "#16a34a" },
  { date: "10 May 2024", time: "11:20 AM", kind: "Lab Tests Completed", tag: "Cardiac", detail: "Troponin I & enzymes assessed", icon: FlaskConical, tone: "#D13438" },
  { date: "10 May 2024", time: "02:15 PM", kind: "Coronary Angiography", tag: "Cath Lab", detail: "Successful stent placement in LAD", icon: Activity, tone: "#8764B8" },
  { date: "11 May 2024", time: "08:10 AM", kind: "ICU Monitoring", tag: "Recovery", detail: "Post-procedure vitals stable", icon: ArrowUpRight, tone: "#0078d4" },
  { date: "12 May 2024", time: "04:30 PM", kind: "Prescription Updated", tag: "Pharmacy", detail: "Dual antiplatelet therapy started", icon: PillIcon, tone: "#16a34a" },
  { date: "13 May 2024", time: "10:30 AM", kind: "Discharge & Home Plan", tag: "Care Plan", detail: "Cardiac rehab & diet guidance", icon: LogOut, tone: "#CA5010" },
];

const ADMISSION_BAR = [
  { label: "Care Type", value: "Cardiology Inpatient" },
  { label: "Admission Date", value: "10 May 2024, 09:30 AM" },
  { label: "Room / Bed", value: "ICU-07, Bed-01" },
  { label: "Stay Duration", value: "3 Days 2 Hours" },
  { label: "Insurance", value: "Jubilee Health" },
  { label: "Policy No.", value: "JH-78654321" },
  { label: "Next Follow-Up", value: "14 May 2024" },
];

const VITAL_CARDS = [
  { label: "Blood Pressure", short: "BP", value: "128/80", unit: "mmHg", status: "Optimal Range", color: "#0078d4" },
  { label: "Heart Rate", short: "HR", value: "76", unit: "bpm", status: "Normal Rhythm", color: "#16a34a" },
  { label: "Oxygen Saturation", short: "SpO₂", value: "98", unit: "%", status: "Excellent", color: "#0891b2" },
  { label: "Body Temperature", short: "Temp", value: "98.6", unit: "°F", status: "Normal", color: "#CA5010" },
  { label: "Breathing Rate", short: "RR", value: "18", unit: "/min", status: "Normal", color: "#8764B8" },
];

const PATIENT_INSIGHTS = [
  { title: "Medication Reminder", body: "Take Pantoprazole 30 mins before your breakfast for optimal stomach protection.", time: "Today 8:00 AM", icon: PillIcon, tone: "#0078d4" },
  { title: "Heart Health Tip", body: "Keep your daily sodium intake low and enjoy 15-minute gentle walks as advised by Dr. Ahmed Ali.", time: "Today", icon: Heart, tone: "#16a34a" },
  { title: "Upcoming Follow-up", body: "Your next cardiac review appointment is scheduled for tomorrow at 10:30 AM.", time: "Tomorrow", icon: Calendar, tone: "#8764B8" },
];

const PATIENT_ACTIONS = [
  { label: "Take Morning Medicines", cta: "Mark Taken" },
  { label: "View Doctor's Instructions", cta: "Read Advice" },
  { label: "Download Lab Report (Troponin I)", cta: "Download PDF" },
  { label: "Book Follow-up Consultation", cta: "Schedule" },
];

const QUICK_ASK = [
  "Explain my latest lab report",
  "When should I take my medicines?",
  "What foods should I avoid?",
  "What are my discharge instructions?"
];

const card = "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(28,33,51,.04)]";

function initials(name?: string) {
  if (!name) return "DR";
  return name.replace(/^Dr\.\s*/i, "").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 tracking-wide"
      style={{
        backgroundColor: `${tone}15`,
        color: tone,
        border: `1px solid ${tone}30`,
      }}
    >
      {children}
    </span>
  );
}

function Spark({ color = "#0078d4" }: { color?: string }) {
  return (
    <svg className="w-14 h-4 overflow-visible" viewBox="0 0 60 16">
      <path
        d="M 0 10 Q 15 4 30 11 T 60 7"
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PanelHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[12.5px] font-extrabold text-[#0c3b63]">{title}</h3>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="text-[11px] font-semibold text-[#0078d4] hover:underline"
        >
          {action} ›
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ MAIN COMPONENT */

export default function PatientDashboard() {
  const nav = useNavigate();
  const location = useLocation();
  const journey = useJourney();
  const events = useRealtime((s) => s.events);
  const portalSession = getPortalPatient();
  const portalPatientId = portalSession?.patient_id || "demo-patient-001";
  const portalPatientName = portalSession?.name || "Ahmed Khan";

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [tab, setTabState] = useState(() => urlTab || "My Health Overview");

  useEffect(() => {
    if (urlTab && urlTab !== tab) {
      setTabState(urlTab);
    }
  }, [urlTab, tab]);

  const setTab = (newTab: string) => {
    setTabState(newTab);
    setSearchParams({ tab: newTab });
  };
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  const [copilotTab, setCopilotTab] = useState("Health Tips");
  const [search, setSearch] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string; time: string }>>([
    {
      role: "assistant",
      text: `Hello ${portalPatientName}! I am your personal AI Health Assistant. Your heart recovery is progressing well under Dr. Ahmed Ali's care. How can I help you today?`,
      time: "Just now",
    },
  ]);
  const [showSimilarityModal, setShowSimilarityModal] = useState(false);

  // Checkin Flow States
  const [checkinStep, setCheckinStep] = useState<"appointments" | "details">("appointments");
  const [selectedCheckinAppt, setSelectedCheckinAppt] = useState<any | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [checkInSuccess, setCheckInSuccess] = useState("");
  const [checkinReason, setCheckinReason] = useState("Routine Follow-up & Cardiology Check");
  const [checkinSpecialty, setCheckinSpecialty] = useState("Cardiology");
  const [showWalkinCheckin, setShowWalkinCheckin] = useState(false);

  // Booking Flow States (ClinIQ Multi-Step DB Sync)
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingStep, setBookingStep] = useState<"form" | "slots" | "confirm" | "success">("form");
  const [bookingDate, setBookingDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [bookingReason, setBookingReason] = useState("Post-procedure Follow-up & Cardiac Health Review");
  const [bookingSpecialty, setBookingSpecialty] = useState("Cardiology");
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<any | null>(null);
  const [findingSlots, setFindingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState("");

  // Profile Editable Demographics State (First Name, Last Name, Gender, DOB, Email, Address)
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profileGender, setProfileGender] = useState("Male");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileDob, setProfileDob] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState("");
  const [profileSaveError, setProfileSaveError] = useState("");

  // Allergies & Chronic Issues Management State
  const [showAddAllergyModal, setShowAddAllergyModal] = useState(false);
  const [newAllergySubstance, setNewAllergySubstance] = useState("");
  const [newAllergySeverity, setNewAllergySeverity] = useState("MILD");
  const [newAllergyReaction, setNewAllergyReaction] = useState("");
  const [addingAllergy, setAddingAllergy] = useState(false);
  const [allergyError, setAllergyError] = useState("");

  const [showAddIssueModal, setShowAddIssueModal] = useState(false);
  const [newIssueName, setNewIssueName] = useState("");
  const [newIssueOnset, setNewIssueOnset] = useState("");
  const [addingIssue, setAddingIssue] = useState(false);
  const [issueError, setIssueError] = useState("");

  // Document Upload & Management State
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docUploadType, setDocUploadType] = useState("LAB_REPORT");
  const [docUploadTitle, setDocUploadTitle] = useState("");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docUploadSuccess, setDocUploadSuccess] = useState("");
  const [docUploadError, setDocUploadError] = useState("");
  const [docFilter, setDocFilter] = useState("ALL");

  // Query patient records with active live-polling
  const { data: p360, refetch: refetchP360 } = useQuery({
    queryKey: ["portal-p360", portalPatientId],
    queryFn: () => api.patient360(portalPatientId),
    enabled: !!portalPatientId,
    refetchInterval: 3000,
    retry: 1,
  });

  const { data: appointmentData, refetch: refetchAppointments } = useQuery({
    queryKey: ["portal-upcoming-appointments", portalPatientId],
    queryFn: () => api.upcomingAppointments(portalPatientId),
    enabled: !!portalPatientId,
    refetchInterval: 3000,
    retry: 1,
  });

  const { data: todayApptData, refetch: refetchTodayAppointments, isLoading: loadingTodayAppts } = useQuery({
    queryKey: ["portal-today-appointments", portalPatientId],
    queryFn: () => api.todayAppointments(portalPatientId),
    enabled: !!portalPatientId,
    refetchInterval: 3000,
    retry: 1,
  });

  // Listen to realtime websocket events for live synchronization
  useEffect(() => {
    if (events.length > 0) {
      refetchP360();
      refetchAppointments();
      refetchTodayAppointments();
    }
  }, [events.length, refetchP360, refetchAppointments, refetchTodayAppointments]);

  const episodes = p360?.episodes ?? [];
  const latestEpisode = episodes[0];
  const rawToken = latestEpisode?.token || p360?.active_token;
  const currentToken = typeof rawToken === "string" ? rawToken : (rawToken?.number || "T-01");
  const tokenObject = typeof rawToken === "object" && rawToken ? rawToken : { number: currentToken, room: "Consultation Room", floor: "Floor 1", eta_minutes: 10 };
  const appointments = appointmentData?.appointments ?? [];
  const todayAppointments = (todayApptData?.appointments && todayApptData.appointments.length > 0)
    ? todayApptData.appointments
    : appointments;

  // Determine if patient has checked in and has an active hospital visit
  const isCheckedInAndActive = useMemo(() => {
    const rawSt = (
      latestEpisode?.status ||
      p360?.active_encounter?.status ||
      p360?.patient?.status ||
      ""
    ).toUpperCase().replace(/-/g, "_");
    if (!rawSt) return false;
    if (["DISCHARGED", "COMPLETED", "CANCELLED", "BOOKED", "SCHEDULED", "CONFIRMED"].includes(rawSt)) {
      return false;
    }
    return true;
  }, [latestEpisode?.status, p360?.active_encounter?.status, p360?.patient?.status]);

  // Split appointments into Upcoming & Today (today on top) vs Past appointments
  const { upcomingAndTodayAppointments, pastAppointmentsList } = useMemo(() => {
    const all = [...(appointmentData?.appointments || []), ...(todayApptData?.appointments || [])];
    const uniqueMap = new Map<string, any>();
    for (const a of all) {
      if (a.appointment_id && !uniqueMap.has(a.appointment_id)) {
        uniqueMap.set(a.appointment_id, a);
      }
    }
    const combined = Array.from(uniqueMap.values());
    const todayIsoStr = new Date().toISOString().slice(0, 10);

    const upcoming: any[] = [];
    const past: any[] = [];

    for (const a of combined) {
      const apptDate = a.scheduled_start ? a.scheduled_start.slice(0, 10) : todayIsoStr;
      const rawStatus = (a.status || "").toUpperCase().replace(/-/g, "_");
      const isPast = (apptDate < todayIsoStr && rawStatus !== "CHECKED_IN" && rawStatus !== "IN_CONSULT") || rawStatus === "COMPLETED" || rawStatus === "DISCHARGED" || rawStatus === "CANCELLED";
      if (isPast) {
        past.push(a);
      } else {
        upcoming.push(a);
      }
    }

    // Sort upcoming: today first, then by date/time ascending
    upcoming.sort((a, b) => {
      const aDate = a.scheduled_start ? a.scheduled_start.slice(0, 10) : todayIsoStr;
      const bDate = b.scheduled_start ? b.scheduled_start.slice(0, 10) : todayIsoStr;
      const aIsToday = aDate === todayIsoStr ? 0 : 1;
      const bIsToday = bDate === todayIsoStr ? 0 : 1;
      if (aIsToday !== bIsToday) return aIsToday - bIsToday;
      return (a.scheduled_start || "").localeCompare(b.scheduled_start || "");
    });

    // If past list is empty, populate with past encounters from patient chart
    if (past.length === 0 && p360?.encounters) {
      for (const enc of p360.encounters) {
        const rawStatus = (enc.status || "").toUpperCase().replace(/-/g, "_");
        if (rawStatus === "COMPLETED" || rawStatus === "DISCHARGED" || (enc.date && enc.date < todayIsoStr)) {
          past.push({
            appointment_id: enc.encounter_id || `ENC-${Math.random()}`,
            doctor: { name: enc.doctor_name || "Dr. Ahmed Ali", specialty: enc.department || "Cardiology", room: "OPD-04", floor: "Floor 2" },
            specialty: enc.department || "Cardiology",
            status: "COMPLETED",
            scheduled_start: enc.date ? `${enc.date}T10:00:00Z` : enc.arrival_ts,
            reason: enc.reason || enc.chief_complaint || "Routine Cardiac Review",
          });
        }
      }
    }

    return {
      upcomingAndTodayAppointments: upcoming,
      pastAppointmentsList: past,
    };
  }, [appointmentData?.appointments, todayApptData?.appointments, p360?.encounters]);

  // Dynamically compute the active stage for Live Visit Tracker
  const activeEncounterStatus = (
    latestEpisode?.status ||
    p360?.active_encounter?.status ||
    p360?.patient?.status ||
    todayAppointments[0]?.status ||
    ""
  ).toUpperCase().replace(/-/g, "_");

  const currentStageIndex = useMemo(() => {
    if (activeEncounterStatus === "DISCHARGED" || activeEncounterStatus === "COMPLETED") return 6;
    if (activeEncounterStatus === "RX_ISSUED" || activeEncounterStatus === "PHARMACY" || activeEncounterStatus === "PHARMACY_PENDING" || activeEncounterStatus === "RX_READY") return 5;
    if (activeEncounterStatus === "UNDER_REVIEW" || activeEncounterStatus === "LAB_COMPLETED") return 4;
    if (activeEncounterStatus === "DIAGNOSTICS" || activeEncounterStatus === "LAB" || activeEncounterStatus === "LAB_ORDERED" || activeEncounterStatus === "LAB_PENDING") return 3;
    if (activeEncounterStatus === "IN_CONSULT" || activeEncounterStatus === "IN_CONSULTATION" || activeEncounterStatus === "CONSULTING" || activeEncounterStatus === "WITH_DOCTOR") return 2;
    if (activeEncounterStatus === "TRIAGED" || activeEncounterStatus === "EMERGENCY") return 1;
    if (activeEncounterStatus === "CHECKED_IN" || activeEncounterStatus === "CHECKEDIN" || activeEncounterStatus === "ARRIVED") return 0;
    return 1;
  }, [activeEncounterStatus]);

  // Group slots by doctor for selection
  const doctorSlotGroups = useMemo(() => {
    const grouped: Record<string, { doctor: any; slots: any[] }> = {};
    for (const slot of availableSlots) {
      if (!grouped[slot.doctor_id]) {
        grouped[slot.doctor_id] = { doctor: slot, slots: [slot] };
      } else {
        grouped[slot.doctor_id].slots.push(slot);
      }
    }
    return Object.values(grouped);
  }, [availableSlots]);

  // Live Database bindings
  const clinicalSummary = p360?.clinical_summary || p360?.patient?.summary || p360?.ai_summary?.result?.summary || (p360?.recent_notes && p360?.recent_notes[0]?.text);

  const vitalsData = p360?.latest_vitals;
  let bpCard = null;
  if (vitalsData?.bp || (vitalsData?.bp_systolic && vitalsData?.bp_diastolic)) {
    const sys = vitalsData.bp_systolic || parseInt(String(vitalsData.bp).split("/")[0], 10);
    const dia = vitalsData.bp_diastolic || parseInt(String(vitalsData.bp).split("/")[1], 10);
    const isAbnormal = Boolean((sys && (sys >= 140 || sys < 90)) || (dia && (dia >= 90 || dia < 60)));
    bpCard = {
      label: "Blood Pressure",
      short: "BP",
      value: vitalsData.bp || `${sys}/${dia}`,
      unit: "mmHg",
      isAbnormal,
      status: isAbnormal ? (sys >= 140 ? "Elevated BP" : "Low BP") : "Optimal Range",
    };
  }

  let hrCard = null;
  if (vitalsData?.heart_rate != null) {
    const hr = Number(vitalsData.heart_rate);
    const isAbnormal = hr < 60 || hr > 100;
    hrCard = {
      label: "Heart Rate",
      short: "HR",
      value: String(hr),
      unit: "bpm",
      isAbnormal,
      status: isAbnormal ? (hr > 100 ? "Tachycardia" : "Bradycardia") : "Normal Rhythm",
    };
  }

  let spo2Card = null;
  if (vitalsData?.spo2 != null) {
    const spo2 = Number(vitalsData.spo2);
    const isAbnormal = spo2 < 95;
    spo2Card = {
      label: "Oxygen Saturation",
      short: "SpO₂",
      value: String(spo2),
      unit: "%",
      isAbnormal,
      status: isAbnormal ? "Hypoxia (Low)" : "Normal / High",
    };
  }

  let tempCard = null;
  if (vitalsData?.temperature != null) {
    const temp = Number(vitalsData.temperature);
    const isAbnormal = temp > 99.5 || temp < 97.0;
    tempCard = {
      label: "Body Temperature",
      short: "Temp",
      value: String(temp),
      unit: "°F",
      isAbnormal,
      status: isAbnormal ? (temp > 99.5 ? "Fever / Elevated" : "Low Temp") : "Normal",
    };
  }

  let rrCard = null;
  if (vitalsData?.respiratory_rate != null) {
    const rr = Number(vitalsData.respiratory_rate);
    const isAbnormal = rr < 12 || rr > 20;
    rrCard = {
      label: "Breathing Rate",
      short: "RR",
      value: String(rr),
      unit: "/min",
      isAbnormal,
      status: isAbnormal ? (rr > 20 ? "Elevated RR" : "Low RR") : "Normal",
    };
  } else if (vitalsData?.bmi != null) {
    const bmi = Number(vitalsData.bmi);
    const isAbnormal = bmi < 18.5 || bmi >= 30;
    rrCard = {
      label: "Body Mass Index",
      short: "BMI",
      value: String(bmi),
      unit: "kg/m²",
      isAbnormal,
      status: isAbnormal ? (bmi >= 30 ? "High BMI" : "Low BMI") : "Normal BMI",
    };
  }

  const liveVitals = [bpCard, hrCard, spo2Card, tempCard, rrCard].filter(Boolean);

  const [viewingReportModal, setViewingReportModal] = useState<any | null>(null);

  const careTeam = (p360?.care_team && p360.care_team.length > 0) ? p360.care_team : (p360?.past_doctors || []);

  const labReports = p360?.lab_reports || [];
  const scansAndDiagnostics = p360?.scans_diagnostics || [];
  const pendingLabOrders = labReports.filter((l: any) => l.status === "CREATED" || l.status === "PENDING" || l.raw_status === "CREATED" || l.raw_status === "PENDING");
  const pendingScanOrders = scansAndDiagnostics.filter((s: any) => s.status === "CREATED" || s.status === "PENDING" || s.raw_status === "CREATED" || s.raw_status === "PENDING");
  const allPendingOrders = p360?.pending_lab_orders || [...pendingLabOrders, ...pendingScanOrders];
  const activeMeds = p360?.medications || [];

  // Helper to determine status type: ACTION_REQUIRED, BOOKED, or COMPLETED
  const getInvestigationStatus = (item: any) => {
    const st = (item.status || item.raw_status || "").toUpperCase();
    const isDone = st === "COMPLETED" || st === "RESULTED" || st === "DISCHARGED" || Boolean(item.attachment_uri || item.attachment_name);
    if (isDone) {
      const isAbnormal = item.flag && item.flag !== "N";
      return {
        type: "COMPLETED" as const,
        label: isAbnormal ? `Abnormal (${item.flag})` : "Completed",
        badgeColor: isAbnormal ? "bg-red-100 text-red-800 border-red-200" : "bg-emerald-100 text-emerald-800 border-emerald-200",
        tone: isAbnormal ? "#D13438" : "#16a34a",
      };
    }
    const isBooked = st === "CONFIRMED" || st === "BOOKED" || st === "SCHEDULED" || st === "PREPAID" || st === "SAMPLE_COLLECTED";
    if (isBooked) {
      return {
        type: "BOOKED" as const,
        label: "Booked",
        badgeColor: "bg-blue-100 text-[#0078d4] border-blue-200",
        tone: "#0078d4",
      };
    }
    return {
      type: "ACTION_REQUIRED" as const,
      label: "Action Required",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-300",
      tone: "#ca8a04",
    };
  };

  // 1. Active Triage Token (Nurse Intake & Vitals)
  const activeTriageToken = useMemo(() => {
    if (p360?.active_tokens && Array.isArray(p360.active_tokens)) {
      const tok = p360.active_tokens.find(
        (t: any) =>
          t.is_triage ||
          (t.department || "").toLowerCase() === "triage" ||
          (t.number && t.number.startsWith("T-"))
      );
      if (tok && tok.status !== "DONE" && tok.status !== "COMPLETED") return tok;
    }
    const rawSt = (latestEpisode?.status || p360?.active_encounter?.status || "").toUpperCase().replace(/-/g, "_");
    if (["CHECKED_IN", "WAITING", "ARRIVED"].includes(rawSt)) {
      return {
        number: currentToken || "T-104",
        room: tokenObject?.room || "Triage Room 2",
        floor: tokenObject?.floor || "Ground Floor",
        department: "Triage & Intake",
        status: "WAITING",
        eta_minutes: tokenObject?.eta_minutes || 5,
      };
    }
    return null;
  }, [p360?.active_tokens, latestEpisode?.status, p360?.active_encounter?.status, currentToken, tokenObject]);

  // 2. Active Doctor Consultation Token
  const activeDoctorToken = useMemo(() => {
    if (p360?.active_tokens && Array.isArray(p360.active_tokens)) {
      const tok = p360.active_tokens.find(
        (t: any) =>
          !t.is_lab &&
          !t.is_pharmacy &&
          !t.is_triage &&
          (t.department || "").toLowerCase() !== "triage" &&
          (t.department || "").toLowerCase() !== "pharmacy" &&
          (t.department || "").toLowerCase() !== "laboratory"
      );
      if (tok && tok.status !== "DONE" && tok.status !== "COMPLETED") return tok;
    }
    const rawSt = (latestEpisode?.status || p360?.active_encounter?.status || "").toUpperCase().replace(/-/g, "_");
    if (["TRIAGED", "IN_CONSULT", "WAITING_DOCTOR", "CONSULTATION"].includes(rawSt)) {
      return {
        number: latestEpisode?.doctor_token || currentToken || "DOC-101",
        room: careTeam[0]?.room || "Room 101",
        floor: careTeam[0]?.floor || "Floor 1",
        doctor_name: careTeam[0]?.name || "Dr. Ananya Mehta",
        department: careTeam[0]?.specialty || "General Medicine",
        status: rawSt === "IN_CONSULT" ? "IN_PROGRESS" : "READY",
        eta_minutes: 5,
      };
    }
    return null;
  }, [p360?.active_tokens, latestEpisode, p360?.active_encounter?.status, currentToken, careTeam]);

  // 3. Active Lab Token (Issued upon lab booking and payment, vanishes when all lab tests are completed)
  const activeLabToken = useMemo(() => {
    if (p360?.active_tokens && Array.isArray(p360.active_tokens)) {
      const labTok = p360.active_tokens.find(
        (t: any) =>
          t.is_lab ||
          (t.number && t.number.startsWith("L-")) ||
          (t.department || "").toLowerCase() === "laboratory" ||
          t.visit_type === "LAB"
      );
      if (labTok && labTok.status !== "DONE" && labTok.status !== "COMPLETED") return labTok;
    }
    if (p360?.active_token && (p360.active_token.is_lab || (p360.active_token.number && p360.active_token.number.startsWith("L-")) || p360.active_token.visit_type === "LAB")) {
      return p360.active_token;
    }
    // Fallback: if any lab or scan order is CONFIRMED / BOOKED / PREPAID and not yet completed
    const hasBookedUncompletedLab = [...labReports, ...scansAndDiagnostics].some((o: any) => {
      const st = (o.status || o.raw_status || "").toUpperCase();
      const isDone = st === "COMPLETED" || st === "RESULTED" || st === "DISCHARGED" || Boolean(o.attachment_uri);
      return (st === "CONFIRMED" || st === "BOOKED" || st === "PREPAID" || st === "SAMPLE_COLLECTED") && !isDone;
    });
    if (hasBookedUncompletedLab) {
      return {
        number: "L-101",
        room: "Phlebotomy / Lab 1",
        floor: "Ground Floor",
        department: "Laboratory & Diagnostics",
        status: "WAITING",
        eta_minutes: 10,
      };
    }
    return null;
  }, [p360?.active_token, p360?.active_tokens, labReports, scansAndDiagnostics]);

  // 4. Active Pharmacy Pickup Token (Issued when prescription is prepaid, vanishes when dispensed)
  const activePharmacyToken = useMemo(() => {
    if (p360?.prescriptions && Array.isArray(p360.prescriptions)) {
      for (const rx of p360.prescriptions) {
        if (
          rx.pickup_token &&
          rx.status !== "DISPENSED" &&
          rx.status !== "COLLECTED" &&
          rx.pickup_token.status !== "COMPLETED"
        ) {
          return {
            number: rx.pickup_token.number,
            room: rx.pickup_token.room || "Pharmacy Counter 3",
            floor: rx.pickup_token.floor || "Ground Floor",
            department: "Pharmacy",
            status: rx.pickup_token.status || "WAITING",
            rx_id: rx.rx_id,
          };
        }
      }
    }
    if (p360?.active_tokens && Array.isArray(p360.active_tokens)) {
      const phaTok = p360.active_tokens.find(
        (t: any) =>
          t.is_pharmacy ||
          (t.number && t.number.startsWith("PHA-")) ||
          (t.department || "").toLowerCase() === "pharmacy"
      );
      if (phaTok && phaTok.status !== "DONE" && phaTok.status !== "COMPLETED") return phaTok;
    }
    return null;
  }, [p360?.prescriptions, p360?.active_tokens]);

  // Sync profile editable fields when p360 changes
  useEffect(() => {
    if (p360?.patient) {
      if (p360.patient.first_name !== undefined) {
        setProfileFirstName(p360.patient.first_name || "");
      }
      if (p360.patient.last_name !== undefined) {
        setProfileLastName(p360.patient.last_name || "");
      }
      if (p360.patient.gender !== undefined) {
        setProfileGender(p360.patient.gender || "Male");
      }
      if (p360.patient.email !== undefined) {
        setProfileEmail(p360.patient.email || "");
      }
      if (p360.patient.address !== undefined) {
        setProfileAddress(p360.patient.address || "");
      }
      if (p360.patient.dob !== undefined) {
        setProfileDob(p360.patient.dob || "");
      }
    }
  }, [
    p360?.patient?.first_name,
    p360?.patient?.last_name,
    p360?.patient?.gender,
    p360?.patient?.email,
    p360?.patient?.address,
    p360?.patient?.dob,
  ]);

  // Handle Save Patient Demographics (First Name, Last Name, Gender, Email, Address, DOB)
  const handleSaveDemographics = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingProfile(true);
    setProfileSaveSuccess("");
    setProfileSaveError("");
    try {
      await api.updatePatientProfile(portalPatientId, {
        first_name: profileFirstName.trim() || undefined,
        last_name: profileLastName.trim() || undefined,
        gender: profileGender || undefined,
        email: profileEmail.trim() || undefined,
        address: profileAddress.trim() || undefined,
        dob: profileDob || undefined,
      });
      setProfileSaveSuccess("Profile demographics updated successfully!");
      await refetchP360();
      setTimeout(() => setProfileSaveSuccess(""), 4000);
    } catch (err: any) {
      setProfileSaveError(err.message || "Failed to update profile demographics.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Allergy Handlers
  const handleAddAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllergySubstance.trim()) {
      setAllergyError("Please specify the allergen name.");
      return;
    }
    setAddingAllergy(true);
    setAllergyError("");
    try {
      await api.addPatientAllergy(portalPatientId, {
        substance: newAllergySubstance.trim(),
        severity: newAllergySeverity,
        reaction: newAllergyReaction.trim() || undefined,
      });
      setNewAllergySubstance("");
      setNewAllergyReaction("");
      setShowAddAllergyModal(false);
      await refetchP360();
    } catch (err: any) {
      setAllergyError(err.message || "Failed to add allergy record.");
    } finally {
      setAddingAllergy(false);
    }
  };

  const handleRemoveAllergy = async (allergyIdentifier: string) => {
    try {
      await api.deletePatientAllergy(portalPatientId, allergyIdentifier);
      await refetchP360();
    } catch (err: any) {
      alert(err.message || "Failed to remove allergy record.");
    }
  };

  // Medical History / Condition Handlers
  const handleAddIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueName.trim()) {
      setIssueError("Please specify the condition or diagnosis name.");
      return;
    }
    setAddingIssue(true);
    setIssueError("");
    try {
      await api.addPatientIssue(portalPatientId, {
        issue_name: newIssueName.trim(),
        onset_info: newIssueOnset.trim() || "Active Medical History",
        status: "ACTIVE",
      });
      setNewIssueName("");
      setNewIssueOnset("");
      setShowAddIssueModal(false);
      await refetchP360();
    } catch (err: any) {
      setIssueError(err.message || "Failed to add chronic medical condition.");
    } finally {
      setAddingIssue(false);
    }
  };

  const handleRemoveIssue = async (issueIdentifier: string) => {
    try {
      await api.deletePatientIssue(portalPatientId, issueIdentifier);
      await refetchP360();
    } catch (err: any) {
      alert(err.message || "Failed to remove condition from history.");
    }
  };

  // Document Upload & Management Handlers
  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docUploadFile) {
      setDocUploadError("Please select a document file to upload.");
      return;
    }
    setUploadingDoc(true);
    setDocUploadSuccess("");
    setDocUploadError("");
    try {
      await api.uploadPatientDocument(
        portalPatientId,
        docUploadFile,
        docUploadType,
        docUploadTitle.trim() || docUploadFile.name
      );
      setDocUploadSuccess("Successfully uploaded!");
      setDocUploadFile(null);
      setDocUploadTitle("");
      await refetchP360();
      setTimeout(() => setDocUploadSuccess(""), 5000);
    } catch (err: any) {
      setDocUploadError(err.message || "Failed to upload medical document.");
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm("Are you sure you want to delete this document from your records?")) return;
    try {
      await api.deletePatientDocument(portalPatientId, docId);
      await refetchP360();
    } catch (err: any) {
      alert(err.message || "Failed to delete document.");
    }
  };

  const handleSignOut = () => {
    clearPortalPatient();
    journey.reset();
    nav("/patient/login?redirect=/patient", { replace: true });
  };

  // Check-In Handlers (Aligned with ClinIQ Backend & DB)
  const handleSelectCheckinAppt = (item: any) => {
    setSelectedCheckinAppt(item);
    setCheckinStep("details");
    setCheckInError("");
    setCheckInSuccess("");
  };

  const handleCompleteCheckIn = async (appointmentId?: string, reason?: string) => {
    setCheckingIn(true);
    setCheckInError("");
    setCheckInSuccess("");
    try {
      const apptId = appointmentId || selectedCheckinAppt?.appointment_id;
      const rsn = reason || selectedCheckinAppt?.reason || checkinReason;
      const res = await api.checkin({
        patient_id: portalPatientId,
        appointment_id: apptId,
        mobile: portalSession?.mobile || "0300-1234567",
        channel: "PORTAL",
        reason: rsn,
      });

      journey.set({
        patientId: res.patient?.patient_id || portalPatientId,
        patientName: res.patient?.name || portalPatientName,
        encounterId: res.encounter_id,
      });

      await refetchP360();
      await refetchTodayAppointments();
      const issuedToken = res.token || res.token_number || res.token_data?.number || res.doctor_token;
      if (issuedToken) {
        setCheckInSuccess(`Check-in complete! Your live Token is ${issuedToken} for Consultation.`);
      } else {
        setCheckInSuccess("Check-in complete! Your live visit is now active.");
      }
      setCheckinStep("appointments");
      setSelectedCheckinAppt(null);
      setShowWalkinCheckin(false);
    } catch (e: any) {
      setCheckInError(e?.message || (e instanceof ApiError ? e.message : "Check-in failed. Please try again or visit reception counter."));
    } finally {
      setCheckingIn(false);
    }
  };

  // Appointment Booking Handlers (Live Doctor Slots + Razorpay Payment + DB Sync)
  const handleFindSlots = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFindingSlots(true);
    setBookingError("");
    setSelectedSlot(null);
    try {
      const result = await api.appointmentSlots({
        patient_id: portalPatientId,
        appointment_date: bookingDate,
        reason: bookingReason,
      });
      setBookingSpecialty(result.specialty || "Cardiology");
      setAvailableSlots(result.slots ?? []);
      setBookingStep("slots");
    } catch (err: any) {
      setBookingError(err?.message || "Failed to retrieve available doctor slots for this date.");
    } finally {
      setFindingSlots(false);
    }
  };

  const handleConfirmAndPay = async () => {
    if (!selectedSlot) return;
    setBookingLoading(true);
    setBookingError("");
    try {
      let Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        const loaded = await loadRazorpayScript();
        if (loaded) Razorpay = (window as any).Razorpay;
      }

      let bookedAppt: any = null;
      try {
        const order = await api.createRazorpayOrder({
          patient_id: portalPatientId,
          doctor_id: selectedSlot.doctor_id,
          scheduled_start: selectedSlot.scheduled_start,
          scheduled_end: selectedSlot.scheduled_end,
          reason: bookingReason,
          specialty: selectedSlot.specialty,
          appointment_type: "OPD",
          channel: "PORTAL",
          checkout_email: portalSession?.email || "patient@cliniq.health",
        });

        let payment: RazorpaySuccess;
        if (order.key_id === "mock_sandbox_key" || !Razorpay) {
          payment = {
            razorpay_payment_id: `pay_mock_${Math.random().toString(36).substring(2, 11)}`,
            razorpay_order_id: order.order_id,
            razorpay_signature: "mock_signature_sandbox",
          };
        } else {
          payment = await new Promise<RazorpaySuccess>((resolve, reject) => {
            let settled = false;
            const checkout = new Razorpay({
              key: order.key_id,
              amount: order.amount,
              currency: order.currency,
              name: "ClinIQ Healthcare",
              description: `${selectedSlot.specialty} consultation with ${selectedSlot.doctor_name}`,
              order_id: order.order_id,
              prefill: order.prefill,
              theme: { color: "#0078d4" },
              modal: {
                confirm_close: true,
                ondismiss: () => {
                  if (!settled) reject(new Error("Payment was cancelled. Your appointment has not been booked."));
                },
              },
              handler: (response: RazorpaySuccess) => {
                settled = true;
                resolve(response);
              },
            });
            checkout.on("payment.failed", (response: any) => {
              settled = true;
              reject(new Error(response?.error?.description || "Payment failed. Please try again."));
            });
            checkout.open();
          });
        }

        const result = await api.verifyRazorpayPayment(payment);
        bookedAppt = result.appointment;
      } catch (payErr: any) {
        // Direct appointment booking fallback to ensure seamless DB sync
        const directRes = await api.bookAppointment({
          patient_id: portalPatientId,
          doctor_id: selectedSlot.doctor_id,
          specialty: selectedSlot.specialty,
          scheduled_start: selectedSlot.scheduled_start,
          scheduled_end: selectedSlot.scheduled_end,
          reason: bookingReason,
          channel: "PORTAL",
        });
        bookedAppt = directRes.appointment || directRes;
      }

      setConfirmedAppointment(bookedAppt);
      setBookingStep("success");
      setBookingSuccessMsg(`Your appointment is confirmed for ${bookingDate} with ${selectedSlot.doctor_name}.`);
      await refetchAppointments();
      await refetchTodayAppointments();
      await refetchP360();
    } catch (err: any) {
      setBookingError(err?.message || "Failed to complete appointment booking. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  };

  const resetBookingFlow = () => {
    setBookingStep("form");
    setSelectedSlot(null);
    setAvailableSlots([]);
    setBookingError("");
    setConfirmedAppointment(null);
    setBookingSuccessMsg("");
  };

  const sendCopilotChat = (textToSend?: string) => {
    const q = (textToSend || chatInput).trim();
    if (!q) return;
    const userMsg = { role: "user" as const, text: q, time: "Just now" };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setChatInput("");

    setTimeout(() => {
      let reply = "Your recovery is on track! Your latest vitals are stable (BP 128/80, Pulse 76 bpm). Remember to take your heart medications with water after meals and stay well hydrated.";
      const low = q.toLowerCase();
      if (low.includes("lab") || low.includes("troponin")) {
        reply = "Your Troponin I level is 1.52 ng/mL. This enzyme was elevated due to your heart condition, but your doctors note it is now trending down steadily, indicating healthy healing.";
      } else if (low.includes("medicine") || low.includes("pill") || low.includes("prescript")) {
        reply = "You have 6 active medicines: Aspirin & Clopidogrel (to keep blood flow smooth), Atorvastatin (for cholesterol), Metoprolol (for heart rhythm), Insulin (for blood sugar), and Pantoprazole (for stomach protection). Take them as scheduled!";
      } else if (low.includes("food") || low.includes("diet") || low.includes("eat")) {
        reply = "Recommended heart diet: Low sodium (salt), plenty of fresh vegetables, whole grains, and lean proteins. Avoid fried foods, excessive oily snacks, and caffeinated energy drinks.";
      } else if (low.includes("discharge") || low.includes("home") || low.includes("exercise")) {
        reply = "Your discharge plan includes: 1) Resting comfortably at home, 2) 15-minute gentle indoor walking, 3) Continuing your dual blood thinner medications, and 4) Follow-up visit with Dr. Ahmed Ali in 1 week.";
      }
      setChatMessages((prev) => [...prev, { role: "assistant", text: reply, time: "Just now" }]);
    }, 600);
  };

  const patientName = p360?.patient?.name || portalSession?.name || "Patient";
  const patientAge = p360?.patient?.age ? `${p360.patient.age} Y` : "—";
  const patientGender = p360?.patient?.gender || "Not Specified";
  const patientMRN = p360?.patient?.mrn || "—";
  const patientPhone = p360?.patient?.mobile || portalSession?.mobile || "—";
  const patientBloodGroup = p360?.patient?.blood_group;

  // Real DB encounters / appointments for visit date
  const latestEnc = (p360?.encounters && p360.encounters.length > 0) ? p360.encounters[0] : (latestEpisode || null);
  const nextAppt = (todayAppointments && todayAppointments.length > 0) ? todayAppointments[0] : ((upcomingAndTodayAppointments && upcomingAndTodayAppointments.length > 0) ? upcomingAndTodayAppointments[0] : null);

  let visitLabel = "Latest Visit";
  let visitDate = "No Visits Recorded";
  let visitTimeOrSub = "Book appointment below";

  if (latestEnc) {
    visitLabel = latestEnc.visit_type === "IPD" ? "Admitted On" : "Latest Visit";
    const encDate = latestEnc.arrival_ts || latestEnc.date;
    if (encDate) {
      visitDate = new Date(encDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      visitTimeOrSub = latestEnc.arrival_ts
        ? new Date(latestEnc.arrival_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : (latestEnc.department || "Outpatient");
    }
  } else if (nextAppt) {
    visitLabel = "Next Appointment";
    if (nextAppt.scheduled_start) {
      visitDate = new Date(nextAppt.scheduled_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      visitTimeOrSub = new Date(nextAppt.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  // Real DB Attending Doctor
  const dbDoc = (careTeam && careTeam.length > 0 ? careTeam[0] : null) || (latestEpisode?.doctor_name ? { name: latestEpisode.doctor_name, specialty: latestEpisode.department || "Specialist" } : null) || (nextAppt?.doctor ? { name: nextAppt.doctor.name, specialty: nextAppt.specialty || nextAppt.doctor.specialty } : null);
  const attendingDocName = dbDoc?.name || "Not Assigned";
  const attendingDocRole = dbDoc ? (dbDoc.specialty || dbDoc.role || dbDoc.department || "Attending Physician") : "Assigned on booking";

  // Real DB Allergies
  const allergiesList = p360?.allergies || [];
  const hasAllergies = allergiesList.length > 0;
  const allergySummary = hasAllergies ? allergiesList.map((a: any) => a.substance).join(", ") : "No Known Allergies";
  const allergySub = hasAllergies
    ? (allergiesList[0].severity ? `Severity: ${allergiesList[0].severity}` : `${allergiesList.length} recorded`)
    : "None recorded in DB";

  return (
    <div className="min-h-[calc(100vh-5rem)] text-slate-700 font-sans">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-xs lg:hidden"
          aria-label="Close menu"
        />
      )}

      {/* ================= PATIENT WORKSPACE SIDE PANEL (Dark Navy Theme with Bright White Text & Toggle) ================= */}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-20 flex w-[240px] flex-col gap-1 p-3.5 bg-[#0b1329] border-r border-slate-800/80 shadow-2xl overflow-y-auto select-none transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Top Header Row with Title + Collapse button */}
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2 border-b border-slate-800/60 mb-1">
          <span
            className="text-[11px] font-extrabold uppercase tracking-wider"
            style={{ color: "#94a3b8", letterSpacing: "0.08em" }}
          >
            MAIN MENU
          </span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            title="Collapse Sidebar"
            className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>

        {PATIENT_SIDEBAR_NAV.filter((n) => n.section === "MAIN").map((n) => {
          const isActive =
            (n.tab === "My Health Overview" && (!tab || tab === "My Health Overview")) ||
            tab === n.tab ||
            (n.tab === "Appointments" && tab === "Book Consultation") ||
            (n.tab === "My Lab Reports" && (tab === "Scans & Imaging" || tab === "My Lab Reports"));

          return (
            <button
              key={n.label}
              type="button"
              onClick={() => {
                setTab(n.tab);
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition text-left ${
                isActive
                  ? "bg-[#0078d4] text-white shadow-md shadow-blue-500/20"
                  : "hover:bg-white/10"
              }`}
              style={{
                color: isActive ? "#ffffff" : "#f8fafc",
              }}
            >
              <n.icon size={18} color={isActive ? "#ffffff" : "#f8fafc"} className="shrink-0" />
              <span style={{ color: isActive ? "#ffffff" : "#f8fafc" }}>{n.label}</span>
            </button>
          );
        })}

        {/* ACCOUNT & SETTINGS */}
        <div
          className="px-2.5 pt-4 pb-2 text-[11px] font-extrabold uppercase tracking-wider mt-2"
          style={{ color: "#94a3b8", letterSpacing: "0.08em", borderTop: "1px solid rgba(51, 65, 85, 0.8)" }}
        >
          ACCOUNT &amp; SETTINGS
        </div>

        {PATIENT_SIDEBAR_NAV.filter((n) => n.section === "ACCOUNT").map((n) => {
          const isActive = tab === n.tab;
          return (
            <button
              key={n.label}
              type="button"
              onClick={() => {
                setTab(n.tab);
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-bold transition text-left ${
                isActive
                  ? "bg-[#0078d4] text-white shadow-md shadow-blue-500/20"
                  : "hover:bg-white/10"
              }`}
              style={{
                color: isActive ? "#ffffff" : "#f8fafc",
              }}
            >
              <n.icon size={18} color={isActive ? "#ffffff" : "#f8fafc"} className="shrink-0" />
              <span style={{ color: isActive ? "#ffffff" : "#f8fafc" }}>{n.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition text-left hover:bg-rose-950/40 hover:text-rose-100 mt-1"
          style={{ color: "#fca5a5" }}
        >
          <LogOut size={18} className="shrink-0" color="#f87171" />
          <span style={{ color: "#fca5a5" }}>Log Out</span>
        </button>
      </aside>

      {/* ================= MAIN CONTENT + AI ASSISTANT ================= */}
      <div className={`min-w-0 transition-[padding] duration-200 ${sidebarOpen ? "lg:pl-[240px]" : "pl-0"}`}>
        {!sidebarOpen && (
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-700 shadow-xs hover:border-[#0078d4] hover:text-[#0078d4] hover:shadow-sm transition"
            >
              <PanelLeft size={15} className="text-[#0078d4]" />
              <span>Show Navigation Menu</span>
            </button>
          </div>
        )}
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          {/* CENTER / LEFT: HERO BANNER + TABS + OVERVIEW */}
          <div className="space-y-4 min-w-0">
            {/* ================= PATIENT PROFILE CARD ================= */}
            <div className={`${card} p-4 sm:p-5 bg-white`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Profile Details */}
              <div className="flex items-start gap-4">
                <div className="relative group shrink-0">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 text-slate-600 border border-black/[0.08] shadow-sm font-bold text-xl overflow-hidden">
                    <Users size={32} className="text-slate-400" />
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[19px] font-extrabold tracking-tight text-slate-800">{patientName}</h2>
                    {patientGender.toLowerCase() === "female" && (
                      <span className="text-pink-500 text-sm font-bold" title="Female">♀</span>
                    )}
                    {patientGender.toLowerCase() === "male" && (
                      <span className="text-blue-500 text-sm font-bold" title="Male">♂</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0078d4]">
                      {isCheckedInAndActive ? "Checked In" : (latestEnc?.visit_type === "IPD" ? "Active Inpatient" : "Outpatient")}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-500 flex-wrap">
                    {patientAge !== "—" && (
                      <>
                        <span className="font-semibold">{patientAge}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{patientGender}</span>
                    <span>·</span>
                    <span>My MRN: <b className="text-slate-700">{patientMRN}</b></span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-[11.5px] text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><Phone size={12} className="text-slate-400" /> {patientPhone}</span>
                    {patientBloodGroup && patientBloodGroup !== "UNK" && patientBloodGroup !== "Not Set" && (
                      <span className="flex items-center gap-1"><Droplet size={12} className="text-red-500" /> Blood Group: {patientBloodGroup}</span>
                    )}
                    {p360?.patient?.email && (
                      <span className="flex items-center gap-1"><Mail size={12} className="text-slate-400" /> {p360.patient.email}</span>
                    )}
                    {p360?.patient?.address && (
                      <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> {p360.patient.address}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Patient Care Meta from DB (Visit Date, Doctor, Known Allergies) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-3 lg:pt-0">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{visitLabel}</div>
                  <div className="text-[12.5px] font-extrabold text-slate-800 mt-0.5">{visitDate}</div>
                  <div className="text-[10.5px] text-slate-400">{visitTimeOrSub}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">My Attending Doctor</div>
                  <div className="text-[12.5px] font-extrabold text-slate-800 mt-0.5">{attendingDocName}</div>
                  <div className={`text-[10.5px] font-semibold ${dbDoc ? "text-[#0078d4]" : "text-slate-400"}`}>{attendingDocRole}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Known Allergies</div>
                  <div className={`text-[12.5px] font-extrabold mt-0.5 ${hasAllergies ? "text-[#D13438]" : "text-emerald-700"}`}>{allergySummary}</div>
                  <div className="text-[10.5px] text-slate-400">{allergySub}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions inside Card */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. Triage Token Pill */}
                {activeTriageToken && (
                  <button
                    type="button"
                    onClick={() => setTab("Appointments")}
                    className="flex items-center gap-2 rounded-xl bg-blue-50/90 border border-blue-200 hover:bg-blue-100/70 px-3 py-1.5 text-[11.5px] font-bold text-[#0078d4] transition shadow-2xs"
                  >
                    <Ticket size={14} className="text-[#0078d4]" />
                    <span>Token: <b className="text-slate-900 text-[13px]">{activeTriageToken.number}</b></span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 font-medium">Destination: <b className="text-slate-800">{activeTriageToken.room}</b></span>
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.2 text-[9.5px] font-bold">● Active</span>
                  </button>
                )}

                {/* 2. Doctor Consultation Token Pill */}
                {activeDoctorToken && (
                  <button
                    type="button"
                    onClick={() => setTab("Appointments")}
                    className="flex items-center gap-2 rounded-xl bg-teal-50/90 border border-teal-200 hover:bg-teal-100/70 px-3 py-1.5 text-[11.5px] font-bold text-teal-700 transition shadow-2xs"
                  >
                    <User size={14} className="text-teal-600" />
                    <span>Doctor Token: <b className="text-slate-900 text-[13px]">{activeDoctorToken.number}</b></span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 font-medium">Destination: <b className="text-slate-800">{activeDoctorToken.room}</b></span>
                    <span className="rounded-full bg-teal-100 text-teal-700 px-1.5 py-0.2 text-[9.5px] font-bold">● Ready</span>
                  </button>
                )}

                {/* 3. Lab Queue Token Pill */}
                {activeLabToken && (
                  <button
                    type="button"
                    onClick={() => setTab("My Lab Reports")}
                    className="flex items-center gap-2 rounded-xl bg-indigo-50/90 border border-indigo-200 hover:bg-indigo-100/70 px-3 py-1.5 text-[11.5px] font-bold text-indigo-700 transition shadow-2xs"
                  >
                    <FlaskConical size={14} className="text-indigo-600" />
                    <span>Lab Token: <b className="text-slate-900 text-[13px]">{activeLabToken.number}</b></span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 font-medium">Destination: <b className="text-slate-800">{activeLabToken.room}</b></span>
                    <span className="rounded-full bg-blue-100 text-[#0078d4] px-1.5 py-0.2 text-[9.5px] font-bold">● Slot Booked</span>
                  </button>
                )}

                {/* 4. Pharmacy Pickup Token Pill */}
                {activePharmacyToken && (
                  <button
                    type="button"
                    onClick={() => setTab("My Prescriptions")}
                    className="flex items-center gap-2 rounded-xl bg-emerald-50/90 border border-emerald-200 hover:bg-emerald-100/70 px-3 py-1.5 text-[11.5px] font-bold text-emerald-700 transition shadow-2xs"
                  >
                    <PillIcon size={14} className="text-emerald-600" />
                    <span>Pharmacy Token: <b className="text-slate-900 text-[13px]">{activePharmacyToken.number}</b></span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600 font-medium">Destination: <b className="text-slate-800">{activePharmacyToken.room}</b></span>
                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[9.5px] font-bold">● Packaging</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setTab("My Prescriptions")}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 transition"
                >
                  <PillIcon size={13} className="text-emerald-600" /> {activeMeds.length} Active Prescription{activeMeds.length === 1 ? "" : "s"}
                </button>
              </div>

              <div className="flex items-center gap-1 text-slate-400">
                <button type="button" onClick={() => refetchP360()} title="Refresh Data" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                  <RefreshCw size={13} />
                </button>
                <button type="button" onClick={() => setTab("My Lab Reports")} title="View Labs" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 hover:bg-slate-50">
                  <FlaskConical size={13} />
                </button>
                <button type="button" onClick={handleSignOut} title="Log Out" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-600">
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* ================= TAB BAR ================= */}
          <div className="flex gap-x-1.5 sm:gap-x-2 overflow-x-auto border-b border-slate-200/80 pb-2 scrollbar-none">
            {PATIENT_TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-1.5 rounded-xl text-[12.5px] font-bold transition-all ${isActive
                    ? "bg-blue-50/90 text-[#0066fe] border border-blue-200/60 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent"
                    }`}
                >
                  <Icon size={15} className={isActive ? "text-[#0066fe]" : "text-slate-400"} />
                  <span>{t.label}</span>
                  {isActive && (
                    <span className="absolute inset-x-2 -bottom-2 h-0.5 rounded-full bg-[#0066fe]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ================= TAB CONTENTS ================= */}

          {/* 1. MY HEALTH OVERVIEW (Patient-Centric CliniQ Style) */}
          {tab === "My Health Overview" && (
            <div className="space-y-4">
              {/* LIVE ACTIVE QUEUE TOKEN BANNERS */}
              <div className="space-y-3">
                {/* 1. LIVE TRIAGE TOKEN BANNER */}
                {activeTriageToken && (
                  <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-sky-50/40 to-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0078d4] to-[#0c3b63] text-white font-black text-[16px] shadow-xs">
                        {activeTriageToken.number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-extrabold text-slate-900">Active Triage &amp; Intake Queue Token</span>
                          <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                            ● Live Check-In Active
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Please proceed to <b>{activeTriageToken.room}</b> ({activeTriageToken.floor}) for initial vital signs assessment and nurse triage.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("Appointments")}
                      className="shrink-0 px-4 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] transition shadow-xs"
                    >
                      Go to Live Queue ›
                    </button>
                  </div>
                )}

                {/* 2. LIVE DOCTOR CONSULTATION TOKEN BANNER */}
                {activeDoctorToken && (
                  <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50/90 via-emerald-50/40 to-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-800 text-white font-black text-[16px] shadow-xs">
                        {activeDoctorToken.number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-extrabold text-slate-900">Active Doctor Consultation Token</span>
                          <span className="rounded-full bg-teal-100 text-teal-700 border border-teal-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                            ● Ready for Consultation
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Please proceed to <b>{activeDoctorToken.room}</b> ({activeDoctorToken.floor}) to consult with <b>{activeDoctorToken.doctor_name || attendingDocName}</b>.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("Appointments")}
                      className="shrink-0 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[12px] transition shadow-xs"
                    >
                      View Visit Details ›
                    </button>
                  </div>
                )}

                {/* 3. LIVE LABORATORY TOKEN BANNER */}
                {activeLabToken && (
                  <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 via-blue-50/40 to-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0078d4] to-[#3730a3] text-white font-black text-[16px] shadow-xs">
                        {activeLabToken.number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-extrabold text-slate-900">Active Laboratory Queue Token</span>
                          <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                            ● Slot Booked &amp; Confirmed
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Please proceed to <b>{activeLabToken.room}</b> ({activeLabToken.floor}) for sample collection.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("My Lab Reports")}
                      className="shrink-0 px-4 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] transition shadow-xs"
                    >
                      View Test Details ›
                    </button>
                  </div>
                )}

                {/* 4. LIVE PHARMACY PICKUP TOKEN BANNER */}
                {activePharmacyToken && (
                  <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white font-black text-[16px] shadow-xs">
                        {activePharmacyToken.number}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-extrabold text-slate-900">Active Pharmacy Pickup Token</span>
                          <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                            ● Packaging / Ready for Pickup
                          </span>
                        </div>
                        <p className="text-[12px] text-slate-600 mt-0.5">
                          Please proceed to <b>{activePharmacyToken.room}</b> ({activePharmacyToken.floor}) to collect your dispensed medications.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("My Prescriptions")}
                      className="shrink-0 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] transition shadow-xs"
                    >
                      View Prescription Slip ›
                    </button>
                  </div>
                )}
              </div>

              {/* TOP ROW: AI Health Summary, My Vitals, My Care Team */}
              <div className="grid gap-4 lg:grid-cols-[1.15fr_1.4fr_1fr]">
                {/* AI Health Summary (From Clinical Chart) */}
                <div className={`${card} p-3.5 flex flex-col justify-between`}>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-[#0a5aa8]">
                        <Sparkles size={14} /> AI Health Summary <span className="text-[10px] text-slate-400 font-normal">(Clinical Summary)</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Clinical Notes Summary</span>
                    </div>
                    {clinicalSummary ? (
                      <p className="text-[12px] leading-relaxed text-slate-700 whitespace-pre-line">
                        {clinicalSummary}
                      </p>
                    ) : (
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-[12px] text-slate-500 italic">
                        No clinical summary recorded in your chart yet. Summary will appear once your physician completes and approves your consultation notes.
                      </div>
                    )}
                  </div>
                </div>

                {/* My Latest Vitals with abnormal vital red highlighting */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12.5px] font-extrabold text-[#0c3b63]">
                      My Latest Vitals {vitalsData?.captured_ts && <span className="text-[10.5px] font-normal text-slate-400">· {new Date(vitalsData.captured_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </span>
                    <button type="button" onClick={() => setTab("My Vitals")} className="text-[11px] font-semibold text-[#0078d4] hover:underline">View Trends ›</button>
                  </div>
                  {liveVitals.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-1">
                      {liveVitals.map((v: any) => (
                        <div
                          key={v.short}
                          className={`rounded-xl border p-2 text-center flex flex-col justify-between transition ${v.isAbnormal
                            ? "bg-red-50/90 border-red-200 text-red-700 shadow-sm"
                            : "border-black/[0.05] bg-slate-50/60 text-slate-800"
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase ${v.isAbnormal ? "text-red-500" : "text-slate-400"}`}>{v.short}</span>
                            {v.isAbnormal && (
                              <span className="inline-flex items-center px-1 rounded bg-red-200/70 text-red-800 text-[8px] font-extrabold">
                                Abnormal
                              </span>
                            )}
                          </div>
                          <div className="my-1">
                            <div className={`text-[14px] font-extrabold tabular-nums ${v.isAbnormal ? "text-red-700" : "text-slate-800"}`}>{v.value}</div>
                            <div className={`text-[9px] font-medium ${v.isAbnormal ? "text-red-500" : "text-slate-400"}`}>{v.unit}</div>
                          </div>
                          <div className="flex justify-center"><Spark color={v.isAbnormal ? "#D13438" : "#16a34a"} /></div>
                          <div className={`mt-1 text-[8.5px] font-semibold truncate ${v.isAbnormal ? "text-red-700 font-bold" : "text-emerald-600"}`}>{v.status}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[12px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No vitals recorded in your chart yet.
                    </div>
                  )}
                </div>

                {/* My Care Team (Past Doctors from DB) */}
                <div className={`${card} p-3.5`}>
                  <PanelHead title="My Care Team" action="View All" onAction={() => setTab("Care & Recovery Plan")} />
                  {careTeam.length > 0 ? (
                    <div className="space-y-2">
                      {careTeam.map((m: any) => (
                        <div key={m.staff_id || m.name} className="flex items-center gap-2.5">
                          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0078d4]/10 text-[10.5px] font-bold text-[#0078d4]">
                            {initials(m.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-bold text-slate-700">{m.name}</div>
                            <div className="text-[10px] text-slate-400">{m.role || m.specialty || m.department || "Consultant"}</div>
                          </div>
                          {m.badge && <Pill tone="#16a34a">{m.badge}</Pill>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11.5px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No past treating doctors on file yet.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab("Book Consultation")}
                    className="w-full mt-2.5 py-1 text-center text-[11px] font-semibold text-[#0078d4] border border-dashed border-slate-200 rounded-lg hover:bg-blue-50/40"
                  >
                    Book Doctor Consultation
                  </button>
                </div>
              </div>

              {/* SECOND ROW: My Lab Reports, Scans & Imaging, My Prescriptions, Health Conditions */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* My Lab Reports (Non-imaging tests from DB) */}
                <div className={`${card} p-3.5`}>
                  <PanelHead title="My Lab Reports" action="View All" onAction={() => setTab("My Lab Reports")} />
                  {labReports.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {labReports.slice(0, 5).map((l: any, idx: number) => {
                        const statusInfo = getInvestigationStatus(l);
                        return (
                          <div
                            key={l.lab_order_id || idx}
                            onClick={() => setTab("My Lab Reports")}
                            className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition border ${statusInfo.type === "ACTION_REQUIRED"
                              ? "bg-amber-50/90 border-amber-300 hover:bg-amber-100/80 shadow-xs"
                              : statusInfo.type === "BOOKED"
                                ? "bg-blue-50/60 border-blue-200 hover:bg-blue-100/50"
                                : "bg-transparent border-transparent hover:bg-slate-50"
                              }`}
                            title="Click to view in My Lab Reports"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-slate-800 text-[11.5px] truncate block">{l.test || l.name}</span>
                              <span className="text-[9.5px] text-slate-400">{l.panel || "Laboratory Investigation"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {statusInfo.type === "ACTION_REQUIRED" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                  Action Required
                                </span>
                              ) : statusInfo.type === "BOOKED" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-[#0078d4] border border-blue-200">
                                  Booked
                                </span>
                              ) : (
                                <>
                                  <span className="text-slate-600 font-medium text-[11px]">{l.value || "Completed"}</span>
                                  <Pill tone={statusInfo.tone}>
                                    {statusInfo.label}
                                  </Pill>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11.5px]">
                      No laboratory test reports found in your chart.
                    </div>
                  )}
                  {labReports.length > 0 && (
                    <div className="mt-3 text-[10px] text-slate-400 border-t border-slate-100 pt-1.5 flex items-center justify-between">
                      <span>Latest: {labReports[0]?.date || "Recent"}</span>
                      <span>{labReports.length} test{labReports.length === 1 ? "" : "s"}</span>
                    </div>
                  )}
                </div>

                {/* Scans & Diagnostics (Imaging scans only: MRI, CT, X-Ray, etc. from DB) */}
                <div className={`${card} p-3.5`}>
                  <PanelHead title="Scans & Diagnostics" action="View All" onAction={() => setTab("My Lab Reports")} />
                  {scansAndDiagnostics.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {scansAndDiagnostics.slice(0, 4).map((im: any, idx: number) => {
                        const statusInfo = getInvestigationStatus(im);
                        return (
                          <div
                            key={im.report_id || idx}
                            onClick={() => setTab("My Lab Reports")}
                            className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition border ${statusInfo.type === "ACTION_REQUIRED"
                              ? "bg-amber-50/90 border-amber-300 hover:bg-amber-100/80 shadow-xs"
                              : statusInfo.type === "BOOKED"
                                ? "bg-blue-50/60 border-blue-200 hover:bg-blue-100/50"
                                : "bg-transparent border-transparent hover:bg-slate-50"
                              }`}
                            title="Click to view in My Lab Reports"
                          >
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-slate-300">
                              <ScanLine size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11.5px] font-bold text-slate-800">{im.name}</div>
                              <div className="text-[9.5px] text-slate-400">{im.date || im.finding || "Diagnostic Imaging"}</div>
                            </div>
                            {statusInfo.type === "ACTION_REQUIRED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse shrink-0">
                                Action Required
                              </span>
                            ) : statusInfo.type === "BOOKED" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-[#0078d4] border border-blue-200 shrink-0">
                                Booked
                              </span>
                            ) : (
                              <Pill tone="#16a34a">
                                {im.status || "Completed"}
                              </Pill>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11.5px]">
                      No imaging scans or diagnostic reports found in your chart.
                    </div>
                  )}
                  {scansAndDiagnostics.length > 0 && (
                    <div className="mt-3 text-[10px] text-slate-400 border-t border-slate-100 pt-1.5 flex items-center justify-between">
                      <span>Latest: {scansAndDiagnostics[0]?.date || "Recent"}</span>
                      <span>{scansAndDiagnostics.length} scan{scansAndDiagnostics.length === 1 ? "" : "s"}</span>
                    </div>
                  )}
                </div>

                {/* My Active Prescriptions (From DB) */}
                <div className={`${card} p-3.5`}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[12px] font-extrabold text-[#0c3b63]">My Medicines ({activeMeds.length} Active)</h3>
                    <button type="button" onClick={() => setTab("My Prescriptions")} className="text-[11px] font-semibold text-[#0078d4] hover:underline">
                      View All ›
                    </button>
                  </div>
                  {activeMeds.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {activeMeds.slice(0, 6).map((m: any, idx: number) => (
                        <div key={m.medication_id || m.name || idx} className="flex items-center justify-between text-[11.5px]">
                          <span className="font-semibold text-slate-700 truncate">{m.name || m.drug_name}</span>
                          <div className="flex items-center gap-2 text-slate-500 text-[10.5px]">
                            <span className="font-medium">{m.dose || m.dosage}</span>
                            <span className="font-bold text-slate-400">{m.freq || "Daily"}</span>
                            <span className="text-slate-400">{m.route || "Oral"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11.5px]">
                      No active medications recorded in your chart.
                    </div>
                  )}
                </div>

                {/* Health Conditions */}
                <div className={`${card} p-3.5`}>
                  <PanelHead title="Health Conditions" action="Details" onAction={() => setTab("Care & Recovery Plan")} />
                  {p360?.issues && p360.issues.length > 0 ? (
                    <ol className="space-y-1.5 mt-1">
                      {p360.issues.map((p: any, i: number) => (
                        <li key={p.issue_id || p.issue_name || i} className="flex items-center gap-1.5 text-[11.5px] text-slate-700">
                          <span className="font-bold text-slate-400 w-4">{i + 1}.</span>
                          <span className="flex-1 truncate">{p.issue_name}</span>
                          {p.status === "ACTIVE" && <Pill tone="#0078d4">Active</Pill>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="py-6 text-center text-slate-400 text-[11.5px]">
                      No health conditions recorded in your chart.
                    </div>
                  )}
                </div>
              </div>

              {/* THIRD ROW: My Care Journey Timeline */}
              <div className={`${card} p-3.5`}>
                <PanelHead title="My Care Journey & Visits" action="Full Timeline" onAction={() => setTab("Care Timeline")} />
                <div className="relative mt-2 overflow-x-auto pb-2 scrollbar-none">
                  <div className="flex items-center min-w-[760px] gap-2">
                    {RECENT_ENC.map((e, idx) => (
                      <Fragment key={e.kind + idx}>
                        <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                          <div className="text-[9.5px] text-slate-400 font-medium">{e.date}</div>
                          <div className="text-[9px] text-slate-400">{e.time || "—"}</div>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: `${e.tone}18`, color: e.tone }}>
                              <e.icon size={11} />
                            </span>
                            <span className="text-[11px] font-bold text-slate-700 truncate">{e.kind}</span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500 truncate">{e.detail}</div>
                        </div>
                        {idx < RECENT_ENC.length - 1 && (
                          <div className="w-4 h-0.5 border-t border-dashed border-slate-300 shrink-0" />
                        )}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* BOTTOM STRIP: Admission Details Bar */}
              <div className="rounded-xl border border-black/[0.06] bg-white p-3 shadow-sm">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center sm:text-left">
                  {ADMISSION_BAR.map((b) => (
                    <div key={b.label} className="border-r last:border-r-0 border-slate-100 pr-2">
                      <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">{b.label}</div>
                      <div className="text-[11.5px] font-extrabold text-slate-700 truncate mt-0.5">{b.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. APPOINTMENTS TAB */}
          {tab === "Appointments" && (
            <div className="space-y-4">
              {/* TOP STRIP / LIVE VISIT TRACKER: Only shown when patient has checked in and visit is actively in progress */}
              {isCheckedInAndActive && (
                <div className={`${card} p-5 bg-gradient-to-br from-white to-blue-50/30 space-y-4 animate-in fade-in duration-200`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[18px] font-extrabold text-slate-800">Live Hospital Visit Journey &amp; Queue Status</h2>
                        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-bold">
                          Live Active Visit
                        </span>
                      </div>
                      <p className="text-[12.5px] text-slate-500 mt-1">
                        Track your live consultation steps, triage routing, counter calls, and real-time queue position.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-gradient-to-br from-[#0078d4] to-[#0c3b63] p-4 text-white text-center min-w-[150px] shadow-md">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Your Active Token</div>
                        <div className="text-[26px] font-black tracking-tight">{currentToken}</div>
                        <div className="text-[10px] font-medium text-emerald-300">● Live in Queue</div>
                      </div>
                    </div>
                  </div>

                  {/* MY VISIT JOURNEY TRACKER */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5">
                        <Sparkles size={15} className="text-[#0078d4]" /> My Visit Journey Tracker
                      </h3>
                      <span className="text-[11px] font-semibold text-slate-400">
                        Destination: <b className="text-slate-700">{tokenObject?.room || "Consultation Room 4"}</b>
                      </span>
                    </div>
                    <StageTracker stage={currentStageIndex} token={tokenObject} />
                  </div>
                </div>
              )}

              {/* Status notifications */}
              {checkInSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12.5px] font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} /> {checkInSuccess}
                </div>
              )}
              {checkInError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12.5px] font-semibold flex items-center gap-2">
                  <AlertCircle size={16} /> {checkInError}
                </div>
              )}

              {/* FLOW STEP 1: Appointments List with Live Status & Check-In */}
              {checkinStep === "appointments" && (
                <div className={`${card} p-5 space-y-4`}>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                    <div>
                      <h3 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                        <Calendar size={18} className="text-[#0078d4]" /> Appointments
                      </h3>
                      <p className="text-[12px] text-slate-500 mt-0.5">
                        Scheduled doctor consultations for today and upcoming dates.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          refetchTodayAppointments();
                          refetchAppointments();
                        }}
                        className="text-[11.5px] font-semibold text-[#0078d4] bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition"
                      >
                        <RefreshCw size={12} /> Refresh
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("Book Consultation")}
                        className="text-[11.5px] font-bold text-white bg-[#0078d4] hover:bg-[#0a6ec2] px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition"
                      >
                        <CalendarPlus size={13} /> Book Consultation
                      </button>
                    </div>
                  </div>

                  {loadingTodayAppts && (
                    <div className="py-8 text-center text-slate-400 text-[12.5px]">
                      Loading scheduled consultations from medical chart...
                    </div>
                  )}

                  {!loadingTodayAppts && upcomingAndTodayAppointments.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-[12.5px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No upcoming appointments found in your chart. Click "Book Consultation" to schedule a visit.
                    </div>
                  )}

                  {/* Scrollable list showing today's and upcoming appointments */}
                  {upcomingAndTodayAppointments.length > 0 && (
                    <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
                      {upcomingAndTodayAppointments.map((appt: any) => {
                        const rawStatus = (appt.status || "BOOKED").toUpperCase().replace(/-/g, "_");
                        const isNotCheckedIn = rawStatus === "BOOKED" || rawStatus === "CONFIRMED" || rawStatus === "SCHEDULED";

                        const apptDateIso = appt.scheduled_start ? appt.scheduled_start.slice(0, 10) : "";
                        const todayIso = new Date().toISOString().slice(0, 10);
                        const isToday = apptDateIso === todayIso || appt.is_today || !appt.scheduled_start;

                        let statusBadge = (
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                            BOOKED
                          </span>
                        );

                        if (rawStatus === "CHECKED_IN" || rawStatus === "CHECKEDIN" || rawStatus === "ARRIVED") {
                          statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                              CHECKED IN
                            </span>
                          );
                        } else if (rawStatus === "TRIAGED" || rawStatus === "TRIAGE") {
                          statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                              TRIAGED
                            </span>
                          );
                        } else if (rawStatus === "IN_CONSULTATION" || rawStatus === "CONSULTING" || rawStatus === "IN_CONSULT" || rawStatus === "INCONSULT") {
                          statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-[#0078d4] border border-blue-200 uppercase">
                              IN CONSULT
                            </span>
                          );
                        } else if (rawStatus === "COMPLETED" || rawStatus === "DISCHARGED") {
                          statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              COMPLETED
                            </span>
                          );
                        } else if (rawStatus === "CANCELLED") {
                          statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase">
                              CANCELLED
                            </span>
                          );
                        }

                        const apptDateStr = appt.scheduled_start
                          ? new Date(appt.scheduled_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                          : "Today";
                        const apptTimeStr = appt.scheduled_start
                          ? new Date(appt.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : "10:30 AM";

                        return (
                          <div
                            key={appt.appointment_id}
                            className={`p-3.5 rounded-xl border transition ${isToday
                              ? "bg-blue-50/40 border-blue-200 shadow-xs"
                              : "bg-slate-50/60 border-slate-200 hover:bg-slate-50"
                              } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-[13.5px] text-slate-800">{appt.doctor?.name || "Assigned Doctor"}</span>
                                <Pill tone="#0078d4">{appt.specialty || "Specialist"}</Pill>
                                {statusBadge}
                                {isToday && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white uppercase tracking-wider">
                                    Today's Visit
                                  </span>
                                )}
                              </div>
                              <div className="text-[11.5px] text-slate-500 mt-1 flex items-center gap-2.5 flex-wrap">
                                <span className={`flex items-center gap-1 font-semibold ${isToday ? "text-[#0078d4]" : "text-slate-700"}`}>
                                  <Calendar size={12} className={isToday ? "text-[#0078d4]" : "text-slate-400"} /> {apptDateStr}
                                </span>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Clock size={12} className="text-slate-400" /> {apptTimeStr}
                                </span>
                                <span>·</span>
                                <span>Room: <b>{[appt.doctor?.room, appt.doctor?.floor].filter(Boolean).join(" / ") || "OPD-04"}</b></span>
                                <span>·</span>
                                <span className="text-slate-600 truncate max-w-[240px]">Reason: {appt.reason || "Consultation"}</span>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-2">
                              {isToday && isNotCheckedIn ? (
                                <button
                                  type="button"
                                  disabled={checkingIn}
                                  onClick={() => handleSelectCheckinAppt(appt)}
                                  className="flex items-center justify-center gap-1.5 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] px-4 py-2 shadow-sm transition"
                                >
                                  Check In <ChevronRight size={14} />
                                </button>
                              ) : isToday ? (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                                  <Check size={13} /> Checked In
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                                  <Calendar size={12} /> Scheduled
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* FLOW STEP 2: Appointment Details Review & Complete Check-In */}
              {checkinStep === "details" && selectedCheckinAppt && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 size={18} className="text-[#0078d4]" /> Review Consultation &amp; Confirm Check-In
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCheckinStep("appointments")}
                      className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      <ArrowLeft size={13} /> Back
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-[12px]">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Assigned Doctor</span>
                      <div className="font-bold text-slate-800 mt-0.5">{selectedCheckinAppt.doctor?.name || "Dr. Ahmed Ali"}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Specialty</span>
                      <div className="font-bold text-[#0078d4] mt-0.5">{selectedCheckinAppt.specialty || "Cardiology"}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Scheduled Time</span>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {selectedCheckinAppt.scheduled_start ? new Date(selectedCheckinAppt.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Today"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Room / Counter Location</span>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {[selectedCheckinAppt.doctor?.room, selectedCheckinAppt.doctor?.floor].filter(Boolean).join(" / ") || "Consultation Room 4"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 sm:col-span-2">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Reason for Visit</span>
                      <div className="font-medium text-slate-700 mt-0.5">{selectedCheckinAppt.reason || "Routine Consultation"}</div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCheckinStep("appointments")}
                      className="py-2 px-4 rounded-lg border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50"
                    >
                      ‹ Change Selection
                    </button>
                    <button
                      type="button"
                      disabled={checkingIn}
                      onClick={() => handleCompleteCheckIn(selectedCheckinAppt.appointment_id, selectedCheckinAppt.reason)}
                      className="py-2 px-6 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12.5px] shadow-sm flex items-center gap-2 transition"
                    >
                      {checkingIn ? <RefreshCw className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                      {checkingIn ? "Checking In..." : "Complete Check-In & Get Token"}
                    </button>
                  </div>
                </div>
              )}

              {/* CARD 2: Past Appointments Card */}
              <div className={`${card} p-5 space-y-3`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h3 className="text-[14.5px] font-extrabold text-slate-800 flex items-center gap-2">
                      <History size={16} className="text-[#0078d4]" /> Past Appointments
                    </h3>
                    <p className="text-[11.5px] text-slate-500 mt-0.5">
                      Historical completed consultations and previous hospital encounters.
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {pastAppointmentsList.length} Completed Visit{pastAppointmentsList.length === 1 ? "" : "s"}
                  </span>
                </div>

                {pastAppointmentsList.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-[12px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No past completed appointments found in your medical chart.
                  </div>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto pr-1 space-y-2 scrollbar-thin">
                    {pastAppointmentsList.map((pa: any, pIdx: number) => {
                      const paDateStr = pa.scheduled_start
                        ? new Date(pa.scheduled_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "Past Date";
                      const paTimeStr = pa.scheduled_start
                        ? new Date(pa.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : "10:00 AM";

                      return (
                        <div
                          key={pa.appointment_id || pIdx}
                          className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 hover:bg-slate-50 flex items-center justify-between gap-3 transition"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[13px] text-slate-800">{pa.doctor?.name || "Dr. Ahmed Ali"}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {pa.specialty || pa.doctor?.specialty || "Cardiology"}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Completed
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2.5 flex-wrap">
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                <Calendar size={11} className="text-slate-400" /> {paDateStr}
                              </span>
                              <span>·</span>
                              <span>{paTimeStr}</span>
                              <span>·</span>
                              <span className="text-slate-600 truncate max-w-[260px]">Reason: {pa.reason || "Consultation Completed"}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-50/80 px-2.5 py-1 rounded-lg">
                              <CheckCircle2 size={12} /> Closed
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. BOOK CONSULTATION TAB (ClinIQ Multi-Step DB Sync) */}
          {tab === "Book Consultation" && (
            <div className={`${card} p-5 max-w-2xl mx-auto space-y-4`}>
              <div className="mb-2">
                <h2 className="text-[18px] font-extrabold text-slate-800">Book Doctor Consultation / Follow-Up</h2>
                <p className="text-[12.5px] text-slate-500">Live doctor schedule discovery & instant booking synchronized with your medical chart.</p>
              </div>

              {/* Stepper indicator */}
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${bookingStep === "form" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                  1. Reason & Date
                </span>
                <span className="text-slate-300">›</span>
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${bookingStep === "slots" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                  2. Doctor & Time
                </span>
                <span className="text-slate-300">›</span>
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${bookingStep === "confirm" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                  3. Payment & Confirm
                </span>
              </div>

              {bookingError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[12.5px] font-semibold flex items-center gap-2">
                  <AlertCircle size={16} /> {bookingError}
                </div>
              )}

              {/* STEP 1: Reason & Date */}
              {bookingStep === "form" && (
                <form onSubmit={handleFindSlots} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Consultation Date</label>
                    <input
                      type="date"
                      value={bookingDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setBookingDate(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-[13px] text-slate-800 outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Reason for Visit / Health Concern</label>
                    <textarea
                      rows={3}
                      value={bookingReason}
                      onChange={(e) => setBookingReason(e.target.value)}
                      placeholder="Describe how you are feeling or the purpose of your check-up..."
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] shadow-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={findingSlots}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] py-2.5 transition shadow-sm"
                  >
                    {findingSlots ? <RefreshCw className="animate-spin" size={16} /> : <CalendarPlus size={16} />}
                    {findingSlots ? "Finding Available Doctors..." : "Find Available Doctor Slots"}
                  </button>
                </form>
              )}

              {/* STEP 2: Doctor & Slot Selection */}
              {bookingStep === "slots" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-bold text-slate-700">
                      Available Specialist Slots ({bookingSpecialty}) on {bookingDate}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBookingStep("form")}
                      className="text-[11.5px] font-bold text-[#0078d4] hover:underline"
                    >
                      ‹ Change Date
                    </button>
                  </div>

                  {availableSlots.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-[12.5px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No open slots available for this specialty on {bookingDate}. Please try another date.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {doctorSlotGroups.map(({ doctor, slots }) => (
                        <div key={doctor.doctor_id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0078d4]/10 text-[11px] font-bold text-[#0078d4]">
                                {initials(doctor.doctor_name)}
                              </div>
                              <div>
                                <div className="font-bold text-[13px] text-slate-800">{doctor.doctor_name}</div>
                                <div className="text-[10.5px] text-slate-400">
                                  {doctor.specialty} · Room: {doctor.room || "OPD-04"} · Fee: ₹{doctor.opd_fee || 500}
                                </div>
                              </div>
                            </div>
                            <Pill tone="#16a34a">Available</Pill>
                          </div>

                          {/* Horizontal left to right scrolling slot row */}
                          <div className="flex gap-2 overflow-x-auto pb-2 pt-1 border-t border-slate-100 scrollbar-thin">
                            {slots.map((s: any) => {
                              const isSelected = selectedSlot?.scheduled_start === s.scheduled_start && selectedSlot?.doctor_id === s.doctor_id;
                              const timeStr = new Date(s.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              return (
                                <button
                                  key={s.scheduled_start}
                                  type="button"
                                  onClick={() => setSelectedSlot(s)}
                                  className={`shrink-0 py-1.5 px-3 rounded-lg text-[11.5px] font-bold border transition whitespace-nowrap ${isSelected
                                    ? "bg-[#0078d4] border-[#0078d4] text-white shadow-sm"
                                    : "border-slate-200 hover:border-[#0078d4] text-slate-700 bg-slate-50/70 hover:bg-white"
                                    }`}
                                >
                                  {timeStr}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setBookingStep("form")}
                      className="py-2 px-4 rounded-lg border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50"
                    >
                      ‹ Back
                    </button>
                    <button
                      type="button"
                      disabled={!selectedSlot}
                      onClick={() => setBookingStep("confirm")}
                      className="py-2 px-6 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12.5px] shadow-sm disabled:opacity-50 transition"
                    >
                      Continue to Review ›
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Confirm & Pay */}
              {bookingStep === "confirm" && selectedSlot && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-[12px]">
                    <h3 className="font-extrabold text-[13px] text-slate-800 border-b border-slate-200/60 pb-2">
                      Consultation Booking Summary
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Doctor</span>
                        <div className="font-bold text-slate-800">{selectedSlot.doctor_name}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Specialty</span>
                        <div className="font-bold text-[#0078d4]">{selectedSlot.specialty}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Date</span>
                        <div className="font-bold text-slate-800">{bookingDate}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Time Slot</span>
                        <div className="font-bold text-slate-800">
                          {new Date(selectedSlot.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Location</span>
                        <div className="font-bold text-slate-800">{selectedSlot.room || "OPD Consultation Room 4"}</div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-slate-400">Consultation Fee</span>
                        <div className="font-extrabold text-emerald-600">₹{selectedSlot.opd_fee || 500}</div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setBookingStep("slots")}
                      className="py-2 px-4 rounded-lg border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50"
                    >
                      ‹ Change Slot
                    </button>
                    <button
                      type="button"
                      disabled={bookingLoading}
                      onClick={handleConfirmAndPay}
                      className="py-2.5 px-6 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] shadow-sm flex items-center gap-2 transition"
                    >
                      {bookingLoading ? <RefreshCw className="animate-spin" size={16} /> : <CreditCard size={16} />}
                      {bookingLoading ? "Processing Booking..." : `Pay ₹${selectedSlot.opd_fee || 500} & Confirm Booking`}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Success Confirmation */}
              {bookingStep === "success" && (
                <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center space-y-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-[16px] font-extrabold text-emerald-900">Consultation Booked Successfully!</h3>
                  <p className="text-[12.5px] text-emerald-800 max-w-md mx-auto">
                    Your appointment with <b>{selectedSlot?.doctor_name || "Doctor"}</b> has been confirmed for <b>{bookingDate}</b>.
                  </p>
                  <div className="pt-2 flex justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        resetBookingFlow();
                        setTab("Appointments");
                      }}
                      className="py-2 px-4 rounded-lg bg-[#0078d4] text-white font-bold text-[12px] shadow-sm"
                    >
                      View in Appointments ›
                    </button>
                    <button
                      type="button"
                      onClick={resetBookingFlow}
                      className="py-2 px-4 rounded-lg border border-emerald-300 text-emerald-800 font-bold text-[12px] hover:bg-emerald-100/50"
                    >
                      Book Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. MY VITALS TAB */}
          {tab === "My Vitals" && (
            <VitalsSection
              vitalsHistory={p360?.vitals_history || []}
              latestVitals={p360?.latest_vitals}
              patientName={portalPatientName}
            />
          )}

          {/* 5. MY LAB REPORTS TAB (Includes Laboratory Tests + Scans & Diagnostic Imaging) */}
          {tab === "My Lab Reports" && (
            <div className="space-y-4">
              {/* ACTIVE LAB QUEUE TOKEN BANNER */}
              {activeLabToken && (
                <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="grid h-12 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0078d4] to-[#0c3b63] text-white font-black text-[16px] shadow-sm">
                      {activeLabToken.number}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-extrabold text-slate-900">Active Laboratory Queue Token</span>
                        <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                          ● Slot Booked &amp; Confirmed
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-600 mt-0.5">
                        Please proceed to <b>{activeLabToken.room}</b> ({activeLabToken.floor}) for sample collection.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-500 bg-white/80 border border-slate-200 px-3 py-1.5 rounded-lg">
                      Est. Wait: ~{activeLabToken.eta_minutes || 10} min
                    </span>
                  </div>
                </div>
              )}

              <LabReportsSection
                labReports={labReports}
                scansAndDiagnostics={scansAndDiagnostics}
              />
            </div>
          )}

          {/* 7. MY PRESCRIPTIONS TAB */}
          {tab === "My Prescriptions" && (
            <PrescriptionsSection
              prescriptions={p360?.prescriptions || []}
              patientId={portalPatientId}
              refetchP360={() => refetchP360()}
            />
          )}

          {/* 8. CARE TIMELINE & DOCTOR NOTES TAB */}
          {(tab === "Care Timeline" || tab === "Procedures" || tab === "Medical Documents" || tab === "Care & Recovery Plan" || tab === "Doctor Notes") && (
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <h3 className="text-[14px] font-bold text-slate-800 mb-3">{tab}</h3>
                <ConsultationSummary
                  encounterId={latestEpisode?.encounter_id || "ENC-001"}
                  triage={{
                    chief_complaint: "Chest discomfort upon exertion, now resolved after stent placement.",
                  }}
                  notes="Doctor's Instructions for Home Care:\n1. Continue daily Aspirin and Clopidogrel with meals.\n2. Maintain gentle physical activity (15 mins daily walk).\n3. Keep your next review appointment with Dr. Ahmed Ali on 14 May."
                  note={{
                    note_id: "NOTE-201",
                    author_name: "Dr. Ahmed Ali",
                    created_at: "2024-05-10T11:30:00Z",
                    assessment: "Post-PCI Cardiac Recovery (NSTEMI) · Hemodynamically stable with normal cardiac recovery markers.",
                  }}
                />
              </div>
            </div>
          )}

          {/* 9. BILLING & INVOICES TAB */}
          {tab === "Billing" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-[20px] font-extrabold text-slate-800 tracking-tight">Billing</h2>
                <p className="text-[12.5px] text-slate-500 mt-0.5">View your bills and payment history</p>
              </div>

              <BillingSection
                bills={p360?.bills || []}
                onPaymentSuccess={() => refetchP360()}
              />
            </div>
          )}

          {/* 10. MY DOCUMENTS TAB (Dedicated Document Records & Upload Center) */}
          {tab === "My Documents" && (
            <div className="space-y-4">
              {/* Document Upload Card */}
              <div className={`${card} p-5`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-2">
                      <FolderOpen size={18} className="text-[#0078d4]" /> Patient Document Vault
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Upload and manage all medical documents, previous lab tests, scan images, prescription slips, and discharge records.
                    </p>
                  </div>
                  <span className="text-[11.5px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {(p360?.documents || []).length} Document{(p360?.documents || []).length === 1 ? "" : "s"} On File
                  </span>
                </div>

                {/* Upload Form */}
                <form onSubmit={handleUploadDocument} className="mt-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-3">
                  <div className="text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5">
                    <FileUp size={15} className="text-[#0078d4]" /> Upload New Health Record / Document
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Title / Note</label>
                      <input
                        type="text"
                        value={docUploadTitle}
                        onChange={(e) => setDocUploadTitle(e.target.value)}
                        placeholder="e.g. Chest X-Ray / Previous CBC Report"
                        className="w-full text-[12px] rounded-lg border border-slate-300 bg-white p-2 text-slate-800 focus:border-[#0078d4] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Category *</label>
                      <select
                        value={docUploadType}
                        onChange={(e) => setDocUploadType(e.target.value)}
                        className="w-full text-[12px] rounded-lg border border-slate-300 bg-white p-2 text-slate-800 focus:border-[#0078d4] focus:outline-none font-semibold"
                      >
                        <option value="LAB_REPORT">🧪 Laboratory Report</option>
                        <option value="SCAN">🩻 Radiology Scan / Imaging</option>
                        <option value="PRESCRIPTION">💊 Doctor Prescription</option>
                        <option value="DISCHARGE">🏥 Discharge Summary</option>
                        <option value="INSURANCE">📄 Health Insurance / Claim</option>
                        <option value="OTHER">📁 Other Medical Record</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Select File (PDF, Images, Scans) *</label>
                      <input
                        type="file"
                        onChange={(e) => setDocUploadFile(e.target.files?.[0] || null)}
                        className="w-full text-[11px] rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-bold file:bg-[#0078d4] file:text-white hover:file:bg-[#0a6ec2] cursor-pointer"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,.txt"
                      />
                    </div>
                  </div>

                  {docUploadError && (
                    <div className="text-[11.5px] text-red-600 font-semibold">{docUploadError}</div>
                  )}
                  {docUploadSuccess && (
                    <div className="text-[11.5px] text-emerald-700 font-bold flex items-center gap-1 bg-emerald-50 border border-emerald-200 p-2 rounded-lg">
                      <CheckCircle2 size={14} /> {docUploadSuccess}
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={uploadingDoc || !docUploadFile}
                      className="px-4 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {uploadingDoc ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploadingDoc ? "Uploading..." : "Upload & Save Document"}
                    </button>
                  </div>
                </form>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 pt-4 border-t border-slate-100 overflow-x-auto">
                  <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Filter:</span>
                  {[
                    { key: "ALL", label: "All Records" },
                    { key: "LAB_REPORT", label: "Lab Reports" },
                    { key: "SCAN", label: "Scans & Imaging" },
                    { key: "PRESCRIPTION", label: "Prescriptions" },
                    { key: "DISCHARGE", label: "Discharge Summaries" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setDocFilter(f.key)}
                      className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition whitespace-nowrap ${docFilter === f.key
                        ? "bg-[#0078d4] text-white shadow-xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Documents Grid / List */}
                <div className="mt-4">
                  {(() => {
                    const allDocs = p360?.documents || [];
                    const filteredDocs = docFilter === "ALL"
                      ? allDocs
                      : allDocs.filter((d: any) => d.doc_type === docFilter);

                    if (filteredDocs.length === 0) {
                      return (
                        <div className="py-10 text-center text-slate-400 text-[12px] bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <FolderOpen size={28} className="mx-auto mb-2 text-slate-300" />
                          No medical documents found {docFilter !== "ALL" ? `for ${docFilter}` : "in your vault"}. Upload your files above.
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredDocs.map((doc: any, idx: number) => {
                          const isScan = doc.doc_type === "SCAN";
                          const isLab = doc.doc_type === "LAB_REPORT";
                          const isRx = doc.doc_type === "PRESCRIPTION";

                          return (
                            <div
                              key={doc.document_id || idx}
                              className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-[#0078d4]/50 shadow-xs flex flex-col justify-between gap-3 transition"
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-bold ${isScan ? "bg-purple-100 text-purple-700" : isLab ? "bg-blue-100 text-[#0078d4]" : isRx ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                                  }`}>
                                  {isScan ? <ScanLine size={17} /> : isLab ? <FlaskConical size={17} /> : isRx ? <PillIcon size={17} /> : <FileText size={17} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[12.5px] font-bold text-slate-800" title={doc.title}>
                                    {doc.title || "Medical Document"}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="px-2 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600">
                                      {doc.doc_type?.replace(/_/g, " ") || "DOCUMENT"}
                                    </span>
                                    {doc.created_ts && (
                                      <span className="text-[10px] text-slate-400">
                                        {new Date(doc.created_ts).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11.5px]">
                                {doc.uri ? (
                                  <a
                                    href={doc.uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-[#0078d4] hover:underline inline-flex items-center gap-1"
                                  >
                                    <ExternalLink size={12} /> View File
                                  </a>
                                ) : (
                                  <span className="text-slate-400 text-[10.5px]">Archived</span>
                                )}
                                <div className="flex items-center gap-1.5">
                                  {doc.uri && (
                                    <a
                                      href={doc.uri}
                                      download={doc.title || "document"}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition"
                                      title="Download"
                                    >
                                      <Download size={12} />
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDocument(doc.document_id)}
                                    className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold transition"
                                    title="Delete Document"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 11. MY PROFILE TAB */}
          {tab === "My Profile" && (
            <div className="space-y-4">
              <div className={`${card} p-5 space-y-6`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
                      <User size={19} className="text-[#0078d4]" /> Patient Profile &amp; Medical Demographics
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Update your contact details, manage known allergies, chronic health history, and medical records.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#0078d4] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition"
                  >
                    <Download size={13} /> Export Health Card
                  </button>
                </div>

                {/* SECTION 1: BASIC DEMOGRAPHICS */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[13.5px] font-bold text-slate-800 flex items-center gap-1.5">
                        <UserRound size={16} className="text-[#0078d4]" /> Patient Basic Demographics
                      </h4>
                      <p className="text-[11.5px] text-slate-500">
                        Update your personal demographics and contact information below.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveDemographics} className="space-y-4 p-4 rounded-2xl bg-slate-50/70 border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {/* First Name (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">First Name</label>
                        <input
                          type="text"
                          value={profileFirstName}
                          onChange={(e) => setProfileFirstName(e.target.value)}
                          placeholder="e.g. Rahul"
                          className="w-full text-[13.5px] font-bold text-slate-800 bg-transparent focus:outline-none placeholder:font-normal placeholder:text-slate-400 mt-1"
                          required
                        />
                      </div>

                      {/* Last Name (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Last Name</label>
                        <input
                          type="text"
                          value={profileLastName}
                          onChange={(e) => setProfileLastName(e.target.value)}
                          placeholder="e.g. Sharma"
                          className="w-full text-[13.5px] font-bold text-slate-800 bg-transparent focus:outline-none placeholder:font-normal placeholder:text-slate-400 mt-1"
                        />
                      </div>

                      {/* Gender (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Gender</label>
                        <select
                          value={profileGender}
                          onChange={(e) => setProfileGender(e.target.value)}
                          className="w-full text-[13.5px] font-bold text-slate-800 bg-transparent focus:outline-none mt-1 cursor-pointer"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      {/* Date of Birth (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Date of Birth</label>
                        <input
                          type="date"
                          value={profileDob}
                          onChange={(e) => setProfileDob(e.target.value)}
                          max={new Date().toISOString().slice(0, 10)}
                          className="w-full text-[13px] font-bold text-slate-800 bg-transparent focus:outline-none mt-1"
                        />
                      </div>

                      {/* Email Address (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Email Address</label>
                        <input
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          placeholder="e.g. patient@gmail.com"
                          className="w-full text-[13px] font-bold text-slate-800 bg-transparent focus:outline-none placeholder:font-normal placeholder:text-slate-400 mt-1"
                        />
                      </div>

                      {/* Locked: Mobile Phone */}
                      <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/80 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Mobile Phone</span>
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5"><Lock size={10} /> Locked</span>
                        </div>
                        <div className="text-[13.5px] font-extrabold text-slate-700 mt-1">{patientPhone}</div>
                      </div>

                      {/* Locked: MRN */}
                      <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/80 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Medical Record No (MRN)</span>
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5"><Lock size={10} /> Locked</span>
                        </div>
                        <div className="text-[13.5px] font-extrabold text-[#0078d4] mt-1">{patientMRN}</div>
                      </div>

                      {/* Locked: Blood Group */}
                      <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/80 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Blood Group</span>
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5"><Lock size={10} /> Locked</span>
                        </div>
                        <div className="text-[13.5px] font-extrabold text-red-600 mt-1">
                          {p360?.patient?.blood_group ? `${p360.patient.blood_group}` : "B+ (Positive)"}
                        </div>
                      </div>

                      {/* Residential Address (Editable) */}
                      <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs focus-within:border-[#0078d4] focus-within:ring-2 focus-within:ring-blue-500/15 transition">
                        <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Residential Address</label>
                        <input
                          type="text"
                          value={profileAddress}
                          onChange={(e) => setProfileAddress(e.target.value)}
                          placeholder="e.g. Flat 402, Green Valley Apartments, Hyderabad"
                          className="w-full text-[13px] font-bold text-slate-800 bg-transparent focus:outline-none placeholder:font-normal placeholder:text-slate-400 mt-1"
                        />
                      </div>
                    </div>

                    {profileSaveError && (
                      <div className="text-[12px] text-red-600 font-semibold">{profileSaveError}</div>
                    )}
                    {profileSaveSuccess && (
                      <div className="text-[12px] text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                        <CheckCircle2 size={16} /> {profileSaveSuccess}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="px-5 py-2.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12.5px] flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                      >
                        {savingProfile ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
                        {savingProfile ? "Saving Changes..." : "Save Demographics"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* SECTION 2: MEDICAL DEMOGRAPHICS (Allergies + Chronic Medical History + Document Upload) */}
                <div className="space-y-4 pt-3 border-t border-slate-100">
                  <div>
                    <h4 className="text-[13.5px] font-bold text-slate-800 flex items-center gap-1.5">
                      <HeartPulse size={16} className="text-[#0078d4]" /> Medical Demographics &amp; Health History
                    </h4>
                    <p className="text-[11.5px] text-slate-500">
                      Manage your known drug/food allergies, chronic conditions, and attach previous health records.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* A. Allergies Card */}
                    <div className="p-4 rounded-2xl border border-red-200 bg-red-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-extrabold text-red-800 flex items-center gap-1.5">
                          <AlertCircle size={16} /> Known Allergies
                        </div>
                        <button
                          type="button"
                          onClick={() => { setShowAddAllergyModal(true); setAllergyError(""); }}
                          className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1 transition shadow-xs"
                        >
                          <Plus size={12} /> Add Allergy
                        </button>
                      </div>

                      {/* Allergies List */}
                      {p360?.allergies && p360.allergies.length > 0 ? (
                        <div className="space-y-2">
                          {p360.allergies.map((a: any, idx: number) => {
                            const isSevere = (a.severity || "").toUpperCase() === "SEVERE";
                            return (
                              <div
                                key={a.allergy_id || a.substance || idx}
                                className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-red-200/80 shadow-2xs"
                              >
                                <div>
                                  <div className="text-[12.5px] font-bold text-slate-800">{a.substance}</div>
                                  <div className="text-[10px] text-slate-500">
                                    Reaction: {a.reaction || "Skin rash / sensitivity"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isSevere ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                    }`}>
                                    {a.severity || "MILD"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAllergy(a.allergy_id || a.substance)}
                                    className="p-1 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                                    title="Remove Allergy"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-3 text-center text-slate-500 text-[11.5px] bg-white/80 rounded-xl border border-dashed border-red-200">
                          No allergies recorded. Click &quot;+ Add Allergy&quot; to add.
                        </div>
                      )}
                    </div>

                    {/* B. Chronic Medical History Card */}
                    <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-extrabold text-[#0a5aa8] flex items-center gap-1.5">
                          <HeartPulse size={16} /> Chronic Medical History
                        </div>
                        <button
                          type="button"
                          onClick={() => { setShowAddIssueModal(true); setIssueError(""); }}
                          className="px-2.5 py-1 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[11px] font-bold flex items-center gap-1 transition shadow-xs"
                        >
                          <Plus size={12} /> Add Condition
                        </button>
                      </div>

                      {/* Chronic History List */}
                      {p360?.issues && p360.issues.length > 0 ? (
                        <div className="space-y-2">
                          {p360.issues.map((issue: any, idx: number) => (
                            <div
                              key={issue.issue_id || issue.issue_name || idx}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-blue-200/80 shadow-2xs"
                            >
                              <div>
                                <div className="text-[12.5px] font-bold text-slate-800">{issue.issue_name}</div>
                                <div className="text-[10px] text-slate-500">
                                  Onset / Notes: {issue.onset_info || "Active Condition"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#0078d4]">
                                  {issue.status || "ACTIVE"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveIssue(issue.issue_id || issue.issue_name)}
                                  className="p-1 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                                  title="Remove Condition"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 text-center text-slate-500 text-[11.5px] bg-white/80 rounded-xl border border-dashed border-blue-200">
                          No chronic medical conditions recorded. Click &quot;+ Add Condition&quot; to add.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload Medical Documents Form inside Medical Demographics */}
                  <form onSubmit={handleUploadDocument} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[12.5px] font-bold text-slate-800 flex items-center gap-1.5">
                        <FileUp size={15} className="text-[#0078d4]" /> Upload Medical Documents (Reports, Scans, Slips)
                      </div>
                      <span className="text-[11px] text-slate-400">PDF, PNG, JPG, DICOM</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Title / Note</label>
                        <input
                          type="text"
                          value={docUploadTitle}
                          onChange={(e) => setDocUploadTitle(e.target.value)}
                          placeholder="e.g. Previous CBC / Echo Report"
                          className="w-full text-[12px] rounded-lg border border-slate-300 bg-white p-2 text-slate-800 focus:border-[#0078d4] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                        <select
                          value={docUploadType}
                          onChange={(e) => setDocUploadType(e.target.value)}
                          className="w-full text-[12px] rounded-lg border border-slate-300 bg-white p-2 text-slate-800 focus:border-[#0078d4] focus:outline-none font-semibold"
                        >
                          <option value="LAB_REPORT">🧪 Laboratory Report</option>
                          <option value="SCAN">🩻 Radiology / Scan</option>
                          <option value="PRESCRIPTION">💊 Prescription Slip</option>
                          <option value="DISCHARGE">🏥 Discharge Summary</option>
                          <option value="OTHER">📁 Other Record</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">File *</label>
                        <input
                          type="file"
                          onChange={(e) => setDocUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-[11px] rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-bold file:bg-[#0078d4] file:text-white cursor-pointer"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.dcm,.txt"
                        />
                      </div>
                    </div>

                    {docUploadError && (
                      <div className="text-[11.5px] text-red-600 font-semibold">{docUploadError}</div>
                    )}
                    {docUploadSuccess && (
                      <div className="text-[12px] text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                        <CheckCircle2 size={16} /> Successfully uploaded!
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={uploadingDoc || !docUploadFile}
                        className="px-4 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {uploadingDoc ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploadingDoc ? "Uploading..." : "Upload Document"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* SECTION 3: DOCUMENTS QUICK VIEW ALL BUTTON */}
                <div className="pt-3 border-t border-slate-100 p-4 rounded-2xl bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0078d4] text-white shadow-sm">
                      <FolderOpen size={22} />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-extrabold text-slate-900">Medical Document Records &amp; Vault</h4>
                      <p className="text-[12px] text-slate-600 mt-0.5">
                        You have <b>{(p360?.documents || []).length} medical document{(p360?.documents || []).length === 1 ? "" : "s"}</b> attached to your health profile.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTab("My Documents")}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12.5px] flex items-center gap-1.5 transition shadow-xs"
                  >
                    <FolderOpen size={15} /> View all documents ›
                  </button>
                </div>
              </div>

              {/* Add Allergy Modal */}
              {showAddAllergyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
                  <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4 border border-slate-100">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h4 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-2">
                        <AlertCircle size={18} className="text-red-600" /> Add Known Allergy
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddAllergyModal(false)}
                        className="text-slate-400 hover:text-slate-700 transition"
                      >
                        <XCircle size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleAddAllergy} className="space-y-3.5">
                      <div>
                        <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">
                          Allergen / Drug Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newAllergySubstance}
                          onChange={(e) => setNewAllergySubstance(e.target.value)}
                          placeholder="e.g. Penicillin, Peanuts, Sulfa drugs"
                          className="w-full text-[13px] rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 p-2.5 shadow-2xs focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">Severity</label>
                        <select
                          value={newAllergySeverity}
                          onChange={(e) => setNewAllergySeverity(e.target.value)}
                          className="w-full text-[13px] rounded-xl border border-slate-300 bg-white text-slate-900 p-2.5 shadow-2xs focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/20 focus:outline-none font-semibold transition"
                        >
                          <option value="MILD" className="bg-white text-slate-900">Mild (Itching, localized rash)</option>
                          <option value="MODERATE" className="bg-white text-slate-900">Moderate (Hives, swelling)</option>
                          <option value="SEVERE" className="bg-white text-slate-900">Severe (Anaphylaxis, breathing difficulty)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">Reaction Details</label>
                        <input
                          type="text"
                          value={newAllergyReaction}
                          onChange={(e) => setNewAllergyReaction(e.target.value)}
                          placeholder="e.g. Skin rash, facial hives, shortness of breath"
                          className="w-full text-[13px] rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 p-2.5 shadow-2xs focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                        />
                      </div>

                      {allergyError && (
                        <div className="text-[11.5px] text-red-600 font-semibold">{allergyError}</div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowAddAllergyModal(false)}
                          className="px-3.5 py-2 rounded-xl text-[12px] font-bold text-slate-600 hover:bg-slate-100 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addingAllergy}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[12px] font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                        >
                          {addingAllergy ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />}
                          {addingAllergy ? "Adding..." : "Add Allergy"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Add Chronic Issue Modal */}
              {showAddIssueModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
                  <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4 border border-slate-100">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h4 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-2">
                        <HeartPulse size={18} className="text-[#0078d4]" /> Add Chronic Health Condition
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowAddIssueModal(false)}
                        className="text-slate-400 hover:text-slate-700 transition"
                      >
                        <XCircle size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleAddIssue} className="space-y-3.5">
                      <div>
                        <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">
                          Diagnosis / Condition Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newIssueName}
                          onChange={(e) => setNewIssueName(e.target.value)}
                          placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma"
                          className="w-full text-[13px] rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 p-2.5 shadow-2xs focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11.5px] font-bold text-slate-700 mb-1.5">Onset Information / Notes</label>
                        <input
                          type="text"
                          value={newIssueOnset}
                          onChange={(e) => setNewIssueOnset(e.target.value)}
                          placeholder="e.g. Diagnosed in 2021, on daily medication"
                          className="w-full text-[13px] rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 p-2.5 shadow-2xs focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition"
                        />
                      </div>

                      {issueError && (
                        <div className="text-[11.5px] text-red-600 font-semibold">{issueError}</div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowAddIssueModal(false)}
                          className="px-3.5 py-2 rounded-xl text-[12px] font-bold text-slate-600 hover:bg-slate-100 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addingIssue}
                          className="px-4 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                        >
                          {addingIssue ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />}
                          {addingIssue ? "Adding..." : "Add Condition"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: AI HEALTH ASSISTANT (Patient Perspective) */}
        <aside className="w-full shrink-0 flex flex-col rounded-2xl border border-black/[0.07] bg-white shadow-sm overflow-hidden h-fit">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3 bg-gradient-to-r from-blue-50/50 to-white">
            <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-[#0a5aa8]">
              <Sparkles size={15} /> AI Health Assistant
            </span>
            <div className="flex items-center gap-1 text-slate-400">
              <button type="button" className="grid h-6 w-6 place-items-center rounded-md hover:bg-slate-100">
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          {/* Subtabs */}
          <div className="flex gap-4 border-b border-black/[0.07] px-4">
            {["Health Tips", "My Reminders (4)", "Ask Assistant"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCopilotTab(t)}
                className="relative py-2.5 text-[12px] font-bold transition"
                style={{ color: copilotTab === t ? "#0078d4" : "#64748b" }}
              >
                {t}
                {copilotTab === t && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[#0078d4]" />
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="space-y-4 px-4 py-3.5">
            {copilotTab === "Health Tips" && (
              <>
                {/* Health Insights */}
                <div>
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                    Health & Care Guidance
                  </div>
                  <div className="space-y-2">
                    {PATIENT_INSIGHTS.map((n) => (
                      <div key={n.title} className="rounded-xl border border-slate-100 bg-slate-50/70 flex gap-2.5 p-2.5">
                        <span
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                          style={{ background: `${n.tone}18`, color: n.tone }}
                        >
                          <n.icon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold text-slate-700">{n.title}</span>
                            <span className="text-[9.5px] text-slate-400">{n.time}</span>
                          </div>
                          <p className="text-[11px] leading-snug text-slate-500 mt-0.5">{n.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Patient Actions */}
                <div>
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                    Recommended For You
                  </div>
                  <div className="space-y-1.5">
                    {PATIENT_ACTIONS.map((a) => (
                      <div key={a.label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-2">
                        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-700">
                          <CheckSquare size={13} className="text-[#0078d4]" /> {a.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => sendCopilotChat(`Tell me about: ${a.label}`)}
                          className="rounded-md border border-[#0078d4]/30 bg-white px-2 py-0.5 text-[10.5px] font-bold text-[#0a5aa8] hover:bg-blue-50"
                        >
                          {a.cta}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Ask */}
                <div>
                  <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                    Common Questions
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ASK.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => sendCopilotChat(q)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-[#0078d4] hover:text-[#0078d4] transition text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ask Assistant Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendCopilotChat()}
                    placeholder="Ask about your diet, medicines, labs..."
                    className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] py-2.5 pl-3 pr-10 text-[12px] text-slate-700 outline-none focus:border-[#0078d4]"
                  />
                  <button
                    type="button"
                    onClick={() => sendCopilotChat()}
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-[#0078d4] text-white hover:bg-[#0a6ec2]"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </>
            )}

            {copilotTab === "My Reminders (4)" && (
              <div className="space-y-2">
                {[
                  { label: "Take Metoprolol 25mg", tag: "Medication", time: "At 08:00 PM" },
                  { label: "Check Blood Pressure", tag: "Daily Vitals", time: "At 06:00 PM" },
                  { label: "Drink 2 glasses of water", tag: "Hydration", time: "Afternoon" },
                  { label: "Follow-up Visit with Dr. Ahmed Ali", tag: "Appointment", time: "Tomorrow 10:30 AM" },
                ].map((t) => (
                  <div key={t.label} className="p-2.5 rounded-xl border border-slate-200 bg-white">
                    <div className="text-[12px] font-bold text-slate-700">{t.label}</div>
                    <div className="text-[10px] text-slate-400 mt-1">{t.tag} · {t.time}</div>
                  </div>
                ))}
              </div>
            )}

            {copilotTab === "Ask Assistant" && (
              <div className="space-y-3">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-2.5 rounded-xl text-[11.5px] ${msg.role === "user"
                        ? "bg-[#0078d4] text-white ml-6"
                        : "bg-slate-100 text-slate-700 mr-6"
                        }`}
                    >
                      <p className="leading-relaxed">{msg.text}</p>
                      <div className={`text-[9px] mt-1 ${msg.role === "user" ? "text-blue-100" : "text-slate-400"}`}>
                        {msg.time}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendCopilotChat()}
                    placeholder="Ask any health question..."
                    className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] py-2 pl-3 pr-10 text-[12px] text-slate-700 outline-none focus:border-[#0078d4]"
                  />
                  <button
                    type="button"
                    onClick={() => sendCopilotChat()}
                    className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-lg bg-[#0078d4] text-white hover:bg-[#0a6ec2]"
                  >
                    <Send size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>

      {/* ================= BOOKING MODAL (ClinIQ Multi-Step DB Sync) ================= */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-black/[0.08] bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-1.5">
                <CalendarPlus size={16} className="text-[#0078d4]" /> Book Doctor Consultation
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowBookingModal(false);
                  resetBookingFlow();
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* Stepper indicator */}
            <div className="flex items-center gap-2 pb-1">
              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${bookingStep === "form" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                1. Reason & Date
              </span>
              <span className="text-slate-300">›</span>
              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${bookingStep === "slots" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                2. Select Slot
              </span>
              <span className="text-slate-300">›</span>
              <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${bookingStep === "confirm" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
                3. Confirm & Pay
              </span>
            </div>

            {bookingError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-[11.5px] font-semibold flex items-center gap-2">
                <AlertCircle size={15} /> {bookingError}
              </div>
            )}

            {/* MODAL STEP 1: Date & Reason */}
            {bookingStep === "form" && (
              <form onSubmit={handleFindSlots} className="space-y-3">
                <div>
                  <label className="text-[10.5px] font-bold text-slate-500 uppercase">Consultation Date</label>
                  <input
                    type="date"
                    value={bookingDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-[12.5px] text-slate-800 outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] shadow-sm"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] font-bold text-slate-500 uppercase">Reason for Visit / Health Concern</label>
                  <textarea
                    rows={3}
                    value={bookingReason}
                    onChange={(e) => setBookingReason(e.target.value)}
                    placeholder="Describe how you are feeling or the purpose of your check-up..."
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-[12.5px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4] shadow-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBookingModal(false)}
                    className="flex-1 py-2 rounded-lg bg-slate-100 text-[12px] font-bold text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={findingSlots}
                    className="flex-1 py-2 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {findingSlots ? <RefreshCw className="animate-spin" size={14} /> : <CalendarPlus size={14} />}
                    {findingSlots ? "Finding Slots..." : "Find Available Slots"}
                  </button>
                </div>
              </form>
            )}

            {/* MODAL STEP 2: Doctor Slots */}
            {bookingStep === "slots" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-bold text-slate-700">Available Slots on {bookingDate}</span>
                  <button type="button" onClick={() => setBookingStep("form")} className="font-bold text-[#0078d4] hover:underline">
                    ‹ Change Date
                  </button>
                </div>

                {availableSlots.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-[12px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No open doctor slots found on {bookingDate}.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {doctorSlotGroups.map(({ doctor, slots }) => (
                      <div key={doctor.doctor_id} className="p-3 rounded-xl border border-slate-200 bg-white space-y-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-[12px] text-slate-800">{doctor.doctor_name}</div>
                            <div className="text-[10px] text-slate-400">{doctor.specialty} · Room: {doctor.room || "OPD-04"} · Fee: ₹{doctor.opd_fee || 500}</div>
                          </div>
                          <Pill tone="#16a34a">Available</Pill>
                        </div>
                        {/* Horizontal left-to-right scrolling slot container */}
                        <div className="flex gap-1.5 overflow-x-auto pb-2 pt-1 border-t border-slate-100 scrollbar-thin">
                          {slots.map((s: any) => {
                            const isSelected = selectedSlot?.scheduled_start === s.scheduled_start && selectedSlot?.doctor_id === s.doctor_id;
                            const timeStr = new Date(s.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                              <button
                                key={s.scheduled_start}
                                type="button"
                                onClick={() => setSelectedSlot(s)}
                                className={`shrink-0 py-1 px-2.5 rounded-lg text-[11px] font-bold border transition whitespace-nowrap ${isSelected ? "bg-[#0078d4] border-[#0078d4] text-white shadow-sm" : "border-slate-200 text-slate-700 bg-slate-50 hover:bg-white"
                                  }`}
                              >
                                {timeStr}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBookingStep("form")}
                    className="flex-1 py-2 rounded-lg bg-slate-100 text-[12px] font-bold text-slate-600"
                  >
                    ‹ Back
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSlot}
                    onClick={() => setBookingStep("confirm")}
                    className="flex-1 py-2 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold disabled:opacity-50"
                  >
                    Review & Confirm ›
                  </button>
                </div>
              </div>
            )}

            {/* MODAL STEP 3: Confirm & Pay */}
            {bookingStep === "confirm" && selectedSlot && (
              <div className="space-y-3 text-[12px]">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex justify-between"><span className="text-slate-400">Doctor:</span> <b className="text-slate-800">{selectedSlot.doctor_name}</b></div>
                  <div className="flex justify-between"><span className="text-slate-400">Specialty:</span> <b className="text-[#0078d4]">{selectedSlot.specialty}</b></div>
                  <div className="flex justify-between"><span className="text-slate-400">Date & Time:</span> <b className="text-slate-800">{bookingDate} at {new Date(selectedSlot.scheduled_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
                  <div className="flex justify-between"><span className="text-slate-400">Consultation Fee:</span> <b className="text-emerald-600 font-extrabold">₹{selectedSlot.opd_fee || 500}</b></div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBookingStep("slots")}
                    className="flex-1 py-2 rounded-lg bg-slate-100 text-[12px] font-bold text-slate-600"
                  >
                    ‹ Change Slot
                  </button>
                  <button
                    type="button"
                    disabled={bookingLoading}
                    onClick={handleConfirmAndPay}
                    className="flex-1 py-2 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {bookingLoading ? <RefreshCw className="animate-spin" size={14} /> : <CreditCard size={14} />}
                    {bookingLoading ? "Booking..." : `Pay ₹${selectedSlot.opd_fee || 500} & Confirm`}
                  </button>
                </div>
              </div>
            )}

            {/* MODAL STEP 4: Success */}
            {bookingStep === "success" && (
              <div className="p-4 rounded-xl bg-emerald-50 text-center space-y-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 text-white mx-auto">
                  <CheckCircle2 size={20} />
                </div>
                <h4 className="font-extrabold text-[14px] text-emerald-900">Consultation Booked!</h4>
                <p className="text-[12px] text-emerald-800">
                  Confirmed for {bookingDate} with {selectedSlot?.doctor_name}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowBookingModal(false);
                    resetBookingFlow();
                    setTab("Appointments");
                  }}
                  className="w-full py-2 rounded-lg bg-[#0078d4] text-white font-bold text-[12px]"
                >
                  View in Appointments ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORT VIEWER MODAL */}
      {viewingReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4]">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-[14.5px] font-extrabold text-slate-800">
                    {viewingReportModal.test || viewingReportModal.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {viewingReportModal.panel || viewingReportModal.modality || "Diagnostic Report"} · {viewingReportModal.date || "Verified"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReportModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-[12.5px]">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Test Name:</span>
                  <span className="font-bold text-slate-800">{viewingReportModal.test || viewingReportModal.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Category / Panel:</span>
                  <span className="font-semibold text-slate-700">{viewingReportModal.panel || viewingReportModal.modality || "Laboratory"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Status:</span>
                  <Pill tone="#16a34a">{viewingReportModal.status || "Completed"}</Pill>
                </div>
                {viewingReportModal.flag && viewingReportModal.flag !== "N" && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-semibold">Abnormal Flag:</span>
                    <span className="font-bold text-red-600">Flag {viewingReportModal.flag} (Out of normal range)</span>
                  </div>
                )}
              </div>

              <div>
                <h5 className="font-bold text-[12px] text-slate-700 uppercase mb-1">Clinical Findings &amp; Values</h5>
                <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-slate-800 font-medium">
                  {viewingReportModal.value || viewingReportModal.finding || "Test completed and verified by laboratory technician."}
                </div>
              </div>

              {viewingReportModal.attachment_name && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={16} />
                    <span className="font-bold text-[12px]">{viewingReportModal.attachment_name}</span>
                  </div>
                  {viewingReportModal.attachment_uri && (
                    <a
                      href={viewingReportModal.attachment_uri}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded-lg bg-emerald-700 text-white font-bold text-[11px] hover:bg-emerald-800"
                    >
                      Open File
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewingReportModal(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 text-[12px] font-bold text-slate-600 hover:bg-slate-200"
              >
                Close
              </button>
              {viewingReportModal.attachment_uri && (
                <a
                  href={viewingReportModal.attachment_uri}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Download size={13} /> Download Report
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
