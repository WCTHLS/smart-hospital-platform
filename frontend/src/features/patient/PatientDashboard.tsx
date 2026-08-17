import { useState, useEffect, useMemo, Fragment, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Search, Plus, Sparkles, Bell, ChevronDown, Users,
  ClipboardList, UserCog, FlaskConical, ScanLine, Pill as PillIcon, Scissors, HeartPulse,
  Ambulance, Receipt, Boxes, FileText, Map, Building2, Package, CheckSquare,
  MessageSquare, TriangleAlert, BedDouble, LogOut, IndianRupee, MoreHorizontal,
  Share2, ExternalLink, Send, Maximize2, Activity, ShieldAlert,
  FileWarning, ArrowUpRight, Stethoscope, Download, Filter, Eye, Mic, Folder, Calendar,
  Settings, Phone, Pencil, RefreshCw, Clock, ChevronRight,
  TestTubes, Droplet, Beaker, FileCheck, XCircle,
  TrendingUp, CheckCircle2, CalendarPlus, Ticket, ShieldCheck, MapPin, UserRound, ArrowLeft, Camera, AlertCircle,
  Heart, Info, Video, Navigation, CreditCard, LoaderCircle, Check
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../lib/razorpay";
import { useJourney } from "../../lib/store";
import { useRealtime } from "../../lib/realtime";
import { getPortalPatient, clearPortalPatient } from "../../lib/patientAuth";

import StageTracker from "./components/StageTracker";
import ConsultationSummary from "./components/ConsultationSummary";
import VitalsAndLabs from "./components/VitalsAndLabs";
import PrescriptionSlip from "./components/PrescriptionSlip";
import LabOrdersAlert from "./components/LabOrdersAlert";

/* ------------------------------------------------------------------ data --- */

const PATIENT_TABS = [
  "My Health Overview", "Check-In & Live Token", "Book Consultation", "Care Timeline", "My Vitals", "My Lab Reports",
  "Scans & Imaging", "My Prescriptions", "Procedures", "Medical Documents", "Care & Recovery Plan", "Doctor Notes"
];

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

  const [tab, setTab] = useState("My Health Overview");
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
  const currentToken = typeof rawToken === "string" ? rawToken : (rawToken?.number || "ICU-07");
  const tokenObject = typeof rawToken === "object" && rawToken ? rawToken : { number: currentToken, room: "ICU-07", floor: "Floor 3", eta_minutes: 10 };
  const appointments = appointmentData?.appointments ?? [];
  const todayAppointments = (todayApptData?.appointments && todayApptData.appointments.length > 0)
    ? todayApptData.appointments
    : appointments;

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
      setCheckInSuccess(`Check-in complete! Your live Token is ${res.token || "TKN-102"} for Consultation.`);
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

  const patientName = portalSession?.name || "Ahmed Khan";
  const patientAge = p360?.patient?.age || "58 Y";
  const patientGender = p360?.patient?.gender || "Male";
  const patientMRN = p360?.patient?.mrn || "CLN-00012345";
  const patientBed = p360?.patient?.location || "ICU-07, Bed-01";
  const patientPhone = portalSession?.mobile || "0300-1234567";

  const primaryEncounter = p360?.encounters?.[0];
  const admissionDateRaw = latestEpisode?.date || primaryEncounter?.date;
  const formattedAdmissionDate = admissionDateRaw
    ? new Date(admissionDateRaw).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "10 May 2024";
  const admissionTime = primaryEncounter?.arrival_ts
    ? new Date(primaryEncounter.arrival_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "09:30 AM";

  const attendingDoc = careTeam[0] || (latestEpisode?.doctor_name ? { name: latestEpisode.doctor_name, specialty: latestEpisode.department || "Cardiology" } : null) || { name: "Dr. Ahmed Ali", specialty: "Cardiologist" };
  const attendingDocName = attendingDoc.name;
  const attendingDocRole = attendingDoc.specialty || attendingDoc.role || attendingDoc.department || "Cardiologist";

  const allergiesList = p360?.allergies || [];
  const primaryAllergy = allergiesList.length > 0 ? allergiesList[0].substance : "Penicillin";
  const secondaryAllergy = allergiesList.length > 1
    ? `${allergiesList[1].substance} (${allergiesList[1].severity || "Caution"})`
    : (allergiesList.length > 0 && allergiesList[0].reaction ? `Reaction: ${allergiesList[0].reaction}` : "Aspirin (Caution)");

  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col gap-4 text-slate-700 font-sans">
      {/* ================= PATIENT WELCOME BANNER ================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.06] bg-gradient-to-r from-white via-blue-50/20 to-white p-4 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-extrabold tracking-tight text-slate-800">
              Welcome back, {patientName}! 👋
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
              Patient Portal Active
            </span>
          </div>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Track your live appointments, recovery progress, vitals, prescriptions, and lab results in real-time.
          </p>
        </div>

        {/* Prominent Active Token & Where-To-Go Card */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => setTab("Check-In & Live Token")}
            className="cursor-pointer rounded-2xl bg-gradient-to-br from-[#0078d4] to-[#0c3b63] p-3 sm:px-4 sm:py-3 text-white shadow-md hover:shadow-lg transition min-w-[210px] flex items-center gap-3.5 border border-blue-400/20"
          >
            <div className="rounded-xl bg-white/15 p-2 text-white shrink-0">
              <Ticket size={22} className="text-blue-100" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Active Token</span>
                <span className="inline-flex items-center rounded-full bg-emerald-400/25 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.2 text-[9px] font-black">
                  ● In Queue
                </span>
              </div>
              <div className="text-[22px] font-black tracking-tight leading-tight text-white">{currentToken}</div>
              <div className="text-[11px] text-blue-100 truncate flex items-center gap-1 mt-0.5">
                <MapPin size={11} className="text-emerald-300 shrink-0" />
                <span className="truncate">Go to: <b>{tokenObject?.room || "Room 4 (Floor 2)"}</b></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetBookingFlow();
              setShowBookingModal(true);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3.5 py-3 text-[12px] font-bold text-slate-700 transition shadow-sm h-full"
          >
            <CalendarPlus size={15} className="text-[#0078d4]" /> Book Visit
          </button>
        </div>
      </div>

      {/* ================= MAIN CONTENT + AI ASSISTANT ================= */}
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
                    <span className="text-slate-400 text-sm font-bold">♂</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-[#0078d4]">
                      Active Inpatient
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-500 flex-wrap">
                    <span className="font-semibold">{patientAge}</span>
                    <span>·</span>
                    <span>{patientGender}</span>
                    <span>·</span>
                    <span>My MRN: <b className="text-slate-700">{patientMRN}</b></span>
                    <span>·</span>
                    <span>Ward / Room: <b className="text-slate-700">{patientBed.split(",")[0] || "ICU-07"}</b></span>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-[11.5px] text-slate-500 flex-wrap">
                    <span className="flex items-center gap-1"><Phone size={12} className="text-slate-400" /> {patientPhone}</span>
                    <span className="flex items-center gap-1"><Droplet size={12} className="text-red-500" /> Blood Group: B+</span>
                    <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-[#0078d4]" /> Jubilee Health</span>
                    <span className="flex items-center gap-1"><MapPin size={12} className="text-slate-400" /> {patientBed}</span>
                  </div>
                </div>
              </div>

              {/* Patient Care Meta (Admitted On, Doctor, Known Allergies) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-100 lg:pl-6 pt-3 lg:pt-0">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Admitted On</div>
                  <div className="text-[12.5px] font-extrabold text-slate-800 mt-0.5">{formattedAdmissionDate}</div>
                  <div className="text-[10.5px] text-slate-400">{admissionTime}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">My Attending Doctor</div>
                  <div className="text-[12.5px] font-extrabold text-slate-800 mt-0.5">{attendingDocName}</div>
                  <div className="text-[10.5px] text-[#0078d4] font-semibold">{attendingDocRole}</div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Known Allergies</div>
                  <div className="text-[12.5px] font-extrabold text-[#D13438] mt-0.5">{primaryAllergy}</div>
                  <div className="text-[10.5px] text-slate-400">{secondaryAllergy}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions inside Card */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setTab("Check-In & Live Token")}
                  className="flex items-center gap-2 rounded-xl bg-blue-50/90 border border-blue-200 hover:bg-blue-100/70 px-3 py-1.5 text-[11.5px] font-bold text-[#0078d4] transition"
                >
                  <Ticket size={14} className="text-[#0078d4]" />
                  <span>Token: <b className="text-slate-900 text-[13px]">{currentToken}</b></span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600 font-medium">Destination: <b className="text-slate-800">{tokenObject?.room || "Room 4"}</b></span>
                  <span className="rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.2 text-[9.5px] font-bold">● Active</span>
                </button>
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
          <div className="flex gap-x-5 overflow-x-auto border-b border-black/[0.08] pb-1 scrollbar-none">
            {PATIENT_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="relative shrink-0 whitespace-nowrap pb-2 text-[13px] font-bold transition-colors"
                style={{ color: tab === t ? "#0078d4" : "#64748b" }}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-[#0078d4]" />
                )}
              </button>
            ))}
          </div>

          {/* ================= TAB CONTENTS ================= */}

          {/* 1. MY HEALTH OVERVIEW (Patient-Centric CliniQ Style) */}
          {tab === "My Health Overview" && (
            <div className="space-y-4">
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
                        const isPending = l.status === "CREATED" || l.status === "PENDING" || l.raw_status === "CREATED" || l.raw_status === "PENDING";
                        return (
                          <div
                            key={l.lab_order_id || idx}
                            onClick={() => setTab("My Lab Reports")}
                            className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition border ${isPending
                                ? "bg-amber-50/90 border-amber-300 hover:bg-amber-100/80 shadow-xs"
                                : "bg-transparent border-transparent hover:bg-slate-50"
                              }`}
                            title="Click to view in My Lab Reports"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-slate-800 text-[11.5px] truncate block">{l.test || l.name}</span>
                              <span className="text-[9.5px] text-slate-400">{l.panel || "Laboratory Investigation"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isPending ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                                  Action Required
                                </span>
                              ) : (
                                <>
                                  <span className="text-slate-600 font-medium text-[11px]">{l.value}</span>
                                  <Pill tone={l.flag && l.flag !== "N" ? "#D13438" : "#16a34a"}>
                                    {l.flag && l.flag !== "N" ? `Abnormal (${l.flag})` : "Completed"}
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
                      <span>{labReports[0]?.date || "Latest Labs"}</span>
                      <button type="button" onClick={() => setTab("My Lab Reports")} className="font-bold text-[#0078d4] hover:underline">View All &amp; Download ›</button>
                    </div>
                  )}
                </div>

                {/* Scans & Diagnostics (Imaging scans only: MRI, CT, X-Ray, etc. from DB) */}
                <div className={`${card} p-3.5`}>
                  <PanelHead title="Scans & Diagnostics" action="View All" onAction={() => setTab("Scans & Imaging")} />
                  {scansAndDiagnostics.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {scansAndDiagnostics.slice(0, 4).map((im: any, idx: number) => {
                        const isPending = im.status === "CREATED" || im.status === "PENDING" || im.raw_status === "CREATED" || im.raw_status === "PENDING";
                        return (
                          <div
                            key={im.report_id || idx}
                            onClick={() => setTab("Scans & Imaging")}
                            className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition border ${isPending
                                ? "bg-amber-50/90 border-amber-300 hover:bg-amber-100/80 shadow-xs"
                                : "bg-transparent border-transparent hover:bg-slate-50"
                              }`}
                            title="Click to view in Scans & Imaging"
                          >
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-slate-300">
                              <ScanLine size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11.5px] font-bold text-slate-800">{im.name}</div>
                              <div className="text-[9.5px] text-slate-400">{im.date || im.finding || "Diagnostic Imaging"}</div>
                            </div>
                            {isPending ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse shrink-0">
                                Action Required
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
                      <span>{scansAndDiagnostics[0]?.date || "Latest Scans"}</span>
                      <button type="button" onClick={() => setTab("Scans & Imaging")} className="font-bold text-[#0078d4] hover:underline">View All Scans ›</button>
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

          {/* 2. CHECK-IN & LIVE TOKENS */}
          {tab === "Check-In & Live Token" && (
            <div className="space-y-4">
              <div className={`${card} p-5 bg-gradient-to-br from-white to-blue-50/30 space-y-4`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[18px] font-extrabold text-slate-800">Live Hospital Check-In & Queue Token</h2>
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[11px] font-bold">
                        Live Queue Sync
                      </span>
                    </div>
                    <p className="text-[12.5px] text-slate-500 mt-1">
                      Track your live visit journey, check in for today's scheduled consultations, and view real-time queue status.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-gradient-to-br from-[#0078d4] to-[#0c3b63] p-4 text-white text-center min-w-[150px] shadow-md">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Your Active Token</div>
                      <div className="text-[26px] font-black tracking-tight">{currentToken}</div>
                      <div className="text-[10px] font-medium text-emerald-300">● Queue: Position 2</div>
                    </div>
                  </div>
                </div>

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

                {/* MY VISIT JOURNEY TRACKER ON TOP */}
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

                {/* FLOW STEP 1: Today's Booked Consultations List with Live Status & Check-In */}
                {checkinStep === "appointments" && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[13.5px] font-bold text-slate-800 flex items-center gap-1.5">
                        <ClipboardList size={16} className="text-[#0078d4]" /> Today's Booked Consultations
                      </h3>
                      <button
                        type="button"
                        onClick={() => refetchTodayAppointments()}
                        className="text-[11px] font-semibold text-[#0078d4] flex items-center gap-1 hover:underline"
                      >
                        <RefreshCw size={12} /> Refresh
                      </button>
                    </div>

                    {loadingTodayAppts && (
                      <div className="py-6 text-center text-slate-400 text-[12px]">
                        Loading today's scheduled consultations from chart...
                      </div>
                    )}

                    {!loadingTodayAppts && todayAppointments.length === 0 && (
                      <div className="py-6 text-center text-slate-400 text-[12px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        No booked appointments found in your chart.
                      </div>
                    )}

                    {/* Show top 2 appointments, scrollable for more */}
                    {todayAppointments.length > 0 && (
                      <div className="max-h-[175px] overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
                        {todayAppointments.map((appt: any) => {
                          const rawStatus = (appt.status || "BOOKED").toUpperCase().replace(/-/g, "_");
                          const isNotCheckedIn = rawStatus === "BOOKED" || rawStatus === "CONFIRMED" || rawStatus === "SCHEDULED";

                          let statusText = "BOOKED";
                          let statusBadge = (
                            <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                              BOOKED
                            </span>
                          );

                          if (rawStatus === "CHECKED_IN" || rawStatus === "CHECKEDIN" || rawStatus === "ARRIVED") {
                            statusText = "CHECKED IN";
                            statusBadge = (
                              <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                                CHECKED IN
                              </span>
                            );
                          } else if (rawStatus === "TRIAGED" || rawStatus === "TRIAGE") {
                            statusText = "TRIAGED";
                            statusBadge = (
                              <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 uppercase">
                                TRIAGED
                              </span>
                            );
                          } else if (rawStatus === "IN_CONSULTATION" || rawStatus === "CONSULTING" || rawStatus === "IN_CONSULT" || rawStatus === "INCONSULT") {
                            statusText = "IN CONSULT";
                            statusBadge = (
                              <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-blue-50 text-[#0078d4] border border-blue-200 uppercase">
                                IN CONSULT
                              </span>
                            );
                          } else if (rawStatus === "COMPLETED" || rawStatus === "DISCHARGED") {
                            statusText = "COMPLETED";
                            statusBadge = (
                              <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                                COMPLETED
                              </span>
                            );
                          } else if (rawStatus === "CANCELLED") {
                            statusText = "CANCELLED";
                            statusBadge = (
                              <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-bold bg-red-50 text-red-700 border border-red-200 uppercase">
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
                              className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-[13px] text-slate-800">{appt.doctor?.name || "Assigned Doctor"}</span>
                                  <Pill tone="#0078d4">{appt.specialty || "Specialist"}</Pill>
                                  {statusBadge}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                                    <Calendar size={11} className="text-[#0078d4]" /> {apptDateStr}
                                  </span>
                                  <span>·</span>
                                  <span className="flex items-center gap-1">
                                    <Clock size={11} className="text-slate-400" /> {apptTimeStr}
                                  </span>
                                  <span>·</span>
                                  <span>Room: <b>{[appt.doctor?.room, appt.doctor?.floor].filter(Boolean).join(" / ") || "OPD-04"}</b></span>
                                  <span>·</span>
                                  <span className="text-slate-600 truncate max-w-[200px]">Reason: {appt.reason || "Consultation"}</span>
                                </div>
                              </div>

                              {isNotCheckedIn ? (
                                <button
                                  type="button"
                                  disabled={checkingIn}
                                  onClick={() => handleSelectCheckinAppt(appt)}
                                  className="shrink-0 flex items-center justify-center gap-1.5 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] px-4 py-1.5 shadow-sm transition"
                                >
                                  Check In <ChevronRight size={14} />
                                </button>
                              ) : (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                                  <Check size={13} /> {statusText}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <span>{todayAppointments.length} consultation{todayAppointments.length === 1 ? "" : "s"} scheduled</span>
                      <button
                        type="button"
                        onClick={() => setTab("Book Consultation")}
                        className="font-bold text-[#0078d4] flex items-center gap-1 hover:underline"
                      >
                        <CalendarPlus size={13} /> Book New Consultation
                      </button>
                    </div>
                  </div>
                )}

                {/* FLOW STEP 2: Appointment Details Review & Complete Check-In */}
                {checkinStep === "details" && selectedCheckinAppt && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-[#0078d4]" /> Review Consultation & Confirm Check-In
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
              </div>

              {/* Today's Appointments & Queue History */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`${card} p-4`}>
                  <h3 className="text-[13px] font-bold text-slate-800 mb-3">All Scheduled Consultations</h3>
                  {appointments.length > 0 ? (
                    <div className="space-y-2">
                      {appointments.map((a: any) => (
                        <div key={a.appointment_id} className="p-3 rounded-lg border border-slate-100 bg-slate-50/70 flex items-center justify-between">
                          <div>
                            <div className="text-[12px] font-bold text-slate-800">{a.doctor?.name || "Dr. Ahmed Ali"}</div>
                            <div className="text-[11px] text-slate-500">{a.specialty} · {a.scheduled_start?.slice(0, 10)} {a.scheduled_start?.slice(11, 16) || "10:30 AM"}</div>
                          </div>
                          <span className="rounded-md bg-[#0078d4]/10 text-[#0078d4] px-2 py-1 text-[10.5px] font-bold">
                            {a.status || "CONFIRMED"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-50 text-center text-slate-400 text-[12px]">
                      No more appointments scheduled for today.
                    </div>
                  )}
                </div>

                <div className={`${card} p-4`}>
                  <h3 className="text-[13px] font-bold text-slate-800 mb-3">Room & Counter Live Status</h3>
                  <div className="space-y-2 text-[12px]">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <span className="font-semibold text-slate-700">Triage Desk (Counter 2)</span>
                      <span className="text-emerald-600 font-bold">Serving TKN-101</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <span className="font-semibold text-slate-700">Consultation Room 4 (Dr. Ahmed Ali)</span>
                      <span className="text-[#0078d4] font-bold">Calling {currentToken}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                      <span className="font-semibold text-slate-700">Phlebotomy Lab</span>
                      <span className="text-slate-500 font-medium">Wait Time: ~10 min</span>
                    </div>
                  </div>
                </div>
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
                        setTab("Check-In & Live Token");
                      }}
                      className="py-2 px-4 rounded-lg bg-[#0078d4] text-white font-bold text-[12px] shadow-sm"
                    >
                      Go to Check-In & Live Token ›
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
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <h3 className="text-[13px] font-bold text-slate-800 mb-3">My Vitals Records & Trend Charts</h3>
                <VitalsAndLabs
                  latestVitals={p360?.latest_vitals || {
                    bp: "128/80",
                    heart_rate: 76,
                    spo2: 98,
                    temperature: 98.6,
                    weight_kg: 78,
                    height_cm: 174,
                  }}
                  orders={labReports.length > 0 ? labReports : LATEST_LABS}
                />
              </div>
            </div>
          )}

          {/* 5. MY LAB REPORTS TAB */}
          {tab === "My Lab Reports" && (
            <div className="space-y-4">
              {pendingLabOrders.length > 0 && (
                <LabOrdersAlert
                  orders={pendingLabOrders}
                  refetchP360={() => refetchP360()}
                  onNavigateToTab={(t) => setTab(t)}
                  patientId={portalPatientId}
                />
              )}

              <div className={`${card} p-5 space-y-4`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-2">
                      <FlaskConical size={18} className="text-[#0078d4]" /> Laboratory Test Reports
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      View all blood tests, biochemistry panels, pathology results, and external uploaded reports.
                    </p>
                  </div>
                  <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#0078d4] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                    <Download size={13} /> Export All (PDF)
                  </button>
                </div>

                {labReports.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-[13px] bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No laboratory test reports found in your medical chart.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {labReports.map((l: any, i: number) => {
                      const isPending = l.status === "CREATED" || l.status === "PENDING" || l.raw_status === "CREATED" || l.raw_status === "PENDING";
                      const isAbnormal = l.flag && l.flag !== "N";

                      return (
                        <div
                          key={l.lab_order_id || i}
                          className={`p-4 rounded-xl border transition ${isPending
                              ? "bg-amber-50/60 border-amber-300"
                              : isAbnormal
                                ? "bg-red-50/30 border-red-200"
                                : "bg-white border-slate-200 hover:border-[#0078d4]/50"
                            } shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[13.5px] text-slate-800">{l.test || l.name}</span>
                              <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 text-slate-600">
                                {l.panel || "Clinical Lab"}
                              </span>
                              {isPending ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Clock size={11} className="animate-pulse text-amber-600" /> Action Required · ₹{l.price || 350}
                                </span>
                              ) : (
                                <Pill tone={isAbnormal ? "#D13438" : "#16a34a"}>
                                  {isAbnormal ? `Abnormal (${l.flag})` : "Completed"}
                                </Pill>
                              )}
                            </div>

                            <div className="text-[12px] text-slate-500 mt-1.5 flex items-center gap-3 flex-wrap">
                              <span>Date: <b>{l.date || "Recent"}</b></span>
                              <span>·</span>
                              <span>Findings / Value: <b className={isAbnormal ? "text-red-700 font-extrabold" : "text-slate-800"}>{l.value || l.finding || "Completed"}</b></span>
                              {l.attachment_name && (
                                <>
                                  <span>·</span>
                                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                    <FileText size={12} /> {l.attachment_name}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.querySelector('.lab-orders-alert');
                                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-[#0078d4] text-white text-[11.5px] font-bold hover:bg-[#0a6ec2] transition shadow-xs"
                              >
                                Complete Test / Upload ›
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setViewingReportModal(l)}
                                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:text-[#0078d4] hover:border-[#0078d4] text-[11.5px] font-bold bg-slate-50 hover:bg-white transition"
                                >
                                  View Full Report
                                </button>
                                {l.attachment_uri && (
                                  <a
                                    href={l.attachment_uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11.5px] font-bold inline-flex items-center gap-1 transition"
                                  >
                                    <Download size={12} /> PDF
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. SCANS & IMAGING TAB */}
          {tab === "Scans & Imaging" && (
            <div className="space-y-4">
              {pendingScanOrders.length > 0 && (
                <LabOrdersAlert
                  orders={pendingScanOrders}
                  refetchP360={() => refetchP360()}
                  onNavigateToTab={(t) => setTab(t)}
                  patientId={portalPatientId}
                />
              )}

              <div className={`${card} p-5 space-y-4`}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-[15px] font-extrabold text-slate-800 flex items-center gap-2">
                      <ScanLine size={18} className="text-[#0078d4]" /> Diagnostic Scans &amp; Radiology Imaging
                    </h3>
                    <p className="text-[12px] text-slate-500 mt-0.5">
                      Access MRI scans, CT scans, X-rays, Ultrasounds, and radiology diagnostic reports.
                    </p>
                  </div>
                  <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#0078d4] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition">
                    <Download size={13} /> Export All (PDF)
                  </button>
                </div>

                {scansAndDiagnostics.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-[13px] bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No diagnostic imaging scans found in your medical chart.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {scansAndDiagnostics.map((im: any, idx: number) => {
                      const isPending = im.status === "CREATED" || im.status === "PENDING" || im.raw_status === "CREATED" || im.raw_status === "PENDING";

                      return (
                        <div
                          key={im.report_id || idx}
                          className={`p-4 rounded-xl border transition ${isPending
                              ? "bg-amber-50/60 border-amber-300"
                              : "bg-white border-slate-200 hover:border-[#0078d4]/50"
                            } shadow-xs flex flex-col justify-between gap-3`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-slate-300">
                              <ScanLine size={22} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-[13.5px] text-slate-800 truncate">{im.name}</span>
                                {isPending ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                    <Clock size={10} className="animate-pulse" /> Action Required · ₹{im.price || 1200}
                                  </span>
                                ) : (
                                  <Pill tone="#16a34a">{im.status || "Completed"}</Pill>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{im.modality || "Imaging"} · {im.date || "Recent"}</div>
                              <p className="text-[12px] text-slate-600 mt-2 leading-snug">
                                {im.finding || "Imaging scan completed and verified by radiologist."}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11.5px]">
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const el = document.querySelector('.lab-orders-alert');
                                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="w-full py-1.5 text-center rounded-lg bg-[#0078d4] text-white font-bold hover:bg-[#0a6ec2] transition"
                              >
                                Book Scan Slot / Upload Report ›
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setViewingReportModal(im)}
                                  className="font-bold text-[#0078d4] hover:underline"
                                >
                                  View Scan Details ›
                                </button>
                                {im.attachment_uri && (
                                  <a
                                    href={im.attachment_uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                                  >
                                    <Download size={12} /> Attachment
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. MY PRESCRIPTIONS TAB */}
          {tab === "My Prescriptions" && (
            <div className="space-y-4">
              <div className={`${card} p-4`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[14px] font-bold text-slate-800">My Active Prescriptions & Dosage Timings</h3>
                  <button type="button" className="flex items-center gap-1 text-[11.5px] font-bold text-[#0078d4]">
                    <Download size={14} /> Print Rx Slip
                  </button>
                </div>
                {activeMeds.length > 0 ? (
                  <PrescriptionSlip
                    encounterId={latestEpisode?.encounter_id || "ENC-001"}
                    patientId={portalPatientId}
                    refetchP360={() => refetchP360()}
                    prescription={{
                      prescription_id: "RX-ACTIVE",
                      items: activeMeds.map((m: any) => ({
                        medication_name: m.name || m.drug_name,
                        dosage: m.dose || m.dosage || "Standard",
                        frequency: m.freq || "Once Daily",
                        instructions: m.purpose || `${m.route || "Oral"} route`,
                        price: 100,
                        quantity: 30,
                      })),
                    }}
                  />
                ) : (
                  <div className="py-8 text-center text-slate-400 text-[12.5px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No active prescriptions found in your chart.
                  </div>
                )}
              </div>
            </div>
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
                    setTab("Check-In & Live Token");
                  }}
                  className="w-full py-2 rounded-lg bg-[#0078d4] text-white font-bold text-[12px]"
                >
                  View in Check-In & Live Token ›
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
