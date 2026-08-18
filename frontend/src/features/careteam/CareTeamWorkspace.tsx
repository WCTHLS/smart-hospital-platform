import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Users, Plus, ShieldAlert, BadgeCheck, Stethoscope, Landmark, Edit, X, Calendar, Clock,
  Search, Trash2, FlaskConical, Pill, ClipboardList, User, UserCog, HeartPulse,
  AlertTriangle, Phone, MessageSquare, BedDouble, ChevronDown, CheckSquare, Activity, Sparkles,
  MoreHorizontal, ArrowUpRight, Maximize2, Send, CornerDownLeft
} from "lucide-react";
import { api } from "../../lib/api";
import { Card, Tag, SectionTitle, Empty } from "../../components/ui";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SPECIALTY_DEPARTMENTS = [
  "General Medicine",
  "Cardiology",
  "Pulmonology",
  "Dermatology",
  "Orthopaedics",
  "Gastroenterology",
  "Paediatrics",
  "Obstetrics & Gynaecology",
  "Ophthalmology",
  "ENT",
  "Dentistry",
  "Psychiatry",
  "Endocrinology",
  "Oncology",
];

// Care Team Dashboard Static Data
const CT_KPIS = [
  { value: "42", label: "Doctors On Duty", sub: "↑ 8% vs yesterday", icon: Stethoscope, color: "#0078d4" },
  { value: "128", label: "Nurses On Duty", sub: "↑ 5% vs yesterday", icon: HeartPulse, color: "#038387" },
  { value: "256", label: "Active Patients", sub: "Across all units", icon: Users, color: "#8764B8" },
  { value: "23", label: "Critical Cases", sub: "↓ 3 vs yesterday", icon: AlertTriangle, color: "#D13438" },
  { value: "6", label: "Shift Changes (Today)", sub: "Upcoming", icon: Clock, color: "#CA5010" },
];

const MDT = [
  { role: "Primary Physician", name: "Dr. Ahmed Ali", tag: "P" },
  { role: "Charge Nurse", name: "Nurse Ayesha", tag: "C" },
  { role: "ICU Consultant", name: "Dr. Imran Haider", sub: "Intensivist" },
  { role: "Physiotherapist", name: "Ali Raza", sub: "Physiotherapy" },
  { role: "Clinical Pharmacist", name: "Dr. Usman", sub: "Pharmacy" },
];

const PHYS_ASSIGN_DUMMY = [
  { name: "Dr. Ahmed Ali", dept: "Cardiology", patients: 18 },
  { name: "Dr. Sara Malik", dept: "Cardiology", patients: 16 },
  { name: "Dr. Imran Haider", dept: "ICU", patients: 12 },
  { name: "Dr. Hassan Raza", dept: "Emergency", patients: 15 },
  { name: "Dr. Marium Shah", dept: "Neurology", patients: 10 },
];

const NURSE_ASSIGN_DUMMY = [
  { name: "Nurse Ayesha", dept: "ICU", patients: 8 },
  { name: "Nurse Fatima Zahra", dept: "Cardiology", patients: 10 },
  { name: "Nurse Sidra Khan", dept: "ICU", patients: 6 },
  { name: "Nurse Maham", dept: "Emergency", patients: 9 },
  { name: "Nurse Hina", dept: "Surgery", patients: 7 },
];

const COVERAGE = [
  { unit: "ICU", shifts: [[28, 30], [26, 30], [24, 30]] },
  { unit: "Cardiology", shifts: [[42, 45], [38, 45], [40, 45]] },
  { unit: "Emergency", shifts: [[18, 20], [22, 20], [16, 20]] },
  { unit: "Surgery", shifts: [[16, 18], [14, 18], [10, 18]] },
  { unit: "Neurology", shifts: [[12, 15], [10, 15], [8, 15]] },
];

const SHIFT_SCHED = [
  { shift: "Day", time: "7A - 3P", vals: [142, 148, 140, 136, 120, 110, 132] },
  { shift: "Evening", time: "3P - 11P", vals: [126, 128, 125, 120, 112, 105, 118] },
  { shift: "Night", time: "11P - 7A", vals: [118, 120, 114, 110, 98, 95, 102] },
];

const SCHED_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const WORKLOAD = [
  { dept: "ICU", pct: 26, count: 49, color: "#0078d4" },
  { dept: "Cardiology", pct: 24, count: 45, color: "#038387" },
  { dept: "Emergency", pct: 18, count: 33, color: "#D13438" },
  { dept: "Surgery", pct: 15, count: 28, color: "#8764B8" },
  { dept: "Others", pct: 17, count: 31, color: "#94a3b8" },
];

const COMMS = [
  { who: "ICU Team", msg: "Bed ICU-09 is now available for transfer.", time: "10:15 AM", icon: BedDouble, tone: "#0078d4" },
  { who: "Cardiology Team", msg: "New protocol for NSTEMI management.", time: "09:40 AM", icon: HeartPulse, tone: "#038387" },
  { who: "Nursing Supervisor", msg: "Please ensure handover notes are updated.", time: "09:20 AM", icon: ClipboardList, tone: "#CA5010" },
];

const HANDOFF = [
  { label: "Total Handovers", value: 24, tone: "#334155" },
  { label: "Completed", value: 22, tone: "#16a34a" },
  { label: "Pending", value: 2, tone: "#CA5010" },
  { label: "Overdue", value: 0, tone: "#D13438" },
];

const CT_INSIGHTS = [
  { title: "High Workload Alert", body: "Emergency department is over capacity by 2 staff.", time: "5 min ago", icon: AlertTriangle, tone: "#D13438" },
  { title: "ICU Staffing", body: "Night shift ICU is running at 90% capacity.", time: "12 min ago", icon: HeartPulse, tone: "#CA5010" },
  { title: "Shift Conflict", body: "2 shift conflicts detected for tomorrow.", time: "18 min ago", icon: Clock, tone: "#CA8A04" },
];

const CT_ACTIONS = [
  { label: "Reassign 2 Nurses to Emergency", cta: "Review" },
  { label: "Add On-Call Cardiologist", cta: "Add" },
  { label: "Adjust ICU Night Shift", cta: "Optimize" },
  { label: "Review Pending Handovers", cta: "Open" },
];

const CT_REASSIGN = [
  { name: "Nurse Hina", from: "Surgery", to: "Emergency Day Shift", match: "99%" },
  { name: "Dr. Hassan Raza", from: "Emergency", to: "ICU Evening Shift", match: "95%" },
];

const CT_QUICK = ["Who is on duty in ICU?", "Which unit is over capacity?", "Show me today's shift changes"];

export default function CareTeamWorkspace({ readOnly = false }: { readOnly?: boolean }) {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = readOnly ? "overview" : (searchParams.get("tab") || "overview");

  // Roster Search & Filter states
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterDept, setRosterDept] = useState("ALL");
  const [rosterShift, setRosterShift] = useState("ALL");
  const [rosterFiltersOpen, setRosterFiltersOpen] = useState(false);

  // Copilot Panel states
  const [showCopilot, setShowCopilot] = useState(true);
  const [copilotTab, setCopilotTab] = useState<"Insights" | "Tasks (4)" | "Ask Copilot">("Insights");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([
    { who: "copilot", text: "Hello! I am your AI Care Team Coordinator. Ask me anything about staffing rosters, workload distributions, or request suggested reassignments.", time: "16:04" }
  ]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Communication Center states
  const [commsTab, setCommsTab] = useState<"All" | "Team Chat" | "Announcements" | "Alerts">("All");

  // Selected MDT Patient state
  const [selectedMdtPatientId, setSelectedMdtPatientId] = useState<string | null>(null);

  // Shared state with Admin onboarding forms
  const [name, setName] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "NURSE" | "LAB" | "PHARMACIST" | "RECEPTIONIST" | "CARE_TEAM">("DOCTOR");
  const [specialty, setSpecialty] = useState("General Medicine");
  const [experience, setExperience] = useState("");
  const [room, setRoom] = useState("");
  const [floor, setFloor] = useState("");
  const [fee, setFee] = useState("500");
  const [pin, setPin] = useState("");
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);

  // Doctor Roster States
  const [schedulingDoctor, setSchedulingDoctor] = useState<any | null>(null);
  const [scheduleDays, setScheduleDays] = useState<Record<number, { active: boolean; start: string; end: string; duration: string }>>({});

  // Lab Schedule Timing States
  const [labCategory, setLabCategory] = useState<string>("ALL");
  const [labScheduleDays, setLabScheduleDays] = useState<Record<number, { active: boolean; start: string; end: string; duration: string; capacity: string }>>(() => {
    const init: Record<number, { active: boolean; start: string; end: string; duration: string; capacity: string }> = {};
    for (let i = 0; i < 7; i++) {
      init[i] = { active: i < 6, start: "08:00", end: "18:00", duration: "20", capacity: "5" };
    }
    return init;
  });

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [removingDoctorId, setRemovingDoctorId] = useState<string | null>(null);
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<"ALL" | "DOCTOR" | "NURSE" | "LAB" | "PHARMACIST" | "RECEPTIONIST" | "CARE_TEAM">("ALL");

  // Fetch doctors/staff directory
  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: api.adminDoctors,
  });

  // Fetch active patient encounters
  const { data: activeEncounters } = useQuery({
    queryKey: ["activeEncounters"],
    queryFn: api.activeEncounters,
  });

  // Fetch lab operating schedules
  const { data: labSchedules } = useQuery({
    queryKey: ["lab-schedules", labCategory],
    queryFn: () => api.listLabSchedules(labCategory),
  });

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (labSchedules && labSchedules.length > 0) {
      const updated: any = {};
      labSchedules.forEach((s: any) => {
        updated[s.day_of_week] = {
          active: Boolean(s.active),
          start: s.start_time || "08:00",
          end: s.end_time || "18:00",
          duration: String(s.slot_duration_minutes || 20),
          capacity: String(s.max_capacity_per_slot || 5),
        };
      });
      setLabScheduleDays(updated);
    }
  }, [labSchedules]);

  const doctorCount = doctors?.filter((d: any) => ((d.role || "DOCTOR").toUpperCase() === "DOCTOR")).length || 0;
  const nurseCount = doctors?.filter((d: any) => ((d.role || "").toUpperCase() === "NURSE")).length || 0;
  const labCount = doctors?.filter((d: any) => ((d.role || "").toUpperCase() === "LAB")).length || 0;
  const pharmacistCount = doctors?.filter((d: any) => ((d.role || "").toUpperCase() === "PHARMACIST")).length || 0;
  const receptionistCount = doctors?.filter((d: any) => ((d.role || "").toUpperCase() === "RECEPTIONIST")).length || 0;
  const careTeamCount = doctors?.filter((d: any) => ((d.role || "").toUpperCase() === "CARE_TEAM")).length || 0;
  const totalCount = doctors?.length || 0;

  const normalizedSearch = directorySearch.trim().toLowerCase();
  const filteredDoctors = doctors?.filter((doctor: any) => {
    const docRole = (doctor.role || "DOCTOR").toUpperCase();
    if (directoryRoleFilter !== "ALL" && docRole !== directoryRoleFilter) {
      return false;
    }
    if (!normalizedSearch) return true;
    return [doctor.name, doctor.specialty, doctor.department, doctor.role, doctor.room, doctor.floor]
      .some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
  });

  // Handle Form Submissions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      name: name.trim(),
      role,
      specialty: role === "DOCTOR" ? specialty : role === "LAB" ? "Pathology" : "Operations",
      department: role === "DOCTOR" ? specialty : role === "LAB" ? "Pathology" : "General Medicine",
      experience_years: experience ? parseInt(experience, 10) : undefined,
      room: room.trim() || undefined,
      floor: floor.trim() || undefined,
      opd_fee: role === "DOCTOR" ? parseFloat(fee) : 0,
      access_pin: pin.trim() || undefined,
    };

    try {
      if (editingDoctorId) {
        await api.updateDoctor(editingDoctorId, payload);
        setSuccessMsg("Practitioner profile updated successfully!");
        setEditingDoctorId(null);
      } else {
        await api.registerDoctor(payload);
        setSuccessMsg("New practitioner onboarded successfully!");
      }

      // Reset Form fields
      setName("");
      setExperience("");
      setRoom("");
      setFloor("");
      setFee("500");
      setPin("");
      void qc.invalidateQueries({ queryKey: ["doctors"] });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit practitioner profile.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditDoctor = (doctor: any) => {
    setEditingDoctorId(doctor.doctor_id || doctor.staff_id || doctor.id);
    setName(doctor.name);
    setRole(doctor.role.toUpperCase() as any);
    setSpecialty(doctor.specialty || "General Medicine");
    setExperience(String(doctor.experience_years || ""));
    setRoom(doctor.room || "");
    setFloor(doctor.floor || "");
    setFee(String(doctor.opd_fee || "500"));
    setPin(doctor.access_pin || "");
    setErrorMsg("");
    setSuccessMsg("");
    setSearchParams({ tab: "directory" });
  };

  const handleCancelEdit = () => {
    setEditingDoctorId(null);
    setName("");
    setExperience("");
    setRoom("");
    setFloor("");
    setFee("500");
    setPin("");
  };

  const handleRemoveDoctor = async (doctor: any) => {
    const id = doctor.doctor_id || doctor.staff_id;
    if (!window.confirm(`Remove ${doctor.name} from the Clinical Directory?`)) return;

    setRemovingDoctorId(id);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await api.removeDoctor(id);
      if (editingDoctorId === id) setEditingDoctorId(null);
      if (schedulingDoctor?.doctor_id === id) setSchedulingDoctor(null);
      setSuccessMsg(`${doctor.name} removed successfully!`);
      void qc.invalidateQueries({ queryKey: ["doctors"] });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to remove practitioner.");
    } finally {
      setRemovingDoctorId(null);
    }
  };

  const handleOpenRosterSettings = async (doctor: any) => {
    setSchedulingDoctor(doctor);
    try {
      const schedule = await api.listDoctorSchedule(doctor.doctor_id || doctor.staff_id);
      const initDays: Record<number, any> = {};
      for (let i = 0; i < 7; i++) {
        const item = schedule.find((s) => s.day_of_week === i);
        initDays[i] = {
          active: item ? Boolean(item.active) : false,
          start: item?.start_time || "09:00",
          end: item?.end_time || "17:00",
          duration: String(item?.slot_duration_minutes || 15),
        };
      }
      setScheduleDays(initDays);
    } catch {
      const initDays: Record<number, any> = {};
      for (let i = 0; i < 7; i++) {
        initDays[i] = { active: false, start: "09:00", end: "17:00", duration: "15" };
      }
      setScheduleDays(initDays);
    }
  };

  const handleSaveRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingDoctor) return;
    setSubmitting(true);
    try {
      const payload = Object.entries(scheduleDays).map(([day, val]) => ({
        day_of_week: parseInt(day, 10),
        active: val.active,
        start_time: val.start,
        end_time: val.end,
        slot_duration_minutes: parseInt(val.duration, 10),
      }));
      await api.updateDoctorSchedule(schedulingDoctor.doctor_id || schedulingDoctor.staff_id, payload);
      setSuccessMsg(`Roster updated for ${schedulingDoctor.name}`);
      setSchedulingDoctor(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save roster schedules.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveLabTimings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = Object.entries(labScheduleDays).map(([day, val]) => ({
        day_of_week: parseInt(day, 10),
        active: val.active,
        category: labCategory,
        start_time: val.start,
        end_time: val.end,
        slot_duration_minutes: parseInt(val.duration, 10),
        max_capacity_per_slot: parseInt(val.capacity, 10),
      }));
      await api.updateLabSchedules(payload);
      setSuccessMsg("Laboratory schedules successfully updated!");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save laboratory schedules.");
    } finally {
      setSubmitting(false);
    }
  };

  // AI Copilot Thread Simulator
  const handleAskCopilot = (text: string) => {
    if (!text.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [...prev, { who: "user", text, time }]);
    setChatInput("");
    setLoadingChat(true);

    setTimeout(() => {
      let reply = "I've processed your query about the care team. Staffing levels in the Emergency and ICU departments are currently stable. Let me know if you need to reassign nurses or check on-duty schedules.";
      const query = text.toLowerCase();
      if (query.includes("who is on duty") || query.includes("duty in icu")) {
        const icuDocs = doctors?.filter((d: any) => d.available && (d.department?.toLowerCase() === "icu" || d.specialty?.toLowerCase() === "icu" || d.specialty?.toLowerCase() === "oncology")) || [];
        if (icuDocs.length > 0) {
          reply = `Currently, the following practitioners are on duty in ICU/Oncology: ${icuDocs.map((d: any) => d.name).join(", ")}.`;
        } else {
          reply = "There are currently no staff registered as available in ICU. You can manage their schedules from the Staff Directory tab.";
        }
      } else if (query.includes("over capacity") || query.includes("capacity")) {
        reply = "Currently, the Emergency Department (OPD) is running at 110% capacity with 2 active shift overflows. The Cardiology Unit is close to high load.";
      } else if (query.includes("shift changes") || query.includes("shift")) {
        reply = "Today has 6 scheduled shift changes. The next upcoming change is ICU Night Shift starting at 3:00 PM.";
      }

      setChatMessages((prev) => [...prev, { who: "copilot", text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setLoadingChat(false);
    }, 850);
  };

  // ---------------- Render Views ----------------

  const renderOverviewTab = () => {
    // Dynamic Active Patient mapping per doctor/staff
    const activeCountMap: Record<string, number> = {};
    activeEncounters?.forEach((e: any) => {
      if (e.doctor_id) {
        activeCountMap[e.doctor_id] = (activeCountMap[e.doctor_id] || 0) + 1;
      }
    });

    // Roster generation
    const liveRoster = doctors?.map((doc: any, i) => {
      // Deterministic Gender
      const lowercaseName = doc.name.toLowerCase();
      const isFemale = lowercaseName.includes("priya") ||
                       lowercaseName.includes("ayesha") ||
                       lowercaseName.includes("fatima") ||
                       lowercaseName.includes("neha") ||
                       lowercaseName.includes("divya") ||
                       lowercaseName.includes("kavita") ||
                       lowercaseName.includes("marium") ||
                       lowercaseName.includes("hina") ||
                       lowercaseName.includes("sidra") ||
                       lowercaseName.includes("maham");
      const genderSymbol = isFemale ? "♀" : "♂";

      // Dynamic shift assignment based on database roster
      const dayOfWeek = (new Date().getDay() + 6) % 7;
      const todaySched = doc.schedules?.find((s: any) => s.day_of_week === dayOfWeek && s.active);

      let shift = "";
      if (todaySched) {
        const startHour = parseInt(todaySched.start_time.split(":")[0], 10);
        let shiftCategory = "Day";
        if (startHour >= 14 && startHour < 22) {
          shiftCategory = "Evening";
        } else if (startHour >= 22 || startHour < 6) {
          shiftCategory = "Night";
        }
        
        const formatTime12h = (tStr: string) => {
          const [h, m] = tStr.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
        };
        shift = `${shiftCategory} (${formatTime12h(todaySched.start_time)} - ${formatTime12h(todaySched.end_time)})`;
      } else {
        // Fallback to deterministic shift
        shift = "Day (7:00 AM - 3:00 PM)";
        if (i % 3 === 1) shift = "Evening (3:00 PM - 11:00 PM)";
        else if (i % 3 === 2) shift = "Night (11:00 PM - 7:00 AM)";
      }

      const ptsCount = activeCountMap[doc.doctor_id || doc.staff_id] || (doc.experience_years ? (doc.experience_years % 4) + 2 : 2);

      return {
        id: doc.doctor_id || doc.staff_id,
        name: doc.name,
        genderSymbol,
        role: doc.roleLabel || doc.role,
        dept: doc.department || doc.specialty || "General",
        shift,
        patients: ptsCount,
        status: doc.available ? "On Duty" : "Away",
        available: doc.available,
      };
    }) || [];

    // Filter Roster list
    const filteredRoster = liveRoster.filter((item: any) => {
      const matchSearch = item.name.toLowerCase().includes(rosterSearch.toLowerCase());
      const matchDept = rosterDept === "ALL" || item.dept.toUpperCase() === rosterDept.toUpperCase();
      const matchShift = rosterShift === "ALL" || (
        rosterShift === "DAY" && item.shift.includes("Day") ||
        rosterShift === "EVENING" && item.shift.includes("Evening") ||
        rosterShift === "NIGHT" && item.shift.includes("Night")
      );
      return matchSearch && matchDept && matchShift;
    });

    // Real-time Physician Assignments (Filtering only DOCTOR role)
    const livePhysicians = doctors?.filter((d: any) => d.role?.toUpperCase() === "DOCTOR").map((p) => ({
      name: p.name,
      dept: p.specialty || p.department || "General",
      patients: activeCountMap[p.doctor_id || p.staff_id] || 0,
    })) || PHYS_ASSIGN_DUMMY;

    // Real-time Nurse Assignments (Filtering only NURSE role)
    const liveNurses = doctors?.filter((d: any) => d.role?.toUpperCase() === "NURSE").map((n) => ({
      name: n.name,
      dept: n.department || "General Medicine",
      patients: activeCountMap[n.doctor_id || n.staff_id] || (n.experience_years ? (n.experience_years % 3) + 1 : 2),
    })) || NURSE_ASSIGN_DUMMY;

    // Filtered MDT active patient selection
    const activePatientChoices = activeEncounters?.map((e: any) => ({
      encounterId: e.encounter_id,
      patientId: e.patient_id,
      name: `Patient ${e.patient_id.slice(0, 5)}`
    })) || [{ encounterId: "1", patientId: "Ahmed Khan", name: "Ahmed Khan" }];

    const selectedMdtPatientName = activePatientChoices.find(c => c.patientId === selectedMdtPatientId)?.name || activePatientChoices[0]?.name;

    const initials = (name: string) => {
      return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
    };

    const covTone = (s: number, c: number) => (s > c ? "#D13438" : s / c >= 0.92 ? "#CA5010" : "#16a34a");
    let acc = 0;
    const workloadGrad = WORKLOAD.map((w) => { const seg = `${w.color} ${acc}% ${acc + w.pct}%`; acc += w.pct; return seg; }).join(", ");

    const doctorsOnDuty = doctors?.filter((d: any) => d.role?.toUpperCase() === "DOCTOR" && d.available).length || 0;
    const nursesOnDuty = doctors?.filter((d: any) => d.role?.toUpperCase() === "NURSE" && d.available).length || 0;
    const activePatientsCount = activeEncounters?.length || 0;
    const criticalCasesCount = activeEncounters?.filter((e: any) => e.status === "TRIAGED").length || 0;
    const shiftChangesCount = Math.max(1, Math.floor(doctorsOnDuty / 4) + 1);

    const liveKpis = [
      { value: String(doctorsOnDuty), label: "Doctors On Duty", sub: "Based on active roster", icon: Stethoscope, color: "#0078d4" },
      { value: String(nursesOnDuty), label: "Nurses On Duty", sub: "Triage & floor coverage", icon: HeartPulse, color: "#038387" },
      { value: String(activePatientsCount), label: "Active Patients", sub: "Across all departments", icon: Users, color: "#8764B8" },
      { value: String(criticalCasesCount), label: "Critical Cases", sub: "Red-flagged triage status", icon: AlertTriangle, color: "#D13438" },
      { value: String(shiftChangesCount), label: "Shift Changes (Today)", sub: "Scheduled coverage handoffs", icon: Clock, color: "#CA5010" },
    ];

    return (
      <div className="flex gap-4 items-start relative animate-in fade-in duration-300">
        {/* Left main workspace */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {liveKpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-black/[0.08] bg-white relative overflow-hidden p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.color }} />
                <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${k.color}1a`, color: k.color }}><k.icon size={18} /></div>
                <div className="text-[22px] font-extrabold leading-none text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
                <div className="mt-1 text-[11.5px] font-medium text-slate-500">{k.label}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Roster + MDT */}
          <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
            {/* Care Team Roster */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-bold text-[#0c3b63]">
                  Care Team Roster{" "}
                  <span className="text-[10.5px] font-normal text-slate-400">Total {filteredRoster.length} staff</span>
                </h3>
                
                {/* Search & Filters Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="relative">
                    <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search staff..."
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      className="pl-7 pr-2.5 py-1 border border-black/[0.08] rounded-lg text-[10.5px] w-28 bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setRosterFiltersOpen(prev => !prev)}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition ${
                      rosterFiltersOpen ? "bg-sky-500/10 border-sky-500/20 text-[#0078d4]" : "border-black/[0.08] bg-white/70 text-slate-600"
                    }`}
                  >
                    Filters
                  </button>

                  <select
                    value={rosterDept}
                    onChange={(e) => setRosterDept(e.target.value)}
                    className="rounded-lg border border-black/[0.08] bg-white/70 px-2 py-1 text-[10.5px] font-semibold text-slate-600 focus:outline-none"
                  >
                    <option value="ALL">Dept: All</option>
                    {SPECIALTY_DEPARTMENTS.slice(0, 5).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  <select
                    value={rosterShift}
                    onChange={(e) => setRosterShift(e.target.value)}
                    className="rounded-lg border border-black/[0.08] bg-white/70 px-2 py-1 text-[10.5px] font-semibold text-slate-600 focus:outline-none"
                  >
                    <option value="ALL">Shift: All</option>
                    <option value="DAY">Day Shift</option>
                    <option value="EVENING">Evening Shift</option>
                    <option value="NIGHT">Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Roster Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black/[0.08] pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="pb-1.5 font-bold">Staff Name</th>
                      <th className="pb-1.5 font-bold">Role</th>
                      <th className="pb-1.5 font-bold">Department</th>
                      <th className="pb-1.5 font-bold">Shift</th>
                      <th className="pb-1.5 font-bold">Status</th>
                      <th className="pb-1.5 font-bold text-center">Current Patients</th>
                      <th className="pb-1.5 font-bold text-center">Contact</th>
                      {!readOnly && <th className="pb-1.5 font-bold text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {filteredRoster.slice(0, 5).map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-2 pr-3 flex items-center gap-2 font-semibold text-slate-700">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-[rgba(0,120,212,.1)] text-[9px] font-bold text-[#0078d4]">
                            {initials(r.name)}
                          </span>
                          <span className="flex items-center gap-1">
                            {r.name}
                            <span className="text-[9.5px] font-bold text-slate-400">{r.genderSymbol}</span>
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-500">{r.role}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.dept}</td>
                        <td className="py-2 pr-3 text-slate-500">{r.shift}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${
                            r.status === "On Duty"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-semibold text-slate-600 text-center">{r.patients}</td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-2 justify-center text-slate-400">
                            <Phone size={13} className="cursor-pointer hover:text-slate-600" />
                            <MessageSquare size={13} className="cursor-pointer hover:text-slate-600" />
                          </div>
                        </td>
                        {!readOnly && (
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleEditDoctor(r)}
                              className="text-[#0078d4] font-bold hover:underline"
                            >
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!readOnly && (
                <button 
                  type="button" 
                  onClick={() => setSearchParams({ tab: "directory" })}
                  className="mt-3 text-[11px] font-semibold text-[#0078d4] hover:underline block"
                >
                  View All Staff →
                </button>
              )}
            </div>

            {/* Multidisciplinary Care Team */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-[#0c3b63]">Multidisciplinary Care Team</h3>
                
                {/* Active Patient dropdown */}
                <select
                  value={selectedMdtPatientId || ""}
                  onChange={(e) => setSelectedMdtPatientId(e.target.value)}
                  className="rounded-lg border border-black/[0.08] bg-white/70 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 focus:outline-none"
                >
                  {activePatientChoices.map((c) => (
                    <option key={c.patientId} value={c.patientId}>Patient: {c.patientId.slice(0, 8)}</option>
                  ))}
                </select>
              </div>

              <div className="mb-2 text-[10px] text-slate-400 text-left">
                MRN: CLN-{selectedMdtPatientId?.slice(0, 8) || "00012345"} · ICU-07 ·{" "}
                <span className="font-semibold text-[#D13438]">High Risk</span>
              </div>

              <div className="space-y-1.5">
                {MDT.map((m: any) => (
                  <div key={m.role} className="flex items-center gap-2 rounded-lg border border-black/[0.05] bg-white/60 p-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[10px] font-bold text-[#0078d4]">{initials(m.name)}</span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[10px] text-slate-400">{m.role}</div>
                      <div className="text-[12px] font-semibold text-slate-700">{m.name}</div>
                    </div>
                    {m.tag ? (
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#0078d4] text-[9px] font-bold text-white">{m.tag}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">{(m as any).sub}</span>
                    )}
                  </div>
                ))}
              </div>
              
              {!readOnly && (
                <button 
                  type="button" 
                  onClick={() => setSearchParams({ tab: "directory" })}
                  className="mt-3 text-[11px] font-semibold text-[#0078d4] hover:underline block text-left"
                >
                  + Add Team Member
                </button>
              )}
            </div>
          </div>

          {/* Real-time Physician/Nurse Assignments + Patient Coverage Matrix + Shift Scheduling */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Physician Assignments */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12.5px] font-bold text-[#0c3b63]">Physician Assignments</h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchParams({ tab: "directory" });
                      setDirectoryRoleFilter("DOCTOR");
                    }}
                    className="text-[10.5px] font-semibold text-[#0078d4] hover:underline"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {livePhysicians.slice(0, 5).map((p, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[rgba(0,120,212,.1)] text-[9px] font-bold text-[#0078d4]">{initials(p.name)}</span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[11.5px] font-semibold text-slate-700">{p.name}</div>
                      <div className="truncate text-[9.5px] text-slate-400">{p.dept} · {p.patients} Patients</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Nurse Assignments */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12.5px] font-bold text-[#0c3b63]">Nurse Assignments</h3>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchParams({ tab: "directory" });
                      setDirectoryRoleFilter("NURSE");
                    }}
                    className="text-[10.5px] font-semibold text-[#0078d4] hover:underline"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {liveNurses.slice(0, 5).map((p, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[rgba(3,131,135,.12)] text-[9px] font-bold text-[#038387]">{initials(p.name)}</span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-[11.5px] font-semibold text-slate-700">{p.name}</div>
                      <div className="truncate text-[9.5px] text-slate-400">{p.dept} · {p.patients} Patients</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Patient Coverage Matrix */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <h3 className="mb-2 text-[12.5px] font-bold text-[#0c3b63] text-left">Patient Coverage Matrix</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[180px] text-left text-[10.5px]">
                  <thead>
                    <tr className="border-b border-black/[0.05] pb-1 font-bold text-slate-400 text-[9px] uppercase tracking-wider">
                      <th className="pb-1 font-bold">Unit</th>
                      <th className="pb-1 font-bold">Day</th>
                      <th className="pb-1 font-bold">Eve</th>
                      <th className="pb-1 font-bold">Night</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {COVERAGE.map((r) => (
                      <tr key={r.unit} className="hover:bg-slate-50/55 transition">
                        <td className="py-1.5 font-semibold text-slate-650">{r.unit}</td>
                        {r.shifts.map(([sV, cV], i) => (
                          <td key={i} className="py-1.5 font-bold" style={{ color: covTone(sV, cV) }}>
                            {sV}/{cV}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-2.5 gap-y-1 text-[8.5px] text-slate-400 font-bold border-t border-black/[0.05] pt-2">
                {[["#16a34a", "Within Capacity"], ["#CA5010", "High Load"], ["#D13438", "Over Capacity"]].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                    {l}
                  </span>
                ))}
              </div>
            </div>

            {/* Shift Scheduling */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12.5px] font-bold text-[#0c3b63]">Shift Scheduling</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0078d4] hover:underline">Calendar</button>
              </div>
              <div className="mb-1 text-[9.5px] text-slate-400 text-left">May 12 - May 18, 2026</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[200px] text-left text-[10px]">
                  <thead>
                    <tr className="border-b border-black/[0.05] pb-1 text-slate-400 font-bold">
                      <th className="pb-1">Shift</th>
                      {SCHED_DAYS.map((d) => (
                        <th key={d} className="pb-1 pr-1">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {SHIFT_SCHED.map((r) => (
                      <tr key={r.shift} className="hover:bg-slate-50/50 transition">
                        <td className="py-1 pr-1.5">
                          <div className="font-semibold text-slate-655">{r.shift}</div>
                          <div className="text-[8px] text-slate-400 leading-none">{r.time}</div>
                        </td>
                        {r.vals.map((v, i) => (
                          <td key={i} className="py-1 pr-1 text-slate-500 font-semibold">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Workload Distribution + Communication Center + Handoff Status */}
          <div className="grid gap-3 lg:grid-cols-3">
            {/* Workload Distribution */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <h3 className="mb-2 text-[12.5px] font-bold text-[#0c3b63] text-left">
                Workload Distribution <span className="text-[10px] font-normal text-slate-400">Departments</span>
              </h3>
              <div className="flex items-center gap-4 py-2">
                <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${workloadGrad})` }}>
                  <div className="grid h-18 w-18 place-items-center rounded-full bg-white text-center shadow-sm">
                    <div>
                      <div className="text-[15px] font-extrabold text-slate-800">186</div>
                      <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Total Staff</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-1 text-left">
                  {WORKLOAD.map((w) => (
                    <div key={w.dept} className="flex items-center gap-1.5 text-[10.5px]">
                      <span className="h-2 w-2 rounded-full" style={{ background: w.color }} />
                      <span className="flex-1 text-slate-600 truncate">{w.dept}</span>
                      <span className="font-bold text-slate-500">{w.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Communication Center */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div>
                <h3 className="text-[12.5px] font-bold text-[#0c3b63] text-left">Communication Center</h3>
                
                {/* Comms Tabs */}
                <div className="mb-2 flex gap-3 border-b border-black/[0.06] text-[11px] pt-1">
                  {["All", "Team Chat", "Announcements", "Alerts"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setCommsTab(t as any)}
                      className={`pb-1 font-semibold transition ${
                        commsTab === t ? "border-b-2 border-[#0078d4] text-[#0078d4]" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Comms Feed list */}
                <div className="space-y-2 text-left">
                  {COMMS.map((c, i) => (
                    <div key={i} className="flex gap-2 p-1.5 hover:bg-slate-50/50 rounded-lg transition">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${c.tone}1a`, color: c.tone }}>
                        <c.icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 leading-none">{c.who}</span>
                          <span className="text-[9px] text-slate-400 font-medium">{c.time}</span>
                        </div>
                        <p className="text-[10px] leading-snug text-slate-500 mt-0.5 truncate">{c.msg}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" className="mx-auto mt-2 text-[11px] font-semibold text-[#0078d4] hover:underline block">
                Open Communication Center →
              </button>
            </div>

            {/* Handoff Status */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col justify-between">
              <div>
                <h3 className="mb-2 text-[12.5px] font-bold text-[#0c3b63] text-left">
                  Handoff Status <span className="text-[10px] font-normal text-slate-400">Today</span>
                </h3>
                <div className="flex items-center gap-4 py-2">
                  <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: "conic-gradient(#16a34a 0 92%, #e2e8f0 92% 100%)" }}>
                    <div className="grid h-18 w-18 place-items-center rounded-full bg-white text-center shadow-sm">
                      <div>
                        <div className="text-[15px] font-extrabold text-[#16a34a]">92%</div>
                        <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Completed</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5 text-left">
                    {HANDOFF.map((h) => (
                      <div key={h.label} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">{h.label}</span>
                        <span className="font-bold" style={{ color: h.tone }}>{h.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button type="button" className="mx-auto mt-2 text-[11px] font-semibold text-[#0078d4] hover:underline block">
                View Handoff Board →
              </button>
            </div>
          </div>
        </div>

        {/* AI Copilot Side Pane */}
        {showCopilot && (
          <aside className="w-[310px] shrink-0 border border-black/[0.08] bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col h-[780px] sticky top-6 text-left animate-in slide-in-from-right-3 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3 mb-2">
              <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-[#0a5aa8]">
                <Sparkles size={15} /> AI Copilot
              </span>
              <button 
                type="button" 
                onClick={() => setShowCopilot(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>

            {/* Sidebar Tabs */}
            <div className="flex gap-4 border-b border-black/[0.06] mb-3">
              {["Insights", "Tasks (4)", "Ask Copilot"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCopilotTab(t as any)}
                  className="relative pb-2 text-[12px] font-semibold transition focus:outline-none"
                  style={{ color: copilotTab === t ? "#0078d4" : "#6b7280" }}
                >
                  {t}
                  {copilotTab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[#0078d4]" />}
                </button>
              ))}
            </div>

            {/* Tab content area */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
              {copilotTab === "Insights" && (
                <>
                  {/* Staffing Insights */}
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Staffing Insights</div>
                    <div className="space-y-2">
                      {CT_INSIGHTS.map((n) => (
                        <div key={n.title} className="rounded-xl border border-black/[0.05] bg-slate-50/50 p-2.5">
                          <div className="flex gap-2">
                            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ background: `${n.tone}1a`, color: n.tone }}>
                              <AlertTriangle size={13} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11.5px] font-bold text-slate-700 leading-none">{n.title}</span>
                                <span className="text-[9px] text-slate-400">{n.time}</span>
                              </div>
                              <p className="text-[10px] leading-snug text-slate-500 mt-1">{n.body}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Actions */}
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Recommended Actions</div>
                    <div className="space-y-1.5">
                      {CT_ACTIONS.map((a) => (
                        <div key={a.label} className="flex items-center justify-between rounded-lg border border-black/[0.07] bg-white/70 px-2.5 py-1.5">
                          <span className="text-[11px] font-semibold text-slate-650 truncate w-[190px]">{a.label}</span>
                          <button
                            type="button"
                            onClick={() => handleAskCopilot(a.label)}
                            className="rounded-md border border-[rgba(0,120,212,.3)] bg-white px-2 py-0.5 text-[10px] font-bold text-[#0a5aa8]"
                          >
                            {a.cta}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Reassignments */}
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Suggested Reassignments</div>
                    <div className="space-y-1.5">
                      {CT_REASSIGN.map((r) => (
                        <div key={r.name} className="rounded-xl border border-black/[0.05] p-2.5 bg-slate-50/50">
                          <div className="flex items-center gap-2">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[9px] font-bold text-[#0078d4]">
                              {initials(r.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[11px] font-bold text-slate-700">{r.name}</div>
                              <div className="text-[9px] text-slate-400 truncate">{r.from} → {r.to}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAskCopilot(`Reassign ${r.name} from ${r.from} to ${r.to}`)}
                              className="rounded bg-[#0078d4] px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-[#0078d4]/90"
                            >
                              Reassign
                            </button>
                          </div>
                          <div className="mt-1 text-[8.5px] font-bold text-[#16a34a]">Skills match {r.match}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Ask */}
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Quick Ask</div>
                    <div className="flex flex-wrap gap-1.5">
                      {CT_QUICK.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleAskCopilot(q)}
                          className="rounded-full border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-slate-600 hover:border-[#0078d4]/40 hover:text-[#0a5aa8] transition"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {copilotTab === "Tasks (4)" && (
                <div className="space-y-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Operations Checklist</div>
                  {[
                    { text: "Complete evening nurse handover report (ICU)", done: false },
                    { text: "Onboard new critical care consultant", done: true },
                    { text: "Allocate emergency overflow beds (Floor 1)", done: false },
                    { text: "Resolve night shift scheduling conflict", done: false }
                  ].map((task, idx) => (
                    <label key={idx} className="flex items-start gap-2.5 p-2 rounded-lg border border-black/[0.04] bg-slate-50/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={task.done}
                        readOnly
                        className="mt-0.5 rounded border-slate-350 accent-[#0078d4] h-3.5 w-3.5"
                      />
                      <span className={`text-[11.5px] leading-snug font-medium ${task.done ? "line-through text-slate-400" : "text-slate-600"}`}>
                        {task.text}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {copilotTab === "Ask Copilot" && (
                <div className="flex flex-col h-full space-y-3">
                  {/* Messages container */}
                  <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[460px] pr-1">
                    {chatMessages.map((msg, i) => {
                      const isMe = msg.who === "user";
                      return (
                        <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          <div className={`rounded-xl p-2.5 max-w-[230px] shadow-sm text-[11.5px] leading-snug font-medium ${
                            isMe ? "bg-[#0078d4] text-white rounded-br-none" : "bg-slate-100 text-slate-800 rounded-bl-none"
                          }`}>
                            <div>{msg.text}</div>
                            <div className={`text-[8.5px] text-right mt-1 font-semibold ${isMe ? "text-white/70" : "text-slate-400"}`}>{msg.time}</div>
                          </div>
                        </div>
                      );
                    })}
                    {loadingChat && (
                      <div className="flex justify-start">
                        <div className="rounded-xl p-2.5 bg-slate-100 text-slate-500 text-[11px] italic flex items-center gap-1.5">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200" />
                        </div>
                      </div>
                    )}
                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat input form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAskCopilot(chatInput);
                    }}
                    className="flex gap-1.5 border-t border-black/[0.08] pt-2"
                  >
                    <input
                      type="text"
                      placeholder="Ask copilot..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="input flex-1 p-2 text-xs border border-black/[0.08] rounded-lg focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="p-2 bg-[#0078d4] text-white rounded-lg hover:bg-[#0078d4]/90 transition shrink-0"
                    >
                      <Send size={13} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    );
  };

  const renderDirectoryTab = () => {
    return (
      <div className="grid gap-4 xl:grid-cols-[380px_1fr] text-left animate-in fade-in duration-300">
        {/* Left Form: Onboard Practitioner */}
        <div className="space-y-4">
          <SectionTitle plain>{editingDoctorId ? "Edit Profile Details" : "Onboard Practitioner"}</SectionTitle>
          <Card className="p-4 relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(37,100,207,0.05), transparent)" }}>
            {/* Form Title Actions */}
            <div className="flex items-center justify-between mb-3 border-b border-black/[0.05] pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-[#0078d4]">Registration Details</span>
              {editingDoctorId && (
                <button type="button" onClick={handleCancelEdit} className="text-[10px] font-bold text-red-500 hover:text-red-655 flex items-center gap-0.5">
                  <X size={10} /> Cancel Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs text-slate-800">
              <div className="space-y-1">
                <label className="block font-bold text-slate-500">Staff Role *</label>
                <select
                  className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg bg-white"
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as any;
                    setRole(newRole);
                    if (newRole === "DOCTOR") {
                      setSpecialty("General Medicine");
                      setFee("500");
                    } else if (newRole === "LAB") {
                      setSpecialty("Pathology & Blood/Urine");
                      setFee("0");
                    } else {
                      setFee("0");
                    }
                  }}
                >
                  <option value="DOCTOR">Doctor</option>
                  <option value="NURSE">Nurse</option>
                  <option value="LAB">Lab Technician</option>
                  <option value="PHARMACIST">Pharmacist</option>
                  <option value="RECEPTIONIST">Receptionist</option>
                  <option value="CARE_TEAM">Care Team</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-500">
                  {role === "DOCTOR"
                    ? "Doctor Full Name *"
                    : role === "NURSE"
                    ? "Nurse Full Name *"
                    : role === "LAB"
                    ? "Lab Technician Full Name *"
                    : role === "PHARMACIST"
                    ? "Pharmacist Full Name *"
                    : role === "RECEPTIONIST"
                    ? "Receptionist Full Name *"
                    : "Care Team Full Name *"}
                </label>
                <input
                  type="text"
                  placeholder={
                    role === "DOCTOR"
                      ? "e.g. Dr. Ananya Mehta"
                      : role === "NURSE"
                      ? "e.g. Priya Sharma"
                      : role === "LAB"
                      ? "e.g. Vikram Lab Tech"
                      : role === "PHARMACIST"
                      ? "e.g. Sunil Pharmacist"
                      : role === "RECEPTIONIST"
                      ? "e.g. Deepa Front Desk"
                      : "e.g. Amit Care Coordinator"
                  }
                  className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {role === "DOCTOR" && (
                <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500">Specialty Department</label>
                    <select
                      className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg bg-white"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                    >
                      {SPECIALTY_DEPARTMENTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500">Experience (Years) *</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 8"
                      className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {role === "NURSE" && (
                <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <label className="block font-bold text-[var(--dim)]">Triage Clinical Unit</label>
                    <input
                      type="text"
                      className="input text-xs cursor-not-allowed opacity-60 w-full p-2 border border-black/[0.08] rounded-lg bg-slate-50"
                      value="Emergency Triage & Intake"
                      disabled
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500">Experience (Years) *</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 4"
                      className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {role === "CARE_TEAM" && (
                <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                  <div className="space-y-1">
                    <label className="block font-bold text-[var(--dim)]">Operations Unit</label>
                    <input
                      type="text"
                      className="input text-xs cursor-not-allowed opacity-60 w-full p-2 border border-black/[0.08] rounded-lg bg-slate-50"
                      value="Care Coordination & Roster Ops"
                      disabled
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-500">Experience (Years) *</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 5"
                      className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-500">
                    {role === "DOCTOR"
                      ? "Room Assignment *"
                      : role === "NURSE"
                      ? "Triage Station / Room *"
                      : role === "LAB"
                      ? "Lab Room / Counter *"
                      : role === "PHARMACIST"
                      ? "Pharmacy Counter / Window *"
                      : role === "RECEPTIONIST"
                      ? "Reception Desk / Counter *"
                      : "Care Team Office / Room *"}
                  </label>
                  <input
                    type="text"
                    placeholder={
                      role === "DOCTOR"
                        ? "e.g. Room 104"
                        : role === "NURSE"
                        ? "e.g. Triage Room 1"
                        : role === "LAB"
                        ? "e.g. Lab Counter 2"
                        : role === "PHARMACIST"
                        ? "e.g. Pharmacy Window 1"
                        : role === "RECEPTIONIST"
                        ? "e.g. Front Desk 1"
                        : "e.g. Operations Room 3"
                    }
                    className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-500">Floor Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. Floor 2"
                    className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-500">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                    value={fee}
                    disabled={role !== "DOCTOR"}
                    onChange={(e) => setFee(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-slate-500">Access Login PIN *</label>
                  <input
                    type="password"
                    placeholder="4-8 characters"
                    maxLength={8}
                    className="input text-xs w-full p-2 border border-black/[0.08] rounded-lg"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 flex items-center gap-1.5">
                  <BadgeCheck size={14} className="shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn font-bold w-full py-2 bg-[#0078d4] hover:bg-[#0078d4]/90 text-white rounded-lg transition"
              >
                {submitting ? "Saving..." : editingDoctorId ? "Save Changes" : "Register Staff"}
              </button>
            </form>
          </Card>
        </div>

        {/* Right Panel: Clinical Staff Directory */}
        <div className="space-y-4">
          <SectionTitle plain>Clinical &amp; Staff Directory</SectionTitle>
          <Card className="min-h-[400px] p-4 space-y-4">
            {/* Top Filters */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-50 border border-black/[0.04]">
              {[
                { id: "ALL", label: "All Staff", count: totalCount, icon: Users },
                { id: "DOCTOR", label: "Doctors", count: doctorCount, icon: Stethoscope },
                { id: "NURSE", label: "Nurses", count: nurseCount, icon: User },
                { id: "LAB", label: "Lab Techs", count: labCount, icon: FlaskConical },
                { id: "PHARMACIST", label: "Pharmacists", count: pharmacistCount, icon: Pill },
                { id: "RECEPTIONIST", label: "Receptionists", count: receptionistCount, icon: ClipboardList },
                { id: "CARE_TEAM", label: "Care Team", count: careTeamCount, icon: Users },
              ].map((tab) => {
                const isActive = directoryRoleFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDirectoryRoleFilter(tab.id as any)}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      isActive ? "bg-white text-[#0078d4] shadow-sm border border-black/[0.08]" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <tab.icon size={13} className={isActive ? "text-[#0078d4]" : "opacity-70"} />
                    <span>{tab.label}</span>
                    <span className="rounded-full px-1.5 py-0.2 bg-slate-100 text-[10px] font-extrabold">{tab.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Staff Search Box */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name, specialty, room, floor, or role..."
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                className="input pl-9 w-full p-2 border border-black/[0.08] rounded-lg text-xs"
              />
            </div>

            {/* Staff Table */}
            {filteredDoctors && filteredDoctors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-slate-800 text-[12.5px] text-left">
                  <thead>
                    <tr className="border-b border-black/[0.08] pb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="pb-2 pr-3">Staff Member</th>
                      <th className="pb-2 pr-3">Role / Specialty</th>
                      <th className="pb-2 pr-3">Room / Location</th>
                      <th className="pb-2 pr-3 text-center">Login PIN</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {filteredDoctors.map((doc: any) => {
                      const id = doc.doctor_id || doc.staff_id;
                      return (
                        <tr key={id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 pr-3 font-bold text-slate-700">{doc.name}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-500">{doc.specialty || doc.role}</td>
                          <td className="py-3 pr-3 text-slate-500">
                            {doc.room ? `${doc.room} (${doc.floor || "Floor 1"})` : "—"}
                          </td>
                          <td className="py-3 pr-3 text-center font-bold text-slate-650">{doc.access_pin || "1234"}</td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => handleEditDoctor(doc)}
                              className="text-amber-600 hover:text-amber-850 font-bold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDoctor(doc)}
                              disabled={removingDoctorId === id}
                              className="text-red-500 hover:text-red-800 font-bold"
                            >
                              Remove
                            </button>
                            {doc.role === "DOCTOR" && (
                              <button
                                type="button"
                                onClick={() => handleOpenRosterSettings(doc)}
                                className="text-sky-600 hover:text-sky-800 font-bold"
                              >
                                Roster
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                <div className="font-semibold text-slate-700">No staff members found</div>
                <div className="text-slate-400 text-xs mt-1">Adjust your filters or onboard new practitioners to get started.</div>
              </Empty>
            )}
          </Card>
        </div>

        {/* Doctor Roster Scheduler Modal */}
        {schedulingDoctor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-white rounded-2xl p-6 shadow-2xl space-y-4 border border-black/15 text-slate-800">
              <div className="flex items-center justify-between border-b border-black/10 pb-3">
                <h3 className="text-sm font-extrabold text-[#0c3b63] flex items-center gap-1.5">
                  <Calendar size={18} className="text-[#0078d4]" />
                  <span>Configure Roster Schedules for {schedulingDoctor.name}</span>
                </h3>
                <button type="button" onClick={() => setSchedulingDoctor(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-650">
                  ✕ Close
                </button>
              </div>

              <form onSubmit={handleSaveRoster} className="space-y-4 text-xs">
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {DAYS_OF_WEEK.map((day, index) => {
                    const d = scheduleDays[index] || { active: false, start: "09:00", end: "17:00", duration: "15" };
                    return (
                      <div key={day} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-black/[0.04] bg-slate-50/50">
                        <label className="flex items-center gap-2 min-w-[100px] font-bold text-slate-700">
                          <input
                            type="checkbox"
                            checked={d.active}
                            onChange={(e) => setScheduleDays((prev) => ({
                              ...prev,
                              [index]: { ...d, active: e.target.checked },
                            }))}
                            className="h-3.5 w-3.5 rounded border-slate-350 accent-[#0078d4]"
                          />
                          {day}
                        </label>

                        {d.active && (
                          <div className="flex flex-wrap items-center gap-3 animate-in fade-in duration-200">
                            <label className="flex items-center gap-1 text-slate-550 font-bold">
                              Start:
                              <input
                                type="time"
                                value={d.start}
                                onChange={(e) => setScheduleDays((prev) => ({
                                  ...prev,
                                  [index]: { ...d, start: e.target.value },
                                }))}
                                className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                              />
                            </label>

                            <label className="flex items-center gap-1 text-slate-550 font-bold">
                              End:
                              <input
                                type="time"
                                value={d.end}
                                onChange={(e) => setScheduleDays((prev) => ({
                                  ...prev,
                                  [index]: { ...d, end: e.target.value },
                                }))}
                                className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                              />
                            </label>

                            <label className="flex items-center gap-1 text-slate-550 font-bold">
                              Slot Duration:
                              <select
                                value={d.duration}
                                onChange={(e) => setScheduleDays((prev) => ({
                                  ...prev,
                                  [index]: { ...d, duration: e.target.value },
                                }))}
                                className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                              >
                                <option value="10">10 min</option>
                                <option value="15">15 min</option>
                                <option value="20">20 min</option>
                                <option value="30">30 min</option>
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-black/10">
                  <button
                    type="button"
                    onClick={() => setSchedulingDoctor(null)}
                    className="bg-white hover:bg-slate-100 border border-black/[0.08] text-slate-650 font-bold text-xs py-1.5 px-4 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white font-bold text-xs py-1.5 px-4 rounded-lg transition"
                  >
                    {submitting ? "Saving..." : "Save Roster"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTimingsTab = () => {
    return (
      <div className="max-w-3xl mx-auto text-left animate-in fade-in duration-300 space-y-4">
        <SectionTitle plain>Laboratory Timing &amp; Capacity Scheduler</SectionTitle>
        <Card className="p-6 relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(37,100,207,0.05), transparent)" }}>
          <div className="flex items-center justify-between pb-3 border-b border-black/[0.05] mb-4">
            <label className="flex items-center gap-2 text-slate-500 font-bold">
              Select Category:
              <select
                className="input text-xs border border-black/[0.08] rounded-lg p-1 bg-white"
                value={labCategory}
                onChange={(e) => setLabCategory(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                <option value="PATHOLOGY">Pathology &amp; Blood/Urine</option>
                <option value="RADIOLOGY">Radiology &amp; PACS Imaging</option>
              </select>
            </label>
          </div>

          <form onSubmit={handleSaveLabTimings} className="space-y-4 text-xs text-slate-800">
            <div className="space-y-3">
              {DAYS_OF_WEEK.map((day, index) => {
                const d = labScheduleDays[index] || { active: false, start: "08:00", end: "18:00", duration: "20", capacity: "5" };
                return (
                  <div key={day} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-black/[0.04] bg-slate-50/50">
                    <label className="flex items-center gap-2 min-w-[100px] font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={d.active}
                        onChange={(e) => setLabScheduleDays((prev) => ({
                          ...prev,
                          [index]: { ...d, active: e.target.checked },
                        }))}
                        className="h-3.5 w-3.5 rounded border-slate-350 accent-[#0078d4]"
                      />
                      {day}
                    </label>

                    {d.active && (
                      <div className="flex flex-wrap items-center gap-3 animate-in fade-in duration-200">
                        <label className="flex items-center gap-1 text-slate-550 font-bold">
                          Start:
                          <input
                            type="time"
                            value={d.start}
                            onChange={(e) => setLabScheduleDays((prev) => ({
                              ...prev,
                              [index]: { ...d, start: e.target.value },
                            }))}
                            className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                          />
                        </label>

                        <label className="flex items-center gap-1 text-slate-550 font-bold">
                          End:
                          <input
                            type="time"
                            value={d.end}
                            onChange={(e) => setLabScheduleDays((prev) => ({
                              ...prev,
                              [index]: { ...d, end: e.target.value },
                            }))}
                            className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                          />
                        </label>

                        <label className="flex items-center gap-1 text-slate-550 font-bold">
                          Slot Duration:
                          <select
                            value={d.duration}
                            onChange={(e) => setLabScheduleDays((prev) => ({
                              ...prev,
                              [index]: { ...d, duration: e.target.value },
                            }))}
                            className="p-1 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                          >
                            <option value="15">15 min</option>
                            <option value="20">20 min</option>
                            <option value="30">30 min</option>
                            <option value="60">60 min</option>
                          </select>
                        </label>

                        <label className="flex items-center gap-1 text-slate-550 font-bold">
                          Capacity Per Slot:
                          <input
                            type="number"
                            min="1"
                            value={d.capacity}
                            onChange={(e) => setLabScheduleDays((prev) => ({
                              ...prev,
                              [index]: { ...d, capacity: e.target.value },
                            }))}
                            className="p-1 w-14 border border-black/[0.08] rounded bg-white font-semibold text-slate-700"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 flex items-center gap-1.5">
                <ShieldAlert size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 flex items-center gap-1.5">
                <BadgeCheck size={14} />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn font-bold py-2 bg-[#0078d4] hover:bg-[#0078d4]/90 text-white rounded-lg transition"
            >
              {submitting ? "Saving..." : "Save Operating Hours"}
            </button>
          </form>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Care Team Overview Heading */}
      <div className="flex items-center justify-between text-left pb-1 border-b border-black/[0.05]">
        <div>
          <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
            <UserCog className="text-[#0078d4]" size={20} /> Care Team Clinical Portal
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            {tab === "overview" && "Real-time overview of hospital staffing, assignments, and workload metrics."}
            {tab === "directory" && "Onboard clinical practitioners and manage staff profile credentials."}
            {tab === "timings" && "Set lab operating rosters, slot durations, and service booking capacities."}
          </p>
        </div>
        
        {/* Header Right Buttons */}
        {tab === "overview" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCopilot((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition shadow-sm ${
                showCopilot
                  ? "bg-sky-500/10 text-sky-600 border-sky-500/25"
                  : "bg-white text-slate-600 border-black/[0.08] hover:bg-slate-50"
              }`}
            >
              <Sparkles size={13} className={showCopilot ? "text-[#0078d4]" : "text-slate-400"} />
              <span>Copilot</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Tab Renderings */}
      {tab === "overview" && renderOverviewTab()}
      {tab === "directory" && renderDirectoryTab()}
      {tab === "timings" && renderTimingsTab()}
    </div>
  );
}
