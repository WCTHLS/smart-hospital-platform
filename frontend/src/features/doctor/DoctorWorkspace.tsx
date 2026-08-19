import { useEffect, useState, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { 
  FileText, Share2, Mic, FlaskConical, Pill, ArrowLeft, Sparkles, History, 
  Stethoscope, User, ShieldAlert, Phone, ChevronDown, ChevronUp, CheckCircle2, 
  Plus, AlertTriangle, ExternalLink, ScanLine, MoreHorizontal, UserCheck, 
  Activity, Clock, BookOpen, HeartPulse, ShieldCheck, Download, Filter, Eye, 
  PlusCircle, RefreshCw, ClipboardList, Send, PhoneCall, CheckSquare, Building2, HardDrive, MapPin, Settings
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { LiveDot, Tag } from "../../components/ui";

import DoctorQueue from "./components/DoctorQueue";
import AmbientSoap from "./components/AmbientSoap";
import OrdersAndLabs from "./components/OrdersAndLabs";
import Prescription from "./components/Prescription";
import CopilotSidepane from "./components/CopilotSidepane";

import LabWorkspace from "../lab/LabWorkspace";
import RadiologyWorkspace from "../radiology/RadiologyWorkspace";
import PharmacyWorkspace from "../pharmacy/PharmacyWorkspace";
import CareTeamWorkspace from "../careteam/CareTeamWorkspace";

const NEW_TABS = [
  { id: "timeline", label: "Timeline" },
  { id: "overview", label: "Overview" },
  { id: "vitals", label: "Vitals" },
  { id: "labs", label: "Labs" },
  { id: "imaging", label: "Imaging" },
  { id: "medications", label: "Medications" },
  { id: "procedures", label: "Procedures" },
  { id: "documents", label: "Documents" },
  { id: "care_plan", label: "Care Plan" },
  { id: "encounters", label: "Encounters" },
  { id: "notes", label: "Notes" },
] as const;

// White and black themed card class
const cardClass = "rounded-2xl border border-black/[0.08] bg-white p-4 text-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.02)]";

const KPI_CARDS = [
  { label: "Critical Labs", value: "3", sub: "View All", color: "#D13438", icon: FlaskConical },
  { label: "Beds Available", value: "18", sub: "View Occupancy", color: "#10b981", icon: Stethoscope },
  { label: "Prescriptions Pending", value: "42", sub: "Review", color: "#8764B8", icon: Pill },
  { label: "ER Patients", value: "24", sub: "View Queue", color: "#0078d4", icon: User },
  { label: "Discharges Today", value: "12", sub: "View List", color: "#CA5010", icon: CheckSquare },
  { label: "Today's Revenue", value: "8.6M", sub: "View Analytics", color: "#16a34a", icon: BookOpen },
];

function Spark({ color = "#0078d4", seed = "vital" }: { color?: string; seed?: string }) {
  // Generate a deterministic unique-looking sparkline path based on the value/seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const points = [];
  const step = 8.25;
  for (let i = 0; i <= 8; i++) {
    const x = i * step;
    // Generate a smooth-looking Y value between 4 and 16 using sinusoids
    const y = Math.abs(Math.sin(hash + i) * 11) + 4.5;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width="66" height="20" viewBox="0 0 66 20" fill="none" className="shrink-0 mx-auto mt-1">
      <polyline
        points={points.join(" ")}
        stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
      />
    </svg>
  );
}

/* --------------------------------------------------------- Helper sub-components --- */
function LocalPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span 
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold border"
      style={{
        backgroundColor: `${tone}10`,
        color: tone,
        borderColor: `${tone}25`
      }}
    >
      {children}
    </span>
  );
}

function Bar({ pct, tone = "#0078d4" }: { pct: number; tone?: string }) {
  return (
    <div className="w-full bg-black/[0.04] h-1.5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: tone }} />
    </div>
  );
}

function FilterChip({ icon: Icon, label }: { icon?: any; label: string }) {
  return (
    <button 
      type="button" 
      className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 transition"
    >
      {Icon && <Icon size={12} />}
      {label}
    </button>
  );
}

function PanelHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between pb-1 border-b border-black/[0.04]">
      <h3 className="text-[12.5px] font-extrabold text-[#0c3b63]">{title}</h3>
      {action && (
        <button type="button" onClick={onAction} className="text-[11px] font-bold text-[#0078d4] hover:underline">
          {action}
        </button>
      )}
    </div>
  );
}

function DigitalTwinMap() {
  return (
    <svg viewBox="0 0 400 160" className="w-full h-32 rounded-lg bg-slate-900 border border-slate-800 shadow-inner">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      {/* Wall outlines */}
      <path d="M 50,120 L 200,45 L 350,120" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      
      {/* Beds */}
      {[
        { id: "ICU-01", x: 80, y: 100, color: "#10b981", label: "Available" },
        { id: "ICU-02", x: 130, y: 75, color: "#10b981", label: "Available" },
        { id: "ICU-07", x: 220, y: 75, color: "#ef4444", label: "Ahmed Khan" },
        { id: "ICU-08", x: 270, y: 100, color: "#10b981", label: "Available" },
      ].map((b) => (
        <g key={b.id}>
          {/* Bed Base */}
          <polygon
            points={`${b.x},${b.y} ${b.x+30},${b.y-15} ${b.x+45},${b.y-7} ${b.x+15},${b.y+8}`}
            fill={b.color === "#ef4444" ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.15)"}
            stroke={b.color}
            strokeWidth="1.5"
          />
          {/* Pillow */}
          <polygon
            points={`${b.x+20},${b.y-10} ${b.x+28},${b.y-14} ${b.x+32},${b.y-12} ${b.x+24},${b.y-8}`}
            fill="rgba(255,255,255,0.25)"
            stroke={b.color}
            strokeWidth="1"
          />
          {/* Label */}
          <text x={b.x - 2} y={b.y+20} fill="rgba(255,255,255,0.6)" fontSize="8.5" fontWeight="bold">
            {b.id}
          </text>
          <text x={b.x - 2} y={b.y+28} fill={b.color} fontSize="7.5" fontWeight="bold">
            {b.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ Historical Visit Dropdown */
function HistoricalVisitDropdown({ encounter }: { encounter: any }) {
  const [open, setOpen] = useState(false);

  const { data: details, isLoading } = useQuery({
    queryKey: ["encounter-details", encounter.encounter_id],
    queryFn: () => api.encounter(encounter.encounter_id),
    enabled: open,
  });

  return (
    <div className="border border-black/[0.06] rounded-xl transition bg-white" style={{ background: open ? "#fff" : "#fafafa" }}>
      <button 
        onClick={() => setOpen(!open)}
        className="w-full text-left p-3 flex items-center justify-between text-xs font-semibold hover:bg-black/[0.02] rounded-xl transition animate-none"
      >
        <div className="truncate flex items-center gap-2">
          <span className="text-slate-800 font-extrabold">{encounter.date || encounter.arrival?.slice(0,10)}</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 font-bold">{encounter.visit_type || encounter.department}</span>
        </div>
        <span className="text-[#0078d4] font-bold text-[13px] ml-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="p-3.5 border-t border-black/[0.06] space-y-3.5 text-[11.5px] leading-relaxed text-slate-600">
          {isLoading ? (
            <div className="text-center py-2 text-slate-400 font-medium">Retrieving raw EMR records...</div>
          ) : details ? (
            <>
              {/* Vitals */}
              {details.vitals ? (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-1">Vitals:</div>
                  <div className="grid grid-cols-2 gap-2 text-[10.5px] sm:grid-cols-3">
                    <div className="bg-white border border-black/[0.04] p-1.5 rounded-lg text-center"><small className="text-slate-400 font-semibold">BP</small><br /><b className="text-slate-800">{details.vitals.bp}</b></div>
                    <div className="bg-white border border-black/[0.04] p-1.5 rounded-lg text-center"><small className="text-slate-400 font-semibold">SpO₂</small><br /><b className="text-slate-800">{details.vitals.spo2}%</b></div>
                    <div className="bg-white border border-black/[0.04] p-1.5 rounded-lg text-center"><small className="text-slate-400 font-semibold">Temp</small><br /><b className="text-slate-800">{details.vitals.temperature}°F</b></div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Vitals:</div>
                  <span className="text-slate-400 italic">No vitals captured.</span>
                </div>
              )}

              {/* Diagnosed Conditions */}
              {details.note?.icd10_codes?.length > 0 && (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-1">Diagnosed Condition(s):</div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {details.note.icd10_codes.map((icd: any) => (
                      <span key={icd.code} className="text-[10px] bg-rose-500/10 text-rose-600 font-extrabold px-2.5 py-0.5 rounded-xl border border-rose-500/20">
                        ⚠ {icd.label} ({icd.code})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* SOAP Note Text */}
              {details.note ? (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-1">Clinical Note (SOAP):</div>
                  <div className="p-3 rounded-xl bg-white border border-black/[0.04] text-[11px] whitespace-pre-line text-slate-600">
                    {details.note.final_text}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Clinical Note (SOAP):</div>
                  <span className="text-slate-400 italic">Not documented or pending.</span>
                </div>
              )}
            </>
          ) : <div className="text-center py-2 text-slate-400 font-medium">Failed to load details.</div>}
        </div>
      )}
    </div>
  );
}

export default function DoctorWorkspace() {
  const qc = useQueryClient();
  const journey = useJourney();
  const [tab, setTab] = useState<string>("timeline");
  
  const [sel, setSel] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Hoisted prescription state
  const [rxItems, setRxItems] = useState<any[]>([]);
  const [cds, setCds] = useState<any>(null);
  const [rxId, setRxId] = useState<string | null>(null);
  const [rxBusy, setRxBusy] = useState(false);
  const [rxAccept, setRxAccept] = useState(false);
  const [rxOverride, setRxOverride] = useState(false);
  const [rxDone, setRxDone] = useState<any>(null);
  const [rxErr, setRxErr] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [discharging, setDischarging] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);

  // Active consultation notes & advice state
  const [adviceNotes, setAdviceNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSuccess, setNotesSuccess] = useState(false);

  // Add chronic problem state
  const [newIssueName, setNewIssueName] = useState("");
  const [newIssueOnset, setNewIssueOnset] = useState("");
  const [addingIssue, setAddingIssue] = useState(false);
  
  // AI summary trigger state
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [busy, setBusy] = useState(false);

  // Checklist tasks status
  const [task1Checked, setTask1Checked] = useState(false);
  const [task2Checked, setTask2Checked] = useState(false);
  const [task3Checked, setTask3Checked] = useState(false);
  const [task4Checked, setTask4Checked] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view");

  // Load Doctor Queue for dropdown patient switcher
  const selectedDoctorId = localStorage.getItem("selected_doctor_id") || "";
  const { data: queue } = useQuery({
    queryKey: ["doctor-queue", selectedDoctorId],
    queryFn: () => api.doctorEncounters(selectedDoctorId),
    enabled: !!selectedDoctorId,
    refetchInterval: 5000,
  });

  // Fetch global lab orders for feeds
  const { data: globalLabOrders } = useQuery({
    queryKey: ["global-lab-orders"],
    queryFn: () => api.labOrders(),
    enabled: !journey.encounterId && (view === "labs" || view === "radiology"),
    refetchInterval: 5000,
  });

  // Fetch global prescriptions for feed
  const { data: globalPrescriptions } = useQuery({
    queryKey: ["global-prescriptions"],
    queryFn: () => api.prescriptions(),
    enabled: !journey.encounterId && view === "prescriptions",
    refetchInterval: 5000,
  });

  // Removed EMR view parameters redirection to allow global workspace rendering

  const { data: encDetails } = useQuery({
    queryKey: ["encounter-details", journey.encounterId],
    queryFn: () => api.encounter(journey.encounterId!),
    enabled: !!journey.encounterId,
  });

  // Fetch full Patient 360 profile data
  const { data: p360Data, refetch: refetchP360, error: p360Error } = useQuery({
    queryKey: ["p360", journey.patientId],
    queryFn: () => api.patient360(journey.patientId!),
    enabled: !!journey.patientId,
    refetchInterval: 5000,
    retry: false,
  });

  const isConsentRequired = p360Error instanceof ApiError && p360Error.status === 403;

  // Fetch Active Encounter consultation notes
  useQuery({
    queryKey: ["active-encounter", journey.encounterId],
    queryFn: async () => {
      if (!journey.encounterId) return null;
      const res = await api.encounter(journey.encounterId);
      if (res && res.notes) {
        setAdviceNotes(res.notes);
      }
      return res;
    },
    enabled: !!journey.encounterId,
  });

  const parentEncounterId = encDetails?.parent_encounter_id;
  const { data: parentEncounter } = useQuery({
    queryKey: ["parent-encounter-notes", parentEncounterId],
    queryFn: () => api.encounter(parentEncounterId!),
    enabled: !!parentEncounterId,
  });

  const toggleTest = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  async function runCds(items: any[]) {
    setRxBusy(true); 
    setRxDone(null); 
    setRxErr(null);
    try {
      const payloadItems = items.map((it) => ({
        drug_name: it.drug_name,
        dose: it.dose,
        frequency: it.frequency,
        duration_days: it.duration_days ? parseInt(String(it.duration_days), 10) : null,
        instructions: it.instructions || null,
      }));
      const r = await api.createRx({ encounter_id: journey.encounterId!, items: payloadItems });
      setCds(r.result); 
      setRxId(r.rx_id);
    } finally { 
      setRxBusy(false); 
    }
  }

  async function approve() {
    if (!rxId) return;
    setRxBusy(true); 
    setRxErr(null);
    try {
      const r = await api.approveRx(rxId, { approved_by: journey.doctorName || "Attending Doctor", accept_substitutions: rxAccept, override_warnings: rxOverride });
      setRxDone(r);
      void refetchP360();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setRxErr("Blocked by CDS — resolve the allergy conflict, accept a substitution, or override warning.");
        setCds((e.detail as any)?.cds?.result || cds);
      }
    } finally { 
      setRxBusy(false); 
    }
  }

  async function approveNoMeds() {
    setRxBusy(true);
    setRxErr(null);
    setRxDone(null);
    try {
      const draft = await api.createRx({ encounter_id: journey.encounterId! });
      const r = await api.approveRx(draft.rx_id, { approved_by: journey.doctorName || "Attending Doctor", accept_substitutions: false, override_warnings: false });
      setRxDone(r);
      void refetchP360();
    } catch (e: any) {
      setRxErr(e.message || "Failed to e-sign empty prescription");
    } finally {
      setRxBusy(false);
    }
  }

  async function getSuggestions(encounterId: string) {
    setLoadingSuggestions(true);
    try {
      const r = await api.suggestLabOrders(encounterId);
      setSuggestions(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  // Removed automatic getSuggestions call on load to conserve AI API credits. Can be manually triggered via button.

  const handleSelectPatient = (enc: any) => {
    setSel([]);
    setSuggestions([]);
    setRxItems([]);
    setCds(null);
    setRxId(null);
    setRxBusy(false);
    setRxAccept(false);
    setRxOverride(false);
    setRxDone(null);
    setRxErr(null);
    setTab("timeline");
    setSearchParams({ view: "patient360" });
    journey.set({
      patientId: enc.patient.patient_id,
      encounterId: enc.encounter_id,
      patientName: enc.patient.name,
      token: enc.token?.number || null,
      department: enc.visit_type || null,
      chiefComplaint: enc.triage?.chief_complaint || null,
      doctorName: enc._doctorName || null,
    });
  };

  const handleResetJourney = () => {
    setSel([]);
    setSuggestions([]);
    journey.reset();
  };

  const handleBackToQueue = () => {
    if (rxDone) {
      handleResetJourney();
      return;
    }
    if (window.confirm("This patient hasn't been discharged yet. Go back to the queue anyway?")) {
      handleResetJourney();
    }
  };

  const handleSaveNotes = async () => {
    if (!journey.encounterId) return;
    setSavingNotes(true);
    setNotesSuccess(false);
    try {
      const res = await api.updateEncounterNotes(journey.encounterId, adviceNotes);
      if (res && res.notes) {
        setAdviceNotes(res.notes);
      }
      setNotesSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Failed to save consultation notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleAddIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIssueName.trim()) return;
    setAddingIssue(true);
    try {
      await api.addPatientIssue(journey.patientId!, {
        issue_name: newIssueName.trim(),
        onset_info: newIssueOnset.trim() || undefined,
      });
      setNewIssueName("");
      setNewIssueOnset("");
      qc.invalidateQueries({ queryKey: ["p360", journey.patientId] });
    } catch (err) {
      console.error(err);
      alert("Failed to add medical issue.");
    } finally {
      setAddingIssue(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!journey.patientId) return;
    setGeneratingSummary(true);
    try {
      await api.generateSummary(journey.patientId);
      qc.invalidateQueries({ queryKey: ["p360", journey.patientId] });
    } catch (err) {
      console.error(err);
      alert("Failed to generate AI summary.");
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Helper to open patient and direct to correct EMR tab
  const handleSelectPatientWithTab = (enc: any, targetTab: string) => {
    handleSelectPatient(enc);
    setTab(targetTab);
    setSearchParams({}, { replace: true });
  };

  const renderGlobalLabsFeed = () => {
    const patientIds = queue?.map((enc: any) => enc.patient.patient_id) || [];
    const filteredOrders = globalLabOrders?.filter((o: any) => 
      o.category !== "RADIOLOGY" && patientIds.includes(o.patient_id)
    ) || [];

    return (
      <div className="space-y-4 text-left animate-in fade-in duration-300">
        <div className="flex items-center justify-between pb-1 border-b border-black/[0.05]">
          <div>
            <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
              <FlaskConical className="text-[#107C10]" size={20} /> Laboratory Pathology Feed
            </h2>
            <p className="text-xs text-slate-400">Track all pathology tests ordered and resulted for your patients today.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-semibold">No active lab orders found for today.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-slate-800 text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="text-left pb-2 pr-3">Token</th>
                    <th className="text-left pb-2 pr-3">Patient Name</th>
                    <th className="text-left pb-2 pr-3">Test Name</th>
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Status</th>
                    <th className="text-right pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03]">
                  {filteredOrders.map((o: any) => {
                    const enc = queue?.find((e: any) => e.patient.patient_id === o.patient_id);
                    return (
                      <tr key={o.lab_order_id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 pr-3 font-extrabold text-slate-700">
                          {o.token_number ? `A-${o.token_number}` : "—"}
                        </td>
                        <td className="py-3 pr-3 font-bold text-[#0c3b63]">
                          {o.patient_name}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-650">
                          {o.test_name}
                        </td>
                        <td className="py-3 pr-3 text-slate-500">
                          {o.ordered_ts ? new Date(o.ordered_ts).toLocaleDateString([], { day: '2-digit', month: 'short' }) : "—"}
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                            o.status === "RESULTED"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}>
                            {o.status === "RESULTED" ? "Resulted" : "Pending"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => enc && handleSelectPatientWithTab(enc, "labs")}
                            className="bg-[#107C10] hover:bg-[#107C10]/90 text-white font-extrabold text-[11px] py-1 px-3 rounded-lg transition"
                          >
                            View Result →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGlobalRadiologyFeed = () => {
    const patientIds = queue?.map((enc: any) => enc.patient.patient_id) || [];
    const filteredOrders = globalLabOrders?.filter((o: any) => 
      o.category === "RADIOLOGY" && patientIds.includes(o.patient_id)
    ) || [];

    return (
      <div className="space-y-4 text-left animate-in fade-in duration-300">
        <div className="flex items-center justify-between pb-1 border-b border-black/[0.05]">
          <div>
            <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
              <ScanLine className="text-[#038387]" size={20} /> Radiology Imaging Feed
            </h2>
            <p className="text-xs text-slate-400">Review CT, MRI, and X-ray imaging reports and active PACS scans.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-semibold">No active imaging orders found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-slate-800 text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="text-left pb-2 pr-3">Token</th>
                    <th className="text-left pb-2 pr-3">Patient Name</th>
                    <th className="text-left pb-2 pr-3">Scan Type</th>
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Severity</th>
                    <th className="text-left pb-2 pr-3">Status</th>
                    <th className="text-right pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03]">
                  {filteredOrders.map((o: any) => {
                    const enc = queue?.find((e: any) => e.patient.patient_id === o.patient_id);
                    const aiFlag = o.ai_analysis_summary?.includes("HIGH") ? "HIGH" : o.ai_analysis_summary?.includes("MODERATE") ? "MODERATE" : "NORMAL";
                    return (
                      <tr key={o.lab_order_id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 pr-3 font-extrabold text-slate-700">
                          {o.token_number ? `A-${o.token_number}` : "—"}
                        </td>
                        <td className="py-3 pr-3 font-bold text-[#0c3b63]">
                          {o.patient_name}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-650">
                          {o.test_name}
                        </td>
                        <td className="py-3 pr-3 text-slate-500">
                          {o.ordered_ts ? new Date(o.ordered_ts).toLocaleDateString([], { day: '2-digit', month: 'short' }) : "—"}
                        </td>
                        <td className="py-3 pr-3">
                          {o.status === "RESULTED" && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                              aiFlag === "HIGH"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : aiFlag === "MODERATE"
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                            }`}>
                              {aiFlag}
                            </span>
                          )}
                          {o.status !== "RESULTED" && <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                            o.status === "RESULTED"
                              ? "bg-sky-500/10 text-sky-600 border-sky-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}>
                            {o.status === "RESULTED" ? "Resulted" : "Pending"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => enc && handleSelectPatientWithTab(enc, "imaging")}
                            className="bg-[#038387] hover:bg-[#038387]/90 text-white font-extrabold text-[11px] py-1 px-3 rounded-lg transition"
                          >
                            View PACS Scan →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderGlobalPrescriptionsFeed = () => {
    const patientIds = queue?.map((enc: any) => enc.patient.patient_id) || [];
    const filteredPrescriptions = globalPrescriptions?.filter((rx: any) => 
      patientIds.includes(rx.patient_id)
    ) || [];

    return (
      <div className="space-y-4 text-left animate-in fade-in duration-300">
        <div className="flex items-center justify-between pb-1 border-b border-black/[0.05]">
          <div>
            <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
              <Pill className="text-[#CA5010]" size={20} /> Clinical Prescriptions Feed
            </h2>
            <p className="text-xs text-slate-400">Review, modify, or authorize active patient prescriptions and pharmacotherapy orders.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          {filteredPrescriptions.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-semibold">No active prescriptions found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-slate-800 text-[12.5px]">
                <thead>
                  <tr className="border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="text-left pb-2 pr-3">Patient Name</th>
                    <th className="text-left pb-2 pr-3">Meds Summary</th>
                    <th className="text-left pb-2 pr-3">Date</th>
                    <th className="text-left pb-2 pr-3">Status</th>
                    <th className="text-right pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03]">
                  {filteredPrescriptions.map((rx: any) => {
                    const enc = queue?.find((e: any) => e.patient.patient_id === rx.patient_id);
                    const medsSummary = rx.items?.map((it: any) => it.drug_name).join(", ") || "No items";
                    return (
                      <tr key={rx.rx_id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 pr-3 font-bold text-[#0c3b63]">
                          {rx.patient_name}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-650 max-w-[280px] truncate" title={medsSummary}>
                          {medsSummary}
                        </td>
                        <td className="py-3 pr-3 text-slate-500">
                          {rx.created_ts ? new Date(rx.created_ts).toLocaleDateString([], { day: '2-digit', month: 'short' }) : "—"}
                        </td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                            rx.status === "APPROVED" || rx.status === "PREPAID" || rx.status === "DISPENSED"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          }`}>
                            {rx.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => enc && handleSelectPatientWithTab(enc, "medications")}
                            className="bg-[#CA5010] hover:bg-[#CA5010]/90 text-white font-extrabold text-[11px] py-1 px-3 rounded-lg transition"
                          >
                            Review Rx →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Moved patient selection check below global view routing to allow direct global workspace rendering

  // Formatting variables
  const allergyText = p360Data?.allergies?.map((a: any) => a.substance) ?? [];
  const activeProblems = p360Data?.issues ?? [];
  const activeMedications = p360Data?.medications ?? [];
  const recentLabs = p360Data?.recent_results?.filter((r: any) => r.category !== "RADIOLOGY") ?? [];
  const recentImaging = p360Data?.recent_results?.filter((r: any) => r.category === "RADIOLOGY") ?? [];

  // ---------------------------------------------------- High-Fidelity Command Center fallbacks
  const renderAdmissionsView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <ClipboardList className="text-[#CA5010]" size={20} /> Admissions Command Center
        </h2>
        <p className="text-xs text-slate-400">Live monitor of patient bed allocations, admissions queues, and floor census.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "ICU Occupancy", value: "85%", color: "#ef4444" },
          { label: "General Beds", value: "18 / 20", color: "#16a34a" },
          { label: "Admitted Today", value: "14 Patients", color: "#0078d4" },
          { label: "Discharge Pending", value: "3 Patients", color: "#CA5010" }
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: k.color }} />
            <div className="text-[20px] font-extrabold text-slate-800">{k.value}</div>
            <div className="text-[11.5px] font-bold text-slate-400 mt-1">{k.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
        <div className="font-bold text-[13px] text-[#0c3b63] mb-3">Active Admissions Log</div>
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-slate-700 text-left">
            <thead>
              <tr className="border-b border-black/[0.08] pb-1.5 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider">
                <th className="pb-2">Patient</th>
                <th className="pb-2">Room / Ward</th>
                <th className="pb-2">Admitting Doctor</th>
                <th className="pb-2">Diagnosis</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.03]">
              {[
                { name: "Ahmed Khan", room: "ICU 07", doctor: "Dr. Ahmed Ali", dx: "NSTEMI", status: "Active" },
                { name: "Sara Ali", room: "Ward B3", doctor: "Dr. Michael Lee", dx: "Post-op Care", status: "Admitted" },
                { name: "Ali Mahmood", room: "ICU 03", doctor: "Dr. Imran Haider", dx: "Pneumonia", status: "Active" },
                { name: "Zara Noor", room: "Ward A1", doctor: "Dr. Sarah Khan", dx: "Cellulitis", status: "Discharged" },
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2.5 font-bold text-slate-800">{row.name}</td>
                  <td className="py-2.5 font-semibold text-slate-650">{row.room}</td>
                  <td className="py-2.5 text-slate-550">{row.doctor}</td>
                  <td className="py-2.5 text-slate-500">{row.dx}</td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${
                      row.status === "Discharged" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-sky-500/10 text-sky-600 border-sky-500/20"
                    }`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSurgeryView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <Activity className="text-[#107C10]" size={20} /> Surgery &amp; OT Command Center
        </h2>
        <p className="text-xs text-slate-400">Live operational monitor of Operating Theaters (OT) and scheduled surgeries.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "OR 1 - Active", op: "Coronary Bypass Graft", doc: "Dr. Ahmed Ali", time: "8:00 AM - 12:30 PM", color: "#D13438" },
          { title: "OR 2 - Active", op: "Laparoscopic Appendectomy", doc: "Dr. Sara Malik", time: "10:30 AM - 12:00 PM", color: "#D13438" },
          { title: "OR 3 - Idle", op: "Scheduled Disinfection", doc: "—", time: "11:30 AM - 12:00 PM", color: "#16a34a" },
          { title: "OR 4 - Scheduled", op: "Total Knee Arthroplasty", doc: "Dr. Michael Lee", time: "1:30 PM - 3:30 PM", color: "#0078d4" }
        ].map((or, idx) => (
          <div key={idx} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1.5 h-full" style={{ backgroundColor: or.color }} />
            <div className="font-extrabold text-[12px] text-slate-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: or.color }} />
              {or.title}
            </div>
            <div className="text-xs font-bold text-slate-650 mt-2">{or.op}</div>
            <div className="text-[11px] text-slate-450 mt-1">Surgeon: {or.doc}</div>
            <div className="text-[10px] text-slate-450 mt-1 flex items-center gap-1"><Clock size={11} /> {or.time}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderIcuView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <HeartPulse className="text-[#D13438]" size={20} /> ICU Operations Monitor
        </h2>
        <p className="text-xs text-slate-400">Real-time telemetry feeds and acuity metrics for Intensive Care patients.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { bed: "Bed ICU-01", patient: "M. Siddiqui", vitals: "HR 82, BP 118/76, SpO2 97%", status: "Stable", tone: "green" },
          { bed: "Bed ICU-03", patient: "Rashid Ali", vitals: "HR 104, BP 138/92, SpO2 93%", status: "Alert", tone: "amber" },
          { bed: "Bed ICU-07", patient: "Ahmed Khan", vitals: "HR 76, BP 125/80, SpO2 99%", status: "Critical", tone: "red" },
        ].map((icu, idx) => (
          <div key={idx} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center pb-2 border-b border-black/[0.04]">
              <span className="font-extrabold text-[12px] text-slate-800">{icu.bed}</span>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[8.5px] font-extrabold uppercase border ${
                icu.tone === "red" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : icu.tone === "amber" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              }`}>{icu.status}</span>
            </div>
            <div className="pt-2 text-left">
              <div className="font-bold text-xs text-slate-700">{icu.patient}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-1">{icu.vitals}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEmergencyView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <AlertTriangle className="text-amber-500" size={20} /> Emergency Department Triage
        </h2>
        <p className="text-xs text-slate-400">Emergency room (ED) patient logs classified by standard CTAS priority guidelines.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-black/[0.08] pb-1.5 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider">
              <th className="pb-2">CTAS Code</th>
              <th className="pb-2">Patient</th>
              <th className="pb-2">Chief Complaint</th>
              <th className="pb-2">Wait Time</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.03]">
            {[
              { code: "Level 1 - Resuscitation", patient: "Bilal Ahmad", complaint: "Cardiac Arrest", wait: "0 min", status: "In Trauma Room", tone: "red" },
              { code: "Level 2 - Emergent", patient: "Marium Bibi", complaint: "Severe Chest Pain", wait: "5 min", status: "Awaiting ECG", tone: "red" },
              { code: "Level 3 - Urgent", patient: "Kamran Shah", complaint: "Compound Fracture", wait: "18 min", status: "Triage Done", tone: "amber" },
              { code: "Level 4 - Less Urgent", patient: "Hina Riaz", complaint: "Acute Sprain", wait: "45 min", status: "Waiting", tone: "blue" },
            ].map((er, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-2.5 font-bold">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[8.5px] font-extrabold border ${
                    er.tone === "red" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : er.tone === "amber" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-sky-500/10 text-sky-600 border-sky-500/20"
                  }`}>{er.code}</span>
                </td>
                <td className="py-2.5 font-bold text-slate-800">{er.patient}</td>
                <td className="py-2.5 text-slate-600">{er.complaint}</td>
                <td className="py-2.5 text-slate-500 font-mono">{er.wait}</td>
                <td className="py-2.5 text-right font-semibold text-slate-650">{er.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBillingView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <BookOpen className="text-indigo-500" size={20} /> Billing &amp; Invoices
        </h2>
        <p className="text-xs text-slate-400 font-medium">Verify outstanding patient claims, pre-authorization statuses, and copays.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-black/[0.08] pb-1.5 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider">
              <th className="pb-2">Invoice ID</th>
              <th className="pb-2">Patient</th>
              <th className="pb-2">Total Bill</th>
              <th className="pb-2">Insurance Covered</th>
              <th className="pb-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.03]">
            {[
              { id: "INV-2849", name: "Ahmed Khan", amount: "₹45,280.00", insurance: "₹42,000.00", status: "Paid" },
              { id: "INV-2850", name: "Sara Ali", amount: "₹18,500.00", insurance: "₹15,000.00", status: "Unpaid" },
              { id: "INV-2851", name: "Ali Mahmood", amount: "₹8,200.00", insurance: "₹0.00", status: "Paid" },
            ].map((inv, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-2.5 font-mono text-[#0078d4] font-bold">{inv.id}</td>
                <td className="py-2.5 font-bold text-slate-800">{inv.name}</td>
                <td className="py-2.5 font-semibold text-slate-700">{inv.amount}</td>
                <td className="py-2.5 text-slate-500">{inv.insurance}</td>
                <td className="py-2.5 text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${
                    inv.status === "Paid" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                  }`}>{inv.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderInventoryView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <HardDrive className="text-teal-600" size={20} /> Inventory Command Center
        </h2>
        <p className="text-xs text-slate-400">Monitor centralized hospital supplies, clinical disposables, and sterile kit stocks.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm">
        <div className="font-bold text-[13px] text-[#0c3b63] mb-3">Critical Supply Alerts</div>
        <div className="space-y-2.5 text-xs text-slate-750">
          {[
            { item: "Sterile Nitrile Gloves (Medium)", stock: "15 boxes left", alert: "Below reorder margin of 50 boxes", type: "Low Stock" },
            { item: "Disposible Syringes 5ml", stock: "102 units left", alert: "High depletion rate today", type: "Depleted" },
            { item: "Infusion Pumps IV-100", stock: "2 available", alert: "All other units allocated to ICU", type: "Allocation Alert" },
          ].map((inv, idx) => (
            <div key={idx} className="p-3 border border-black/[0.05] rounded-xl bg-slate-50/50 flex justify-between items-start">
              <div>
                <div className="font-bold text-slate-850">{inv.item}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{inv.alert}</div>
              </div>
              <div className="text-right shrink-0">
                <span className="font-bold text-[#D13438] block">{inv.stock}</span>
                <span className="text-[9px] font-extrabold uppercase text-slate-450 block mt-0.5">{inv.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderReportsView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <FileText className="text-sky-600" size={20} /> Clinical Analytics &amp; Reports
        </h2>
        <p className="text-xs text-slate-400">Generate compliance metrics, readmission reviews, and clinical quality performance logs.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { title: "Monthly Readmission Quality Report", date: "August 2026", desc: "Detailed breakdown of 30-day medical readmission trends.", download: "Download PDF" },
          { title: "OT Utilization Review", date: "Q2 2026", desc: "Analysis of Operating Theater occupancy hours and turnover periods.", download: "Generate Chart" },
        ].map((rep, idx) => (
          <div key={idx} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm flex flex-col justify-between h-36">
            <div>
              <span className="text-[10px] text-slate-400 font-bold">{rep.date}</span>
              <h4 className="text-[13px] font-bold text-slate-800 mt-1">{rep.title}</h4>
              <p className="text-[11px] text-slate-450 leading-relaxed mt-1.5">{rep.desc}</p>
            </div>
            <button className="text-left text-[11px] font-extrabold text-[#0078d4] hover:underline pt-2 border-t border-black/[0.04] flex items-center gap-1">
              <Download size={12} /> {rep.download}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderMapView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <MapPin className="text-rose-500" size={20} /> Hospital Floor Map
        </h2>
        <p className="text-xs text-slate-400">Dynamic 3D vector coordinates representing active hospital telemetry digital twins.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm flex justify-center items-center bg-slate-950 min-h-[300px]">
        <div className="w-full max-w-lg">
          <DigitalTwinMap />
        </div>
      </div>
    </div>
  );

  const renderDepartmentsView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <Building2 className="text-slate-700" size={20} /> Hospital Departments Directory
        </h2>
        <p className="text-xs text-slate-400">Live operational overview of departments, staffing indexes, and occupancy levels.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: "Emergency Department", count: "24 Patients", staff: "12 Doctors, 28 Nurses", occupancy: "110% Capacity" },
          { name: "ICU / CCU Unit", count: "14 Patients", staff: "4 Doctors, 16 Nurses", occupancy: "85% Capacity" },
          { name: "Cardiology Center", count: "32 Patients", staff: "8 Doctors, 12 Nurses", occupancy: "75% Capacity" },
          { name: "Pharmacy Main", count: "42 Pendings", staff: "6 Pharmacists", occupancy: "Normal Load" },
          { name: "Radiology Central", count: "11 Studies", staff: "4 Radiologists", occupancy: "Moderate Load" },
        ].map((dept, idx) => (
          <div key={idx} className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm text-xs space-y-1">
            <h4 className="font-extrabold text-slate-800 text-[12.5px]">{dept.name}</h4>
            <div className="text-slate-500 font-semibold">{dept.count} · {dept.staff}</div>
            <div className="text-[#0078d4] font-bold">{dept.occupancy}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderAssetsView = () => (
    <div className="space-y-4 text-left animate-in fade-in duration-300">
      <div className="pb-1 border-b border-black/[0.05]">
        <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
          <HardDrive className="text-slate-700" size={20} /> High-Value Medical Equipment Assets
        </h2>
        <p className="text-xs text-slate-400">Verify calibration triggers, operational status, and floor location of tracking assets.</p>
      </div>
      <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-black/[0.08] pb-1.5 text-[9.5px] font-extrabold text-slate-400 uppercase tracking-wider">
              <th className="pb-2">Asset Tag</th>
              <th className="pb-2">Equipment Description</th>
              <th className="pb-2">Current Location</th>
              <th className="pb-2">Calibration Status</th>
              <th className="pb-2 text-right">Connectivity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.03]">
            {[
              { tag: "VT-102", name: "Ventilator Servo-U", loc: "ICU Bed 07", calib: "Approved", status: "Connected" },
              { tag: "ECG-99", name: "ECG Telemetry 12-lead", loc: "ER Trauma Room 1", calib: "Approved", status: "Connected" },
              { tag: "US-88", name: "Ultrasound GE Voluson", loc: "OBS/GYN Exam Room", calib: "Pending Review", status: "Offline" },
            ].map((asset, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-2.5 font-mono text-[#0078d4] font-bold">{asset.tag}</td>
                <td className="py-2.5 font-bold text-slate-800">{asset.name}</td>
                <td className="py-2.5 font-semibold text-slate-650">{asset.loc}</td>
                <td className="py-2.5 text-slate-500">{asset.calib}</td>
                <td className="py-2.5 text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[8.5px] font-extrabold border ${
                    asset.status === "Connected" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                  }`}>{asset.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSystemView = (type: string) => {
    const title = type.charAt(0).toUpperCase() + type.slice(1);
    return (
      <div className="space-y-4 text-left animate-in fade-in duration-300">
        <div className="pb-1 border-b border-black/[0.05]">
          <h2 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
            <Settings className="text-[#0c3b63]" size={20} /> System {title} Panel
          </h2>
          <p className="text-xs text-slate-400">Configure preferences, check system tasks checklist, and read communications.</p>
        </div>
        <div className="rounded-2xl border border-black/[0.08] bg-white p-4 shadow-sm text-xs text-slate-700 leading-relaxed max-w-xl">
          <div className="font-bold text-slate-850 mb-2">Configure ClinIQ Preferences</div>
          <p className="text-slate-450">Settings are synced with active LDAP directory credentials. To change notification flags, contact administrative support.</p>
          <div className="mt-3 p-3 bg-slate-50 border border-black/[0.04] rounded-xl flex items-center justify-between">
            <span className="font-semibold">SMS Patients on Resulted Labs</span>
            <span className="text-[#107C10] font-bold">Enabled</span>
          </div>
        </div>
      </div>
    );
  };

  // Global views routing
  if (view === "care-team") {
    return <CareTeamWorkspace readOnly={true} />;
  }
  if (view === "labs") {
    return <LabWorkspace />;
  }
  if (view === "radiology") {
    return <RadiologyWorkspace />;
  }
  if (view === "pharmacy") {
    return <PharmacyWorkspace />;
  }
  if (view === "admissions") {
    return renderAdmissionsView();
  }
  if (view === "surgery") {
    return renderSurgeryView();
  }
  if (view === "icu") {
    return renderIcuView();
  }
  if (view === "emergency") {
    return renderEmergencyView();
  }
  if (view === "billing") {
    return renderBillingView();
  }
  if (view === "inventory") {
    return renderInventoryView();
  }
  if (view === "reports") {
    return renderReportsView();
  }
  if (view === "map") {
    return renderMapView();
  }
  if (view === "departments") {
    return renderDepartmentsView();
  }
  if (view === "assets") {
    return renderAssetsView();
  }
  if (view === "alerts" || view === "tasks" || view === "messages" || view === "settings") {
    return renderSystemView(view);
  }

  // Patient selected verification check
  if (!journey.encounterId || !journey.patientId) {
    if (view === "labs") {
      return renderGlobalLabsFeed();
    }
    if (view === "radiology") {
      return renderGlobalRadiologyFeed();
    }
    if (view === "prescriptions") {
      return renderGlobalPrescriptionsFeed();
    }
    return <DoctorQueue onSelectPatient={handleSelectPatient} />;
  }

  const buildTimelineEvents = () => {
    const events: any[] = [];

    // 1. Add Encounters (Admission / Check-in)
    if (p360Data?.encounters) {
      p360Data.encounters.forEach((e: any) => {
        const timestamp = e.arrival_ts ? new Date(e.arrival_ts) : null;
        if (!timestamp) return;
        
        events.push({
          id: `enc-${e.encounter_id}`,
          timestamp,
          title: e.visit_type === "LAB" ? "Lab Check-in" : "Patient Admission",
          status: e.status === "DISCHARGED" || e.status === "COMPLETED" ? "Completed" : "Active",
          statusColor: e.status === "DISCHARGED" || e.status === "COMPLETED" ? "#16a34a" : "#0078d4",
          icon: e.visit_type === "LAB" ? FlaskConical : User,
          colorClass: e.visit_type === "LAB" ? "bg-amber-600/10 text-amber-600 border-amber-600/25" : "bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/25",
          content: (
            <span>
              Checked in to <b>{e.department || "General"} Department</b> (Reason: {e.reason || "Consultation / Test"}).
            </span>
          ),
        });
      });
    }

    // 2. Add Lab Results / Updates
    if (p360Data?.recent_results) {
      const groupedOrders: Record<string, any> = {};
      p360Data.recent_results.forEach((r: any) => {
        if (!groupedOrders[r.lab_order_id]) {
          groupedOrders[r.lab_order_id] = {
            test: r.test,
            category: r.category,
            date: r.date,
            resulted_ts: r.resulted_ts,
            analytes: [],
            flag: r.flag,
          };
        }
        groupedOrders[r.lab_order_id].analytes.push(r);
        if (r.flag !== "N") groupedOrders[r.lab_order_id].flag = r.flag;
      });

      Object.entries(groupedOrders).forEach(([orderId, order]: [string, any]) => {
        const timestamp = order.resulted_ts ? new Date(order.resulted_ts) : null;
        if (!timestamp) return;

        const isRadiology = order.category === "RADIOLOGY";
        const isAbnormal = order.flag && order.flag !== "N";

        events.push({
          id: `result-${orderId}`,
          timestamp,
          title: isRadiology ? "Imaging Report Signed" : "Laboratory Findings Updated",
          status: isAbnormal ? "Abnormal" : "Completed",
          statusColor: isAbnormal ? "#CA5010" : "#16a34a",
          icon: isRadiology ? ScanLine : FlaskConical,
          colorClass: isRadiology ? "bg-indigo-600/10 text-indigo-600 border-indigo-600/25" : "bg-sky-600/10 text-sky-600 border-sky-600/25",
          content: (
            <div className="space-y-1 mt-0.5">
              <div>Test: <b>{order.test}</b></div>
              {order.analytes.map((a: any, idx: number) => {
                if (a.analyte === "Lab Findings" || a.analyte === "Findings Class") {
                  return (
                    <div key={idx} className="text-slate-500 font-semibold text-[10.5px] leading-relaxed">
                      <b>Notes:</b> {a.value}
                    </div>
                  );
                }
                return (
                  <div key={idx} className="text-[10.5px]">
                    • {a.analyte}: <b>{a.value} {a.unit}</b> {a.flag !== "N" ? `(${a.flag})` : ""}
                  </div>
                );
              })}
            </div>
          ),
        });
      });
    }

    // 3. Add Prescriptions
    if (p360Data?.medications) {
      p360Data.medications.forEach((m: any) => {
        const timestamp = m.created_ts ? new Date(m.created_ts) : null;
        if (!timestamp) return;

        events.push({
          id: `med-timeline-${m.medication_id}`,
          timestamp,
          title: "Prescription Authorized",
          status: m.status === "ACTIVE" ? "E-Signed" : "Cancelled",
          statusColor: m.status === "ACTIVE" ? "#16a34a" : "#D13438",
          icon: Pill,
          colorClass: "bg-emerald-600/10 text-emerald-600 border border-emerald-600/25",
          content: (
            <span>
              E-Signed: <b>{m.drug_name} {m.dosage}</b>
            </span>
          ),
        });
      });
    }

    // Sort by timestamp desc
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return events;
  };

  const timelineEvents = buildTimelineEvents();
  
  const riskLevel = p360Data?.riskLevel ?? "Moderate";
  const riskColor = riskLevel === "High" ? "#D13438" : riskLevel === "Moderate" ? "#CA5010" : "#16a34a";
  const initials = (journey.patientName || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  // Table styles
  const th = "border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400";
  const cellHead = "pb-2 pr-3";

  return (
    <div className="space-y-4" style={{ fontFamily: '"Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif' }}>
      
      {/* -------------------------------------------------- Main Responsive Grid */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        
        {/* Left: Command Center + Patient 360 Grid */}
        <div className="space-y-4 min-w-0">
          
          {/* TOP: Command Center KPI row */}
          <div className="text-left">
            <h2 className="text-[15.5px] font-extrabold text-[#0c3b63] mb-2">Command Center</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {KPI_CARDS.map((k) => (
                <div key={k.label} className="rounded-2xl border border-black/[0.07] bg-white relative overflow-hidden p-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: k.color }} />
                  <div className="mb-2 grid h-7 w-7 place-items-center rounded-xl" style={{ backgroundColor: `${k.color}15`, color: k.color }}>
                    <k.icon size={14} />
                  </div>
                  <div className="text-[18px] font-extrabold leading-none text-slate-800">{k.value}</div>
                  <div className="mt-1 text-[10.5px] font-extrabold text-slate-500 leading-tight">{k.label}</div>
                  <div className="mt-0.5 text-[9px] text-slate-400">{k.sub}</div>
                </div>
              ))}
            </div>
                    {/* MIDDLE: Patient 360 - Digital Twin Section */}
          <div className={`${cardClass} mt-4 text-left shadow-[0_4px_16px_rgba(0,0,0,0.015)]`}>
            
            {/* Title Header Row with Actions */}
            <div className="mb-4 flex items-center justify-between pb-3 border-b border-black/[0.05]">
              <div className="flex items-center gap-2">
                <h2 className="text-[15.5px] font-extrabold text-[#0c3b63]">Patient 360 – Digital Twin</h2>
                <span className="flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9.5px] font-extrabold text-rose-600 border border-rose-500/25">
                  <AlertTriangle size={11} /> High Risk
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button type="button" className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-extrabold text-slate-600 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <FileText size={13} className="text-slate-400" /> Open Chart
                </button>
                <button type="button" className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[11.5px] font-extrabold text-slate-600 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <Share2 size={13} className="text-slate-400" /> Share
                </button>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.08] bg-white hover:bg-slate-50 text-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"><MoreHorizontal size={16} /></button>
                <span className="text-slate-200 font-extrabold h-4 w-px mx-1" />
                <button 
                  type="button" 
                  onClick={handleBackToQueue}
                  className="border border-black/[0.08] bg-white text-slate-700 text-[11px] font-extrabold px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <ArrowLeft size={11} className="text-slate-450" /> Back
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowHistoryModal(true)}
                  className="border border-black/[0.08] bg-white text-slate-700 text-[11px] font-extrabold px-3 py-1.5 rounded-lg hover:bg-slate-50 flex items-center gap-1 transition shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <History size={11} className="text-slate-450" /> Audit Log
                </button>
              </div>
            </div>

            {isConsentRequired ? (
              <div className="my-8 flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-rose-500/20 bg-rose-500/5 max-w-xl mx-auto space-y-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500/10 text-rose-600">
                  <ShieldAlert size={24} className="animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-md font-extrabold text-slate-800">🔐 Consent Required to Access Record</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    Under hospital security protocols and patient privacy rules, you must capture active patient consent before accessing Protected Health Information (PHI).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api.consent(journey.patientId!);
                      void refetchP360();
                    } catch (err) {
                      console.error(err);
                      alert("Failed to capture patient consent.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white font-extrabold text-[12px] py-2 px-4 rounded-lg shadow-lg cursor-pointer inline-flex items-center gap-1.5 transition"
                >
                  {busy ? "Capturing..." : "Capture Consent & Unlock EMR"}
                </button>
              </div>
            ) : (
              <>
                {/* Demographics details + AI Summary Grid */}
                <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] border-b border-black/[0.05] pb-4">
              
              {/* Left Column: Demographics Details Box */}
              <div className="flex gap-4 text-left items-start">
                <div className="grid h-[92px] w-[92px] shrink-0 place-items-center rounded-2xl border border-black/[0.06] bg-slate-50 text-[30px] font-extrabold text-[#0078d4] shadow-inner">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-[20px] font-extrabold text-slate-850">{journey.patientName}</span>
                    
                    {/* Patient switcher dropdown */}
                    <select 
                      value={journey.encounterId || ""} 
                      onChange={(e) => {
                        const enc = queue?.find((x: any) => x.encounter_id === e.target.value);
                        if (enc) handleSelectPatient(enc);
                      }}
                      className="cursor-pointer rounded-md border border-black/[0.08] bg-white py-1 pl-2 pr-6 text-[12px] font-bold text-slate-500 outline-none focus:border-[#0078d4] shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
                    >
                      <option value="" disabled>Switch patient...</option>
                      {queue?.map((enc: any) => (
                        <option key={enc.encounter_id} value={enc.encounter_id}>
                          {enc.patient.name} {enc.token?.number ? `· Token ${enc.token.number}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="mt-0.5 text-[14px] font-bold text-slate-500 leading-tight">
                    {[
                      encDetails?.patient?.age != null ? `${encDetails.patient.age} Y` : null,
                      encDetails?.patient?.gender === "Female" ? "Female" : "Male",
                      encDetails?.patient?.mrn ? `MRN: ${encDetails.patient.mrn}` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                  
                  <div className="text-[13px] text-slate-400 font-semibold mt-0.5">
                    Phone: {p360Data?.patient?.mobile || "No Mobile"}
                  </div>
 
                  {/* Core variables sub-grid */}
                  <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-black/[0.04] pt-3">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Blood Group</div>
                      <div className="text-[14px] font-bold text-slate-700 mt-0.5">{p360Data?.patient?.blood_group || "B+"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Allergies</div>
                      <div className="text-[14px] font-bold text-rose-600 mt-0.5 truncate max-w-[180px]">{allergyText.length > 0 ? allergyText[0] : "None"}</div>
                      <div className="text-[11.5px] text-rose-500 font-semibold truncate max-w-[160px]">{allergyText.slice(1).join(", ") || "No warnings"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Insurance</div>
                      <div className="text-[14px] font-bold text-slate-700 mt-0.5 truncate max-w-[180px]">{p360Data?.patient?.insurance_provider || "Jubilee Health"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Location</div>
                      <div className="text-[14px] font-bold text-slate-700 mt-0.5">ICU-07</div>
                      <div className="text-[11.5px] text-[#0078d4] font-bold">Bed 01</div>
                    </div>
                  </div>
                </div>
              </div>
 
              {/* Right Column: AI Patient Summary Box */}
              <div className="rounded-xl border border-[#0078d4]/15 bg-[#0078d4]/5 p-3 flex flex-col justify-between text-left">
                <div>
                  <div className="mb-1.5 flex items-center justify-between pb-1 border-b border-[#0078d4]/10">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#0a5aa8]"><Sparkles size={13} /> AI Patient Summary</span>
                    <button onClick={handleGenerateSummary} disabled={generatingSummary} className="text-[11.5px] text-[#0078d4] font-bold">
                      {generatingSummary ? "..." : "Refresh"}
                    </button>
                  </div>
                  <p className="text-[13px] leading-relaxed text-slate-655 font-semibold">
                    {p360Data?.ai_summary?.result?.summary || "Summary has not been generated for this patient yet. Click Refresh."}
                  </p>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-white/70 p-2 border border-black/[0.03]">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Risk Score</div>
                    <div className="text-[14px] font-bold text-rose-600 mt-0.5">{riskLevel === "High" ? "High (85%)" : "Moderate (45%)"}</div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-2 border border-black/[0.03]">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Readmission Risk</div>
                    <div className="text-[14px] font-bold text-amber-600 mt-0.5">Moderate (36%)</div>
                  </div>
                </div>
              </div>
 
            </div>
 
            {/* Tab Bar & Content (Spans Full Width under header row) */}
            <div className="mt-4 flex gap-x-4 gap-y-1 overflow-x-auto border-b border-black/[0.07] pb-1.5 text-left">
              {NEW_TABS.map((t) => (
                <button 
                  key={t.id} 
                  type="button" 
                  onClick={() => setTab(t.id)}
                  className="relative shrink-0 whitespace-nowrap pb-1.5 text-[15px] font-extrabold transition outline-none"
                  style={{ color: tab === t.id ? "#0078d4" : "#64748b" }}
                >
                  {t.label}
                  {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded bg-[#0078d4]" />}
                </button>
              ))}
            </div>
 
            <div className="mt-4 min-w-0">
                {/* TIMELINE TAB */}
                {tab === "timeline" && (
                  <div className="space-y-4 animate-in fade-in duration-200 text-left">
                    <div className="flex items-center justify-between pb-1 border-b border-black/[0.04]">
                      <h4 className="text-[15.5px] font-extrabold text-[#0c3b63]">Clinical Timeline &amp; Events</h4>
                    </div>
 
                    <div className="max-h-[380px] overflow-y-auto pr-1.5 space-y-4 mt-2 custom-scrollbar">
                      {timelineEvents.map((ev: any) => (
                        <div key={ev.id} className="flex gap-3">
                          <div className="flex w-14 shrink-0 flex-col items-end pt-1.5 text-right text-[11.5px] font-bold text-slate-400">
                            <div>{ev.timestamp.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                            <div>{ev.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className={`grid h-6 w-6 place-items-center rounded-full ${ev.colorClass}`}>
                              <ev.icon size={12} />
                            </span>
                            <span className="w-px flex-1 bg-black/[0.08] my-1" />
                          </div>
                          <div className={`${cardClass} p-3 flex-1`}>
                            <div className="flex justify-between items-center">
                              <span className="text-[13.5px] font-extrabold text-slate-700">{ev.title}</span>
                              <LocalPill tone={ev.statusColor}>{ev.status}</LocalPill>
                            </div>
                            <p className="mt-1 text-[12.5px] text-slate-500 font-semibold leading-normal">
                              {ev.content}
                            </p>
                          </div>
                        </div>
                      ))}
                      {timelineEvents.length === 0 && (
                        <div className="text-center py-6 text-slate-400 font-semibold italic">No timeline events recorded.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* OVERVIEW TAB */}
                {tab === "overview" && (
                  <div className="space-y-4 animate-in fade-in duration-200 text-left">
                    
                    {/* Upper Row: Problems, Vitals, Medications */}
                    <div className="grid gap-4 lg:grid-cols-3">
                      
                      {/* Current Problems */}
                      <div className={`${cardClass}`}>
                        <PanelHead title="Current Problems" action="View All" onAction={() => setTab("overview")} />
                        <ol className="space-y-1.5 text-[11.5px] font-semibold text-slate-600">
                          {activeProblems.map((p: any, i: number) => (
                            <li key={i} className="flex justify-between items-center">
                              <span>{i + 1}. {p.issue_name}</span>
                              {i === 0 && <LocalPill tone="#0078d4">Primary</LocalPill>}
                            </li>
                          ))}
                          {activeProblems.length === 0 && <li className="text-slate-400 italic">No chronic problems.</li>}
                        </ol>
                      </div>

                      {/* Recent Vitals */}
                      <div className={`${cardClass}`}>
                        <PanelHead title="Recent Vitals" action="View Trends" onAction={() => setTab("vitals")} />
                        <div className="space-y-2">
                          {[
                            { label: "BP", value: p360Data?.latest_vitals?.bp || "—", color: "#0078d4" },
                            { label: "HR", value: p360Data?.latest_vitals?.heart_rate ? `${p360Data.latest_vitals.heart_rate} bpm` : "—", color: "#D13438" },
                            { label: "SpO₂", value: p360Data?.latest_vitals?.spo2 ? `${p360Data.latest_vitals.spo2}%` : "—", color: "#16a34a" },
                            { label: "Temp", value: p360Data?.latest_vitals?.temperature ? `${p360Data.latest_vitals.temperature}°F` : "—", color: "#CA5010" },
                            { label: "RR", value: p360Data?.latest_vitals?.respiratory_rate ? `${p360Data.latest_vitals.respiratory_rate} /min` : "—", color: "#8764B8" },
                            { label: "Weight", value: p360Data?.latest_vitals?.weight_kg ? `${p360Data.latest_vitals.weight_kg} kg` : "—", color: "#038387" },
                            { label: "Height", value: p360Data?.latest_vitals?.height_cm ? `${p360Data.latest_vitals.height_cm} cm` : "—", color: "#0078d4" },
                          ].map((v) => (
                            <div key={v.label} className="flex items-center justify-between text-[11.5px] font-semibold text-slate-600">
                              <span className="text-slate-400 font-bold w-10">{v.label}</span>
                              <span className="text-slate-700 flex-1">{v.value}</span>
                              <Spark color={v.color} seed={`${v.label}-${v.value}`} />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Active Medications */}
                      <div className={`${cardClass}`}>
                        <PanelHead title="Active Medications" action="View All" onAction={() => setTab("medications")} />
                        <div className="space-y-1.5 text-[11.5px] text-slate-600 font-semibold">
                          {activeMedications.slice(0, 4).map((m: any, i: number) => (
                            <div key={i} className="flex justify-between items-center gap-1">
                              <span className="truncate flex-1 font-extrabold">{m.drug_name}</span>
                              <span className="text-slate-400 font-bold shrink-0">{m.dosage || "QD"}</span>
                            </div>
                          ))}
                          {activeMedications.length === 0 && <div className="text-slate-400 italic">No active medications.</div>}
                        </div>
                      </div>

                    </div>

                    {/* Lower Row: Latest Lab Results, Care Team */}
                    <div className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
                      
                      {/* Latest Lab Results */}
                      <div className={`${cardClass}`}>
                        <PanelHead title="Latest Lab Results" action="View All" onAction={() => setTab("labs")} />
                        <div className="space-y-1.5">
                          {recentLabs.slice(0, 5).map((l: any, i: number) => {
                            const isAbnormal = l.flag !== "N";
                            return (
                              <div key={i} className="flex items-center justify-between text-[11.5px] font-semibold text-slate-600">
                                <span className="truncate flex-1">{l.test}</span>
                                <span className="text-slate-850 mr-2">{l.value} {l.unit}</span>
                                <LocalPill tone={isAbnormal ? "#D13438" : "#16a34a"}>{l.flag === "N" ? "Normal" : l.flag}</LocalPill>
                              </div>
                            );
                          })}
                          {recentLabs.length === 0 && <div className="text-[11px] text-slate-400 py-2 italic text-center">No lab results.</div>}
                        </div>
                      </div>

                      {/* Care Team */}
                      <div className={`${cardClass}`}>
                        <PanelHead title="Care Team" action="View All" onAction={() => setTab("care_plan")} />
                        <div className="space-y-2 h-[120px] overflow-y-auto pr-1">
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0078d4]/10 text-[10px] font-bold text-[#0078d4]">{journey.doctorName ? journey.doctorName.split(" ").slice(-1)[0][0] : "A"}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-extrabold text-slate-700">{journey.doctorName || encDetails?._doctorName || "Dr. Ahmed Ali"}</div>
                              <div className="text-[10px] text-slate-400 font-bold">Attending Physician</div>
                            </div>
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-600 font-extrabold px-1.5 py-0.5 rounded">Active</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-[10px] font-bold text-emerald-600">{encDetails?.triage?.edited_by_user ? encDetails.triage.edited_by_user.split(" ").slice(-1)[0][0] : "N"}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-extrabold text-slate-700">{encDetails?.triage?.edited_by_user || "Nurse Priya Sharma"}</div>
                              <div className="text-[10px] text-slate-400 font-bold">Triage Clinician</div>
                            </div>
                            <span className="text-[9px] bg-slate-500/10 text-slate-500 font-extrabold px-1.5 py-0.5 rounded">Intake</span>
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>
                )}

                {/* VITALS TAB */}
                {tab === "vitals" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {p360Data?.latest_vitals ? (
                      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                        {[
                          { label: "Blood Pressure", value: p360Data.latest_vitals.bp || "—", unit: "mmHg", color: "#0078d4" },
                          { label: "Heart Rate", value: p360Data.latest_vitals.heart_rate != null ? String(p360Data.latest_vitals.heart_rate) : "—", unit: "bpm", color: "#D13438" },
                          { label: "SpO₂", value: p360Data.latest_vitals.spo2 != null ? `${p360Data.latest_vitals.spo2}%` : "—", unit: "%", color: "#16a34a" },
                          { label: "Temperature", value: p360Data.latest_vitals.temperature != null ? `${p360Data.latest_vitals.temperature}°F` : "—", unit: "°F", color: "#CA5010" },
                          {label: "Resp Rate", value: p360Data.latest_vitals.respiratory_rate != null ? String(p360Data.latest_vitals.respiratory_rate) : "—", unit: "/min", color: "#8764B8" },
                          { label: "Weight", value: p360Data.latest_vitals.weight_kg != null ? String(p360Data.latest_vitals.weight_kg) : "—", unit: "kg", color: "#038387" },
                          { label: "Height", value: p360Data.latest_vitals.height_cm != null ? String(p360Data.latest_vitals.height_cm) : "—", unit: "cm", color: "#0078d4" },
                        ].map((v) => (
                          <div key={v.label} className={`${cardClass} p-3 flex flex-col justify-between h-[100px]`}>
                            <div className="flex items-center justify-between text-slate-500 font-bold text-[11px]">{v.label}</div>
                            <div className="mt-1 flex items-baseline gap-1">
                              <span className="text-[20px] font-extrabold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{v.value}</span>
                              <span className="text-[11px] text-slate-400 font-semibold">{v.unit}</span>
                            </div>
                            <Spark color={v.color} seed={`${v.label}-${v.value}`} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`${cardClass} text-center py-6 text-slate-400 font-semibold`}>No vitals recorded for this visit.</div>
                    )}

                    <div className={`${cardClass} p-4 text-left`}>
                      <PanelHead title="Historical Readings" />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-[11.5px]">
                          <thead>
                            <tr className={th}>
                              <th className={cellHead}>Date &amp; Time</th>
                              <th className={cellHead}>BP</th>
                              <th className={cellHead}>HR</th>
                              <th className={cellHead}>SpO₂</th>
                              <th className={cellHead}>Temp</th>
                              <th className={cellHead}>RR</th>
                              <th className={cellHead}>Weight</th>
                              <th className={cellHead}>Height</th>
                              <th className="pb-1.5 font-bold">Source</th>
                            </tr>
                          </thead>
                          <tbody style={{ fontVariantNumeric: "tabular-nums" }} className="divide-y divide-black/[0.04]">
                            {p360Data?.latest_vitals && (
                              <tr className="border-t border-black/[0.05]">
                                <td className="py-2.5 pr-3 text-slate-700 font-semibold">{p360Data.latest_vitals.captured_ts ? new Date(p360Data.latest_vitals.captured_ts).toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : "Active Visit"}</td>
                                <td className="py-2.5 pr-3 font-bold text-slate-800">{p360Data.latest_vitals.bp || "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.heart_rate || "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.spo2 ? `${p360Data.latest_vitals.spo2}%` : "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.temperature ? `${p360Data.latest_vitals.temperature}°F` : "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.respiratory_rate || "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.weight_kg ? `${p360Data.latest_vitals.weight_kg} kg` : "—"}</td>
                                <td className="py-2.5 pr-3 text-slate-600">{p360Data.latest_vitals.height_cm ? `${p360Data.latest_vitals.height_cm} cm` : "—"}</td>
                                <td className="py-2.5 text-slate-400 font-bold">Encounter Vitals</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* LABS TAB */}
                {tab === "labs" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <OrdersAndLabs encounterId={journey.encounterId} sel={sel} setSel={setSel} doctorName={journey.doctorName} />
                    
                    <div className={`${cardClass} p-4 text-left`}>
                      <PanelHead title="Collected Lab Results" />
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-[11.5px]">
                          <thead>
                            <tr className={th}>
                              <th className={cellHead}>Test</th>
                              <th className={cellHead}>Result</th>
                              <th className={cellHead}>Unit</th>
                              <th className={cellHead}>Reference Range</th>
                              <th className={cellHead}>Status</th>
                              <th className={cellHead}>Trend</th>
                              <th className="pb-1.5 font-bold">Collected On</th>
                            </tr>
                          </thead>
                          <tbody style={{ fontVariantNumeric: "tabular-nums" }} className="divide-y divide-black/[0.04]">
                            {recentLabs.map((l: any, i: number) => {
                              const isAbnormal = l.flag !== "N";
                              const tone = isAbnormal ? "#D13438" : "#16a34a";
                              return (
                                <tr key={i} className="border-t border-black/[0.05]">
                                  <td className="py-2.5 pr-3 font-semibold text-slate-700">{l.test}</td>
                                  <td className="py-2.5 pr-3 font-bold" style={{ color: tone }}>{l.value}</td>
                                  <td className="py-2.5 pr-3 text-slate-500">{l.unit || "—"}</td>
                                  <td className="py-2.5 pr-3 text-slate-500">{l.reference_range || "Normal"}</td>
                                  <td className="py-2.5 pr-3">
                                    <Tag tone={isAbnormal ? "amber" : "green"}>{l.flag === "N" ? "Normal" : l.flag}</Tag>
                                  </td>
                                  <td className="py-2.5 pr-3"><Spark color={tone} /></td>
                                  <td className="py-2.5 text-slate-400">{l.date}</td>
                                </tr>
                              );
                            })}
                            {recentLabs.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-6 text-center text-slate-400 font-medium italic">No lab results found.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* IMAGING TAB */}
                {tab === "imaging" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <OrdersAndLabs encounterId={journey.encounterId} sel={sel} setSel={setSel} doctorName={journey.doctorName} />
                    
                    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr] text-left">
                      <div>
                        <div className="mb-2 text-[12px] font-bold text-slate-700">Imaging Studies ({recentImaging.length})</div>
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {recentImaging.map((im: any, i: number) => (
                            <div key={i} className={`${cardClass} overflow-hidden text-left p-0`}>
                              <div className="grid h-16 place-items-center bg-[linear-gradient(135deg,#1e293b,#0f172a)] text-slate-500"><ScanLine size={18} /></div>
                              <div className="p-2 text-xs">
                                <div className="truncate font-extrabold text-slate-700">{im.test}</div>
                                <div className="text-[9.5px] text-slate-400">{im.date}</div>
                                <div className="mt-1"><Tag tone="amber">Abnormal</Tag></div>
                              </div>
                            </div>
                          ))}
                          {recentImaging.length === 0 && <div className="text-slate-400 font-medium italic py-6 col-span-3 text-center">No imaging records.</div>}
                        </div>
                      </div>
                      
                      <div className={`${cardClass} p-3`}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-[12px] font-bold text-slate-700">{recentImaging[0]?.test || "DICOM Viewer"}</span>
                        </div>
                        <div className="grid h-32 place-items-center rounded-lg bg-[linear-gradient(135deg,#1e293b,#0f172a)] text-slate-400"><Activity size={24} /></div>
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-[11px] leading-snug text-slate-600">
                          AI Pathology findings suggest chest/angio monitoring indicators.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MEDICATIONS TAB */}
                {tab === "medications" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <Prescription 
                      encounterId={journey.encounterId}
                      items={rxItems}
                      setItems={setRxItems}
                      cds={cds}
                      setCds={setCds}
                      rxId={rxId}
                      setRxId={setRxId}
                      busy={rxBusy}
                      done={rxDone}
                      setDone={setRxDone}
                      err={rxErr}
                      setErr={setRxErr}
                      runCds={runCds}
                      approveNoMeds={approveNoMeds}
                      onDischarged={handleResetJourney}
                    />
                  </div>
                )}

                {/* PROCEDURES TAB */}
                {tab === "procedures" && (
                  <div className={`${cardClass} py-8 text-center animate-in fade-in duration-200`}>
                    <div className="text-slate-400 font-semibold italic">No surgical or clinical procedures recorded during this encounter.</div>
                  </div>
                )}

                {/* DOCUMENTS TAB */}
                {tab === "documents" && (
                  <div className={`${cardClass} space-y-4 animate-in fade-in duration-200`}>
                    <div className="flex justify-between items-center pb-2 border-b border-black/[0.04]">
                      <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                        <FileText size={16} className="text-[#0078d4]" /> Uploaded Patient Reports
                      </h4>
                      <Tag tone="blue">{p360Data?.documents?.length || 0} reports</Tag>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {p360Data?.documents?.map((d: any) => (
                        <div 
                          key={d.document_id} 
                          onClick={() => setSelectedDoc(d)}
                          className="flex items-start gap-3 rounded-xl border border-black/[0.05] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] text-xs text-left cursor-pointer hover:bg-slate-50 hover:border-[#0078d4]/30 transition shadow-sm"
                        >
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#0078d4]/10 text-[#0078d4]"><FileText size={16} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="font-extrabold text-slate-700 leading-tight truncate">{d.title}</div>
                            <div className="mt-1 text-[10px] text-slate-400 font-semibold">{d.date} · {d.doc_type}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CARE PLAN TAB */}
                {tab === "care_plan" && (
                  <div className={`${cardClass} py-6 text-left space-y-4 animate-in fade-in duration-200`}>
                    <div className="text-[12.5px] font-extrabold text-slate-800 mb-2 border-b border-black/[0.04] pb-1">Care Plan Progress</div>
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between font-semibold mb-1"><span className="text-slate-700">Improve cardiac function</span><span className="text-slate-500">75%</span></div>
                        <Bar pct={75} tone="#0078d4" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ENCOUNTERS TAB */}
                {tab === "encounters" && (
                  <div className={`${cardClass} space-y-3 animate-in fade-in duration-200`}>
                    <div className="flex justify-between items-center pb-2 border-b border-black/[0.04] text-left">
                      <h4 className="font-extrabold text-slate-800 text-sm">Historical Encounters</h4>
                    </div>
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                      {p360Data?.encounters?.filter((e: any) => e.encounter_id !== journey.encounterId && e.status === "DISCHARGED").map((e: any) => (
                        <HistoricalVisitDropdown key={e.encounter_id} encounter={e} />
                      ))}
                    </div>
                  </div>
                )}

                {/* NOTES TAB */}
                {tab === "notes" && (
                  <div className="space-y-4 animate-in fade-in duration-200 text-left">
                    <div className={`${cardClass} space-y-3`}>
                      <PanelHead title="Consultation Advice &amp; Notes Editor" />
                      <textarea
                        className="input w-full p-3 border border-black/[0.08] bg-white rounded-xl text-xs outline-none focus:border-[#0078d4]"
                        rows={4}
                        value={adviceNotes}
                        onChange={(e) => { setAdviceNotes(e.target.value); setNotesSuccess(false); }}
                        placeholder="Enter active clinical advice..."
                      />
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={handleSaveNotes} disabled={savingNotes} className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white font-extrabold px-4 py-2 rounded-xl text-xs">
                          {savingNotes ? "Saving..." : "Save Notes"}
                        </button>
                      </div>
                    </div>

                    <AmbientSoap encounterId={journey.encounterId} doctorName={journey.doctorName} />
                  </div>
                )}
              </div>
              </>
            )}
            </div>

            {/* Bottom Row Grid: Digital Twin, Tasks Checklist, Activity Feed */}
            <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr] mt-4">
              {/* Digital Twin */}
              <div className={`${cardClass} p-3.5`}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12.5px] font-bold text-[#0c3b63]">Hospital Digital Twin – Live View</h3>
                  <button type="button" className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2 py-1 text-[10.5px] font-semibold text-slate-500">Floor 3 - ICU <ChevronDown size={12} /></button>
                </div>
                <div className="relative grid h-[190px] place-items-center overflow-hidden rounded-xl border border-black/[0.06] bg-[linear-gradient(135deg,#eef3f9,#f7f5f1)] shadow-inner">
                  <Building2 size={54} className="text-slate-200" />
                  <div className="absolute left-1/2 top-1/2 w-[168px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#0078d4]/40 bg-white/95 p-2 shadow-lg text-left">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">ICU-07 <ExternalLink size={11} className="text-slate-400" /></div>
                    <div className="text-[10.5px] text-slate-500">{journey.patientName}</div>
                    <div className="text-[10px] text-slate-400">{encDetails?.patient?.gender}, {encDetails?.patient?.age} Y · NSTEMI</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-emerald-600">Status: Stable</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  {[["#16a34a", "Available"], ["#D13438", "Occupied"], ["#0078d4", "In Use"], ["#94a3b8", "Out of Service"]].map(([c, l]) => (
                    <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full inline-block" style={{ background: c }} />{l}</span>
                  ))}
                </div>
              </div>

              {/* My Tasks Checklist */}
              <div className={`${cardClass} p-3.5 flex flex-col justify-between`}>
                <div>
                  <PanelHead title="My Tasks" />
                  <div className="space-y-3.5 text-left">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={task1Checked} onChange={(e) => setTask1Checked(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-[#0078d4]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-medium text-slate-700 ${task1Checked ? "line-through text-slate-400" : ""}`}>Review 3 Critical Labs</span>
                        <span className="text-[10px] text-slate-400 font-bold">ICU · 18 min ago</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={task2Checked} onChange={(e) => setTask2Checked(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-[#0078d4]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-medium text-slate-700 ${task2Checked ? "line-through text-slate-400" : ""}`}>Sign 4 Pending Orders</span>
                        <span className="text-[10px] text-slate-400 font-bold">OPD · 25 min ago</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={task3Checked} onChange={(e) => setTask3Checked(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-[#0078d4]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-medium text-slate-700 ${task3Checked ? "line-through text-slate-400" : ""}`}>Discharge Summary – {journey.patientName}</span>
                        <span className="text-[10px] text-slate-400 font-bold">ICU-07 · 35 min ago</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={task4Checked} onChange={(e) => setTask4Checked(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-[#0078d4]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[12px] font-medium text-slate-700 ${task4Checked ? "line-through text-slate-400" : ""}`}>Follow up: 2 Patients</span>
                        <span className="text-[10px] text-slate-400 font-bold">OPD · 1 hour ago</span>
                      </span>
                    </label>
                  </div>
                </div>
                <button type="button" className="mx-auto mt-2.5 block text-[11px] font-semibold text-[#0078d4] hover:underline">View All Tasks</button>
              </div>

              {/* Recent Activity Feed */}
              <div className={`${cardClass} p-3.5`}>
                <PanelHead title="Recent Activity Feed" action="View All" />
                <div className="space-y-2.5 text-left">
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[#0078d4]"><User size={13} /></span>
                    <div className="text-[11.5px] leading-snug">
                      <span className="font-semibold text-slate-700">Dr. Sara Malik</span> <span className="text-slate-500">added a note for {journey.patientName}</span>
                      <div className="text-[10px] text-slate-400">2 min ago</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[#0078d4]"><FlaskConical size={13} /></span>
                    <div className="text-[11.5px] leading-snug">
                      <span className="font-semibold text-slate-700">Lab result</span> <span className="text-rose-600">(Troponin I) is Abnormal</span>
                      <div className="text-[10px] text-slate-400">5 min ago</div>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[#0078d4]"><Activity size={13} /></span>
                    <div className="text-[11.5px] leading-snug">
                      <span className="font-semibold text-slate-700">Nurse Priya</span> <span className="text-slate-500">updated vitals for ICU-07</span>
                      <div className="text-[10px] text-slate-400">10 min ago</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Right side AI Copilot Panel */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start min-w-0">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            <Sparkles size={12} className="text-[#0078d4]" /> AI Copilot
          </div>
          
          <CopilotSidepane 
            patientId={journey.patientId} 
            tab={tab}
            encounterId={journey.encounterId}
            chiefComplaint={journey.chiefComplaint}
            sel={sel}
            toggle={toggleTest}
            suggestions={suggestions}
            loadingSuggestions={loadingSuggestions}
            onGetSuggestions={() => getSuggestions(journey.encounterId!)}
            
            rxItems={rxItems}
            setRxItems={setRxItems}
            cds={cds}
            setCds={setCds}
            rxId={rxId}
            rxBusy={rxBusy}
            rxAccept={rxAccept}
            setRxAccept={setRxAccept}
            rxOverride={rxOverride}
            setRxOverride={setRxOverride}
            rxDone={rxDone}
            rxErr={rxErr}
            approveRx={approve}
            runCds={runCds}
          />
        </div>
      </div>

      {/* Intake Audit History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl p-6 shadow-2xl space-y-4 bg-white backdrop-blur-lg border border-black/15 text-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-lg font-extrabold flex items-center gap-2 text-slate-800">
                <History className="text-[#0078d4]" size={20} /> Clinical Complaint Audit History
              </h3>
              <button 
                onClick={() => setShowHistoryModal(false)}
                className="border border-black/[0.08] hover:bg-slate-50 py-1 px-2.5 text-xs font-bold rounded-lg text-slate-400"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3.5 rounded-xl bg-[#0078d4]/5 border border-[#0078d4]/10">
                <div className="font-bold text-xs text-slate-400">Current Active Clinical Complaint (Triage Assessment):</div>
                <div className="text-sm font-extrabold mt-1 text-[#0078d4]">
                  {encDetails?.triage?.chief_complaint || journey.chiefComplaint || "No complaint recorded"}
                </div>
              </div>

              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                <h4 className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Audit Timeline & Version Edits</h4>

                {/* Patient Original Entry */}
                <div className="p-3 rounded-xl bg-white border border-black/[0.05] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-600 flex items-center gap-1.5 text-xs">
                      👤 Patient Intake (Initial Booking)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">Version 1</span>
                  </div>
                  <div className="text-xs mt-1 text-slate-600">
                    <b>Entered:</b> "{encDetails?.patient_original_reason || encDetails?.notes || "Initial Intake"}"
                  </div>
                </div>

                {/* Triage & Audit Logs */}
                {encDetails?.audit_logs?.map((log: any, idx: number) => (
                  <div key={log.audit_id || idx} className="p-3 rounded-xl bg-white border border-black/[0.05] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-600 flex items-center gap-1.5 text-xs">
                        {log.edited_by_role === "NURSE" ? "🩺 Nurse Triage Edit" : "👨‍⚕️ Clinician Edit"}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {log.created_ts ? new Date(log.created_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `Version ${idx + 2}`}
                      </span>
                    </div>
                    {log.old_value && (
                      <div className="text-[11px] line-through text-slate-400">
                        <b>Previous:</b> "{log.old_value}"
                      </div>
                    )}
                    <div className="text-xs font-semibold text-[#0078d4]">
                      <b>Updated To:</b> "{log.new_value}"
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Edited by: <b>{log.edited_by_user || log.edited_by_role}</b>
                    </div>
                  </div>
                ))}

                {(!encDetails?.audit_logs || encDetails.audit_logs.length === 0) && (
                  <div className="p-4 rounded-xl text-center text-xs bg-slate-50 border border-black/[0.04] text-slate-400">
                    No triage modifications recorded for this visit. Intake complaint matches patient's initial self-reported reason.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 text-right">
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white font-bold text-xs py-1.5 px-4 rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSelectedDoc(null)}>
          <div 
            className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-black/15 flex flex-col text-slate-800 shadow-[0_20px_40px_rgba(0,0,0,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-black/10 px-5 py-4 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#0078d4]/10 text-[#0078d4] shrink-0">
                  <FileText size={16} />
                </div>
                <div className="text-left min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-800 truncate">{selectedDoc.title}</h3>
                  <p className="text-[10px] text-slate-400 font-bold">{selectedDoc.date} · {selectedDoc.doc_type}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDoc(null)}
                className="border border-black/[0.08] hover:bg-slate-100 py-1 px-2.5 text-xs font-bold rounded-lg text-slate-400 transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 bg-slate-100 overflow-y-auto max-h-[70vh] min-h-[500px]">
              <iframe 
                src={selectedDoc.uri} 
                title={selectedDoc.title}
                className="w-full h-[550px] rounded-xl bg-white border border-black/[0.08]"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-black/10 px-5 py-3.5 bg-slate-50">
              <span className="text-[10.5px] text-slate-400 font-semibold truncate">
                💡 Document URL: <a href={selectedDoc.uri} target="_blank" rel="noopener noreferrer" className="text-[#0078d4] hover:underline font-bold">{selectedDoc.uri}</a>
              </span>
              <div className="flex gap-2">
                <a 
                  href={selectedDoc.uri} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white-force font-bold text-xs py-1.5 px-4 rounded-lg inline-flex items-center gap-1.5 shadow-[0_2px_8px_rgba(0,120,212,0.15)] transition"
                >
                  Open in New Tab
                </a>
                <button 
                  onClick={() => setSelectedDoc(null)}
                  className="bg-white hover:bg-slate-150 border border-black/[0.08] text-slate-650 font-bold text-xs py-1.5 px-4 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
