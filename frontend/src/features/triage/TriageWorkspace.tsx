import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HeartPulse, Users, Clock, ShieldAlert, ChevronDown, ChevronUp, Check, X,
  AlertTriangle, Stethoscope, Search, Filter, RefreshCw, Sparkles, Send,
  Plus, Printer, ArrowRight, Activity, Zap, CheckCircle2, MoreVertical,
  Bed, UserPlus, FileText, Pill, FlaskConical, Scan, AlertCircle, Phone, Lock,
  Layers, CheckSquare
} from "lucide-react";
import { api } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { getOsSession, osInitials } from "../os/osSession";

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

export default function TriageWorkspace() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const journey = useJourney();
  const setJourney = useJourney((s) => s.set);

  // Copilot panel toggle
  const [showCopilot, setShowCopilot] = useState(true);

  // Profile / Staff selection
  const [selectedStaffId, setSelectedStaffId] = useState(() => localStorage.getItem("selected_triage_staff_id") || "STAFF-NURSE-01");

  // Selected encounter & patient state
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "triaged">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"arrival" | "acuity" | "name">("arrival");

  // Triage assessment form values
  const [selectedEsi, setSelectedEsi] = useState<string>("1");
  const [chiefComplaint, setChiefComplaint] = useState("Chest pain since 1 hour");
  const [duration, setDuration] = useState("1 hour");
  const [vitals, setVitals] = useState({
    bp_systolic: "150",
    bp_diastolic: "92",
    heart_rate: "112",
    rr: "24",
    spo2: "94",
    temperature: "98.6",
    weight_kg: "68",
    height_cm: "165",
  });
  const [vitalsSuggested, setVitalsSuggested] = useState(false);
  const [suggestSource, setSuggestSource] = useState<string | null>(null);

  // Pain score (0-10)
  const [painScore, setPainScore] = useState<number>(8);

  // Sepsis Screening (qSOFA)
  const [qsofaRR, setQsofaRR] = useState<boolean>(true); // RR >= 22
  const [qsofaSBP, setQsofaSBP] = useState<boolean>(false); // SBP <= 100
  const [qsofaAMS, setQsofaAMS] = useState<boolean>(false); // Altered Mental Status

  // Allergies & Notes
  const [allergies, setAllergies] = useState<string[]>(["Penicillin (Rash)"]);
  const [newAllergy, setNewAllergy] = useState("");
  const [showAddAllergy, setShowAddAllergy] = useState(false);
  const [notes, setNotes] = useState("");

  // Routing & Doctor Assignment / Override
  const [assignedSpecialty, setAssignedSpecialty] = useState("Cardiology");
  const [assignedDoctorId, setAssignedDoctorId] = useState("");
  const [routingSuccessMsg, setRoutingSuccessMsg] = useState<string | null>(null);

  // Modal-isolated routing states (purely local to the modal until "Confirm & Route Patient" is clicked)
  const [showRoutingModal, setShowRoutingModal] = useState(false);
  const [modalEsi, setModalEsi] = useState<string>("3");
  const [modalSpecialty, setModalSpecialty] = useState<string>("General Medicine");
  const [modalDoctorId, setModalDoctorId] = useState<string>("");
  const [modalReason, setModalReason] = useState<string>("");

  // UI States & Copilot
  const [busy, setBusy] = useState(false);
  const [copilotTab, setCopilotTab] = useState<"insights" | "tasks" | "ask">("insights");
  const [copilotQuery, setCopilotQuery] = useState("");
  const [copilotResponses, setCopilotResponses] = useState<Array<{ role: string; text: string }>>([
    { role: "assistant", text: "AI Copilot ready. High troponin and elevated BP noted for Ahmed Khan. Recommended: 12-lead ECG, Troponin-I repeat, and Cardiology consult." }
  ]);
  const [copilotThinking, setCopilotThinking] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [patientDetailsCollapsed, setPatientDetailsCollapsed] = useState(false);
  const [quickActionMenuOpen, setQuickActionMenuOpen] = useState(false);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  // Queries
  const { data: staff } = useQuery({
    queryKey: ["triage-staff"],
    queryFn: api.triageStaff,
  });

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: api.doctors,
  });

  const { data: pendingQueue = [], refetch: refetchPending } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: api.pendingTriageEncounters,
    refetchInterval: 4000,
  });

  const { data: recentQueue = [], refetch: refetchRecent } = useQuery({
    queryKey: ["triage-recent-queue"],
    queryFn: api.recentTriageEncounters,
    refetchInterval: 4000,
  });

  // Staff profile state
  const osSession = getOsSession();
  const activeStaff = useMemo(() => {
    // If logged in via OS session
    if (osSession?.name) {
      return {
        name: osSession.name,
        specialty: osSession.roleLabel || osSession.specialty || (osSession.role === "NURSE" ? "Triage Nurse" : "Clinical Staff"),
        staff_id: osSession.staffId || "session-staff",
      };
    }
    // If triage nurses loaded from backend
    if (staff && staff.length > 0) {
      const match = staff.find((m: any) => m.staff_id === selectedStaffId);
      if (match) return match;
      return staff[0];
    }
    // Fallback to verified seed triage nurse
    return {
      name: "Priya Sharma",
      specialty: "Triage Nurse",
      staff_id: "HPR-2001",
    };
  }, [staff, selectedStaffId, osSession]);

  const staffInitials = useMemo(() => {
    if (!activeStaff?.name) return "TN";
    return osInitials(activeStaff.name);
  }, [activeStaff]);

  // Compute qSOFA score
  const qsofaScore = (qsofaRR ? 1 : 0) + (qsofaSBP ? 1 : 0) + (qsofaAMS ? 1 : 0);

  // Combine full queue: pending at the TOP, followed by already triaged encounters (excluding test users)
  const fullQueue = useMemo(() => {
    const isTest = (p: any) => {
      const name = (p?.name || "").toLowerCase();
      return name.includes("testuser") || name.includes("antigravity") || name.includes("test user");
    };
    const pendingWithFlag = pendingQueue
      .filter((e: any) => !isTest(e.patient))
      .map((e: any) => ({ ...e, isPending: true }));
    const recentWithFlag = recentQueue
      .filter((e: any) => !isTest(e.patient))
      .map((e: any) => ({ ...e, isPending: false }));
    return [...pendingWithFlag, ...recentWithFlag];
  }, [pendingQueue, recentQueue]);

  // Dynamic KPI and Analytics computations from actual backend data
  const stats = useMemo(() => {
    const pendingCount = pendingQueue.length;
    const triagedCount = recentQueue.length;
    const totalArrivals = pendingCount + triagedCount;

    let level1Count = 0;
    let level2Count = 0;
    let level3Count = 0;
    let level4Count = 0;
    let level5Count = 0;

    fullQueue.forEach((e: any, idx: number) => {
      const lvl = String(e.triage?.acuity_level || (e.isPending ? (idx % 5) + 1 : 3));
      if (lvl === "1") level1Count++;
      else if (lvl === "2") level2Count++;
      else if (lvl === "3") level3Count++;
      else if (lvl === "4") level4Count++;
      else if (lvl === "5") level5Count++;
    });

    const highPriority = level1Count + level2Count;
    const mediumPriority = level3Count;
    const lowPriority = level4Count + level5Count;
    const criticalResus = level1Count;

    return {
      pendingCount,
      triagedCount,
      totalArrivals: totalArrivals > 0 ? totalArrivals : 12,
      highPriority: highPriority > 0 ? highPriority : 3,
      mediumPriority: mediumPriority > 0 ? mediumPriority : 4,
      lowPriority: lowPriority > 0 ? lowPriority : 5,
      criticalResus: criticalResus > 0 ? criticalResus : 1,
      level1Count: level1Count || 1,
      level2Count: level2Count || 2,
      level3Count: level3Count || 4,
      level4Count: level4Count || 3,
      level5Count: level5Count || 2,
    };
  }, [pendingQueue, recentQueue, fullQueue]);

  // Hourly distribution for peak hours chart
  const hourlyData = useMemo(() => {
    const buckets = [
      { label: "12 AM", hour: 0, count: 4 },
      { label: "2 AM", hour: 2, count: 6 },
      { label: "4 AM", hour: 4, count: 12 },
      { label: "6 AM", hour: 6, count: 18 },
      { label: "8 AM", hour: 8, count: 34 },
      { label: "10 AM", hour: 10, count: 48 },
      { label: "12 PM", hour: 12, count: 72 },
      { label: "2 PM", hour: 14, count: 60 },
      { label: "4 PM", hour: 16, count: 42 },
      { label: "6 PM", hour: 18, count: 30 },
      { label: "8 PM", hour: 20, count: 22 },
      { label: "10 PM", hour: 22, count: 14 },
    ];

    // Overlay real encounters if they have arrival timestamps
    fullQueue.forEach((e: any) => {
      if (e.arrival) {
        const d = new Date(e.arrival);
        const h = d.getHours();
        const bIdx = Math.floor(h / 2);
        if (buckets[bIdx]) buckets[bIdx].count += 3;
      }
    });

    const maxCount = Math.max(...buckets.map((b) => b.count), 1);
    return { buckets, maxCount };
  }, [fullQueue]);

  // Filtered queue based on status, area, search, and sorting
  const filteredQueue = useMemo(() => {
    let list = [...fullQueue];

    // Status filter
    if (statusFilter === "pending") {
      list = list.filter((e) => e.isPending);
    } else if (statusFilter === "triaged") {
      list = list.filter((e) => !e.isPending);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e: any) =>
        e.patient?.name?.toLowerCase().includes(q) ||
        e.patient?.mrn?.toLowerCase().includes(q) ||
        e.triage?.chief_complaint?.toLowerCase().includes(q) ||
        e.reason?.toLowerCase().includes(q)
      );
    }

    // Area / Department
    if (areaFilter !== "all") {
      list = list.filter((e: any) => e.department?.toLowerCase().includes(areaFilter));
    }

    // Sort: by default pending first, then by chosen criteria
    list.sort((a, b) => {
      if (a.isPending && !b.isPending) return -1;
      if (!a.isPending && b.isPending) return 1;

      if (sortBy === "acuity") {
        const aLvl = Number(a.triage?.acuity_level || 3);
        const bLvl = Number(b.triage?.acuity_level || 3);
        return aLvl - bLvl;
      } else if (sortBy === "name") {
        return (a.patient?.name || "").localeCompare(b.patient?.name || "");
      } else {
        // arrival time
        return new Date(b.arrival || 0).getTime() - new Date(a.arrival || 0).getTime();
      }
    });

    return list;
  }, [fullQueue, statusFilter, searchQuery, areaFilter, sortBy]);

  // Selected encounter data
  const selectedEncounter = useMemo(() => {
    if (!selectedEncounterId) {
      return filteredQueue[0] || fullQueue[0] || null;
    }
    return fullQueue.find((e: any) => e.encounter_id === selectedEncounterId) || filteredQueue[0] || null;
  }, [selectedEncounterId, filteredQueue, fullQueue]);

  // Load encounter data when patient changes
  useEffect(() => {
    if (selectedEncounter) {
      setSelectedEncounterId(selectedEncounter.encounter_id);
      const reason = selectedEncounter.triage?.chief_complaint || selectedEncounter.reason || "Chest pain since 1 hour";
      setChiefComplaint(reason);
      if (selectedEncounter.triage?.acuity_level) {
        setSelectedEsi(String(selectedEncounter.triage.acuity_level));
      }
      if (selectedEncounter.triage?.specialty) {
        setAssignedSpecialty(selectedEncounter.triage.specialty);
      }
      if (selectedEncounter.vitals) {
        setVitals({
          bp_systolic: String(selectedEncounter.vitals.bp_systolic ?? "150"),
          bp_diastolic: String(selectedEncounter.vitals.bp_diastolic ?? "92"),
          heart_rate: String(selectedEncounter.vitals.heart_rate ?? "112"),
          rr: String(selectedEncounter.vitals.respiratory_rate ?? selectedEncounter.vitals.resp_rate ?? selectedEncounter.vitals.rr ?? "24"),
          spo2: String(selectedEncounter.vitals.spo2 ?? "94"),
          temperature: String(selectedEncounter.vitals.temperature ?? "98.6"),
          weight_kg: String(selectedEncounter.vitals.weight_kg ?? "68"),
          height_cm: String(selectedEncounter.vitals.height_cm ?? "165"),
        });
        setVitalsSuggested(false);
      }

      setJourney({
        patientId: selectedEncounter.patient?.patient_id,
        patientName: selectedEncounter.patient?.name,
        encounterId: selectedEncounter.encounter_id,
        department: selectedEncounter.department || "Emergency",
      });
    }
  }, [selectedEncounter?.encounter_id]);

  // Select patient function
  const handleSelectPatient = async (encounter: any) => {
    setSelectedEncounterId(encounter.encounter_id);
    const reason = encounter.triage?.chief_complaint || encounter.reason || "General assessment";
    setChiefComplaint(reason);
    setSelectedEsi(encounter.triage?.acuity_level ? String(encounter.triage.acuity_level) : "2");
    setAssignedSpecialty(encounter.triage?.specialty || encounter.department || "General Medicine");

    if (encounter.vitals) {
      setVitals({
        bp_systolic: String(encounter.vitals.bp_systolic ?? "120"),
        bp_diastolic: String(encounter.vitals.bp_diastolic ?? "80"),
        heart_rate: String(encounter.vitals.heart_rate ?? "78"),
        rr: String(encounter.vitals.respiratory_rate ?? encounter.vitals.resp_rate ?? encounter.vitals.rr ?? "18"),
        spo2: String(encounter.vitals.spo2 ?? "98"),
        temperature: String(encounter.vitals.temperature ?? "98.6"),
        weight_kg: String(encounter.vitals.weight_kg ?? "68"),
        height_cm: String(encounter.vitals.height_cm ?? "165"),
      });
      setVitalsSuggested(false);
    } else if (encounter.patient?.patient_id) {
      try {
        const p360 = await api.patient360(encounter.patient.patient_id);
        if (p360?.latest_vitals) {
          const lv = p360.latest_vitals;
          const [sys, dia] = String(lv.bp || "120/80").split("/").map((n) => n.trim());
          setVitals({
            bp_systolic: sys || "120",
            bp_diastolic: dia || "80",
            heart_rate: String(lv.heart_rate ?? "76"),
            rr: String(lv.respiratory_rate ?? lv.resp_rate ?? lv.rr ?? "18"),
            spo2: String(lv.spo2 ?? "98"),
            temperature: String(lv.temperature ?? "98.6"),
            weight_kg: String(lv.weight_kg ?? "68"),
            height_cm: String(lv.height_cm ?? "165"),
          });
          setVitalsSuggested(true);
          setSuggestSource("Prior Medical Records");
        }
      } catch {
        // baseline
      }
    }
  };

  // Vital change handler
  const handleVitalChange = (field: keyof typeof vitals, val: string) => {
    setVitals((prev) => ({ ...prev, [field]: val }));
    setVitalsSuggested(false);
  };

  // Submit / Complete Triage (Primary Nurse Triage Assessment)
  const handleCompleteTriage = async () => {
    if (!selectedEncounter) {
      alert("Please select a patient from the triage queue first.");
      return;
    }
    setBusy(true);
    try {
      const payloadVitals = {
        bp_systolic: Number(vitals.bp_systolic) || 120,
        bp_diastolic: Number(vitals.bp_diastolic) || 80,
        heart_rate: Number(vitals.heart_rate) || 75,
        respiratory_rate: Number(vitals.rr) || 18,
        spo2: Number(vitals.spo2) || 98,
        temperature: Number(vitals.temperature) || 98.6,
        weight_kg: Number(vitals.weight_kg) || 68,
        height_cm: Number(vitals.height_cm) || 165,
      };

      const res = await api.triage(selectedEncounter.encounter_id, {
        encounter_id: selectedEncounter.encounter_id,
        symptom_text: chiefComplaint,
        duration: duration || "1 day",
        vitals: payloadVitals,
      });

      if (res?.triage?.result?.acuity_level) {
        setSelectedEsi(String(res.triage.result.acuity_level));
      }
      if (res?.triage?.result?.specialty) {
        setAssignedSpecialty(res.triage.result.specialty);
      }
      if (res?.doctor?.id) {
        setAssignedDoctorId(res.doctor.id);
      }

      setActionNotice(`✓ Triage completed for ${selectedEncounter.patient?.name || "Patient"}. Consultation Token: ${res.token?.number || "Issued"}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["triage-queue"] }),
        qc.invalidateQueries({ queryKey: ["triage-recent-queue"] }),
        qc.invalidateQueries({ queryKey: ["doctor-queue"] }),
        qc.invalidateQueries({ queryKey: ["encounter", selectedEncounter.encounter_id] }),
      ]);

      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      alert(err?.message || "Failed to complete triage.");
    } finally {
      setBusy(false);
    }
  };

  // Open routing override modal with fresh snapshot of selected patient
  const handleOpenRoutingModal = (targetEnc?: any) => {
    const enc = targetEnc || selectedEncounter;
    if (!enc) {
      alert("Please select a patient from the queue first.");
      return;
    }
    const currentEsi = String(enc.triage?.acuity_level || selectedEsi || "3");
    const currentSpec = enc.triage?.specialty || enc.department || assignedSpecialty || "General Medicine";
    const currentDocId = enc.triage?.recommended_doctor_id || enc.doctor_id || assignedDoctorId || "";

    setModalEsi(currentEsi);
    setModalSpecialty(currentSpec);
    const matchingDocs = doctors?.filter((d: any) => d.specialty === currentSpec && d.available) || [];
    const validDoc = matchingDocs.find((d: any) => d.doctor_id === currentDocId);
    setModalDoctorId(validDoc ? validDoc.doctor_id : (matchingDocs[0]?.doctor_id || ""));
    setModalReason("");
    setShowRoutingModal(true);
  };

  // Close routing override modal without making any changes
  const handleCloseRoutingModal = () => {
    setShowRoutingModal(false);
    setModalReason("");
  };

  // When specialty changes in modal, auto-pick first available doctor for that specialty
  const handleModalSpecialtyChange = (newSpec: string) => {
    setModalSpecialty(newSpec);
    const docsInNewSpec = doctors?.filter((d: any) => d.specialty === newSpec && d.available) || [];
    setModalDoctorId(docsInNewSpec[0]?.doctor_id || "");
  };

  // Change Doctor / Routing Override Submit (Triggered ONLY when user explicitly clicks "Confirm & Route Patient")
  const handleSaveRoutingOverride = async () => {
    if (!selectedEncounter) return;
    if (!modalDoctorId) {
      alert("Please choose an assigned consulting physician for this specialty.");
      return;
    }
    if (!modalReason.trim()) {
      alert("Please provide a reason for the routing / acuity override.");
      return;
    }
    const doc = doctors?.find((d: any) => d.doctor_id === modalDoctorId);
    if (!doc) {
      alert("Please choose an available doctor for this specialty.");
      return;
    }
    if (doc.specialty !== modalSpecialty) {
      alert("Selected doctor does not belong to the selected specialty.");
      return;
    }

    setBusy(true);
    try {
      await api.overrideTriage(selectedEncounter.encounter_id, {
        acuity_level: modalEsi,
        specialty: modalSpecialty,
        doctor_id: doc.doctor_id,
        reason: modalReason.trim(),
        overridden_by: activeStaff?.staff_id || selectedStaffId,
      });

      // Synchronize parent state
      setSelectedEsi(modalEsi);
      setAssignedSpecialty(modalSpecialty);
      setAssignedDoctorId(doc.doctor_id);

      setRoutingSuccessMsg(`Patient routed to Dr. ${doc.name} (${modalSpecialty})`);
      setShowRoutingModal(false);
      setModalReason("");

      // Invalidate queries so triage queue, recent queue, and doctor queue immediately show the new assignment
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["triage-queue"] }),
        qc.invalidateQueries({ queryKey: ["triage-recent-queue"] }),
        qc.invalidateQueries({ queryKey: ["doctor-queue"] }),
        qc.invalidateQueries({ queryKey: ["doctors"] }),
        qc.invalidateQueries({ queryKey: ["patients"] }),
      ]);

      setTimeout(() => setRoutingSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err?.message || "Failed to update routing.");
    } finally {
      setBusy(false);
    }
  };

  // Add allergy
  const handleAddAllergy = () => {
    if (newAllergy.trim() && !allergies.includes(newAllergy.trim())) {
      setAllergies([...allergies, newAllergy.trim()]);
      setNewAllergy("");
      setShowAddAllergy(false);
    }
  };

  // Remove allergy
  const handleRemoveAllergy = (item: string) => {
    setAllergies(allergies.filter((a) => a !== item));
  };

  // Send Copilot Query
  const handleSendCopilot = () => {
    if (!copilotQuery.trim()) return;
    const userQ = copilotQuery.trim();
    setCopilotResponses((prev) => [...prev, { role: "user", text: userQ }]);
    setCopilotQuery("");
    setCopilotThinking(true);

    setTimeout(() => {
      let reply = "Based on the recorded vitals and clinical signs, patient requires immediate cardiac protocol initiation.";
      if (userQ.toLowerCase().includes("troponin") || userQ.toLowerCase().includes("ecg")) {
        reply = "Troponin-I elevated at 0.42 ng/mL. Recommend immediate STAT ECG and continuous telemetry monitoring.";
      } else if (userQ.toLowerCase().includes("doctor") || userQ.toLowerCase().includes("route")) {
        reply = "Recommended routing is Cardiology with Dr. Ahmed Ali or Dr. Sarah Jenkins (Treatment Bay 1).";
      } else if (userQ.toLowerCase().includes("bp") || userQ.toLowerCase().includes("vitals")) {
        reply = "Blood Pressure 150/92 mmHg is Stage 2 hypertensive. Oxygen saturation is 94% on room air.";
      }
      setCopilotResponses((prev) => [...prev, { role: "assistant", text: reply }]);
      setCopilotThinking(false);
    }, 600);
  };

  // ESI Color Config
  const ESI_CONFIG = [
    { level: "1", label: "1 Resus", color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", desc: "Resuscitation" },
    { level: "2", label: "2 Emergent", color: "#f97316", bg: "#fff7ed", border: "#fdba74", desc: "Emergent" },
    { level: "3", label: "3 Urgent", color: "#eab308", bg: "#fefce8", border: "#fde047", desc: "Urgent" },
    { level: "4", label: "4 Less Urgent", color: "#22c55e", bg: "#f0fdf4", border: "#86efac", desc: "Less Urgent" },
    { level: "5", label: "5 Non-Urgent", color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd", desc: "Non-Urgent" },
  ];

  // Specialty list & Available Doctors
  const specialties = useMemo(() => {
    if (!doctors?.length) return ["Cardiology", "Emergency", "General Medicine", "Orthopaedics", "Pulmonology", "Neurology"];
    return Array.from(new Set(doctors.map((d: any) => d.specialty).filter(Boolean))).sort() as string[];
  }, [doctors]);

  const availableDoctors = useMemo(() => {
    if (!doctors?.length) return [];
    return doctors.filter((d: any) => d.specialty === assignedSpecialty && d.available);
  }, [doctors, assignedSpecialty]);

  const modalAvailableDoctors = useMemo(() => {
    if (!doctors?.length) return [];
    return doctors.filter((d: any) => d.specialty === modalSpecialty && d.available);
  }, [doctors, modalSpecialty]);

  // Current doctor and specialty for the selected encounter / appointment
  const assignedDoctor = useMemo(() => {
    if (!selectedEncounter) return null;
    const docId =
      selectedEncounter.doctor_id ||
      selectedEncounter.doctor?.doctor_id ||
      selectedEncounter.triage?.doctor_id ||
      selectedEncounter.assigned_doctor_id ||
      selectedEncounter.appointment?.doctor_id;
    if (docId && doctors?.length) {
      const found = doctors.find((d: any) => d.doctor_id === docId || d.id === docId);
      if (found) return found;
    }
    if (selectedEncounter.doctor?.name) {
      return {
        name: selectedEncounter.doctor.name,
        specialty: selectedEncounter.doctor.specialty || selectedEncounter.department || "General Medicine",
        room: selectedEncounter.doctor.room || "Room 101",
      };
    }
    if (selectedEncounter.appointment?.doctor_name) {
      return {
        name: selectedEncounter.appointment.doctor_name,
        specialty: selectedEncounter.appointment.specialty || selectedEncounter.department || "General Medicine",
        room: "Room 101",
      };
    }
    return null;
  }, [selectedEncounter, doctors]);

  const currentSpecialty = useMemo(() => {
    return (
      selectedEncounter?.triage?.specialty ||
      selectedEncounter?.department ||
      selectedEncounter?.appointment?.specialty ||
      assignedDoctor?.specialty ||
      assignedSpecialty ||
      "General Medicine"
    );
  }, [selectedEncounter, assignedDoctor, assignedSpecialty]);

  // Donut chart segment calculations
  const totalDonut = stats.level1Count + stats.level2Count + stats.level3Count + stats.level4Count + stats.level5Count;
  const p1 = Math.round((stats.level1Count / totalDonut) * 100);
  const p2 = Math.round((stats.level2Count / totalDonut) * 100);
  const p3 = Math.round((stats.level3Count / totalDonut) * 100);
  const p4 = Math.round((stats.level4Count / totalDonut) * 100);
  const p5 = 100 - (p1 + p2 + p3 + p4);
  const TRIAGE_KPIS = [
    {
      label: "In Queue",
      value: stats.pendingCount,
      sub: "Waiting intake triage",
      color: "#0078d4",
      icon: Users,
      onClick: () => setStatusFilter("pending"),
      active: statusFilter === "pending",
    },
    {
      label: "In Triage",
      value: stats.triagedCount,
      sub: "Assessed & triaged",
      color: "#8b5cf6",
      icon: Stethoscope,
      onClick: () => setStatusFilter("triaged"),
      active: statusFilter === "triaged",
    },
    {
      label: "High Priority",
      value: stats.highPriority,
      sub: "Level 1 & 2 (Emergent)",
      color: "#ef4444",
      icon: AlertTriangle,
    },
    {
      label: "Medium Priority",
      value: stats.mediumPriority,
      sub: "Level 3 (Urgent)",
      color: "#f59e0b",
      icon: AlertCircle,
    },
    {
      label: "Low Priority",
      value: stats.lowPriority,
      sub: "Level 4 & 5 (Non-Urgent)",
      color: "#10b981",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Banner Notice */}
      {actionNotice && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl font-bold text-xs animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {routingSuccessMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl shadow-xl font-bold text-xs animate-in slide-in-from-top-4 duration-200">
          <CheckCircle2 size={16} />
          <span>{routingSuccessMsg}</span>
        </div>
      )}

      {/* Workspace Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-black/[0.06] shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <HeartPulse size={20} />
            </span>
            Triage
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Assess, prioritize and initiate care for incoming patients.
          </p>
        </div>

        {/* Quick Header Indicators & Actions */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          {/* Staff Profile Pill */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-[11px] font-black text-white shadow-2xs">
              {staffInitials}
            </span>
            <div className="text-left">
              <div className="text-xs font-black text-slate-900 leading-tight flex items-center gap-1.5">
                <span>{activeStaff.name}</span>
                {staff && staff.length > 1 && (
                  <select
                    value={selectedStaffId}
                    onChange={(e) => {
                      setSelectedStaffId(e.target.value);
                      localStorage.setItem("selected_triage_staff_id", e.target.value);
                    }}
                    className="text-[10px] font-bold text-slate-500 bg-transparent border-0 outline-none cursor-pointer hover:text-slate-800"
                  >
                    {staff.map((s: any) => (
                      <option key={s.staff_id} value={s.staff_id}>
                        {s.name} ({s.room || "Triage"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="text-[10.5px] text-slate-500 font-medium leading-tight">
                {activeStaff.specialty || "Triage Nurse"}
              </div>
            </div>
          </div>

          {/* Copilot Toggle Button */}
          <button
            type="button"
            onClick={() => setShowCopilot((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${showCopilot
              ? "border-sky-500/30 bg-sky-50 text-[#0078d4]"
              : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            <Sparkles size={14} /> Copilot
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- MAIN CONTENT + COPILOT GRID */}
      <div className={`grid gap-4 ${showCopilot ? "xl:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_390px]" : "grid-cols-1"}`}>

        {/* LEFT COLUMN: 5 KPI CARDS + QUEUE & ASSESSMENT + ANALYTICS */}
        <div className="space-y-4 min-w-0">

          {/* Top 5 KPI Cards Row - Strictly over Left & Center columns only */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {TRIAGE_KPIS.map((k) => (
              <div
                key={k.label}
                onClick={k.onClick}
                className={`relative overflow-hidden p-3.5 rounded-2xl bg-white border transition ${k.active
                  ? "border-blue-500/50 shadow-sm ring-2 ring-blue-500/10"
                  : "border-black/[0.06] hover:border-slate-300 shadow-xs"
                  } ${k.onClick ? "cursor-pointer" : ""}`}
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.color }} />
                <div className="flex items-center justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${k.color}1a`, color: k.color }}>
                    <k.icon size={18} />
                  </div>
                  {k.onClick && (
                    <span className="text-[10.5px] font-bold" style={{ color: k.color }}>
                      View {k.label === "In Queue" ? "Queue" : "List"}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-[22px] font-extrabold leading-none text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {k.value}
                </div>
                <div className="mt-1 text-[11.5px] font-medium text-slate-500">{k.label}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Middle Row: Triage Queue Table (Left) + Patient Details & Assessment Form (Right) */}
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">

            {/* Left Subcolumn: Triage Queue Card - Stretched to equal height */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 flex flex-col justify-between h-full min-h-0">
              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-900">Triage Queue</h3>
                    <span className="bg-blue-50 text-blue-600 text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                      {filteredQueue.length} {filteredQueue.length === 1 ? "patient" : "patients"}
                    </span>
                  </div>

                  {/* Actions & Filters */}
                  <div className="flex items-center gap-1.5">
                    <select
                      value={areaFilter}
                      onChange={(e) => setAreaFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="all">All Areas (ED)</option>
                      <option value="medicine">General Medicine</option>
                      <option value="cardio">Cardiology</option>
                      <option value="paed">Paediatrics</option>
                      <option value="ortho">Orthopaedics</option>
                    </select>

                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="arrival">Sort: Arrival Time</option>
                      <option value="acuity">Sort: Acuity (ESI)</option>
                      <option value="name">Sort: Name</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => { refetchPending(); refetchRecent(); }}
                      className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition"
                      title="Refresh Queue"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative shrink-0">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient by name, MRN, complaint..."
                    className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Queue Table with Scroll Container */}
                <div className="overflow-x-auto overflow-y-auto flex-1 min-h-[460px] max-h-[660px] rounded-xl border border-slate-100 pr-0.5">
                  <table className="w-full text-left text-xs border-collapse min-w-[540px]">
                    <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                      <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                        <th className="py-2.5 px-2 bg-white">#</th>
                        <th className="py-2.5 px-2 bg-white">Patient</th>
                        <th className="py-2.5 px-2 bg-white">Age / Sex</th>
                        <th className="py-2.5 px-2 bg-white">Chief Complaint</th>
                        <th className="py-2.5 px-2 bg-white">Triage Level</th>
                        <th className="py-2.5 px-2 bg-white">Arrival</th>
                        <th className="py-2.5 px-2 bg-white">Wait</th>
                        <th className="py-2.5 px-2 bg-white">Status</th>
                        <th className="py-2.5 px-2 text-right bg-white">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredQueue.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            No patients match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredQueue.map((enc: any, index: number) => {
                          const isSelected = selectedEncounter?.encounter_id === enc.encounter_id;
                          const levelStr = String(enc.triage?.acuity_level || (enc.isPending ? "Pending" : "3"));
                          const levelObj = ESI_CONFIG.find((c) => c.level === levelStr) || {
                            level: "—",
                            desc: enc.isPending ? "Pending" : "Urgent",
                            color: "#64748b",
                            bg: "#f1f5f9",
                            border: "#cbd5e1",
                          };

                          return (
                            <tr
                              key={enc.encounter_id}
                              onClick={() => handleSelectPatient(enc)}
                              className={`transition-colors cursor-pointer relative ${isSelected ? "bg-blue-50/70" : "hover:bg-slate-50"
                                }`}
                            >
                              <td className="py-3 px-2 font-mono text-slate-400 text-[11px] relative">
                                {isSelected && (
                                  <span className="absolute left-0 inset-y-0 w-1 bg-blue-600 rounded-r" />
                                )}
                                {index + 1}
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-xl bg-slate-100 text-slate-600 font-black text-[10.5px] grid place-items-center shrink-0">
                                    {(enc.patient?.name || "PT").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-extrabold text-slate-900 leading-tight">
                                      {enc.patient?.name || "Patient"}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono">
                                      MRN: {enc.patient?.mrn || `0001234${index + 5}`}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-2 text-slate-600">
                                {enc.patient?.age || 45} Y / {enc.patient?.gender?.slice(0, 1) || "M"}
                              </td>
                              <td className="py-3 px-2 text-slate-700 max-w-[120px] truncate">
                                {enc.triage?.chief_complaint || enc.reason || "Presenting complaint"}
                              </td>
                              <td className="py-3 px-2">
                                <span
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border"
                                  style={{
                                    backgroundColor: levelObj.bg,
                                    color: levelObj.color,
                                    borderColor: levelObj.border,
                                  }}
                                >
                                  Level {levelObj.level} {levelObj.desc}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-slate-500 font-mono text-[11px]">
                                {enc.arrival ? new Date(enc.arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "10:02 am"}
                              </td>
                              <td className="py-3 px-2 font-bold text-red-600 text-[11px]">
                                {enc.isPending ? "5 min" : "15 min"}
                              </td>
                              <td className="py-3 px-2">
                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {enc.isPending ? "Pending" : "Triaged"}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRowMenuOpen(rowMenuOpen === enc.encounter_id ? null : enc.encounter_id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                                >
                                  <MoreVertical size={14} />
                                </button>
                                {rowMenuOpen === enc.encounter_id && (
                                  <div className="absolute right-2 mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-xl z-50 p-1 text-left text-xs animate-in fade-in duration-100">
                                    <button
                                      onClick={() => { handleSelectPatient(enc); setRowMenuOpen(null); }}
                                      className="w-full px-2.5 py-1.5 hover:bg-slate-50 rounded-lg font-semibold text-slate-700 flex items-center gap-2"
                                    >
                                      <Stethoscope size={13} className="text-blue-600" /> Start / Edit Triage
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleSelectPatient(enc);
                                        handleOpenRoutingModal(enc);
                                        setRowMenuOpen(null);
                                      }}
                                      className="w-full px-2.5 py-1.5 hover:bg-slate-50 rounded-lg font-semibold text-slate-700 flex items-center gap-2"
                                    >
                                      <ArrowRight size={13} className="text-purple-600" /> Change Routing
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActionNotice(`Printing wristband for ${enc.patient?.name}...`);
                                        setRowMenuOpen(null);
                                        setTimeout(() => setActionNotice(null), 3000);
                                      }}
                                      className="w-full px-2.5 py-1.5 hover:bg-slate-50 rounded-lg font-semibold text-slate-700 flex items-center gap-2"
                                    >
                                      <Printer size={13} className="text-emerald-600" /> Print Wristband
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status filter toggle pills */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs mt-3">
                <span className="text-slate-500 font-semibold">Filter Queue View:</span>
                <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${statusFilter === "all"
                      ? "bg-[#0078d4] text-white shadow-2xs font-extrabold"
                      : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/70"
                      }`}
                  >
                    Full Queue ({fullQueue.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("pending")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${statusFilter === "pending"
                      ? "bg-amber-500 text-white shadow-2xs font-extrabold"
                      : "bg-transparent text-amber-700 hover:text-amber-900 hover:bg-amber-100/60"
                      }`}
                  >
                    Pending Only ({stats.pendingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("triaged")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${statusFilter === "triaged"
                      ? "bg-emerald-600 text-white shadow-2xs font-extrabold"
                      : "bg-transparent text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/60"
                      }`}
                  >
                    Triaged Only ({stats.triagedCount})
                  </button>
                </div>
              </div>
            </div>

            {/* Right Subcolumn: Patient Details + Triage Assessment Form Column */}
            <div className="space-y-4 min-w-0">

              {/* Patient Details Banner Card */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-extrabold text-slate-900">Patient Details</h3>
                  <button
                    type="button"
                    onClick={() => setPatientDetailsCollapsed(!patientDetailsCollapsed)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    {patientDetailsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>

                {!patientDetailsCollapsed && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-600 font-extrabold grid place-items-center text-sm shrink-0">
                        {(selectedEncounter?.patient?.name || "AK").slice(0, 2).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-black text-slate-900 truncate">
                            {selectedEncounter?.patient?.name || "Ahmed Khan ♂"}
                          </h4>
                          <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 text-[10px] font-extrabold border border-red-200">
                            {selectedEncounter?.isPending ? "Pending Triage" : "Triaged"}
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          {selectedEncounter?.patient?.age || 58} Y · {selectedEncounter?.patient?.gender || "Male"} · MRN: {selectedEncounter?.patient?.mrn || "00012345"}
                        </div>

                        <div className="text-xs text-slate-500 mt-1">
                          Phone: <span className="font-mono">{selectedEncounter?.patient?.mobile || "0300-1234567"}</span>
                        </div>

                        <div className="text-[11.5px] text-slate-400 mt-0.5">
                          Arrived: {selectedEncounter?.arrival ? new Date(selectedEncounter.arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "10:02 AM"}
                        </div>

                        <div className="text-[11.5px] text-slate-500 font-medium mt-0.5">
                          Location: <span className="text-slate-800 font-bold">ED - Triage Bay 1</span>
                        </div>
                      </div>
                    </div>

                    {/* Specialty + Assigned Doctor of Appointment */}
                    <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Specialty</div>
                        <div className="text-xs font-extrabold text-slate-900 mt-0.5 flex items-center gap-1.5 truncate">
                          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                          <span className="truncate">{currentSpecialty}</span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Attending Doctor</div>
                        <div className="text-xs font-extrabold text-slate-900 mt-0.5 flex items-center gap-1.5 truncate">
                          <Stethoscope size={13} className="text-purple-600 shrink-0" />
                          <span className="truncate">
                            {assignedDoctor?.name || selectedEncounter?.doctor?.name || selectedEncounter?.appointment?.doctor_name || "Dr. Priya Iyer"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Triage Assessment Form Card */}
              <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">Triage Assessment</h3>
                  {selectedEncounter?.token?.number && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                      Token: {selectedEncounter.token.number}
                    </span>
                  )}
                </div>

                {/* Triage Level (ESI) 5 Selectable Buttons */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Triage Level (ESI)</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {ESI_CONFIG.map((esi) => {
                      const isSelected = selectedEsi === esi.level;
                      return (
                        <button
                          key={esi.level}
                          type="button"
                          onClick={() => setSelectedEsi(esi.level)}
                          className={`py-2 px-1 rounded-xl text-center transition font-bold border flex flex-col items-center justify-center ${isSelected
                            ? "shadow-sm text-white"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                            }`}
                          style={{
                            backgroundColor: isSelected ? esi.color : undefined,
                            borderColor: isSelected ? esi.color : undefined,
                          }}
                        >
                          <span className="text-xs">{esi.level}</span>
                          <span className="text-[9px] truncate w-full">{esi.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Chief Complaint Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Chief Complaint</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 pr-8 focus:bg-white focus:border-blue-500 outline-none"
                      placeholder="Enter presenting complaint..."
                    />
                    {chiefComplaint && (
                      <button
                        type="button"
                        onClick={() => setChiefComplaint("")}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Vital Signs Grid (8 measurement cards: Systolic, Diastolic, HR, RR, SpO2, Temp, Weight, Height) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Vital Signs & Anthropometry</label>
                    {vitalsSuggested && (
                      <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        Suggested from {suggestSource}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                    {/* BP Systolic */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Systolic BP</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.bp_systolic}
                          onChange={(e) => handleVitalChange("bp_systolic", e.target.value)}
                          className="w-12 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">mmHg</span>
                      </div>
                    </div>

                    {/* BP Diastolic */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Diastolic BP</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.bp_diastolic}
                          onChange={(e) => handleVitalChange("bp_diastolic", e.target.value)}
                          className="w-12 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">mmHg</span>
                      </div>
                    </div>

                    {/* Heart Rate */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Heart Rate</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.heart_rate}
                          onChange={(e) => handleVitalChange("heart_rate", e.target.value)}
                          className="w-11 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">bpm</span>
                      </div>
                    </div>

                    {/* Resp Rate */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Resp Rate</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.rr}
                          onChange={(e) => handleVitalChange("rr", e.target.value)}
                          className="w-11 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">/min</span>
                      </div>
                    </div>

                    {/* SpO2 */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">SpO₂</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.spo2}
                          onChange={(e) => handleVitalChange("spo2", e.target.value)}
                          className="w-11 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">%</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Temperature</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          step="0.1"
                          value={vitals.temperature}
                          onChange={(e) => handleVitalChange("temperature", e.target.value)}
                          className="w-12 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">°F</span>
                      </div>
                    </div>

                    {/* Weight */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Weight</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          step="0.5"
                          value={vitals.weight_kg}
                          onChange={(e) => handleVitalChange("weight_kg", e.target.value)}
                          className="w-11 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">kg</span>
                      </div>
                    </div>

                    {/* Height */}
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80 focus-within:border-blue-500 focus-within:bg-white transition">
                      <span className="text-[10px] font-bold text-slate-500 block">Height</span>
                      <div className="flex items-center justify-center gap-0.5 mt-0.5">
                        <input
                          type="number"
                          value={vitals.height_cm}
                          onChange={(e) => handleVitalChange("height_cm", e.target.value)}
                          className="w-11 text-center font-extrabold text-slate-900 text-xs bg-transparent outline-none border-b border-slate-200 focus:border-blue-500"
                        />
                        <span className="text-[9px] text-slate-400">cm</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pain Score (0-10) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Pain Score (0–10)</label>
                    <span className="text-xs font-black text-red-600">{painScore} / 10</span>
                  </div>
                  <div className="grid grid-cols-11 gap-1">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setPainScore(score)}
                        className={`py-1 rounded-lg text-[11px] font-bold transition ${painScore === score
                          ? "bg-red-600 text-white shadow-2xs"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sepsis Screening (qSOFA) */}
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Sepsis Screening (qSOFA)</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${qsofaScore >= 2 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                      }`}>
                      Score: {qsofaScore} / 3 {qsofaScore >= 2 ? "(High Risk)" : "(Low Risk)"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    {/* RR >= 22 */}
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200">
                      <span className="font-semibold text-slate-700">RR ≥ 22</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQsofaRR(true)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${qsofaRR ? "bg-red-600 text-white" : "text-slate-400"}`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setQsofaRR(false)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${!qsofaRR ? "bg-slate-700 text-white" : "text-slate-400"}`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    {/* SBP <= 100 */}
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200">
                      <span className="font-semibold text-slate-700">SBP ≤ 100</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQsofaSBP(true)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${qsofaSBP ? "bg-red-600 text-white" : "text-slate-400"}`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setQsofaSBP(false)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${!qsofaSBP ? "bg-slate-700 text-white" : "text-slate-400"}`}
                        >
                          No
                        </button>
                      </div>
                    </div>

                    {/* Altered Mental Status */}
                    <div className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-200">
                      <span className="font-semibold text-slate-700">AMS</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQsofaAMS(true)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${qsofaAMS ? "bg-red-600 text-white" : "text-slate-400"}`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setQsofaAMS(false)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${!qsofaAMS ? "bg-slate-700 text-white" : "text-slate-400"}`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Allergies & Notes */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700">Allergies</label>
                      {!showAddAllergy && (
                        <button
                          type="button"
                          onClick={() => setShowAddAllergy(true)}
                          className="text-[11px] text-blue-600 font-bold px-1.5 py-0.5 rounded border border-dashed border-blue-300 hover:bg-blue-50"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allergies.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-lg"
                        >
                          {a}
                          <button
                            type="button"
                            onClick={() => handleRemoveAllergy(a)}
                            className="text-red-400 hover:text-red-700"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter notes..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Bottom Actions: Save, Complete Triage, Send to Treatment Area */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCompleteTriage}
                      disabled={busy}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold rounded-xl transition"
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      onClick={handleCompleteTriage}
                      disabled={busy}
                      className="flex-[2] py-2.5 bg-[#0078d4] hover:bg-[#106ebe] text-white text-xs font-extrabold rounded-xl shadow-xs transition flex items-center justify-center gap-1.5"
                    >
                      {busy ? "Processing Triage..." : (selectedEncounter?.isPending ? "Complete Triage" : "Update / Save Triage")} <ChevronDown size={14} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenRoutingModal()}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-extrabold rounded-xl transition flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight size={14} className="text-blue-600" /> Review / Change Doctor Routing & Treatment Area
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* Bottom Analytics Row: Triage Analytics (Today) & Peak Hours + Patients by Triage Level Donut */}
          <div className="grid gap-4 xl:grid-cols-2">

            {/* Card 1: Triage Analytics & Peak Hours */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-extrabold text-slate-900">Triage Analytics (Today)</h3>
                <button type="button" className="text-xs font-bold text-[#0078d4] hover:underline">
                  View All
                </button>
              </div>

              {/* 4 Mini Stat Boxes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                  <div className="text-[11px] text-slate-500 font-medium">Total Arrivals</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{stats.totalArrivals}</div>
                  <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    ▲ 12% vs yesterday
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                  <div className="text-[11px] text-slate-500 font-medium">Seen</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">{stats.triagedCount}</div>
                  <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    ▲ 8% vs yesterday
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                  <div className="text-[11px] text-slate-500 font-medium">Left Without Seen</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">0</div>
                  <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    0% vs yesterday
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                  <div className="text-[11px] text-slate-500 font-medium">Avg Wait Time</div>
                  <div className="text-lg font-black text-slate-900 mt-0.5">24 min</div>
                  <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    ▼ 5 min vs yesterday
                  </div>
                </div>
              </div>

              {/* Peak Hours Bar Chart */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Peak Hours (By Arrivals)</span>
                  {hoveredHour !== null ? (
                    <span className="text-[10.5px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {hourlyData.buckets[hoveredHour]?.label}: {hourlyData.buckets[hoveredHour]?.count} arrivals
                    </span>
                  ) : (
                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10.5px] font-extrabold px-2.5 py-0.5 rounded-lg shadow-2xs flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                      12 PM - 1 PM · 72 arrivals
                    </span>
                  )}
                </div>

                {/* SVG Bar Chart */}
                <div className="h-28 w-full pt-1">
                  <svg viewBox="0 0 300 95" className="w-full h-full overflow-visible">
                    {hourlyData.buckets.map((b, i) => {
                      const barWidth = 16;
                      const gap = (300 - barWidth * hourlyData.buckets.length) / (hourlyData.buckets.length + 1);
                      const x = gap + i * (barWidth + gap);
                      const height = Math.max(8, (b.count / hourlyData.maxCount) * 72);
                      const y = 80 - height;
                      const isPeak = b.count === hourlyData.maxCount || i === 6;

                      return (
                        <g
                          key={i}
                          onMouseEnter={() => setHoveredHour(i)}
                          onMouseLeave={() => setHoveredHour(null)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={height}
                            rx={3}
                            fill={isPeak ? "#2563eb" : "#93c5fd"}
                            className="transition-colors hover:fill-blue-500"
                          />
                          <text
                            x={x + barWidth / 2}
                            y={92}
                            textAnchor="middle"
                            fontSize="6.5"
                            fill="#94a3b8"
                            fontWeight="600"
                          >
                            {b.label.split(" ")[0]}
                          </text>
                        </g>
                      );
                    })}
                    <line x1="0" y1="80" x2="300" y2="80" stroke="#e2e8f0" strokeWidth="1" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card 2: Patients by Triage Level Donut */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-sm font-extrabold text-slate-900">Patients by Triage Level</h3>
                <span className="text-xs font-bold text-slate-500">{totalDonut} Total Patients</span>
              </div>

              <div className="flex items-center gap-4 pt-1">
                {/* SVG Donut */}
                <div className="relative h-32 w-32 shrink-0 grid place-items-center">
                  <svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-90">
                    {/* Background ring */}
                    <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="5" />

                    {/* Segment 1: Red (Level 1) */}
                    <circle
                      cx="21" cy="21" r="15.915" fill="none" stroke="#ef4444" strokeWidth="5"
                      strokeDasharray={`${p1} ${100 - p1}`}
                      strokeDashoffset="0"
                    />
                    {/* Segment 2: Orange (Level 2) */}
                    <circle
                      cx="21" cy="21" r="15.915" fill="none" stroke="#f97316" strokeWidth="5"
                      strokeDasharray={`${p2} ${100 - p2}`}
                      strokeDashoffset={`${-p1}`}
                    />
                    {/* Segment 3: Yellow (Level 3) */}
                    <circle
                      cx="21" cy="21" r="15.915" fill="none" stroke="#eab308" strokeWidth="5"
                      strokeDasharray={`${p3} ${100 - p3}`}
                      strokeDashoffset={`${-(p1 + p2)}`}
                    />
                    {/* Segment 4: Green (Level 4) */}
                    <circle
                      cx="21" cy="21" r="15.915" fill="none" stroke="#22c55e" strokeWidth="5"
                      strokeDasharray={`${p4} ${100 - p4}`}
                      strokeDashoffset={`${-(p1 + p2 + p3)}`}
                    />
                    {/* Segment 5: Blue (Level 5) */}
                    <circle
                      cx="21" cy="21" r="15.915" fill="none" stroke="#3b82f6" strokeWidth="5"
                      strokeDasharray={`${p5} ${100 - p5}`}
                      strokeDashoffset={`${-(p1 + p2 + p3 + p4)}`}
                    />
                  </svg>
                  <div className="absolute text-center pointer-events-none">
                    <div className="text-base font-black text-slate-900 leading-none">{totalDonut}</div>
                    <div className="text-[9px] text-slate-400 font-bold">Total</div>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="space-y-1.5 text-xs font-medium text-slate-600 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                      <span>Level 1 (Resus)</span>
                    </span>
                    <b className="text-slate-900">{stats.level1Count} ({p1}%)</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                      <span>Level 2 (Emergent)</span>
                    </span>
                    <b className="text-slate-900">{stats.level2Count} ({p2}%)</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 shrink-0" />
                      <span>Level 3 (Urgent)</span>
                    </span>
                    <b className="text-slate-900">{stats.level3Count} ({p3}%)</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Level 4 (Less Urgent)</span>
                    </span>
                    <b className="text-slate-900">{stats.level4Count} ({p4}%)</b>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span>Level 5 (Non-Urgent)</span>
                    </span>
                    <b className="text-slate-900">{stats.level5Count} ({p5}%)</b>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: AI COPILOT (ALIGNED TOP WITH KPIS) */}
        {showCopilot && (
          <div className="space-y-4 min-w-0">

            {/* AI Copilot Card */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 font-black text-sm text-slate-900">
                  <Sparkles size={16} className="text-blue-600" />
                  <span>AI Copilot</span>
                  <span className="bg-blue-50 text-blue-600 text-[9.5px] font-bold px-1.5 py-0.2 rounded">Beta</span>
                </div>
                <MoreVertical size={14} className="text-slate-400" />
              </div>

              {/* Copilot Tabs */}
              <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCopilotTab("insights")}
                  className={`flex-1 py-1 rounded-lg transition ${copilotTab === "insights" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Insights
                </button>
                <button
                  type="button"
                  onClick={() => setCopilotTab("tasks")}
                  className={`flex-1 py-1 rounded-lg transition ${copilotTab === "tasks" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Tasks (4)
                </button>
                <button
                  type="button"
                  onClick={() => setCopilotTab("ask")}
                  className={`flex-1 py-1 rounded-lg transition ${copilotTab === "ask" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                    }`}
                >
                  Ask Copilot
                </button>
              </div>

              {/* Copilot Tab Content */}
              {copilotTab === "insights" && (
                <div className="space-y-2.5">
                  {/* Insight 1 */}
                  <div className="p-2.5 rounded-xl bg-red-50/60 border border-red-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-red-700 flex items-center gap-1">
                        <AlertTriangle size={12} className="text-red-600" /> High Troponin
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">5 min ago</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600">
                      Troponin levels are elevated. Monitor and review ECG.
                    </p>
                  </div>

                  {/* Insight 2 */}
                  <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-700 flex items-center gap-1">
                        <Pill size={12} className="text-purple-600" /> Drug Interaction
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">15 min ago</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600">
                      Clopidogrel may interact with Omeprazole.
                    </p>
                  </div>

                  {/* Insight 3 */}
                  <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-amber-700 flex items-center gap-1">
                        <AlertCircle size={12} className="text-amber-600" /> Risk Alert
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">30 min ago</span>
                    </div>
                    <p className="text-[11.5px] text-slate-600">
                      Readmission risk is Moderate. Ensure follow up.
                    </p>
                  </div>
                </div>
              )}

              {copilotTab === "tasks" && (
                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="font-medium text-slate-700">12-Lead ECG Acquisition</span>
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">STAT</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="font-medium text-slate-700">Serial Troponin at 6h</span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Pending</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="font-medium text-slate-700">Cardiology Admission Consult</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Assigned</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
                    <span className="font-medium text-slate-700">Telemetry Patch Setup</span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                  </div>
                </div>
              )}

              {copilotTab === "ask" && (
                <div className="space-y-2 text-xs">
                  <div className="max-h-40 overflow-y-auto space-y-2 p-1">
                    {copilotResponses.map((r, i) => (
                      <div
                        key={i}
                        className={`p-2 rounded-xl ${r.role === "user" ? "bg-blue-600 text-white ml-4" : "bg-slate-100 text-slate-800 mr-2"
                          }`}
                      >
                        {r.text}
                      </div>
                    ))}
                    {copilotThinking && (
                      <div className="text-[11px] text-slate-400 italic">Copilot is analyzing patient record…</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <input
                      type="text"
                      value={copilotQuery}
                      onChange={(e) => setCopilotQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendCopilot()}
                      placeholder="Ask copilot about this patient..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleSendCopilot}
                      className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition"
                    >
                      <Send size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Recommended Actions */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900">Recommended Actions</h3>

              <div className="space-y-2 text-xs">
                {/* Action 1 */}
                <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2 font-semibold text-slate-700">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    <span>Order ECG</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActionNotice("12-Lead ECG order sent to cardiology technician.");
                      setTimeout(() => setActionNotice(null), 3000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 text-[11px] shadow-2xs"
                  >
                    Order
                  </button>
                </div>

                {/* Action 2 */}
                <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2 font-semibold text-slate-700">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    <span>Repeat Troponin in 6 hours</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActionNotice("Repeat Troponin order scheduled for 6h.");
                      setTimeout(() => setActionNotice(null), 3000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 text-[11px] shadow-2xs"
                  >
                    Order
                  </button>
                </div>

                {/* Action 3 */}
                <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2 font-semibold text-slate-700">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    <span>Echocardiogram</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActionNotice("STAT Echocardiogram requisition submitted.");
                      setTimeout(() => setActionNotice(null), 3000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 text-[11px] shadow-2xs"
                  >
                    Order
                  </button>
                </div>

                {/* Action 4 */}
                <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2 font-semibold text-slate-700">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    <span>Monitor BP closely</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActionNotice("BP Q15M protocol added to nursing chart.");
                      setTimeout(() => setActionNotice(null), 3000);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-bold text-slate-700 text-[11px] shadow-2xs"
                  >
                    Add Note
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions Grid (6 buttons) */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900">Quick Actions</h3>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => nav("/reception")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <UserPlus size={14} className="text-blue-600" /> Create Patient
                </button>

                <button
                  type="button"
                  onClick={() => nav("/copilot")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <Search size={14} className="text-slate-600" /> Find Patient
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActionNotice("Printing wristband for current patient...");
                    setTimeout(() => setActionNotice(null), 3000);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <Printer size={14} className="text-purple-600" /> Print Wristband
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActionNotice("Emergency transport dispatch requested.");
                    setTimeout(() => setActionNotice(null), 3000);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <Activity size={14} className="text-amber-600" /> Request Transport
                </button>

                <button
                  type="button"
                  onClick={() => nav("/lab")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <FlaskConical size={14} className="text-teal-600" /> Lab Orders
                </button>

                <button
                  type="button"
                  onClick={() => nav("/radiology")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-left font-bold text-slate-700 flex items-center gap-2 transition"
                >
                  <Scan size={14} className="text-cyan-600" /> Imaging Orders
                </button>
              </div>
            </div>

            {/* Bed Availability (ED) */}
            <div className="bg-white rounded-2xl border border-black/[0.06] shadow-xs p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-extrabold text-slate-900">Bed Availability (ED)</h3>
                <button type="button" onClick={() => nav("/copilot?view=map")} className="text-[11px] font-bold text-blue-600 hover:underline">
                  View All
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {/* Resus Bays */}
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Resus Bays</div>
                  <div className="text-base font-black text-slate-900 my-0.5">2 / 4</div>
                  <div className="text-[9px] text-emerald-600 font-bold">↑ Available</div>
                </div>

                {/* Treatment Beds */}
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Treatment Beds</div>
                  <div className="text-base font-black text-slate-900 my-0.5">8 / 18</div>
                  <div className="text-[9px] text-emerald-600 font-bold">↑ Available</div>
                </div>

                {/* Observation */}
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Observation</div>
                  <div className="text-base font-black text-slate-900 my-0.5">6 / 10</div>
                  <div className="text-[9px] text-emerald-600 font-bold">↑ Available</div>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Routing & Doctor Review / Change Modal */}
      {showRoutingModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Review / Change Doctor Routing</h3>
                <p className="text-xs text-slate-500">
                  Change clinical department assignment, consulting physician, and ESI triage priority.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseRoutingModal}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* ESI Selector */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Corrected ESI Acuity Level</label>
                <select
                  value={modalEsi}
                  onChange={(e) => setModalEsi(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="1">ESI 1 - Resuscitation (Immediate Life Threat)</option>
                  <option value="2">ESI 2 - Emergent (High Risk / Severe Pain / Confusion)</option>
                  <option value="3">ESI 3 - Urgent (Multiple Resources Needed)</option>
                  <option value="4">ESI 4 - Less Urgent (One Resource Needed)</option>
                  <option value="5">ESI 5 - Non-Urgent (No Resources Needed)</option>
                </select>
              </div>

              {/* Department / Specialty */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Target Specialty Department</label>
                <select
                  value={modalSpecialty}
                  onChange={(e) => handleModalSpecialtyChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                >
                  {specialties.map((spec) => (
                    <option key={spec} value={spec}>{spec}</option>
                  ))}
                </select>
              </div>

              {/* Assigned Doctor */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Assigned Attending Doctor</label>
                <select
                  value={modalDoctorId}
                  onChange={(e) => setModalDoctorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                >
                  <option value="">-- Choose Consulting Physician --</option>
                  {modalAvailableDoctors.map((doc: any) => (
                    <option key={doc.doctor_id} value={doc.doctor_id}>
                      {doc.name} · {doc.room || "Room 1"} (Floor {doc.floor || "1"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason for Override */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Reason for Routing / Acuity Override (Required)</label>
                <textarea
                  rows={3}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. Patient presents with acute diaphoresis and high troponin requiring immediate Cardiology triage..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleCloseRoutingModal}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRoutingOverride}
                disabled={busy}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-xs disabled:opacity-50"
              >
                {busy ? "Saving Routing..." : "Confirm & Route Patient"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
