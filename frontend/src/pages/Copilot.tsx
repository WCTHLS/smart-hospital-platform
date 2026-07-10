import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, FileText, FlaskConical, Pill, Receipt, CheckCircle2, Mic, Plus, Trash2, BadgeCheck,
  Stethoscope, Clock, MapPin, User, ArrowRight, Activity, Users, Clipboard, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useJourney } from "../lib/store";
import { Card, Tag, AgentBadge, Wave, SectionTitle, Empty } from "../components/ui";

const TABS = [
  { id: "p360", label: "Patient 360", icon: FileText },
  { id: "soap", label: "Ambient SOAP", icon: Mic },
  { id: "labs", label: "Orders & Labs", icon: FlaskConical },
  { id: "rx", label: "Prescription", icon: Pill },
  { id: "bill", label: "Billing & Discharge", icon: Receipt },
] as const;

export default function Copilot() {
  const nav = useNavigate();
  const journey = useJourney();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("p360");
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => {
    return localStorage.getItem("selected_doctor_id") || "";
  });
  const [queueTab, setQueueTab] = useState<"first" | "reconsult">("first");

  const [sel, setSel] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const toggleTest = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

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

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: api.doctors,
  });

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["doctor-queue", selectedDoctorId],
    queryFn: () => api.doctorEncounters(selectedDoctorId),
    enabled: !!selectedDoctorId,
    refetchInterval: 5000,
  });

  const [pin, setPin] = useState("");
  const [unlockedDoctorId, setUnlockedDoctorId] = useState<string>(() => {
    return sessionStorage.getItem("unlocked_doctor_id") || "";
  });
  const [pinError, setPinError] = useState("");
  const [verifyingPin, setVerifyingPin] = useState(false);

  const handleSelectDoctor = (id: string) => {
    setSelectedDoctorId(id);
    localStorage.setItem("selected_doctor_id", id);
    setPin("");
    setPinError("");
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !pin) return;
    setVerifyingPin(true);
    setPinError("");
    try {
      await api.verifyDoctorPin(selectedDoctorId, pin);
      setUnlockedDoctorId(selectedDoctorId);
      sessionStorage.setItem("unlocked_doctor_id", selectedDoctorId);
    } catch (err: any) {
      setPinError(err.message || "Incorrect PIN code. Access denied.");
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLogoutDoctor = () => {
    setUnlockedDoctorId("");
    sessionStorage.removeItem("unlocked_doctor_id");
    setPin("");
    setPinError("");
  };

  const handleSelectPatient = (enc: any) => {
    setSel([]);
    setSuggestions([]);
    journey.set({
      patientId: enc.patient.patient_id,
      encounterId: enc.encounter_id,
      patientName: enc.patient.name,
      token: enc.token?.number || null,
      department: enc.visit_type || null,
      chiefComplaint: enc.triage?.chief_complaint || null,
    });
  };

  const handleResetJourney = () => {
    setSel([]);
    setSuggestions([]);
    journey.reset();
  };

  if (!journey.encounterId || !journey.patientId) {
    const activeDoc = doctors?.find((d: any) => d.doctor_id === selectedDoctorId);
    
    return (
      <div className="space-y-6">
        {/* Header Profile Selection */}
        <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
              <Stethoscope size={22} className="text-[var(--cyan)]" /> Doctor Portal Login
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--muted)" }}>
              Select your clinical profile to view your active patient queue and consultation schedules.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <User size={15} color="var(--dim)" />
              <select
                value={selectedDoctorId}
                onChange={(e) => handleSelectDoctor(e.target.value)}
                className="input !py-1.5 !px-3 !w-auto text-[13.5px] font-bold"
                style={{ background: "var(--panel)", borderColor: "var(--glass-border)", color: "#dce9ff" }}
              >
                <option value="">-- Choose Doctor Profile --</option>
                {doctors?.map((doc: any) => (
                  <option key={doc.doctor_id} value={doc.doctor_id}>
                    {doc.name} ({doc.specialty})
                  </option>
                ))}
              </select>
            </div>
            {selectedDoctorId && selectedDoctorId === unlockedDoctorId && (
              <button 
                onClick={handleLogoutDoctor} 
                className="btn ghost !py-1.5 !px-2.5 text-xs text-red-400 hover:text-red-300 font-bold"
              >
                🔒 Lock
              </button>
            )}
          </div>
        </Card>

        {/* PIN Login Form if locked */}
        {selectedDoctorId && selectedDoctorId !== unlockedDoctorId && (
          <div className="max-w-[440px] mx-auto py-8">
            <Card className="space-y-4 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.06), transparent)" }}>
              <div className="flex flex-col items-center text-center space-y-2 pb-2">
                <div className="w-12 h-12 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 flex items-center justify-center text-[var(--cyan)]">
                  <User size={24} />
                </div>
                <h3 className="font-extrabold text-[15px] text-slate-100">
                  {activeDoc?.name}
                </h3>
                <p className="text-[12px] text-[var(--muted)]">
                  {activeDoc?.specialty} · Room {activeDoc?.room} ({activeDoc?.floor})
                </p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="block font-bold text-slate-300 text-center">Enter Access PIN Code</label>
                  <input
                    type="password"
                    placeholder="••••"
                    className="input text-center text-lg font-bold tracking-widest font-mono py-2"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {pinError && (
                  <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-1.5 justify-center">
                    <ShieldAlert size={14} />
                    <span>{pinError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifyingPin}
                  className="btn w-full font-bold py-2 animate-pulse"
                  style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
                >
                  {verifyingPin ? "Verifying..." : "Unlock Workspace"}
                </button>
              </form>
            </Card>
          </div>
        )}

        {/* Patient Queue */}
        {selectedDoctorId && selectedDoctorId === unlockedDoctorId ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="grad-text text-lg font-extrabold flex items-center gap-2">
                <Users size={18} /> Active Patient Queue
              </h3>
              <span className="live">LIVE REFRESH</span>
            </div>

            {/* Queue Tab Switcher */}
            <div className="flex gap-2 p-1 bg-white/[0.02] border border-white/5 rounded-xl w-fit">
              <button
                onClick={() => setQueueTab("first")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  queueTab === "first"
                    ? "bg-white/10 text-white"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                First Consultation ({queue?.filter((e: any) => !e.is_reconsult).length || 0})
              </button>
              <button
                onClick={() => setQueueTab("reconsult")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  queueTab === "reconsult"
                    ? "bg-white/10 text-white"
                    : "text-[var(--muted)] hover:text-white"
                }`}
              >
                Report Review ({queue?.filter((e: any) => e.is_reconsult).length || 0})
                {queue?.some((e: any) => e.is_reconsult) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
                )}
              </button>
            </div>

            {(() => {
              const filteredQueue = queue?.filter((enc: any) => 
                queueTab === "reconsult" ? enc.is_reconsult : !enc.is_reconsult
              ) || [];

              if (filteredQueue.length === 0) {
                return (
                  <Empty>
                    {queueTab === "reconsult" 
                      ? "No patients waiting for report review." 
                      : "No patients waiting in your queue."}
                  </Empty>
                );
              }

              return (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filteredQueue.map((enc: any) => {
                    const acuity = enc.triage?.acuity || "4";
                    const isRedFlag = enc.triage?.red_flag;
                    const tagTone = acuity === "1" ? "red" : acuity === "2" ? "red" : acuity === "3" ? "amber" : "blue";

                    return (
                      <Card 
                        key={enc.encounter_id} 
                        className={`hover-border relative overflow-hidden flex flex-col justify-between h-full transition ${
                          isRedFlag ? "border-red-500/30" : ""
                        }`}
                        style={{ border: isRedFlag ? "1px solid rgba(239, 68, 68, 0.4)" : "" }}
                      >
                        {/* Priority Aura */}
                        {isRedFlag && (
                          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />
                        )}

                        <div className="space-y-2">
                          {/* Token & Priority Badge */}
                          <div className="flex justify-between items-start">
                            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--dim)" }}>
                              Token: <b className="text-white text-base">{enc.token?.number || "—"}</b>
                            </span>
                            <Tag tone={tagTone}>
                              ESI {acuity} {isRedFlag ? "· RED FLAG" : ""}
                            </Tag>
                          </div>

                          {/* Patient Name */}
                          <div>
                            <h4 className="text-base font-extrabold" style={{ color: "#dce9ff" }}>
                              {enc.patient?.name}
                            </h4>
                            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                              {enc.patient?.age} yrs · {enc.patient?.gender} · {enc.patient?.mobile}
                            </p>
                          </div>

                          {/* Chief Complaint */}
                          <div className="holo p-2 text-[12px] whitespace-pre-line" style={{ color: "#bcd2ff" }}>
                            <b>Chief Complaint:</b><br />
                            {enc.triage?.chief_complaint || "Routine consultation."}
                          </div>

                          {/* Room/Location info */}
                          {enc.token?.room && (
                            <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--dim)" }}>
                              <MapPin size={12} color="var(--cyan)" />
                              <span>{enc.token.room} ({enc.token.floor})</span>
                              {enc.token.eta_minutes != null && <span className="ml-auto">Est: ~{enc.token.eta_minutes}m</span>}
                            </div>
                          )}
                        </div>

                        {/* Action Button */}
                        <button 
                          onClick={() => handleSelectPatient(enc)}
                          className={`btn mt-4 w-full flex items-center justify-center gap-1.5 ${isRedFlag ? "r" : ""}`}
                        >
                          Consult Patient <ArrowRight size={14} />
                        </button>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : (
          <Card className="text-center py-10">
            <Stethoscope size={48} className="mx-auto text-[var(--dim)] opacity-40 mb-3" />
            <h3 className="font-bold text-base" style={{ color: "#d7e5ff" }}>Select Profile to Begin</h3>
            <p className="text-[13px] max-w-md mx-auto mt-1" style={{ color: "var(--muted)" }}>
              Please select your doctor name from the dropdown above to retrieve your scheduled queue.
            </p>
          </Card>
        )}
      </div>
    );
  }

  const showSidepane = true;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="grad-text text-2xl font-extrabold">{journey.patientName}</h1>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
            <Tag tone="green">ABHA verified</Tag>
            {journey.department && <Tag tone="blue">{journey.department}</Tag>}
            {journey.token && <Tag tone="violet">Token {journey.token}</Tag>}
            {journey.chiefComplaint && (
              <span className="text-slate-300 ml-2">
                Reason for Visit: <b className="text-[var(--cyan)]">{journey.chiefComplaint}</b>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (confirm("Are you sure you want to complete the consultation and discharge this patient?")) {
                try {
                  await api.discharge(journey.encounterId!);
                  handleResetJourney();
                  refetchQueue();
                } catch (err: any) {
                  alert(err?.message || "Failed to discharge patient.");
                }
              }
            }}
            className="btn text-[12.5px] !py-1.5 !px-3 font-bold"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "white" }}
          >
            ✓ Complete &amp; Discharge
          </button>
          <button 
            className="btn ghost text-[12.5px] !py-1.5 !px-3 font-bold" 
            onClick={handleResetJourney}
          >
            ← Back to Patient Queue
          </button>
          <span className="ai-badge"><Mic size={13} /> Copilot session</span>
        </div>
      </div>

      {/* Outer Grid Layout (Workflow + Copilot Pane) */}
      <div className={showSidepane ? "grid gap-4 lg:grid-cols-[1fr_380px]" : "space-y-4"}>
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
                style={{
                  color: tab === t.id ? "#eafcff" : "var(--muted)",
                  background: tab === t.id ? "linear-gradient(90deg, rgba(52,225,232,.18), rgba(167,139,250,.18))" : "var(--panel)",
                  border: `1px solid ${tab === t.id ? "var(--line2)" : "var(--glass-border)"}`,
                }}>
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          <div className={tab === "p360" ? "" : "hidden"} key={`360-${journey.patientId}`}>
            <Patient360 patientId={journey.patientId} />
          </div>
          <div className={tab === "soap" ? "" : "hidden"} key={`soap-${journey.encounterId}`}>
            <Ambient encounterId={journey.encounterId} />
          </div>
          <div className={tab === "labs" ? "" : "hidden"} key={`labs-${journey.encounterId}`}>
            <Labs encounterId={journey.encounterId!} sel={sel} setSel={setSel} toggle={toggleTest} />
          </div>
          <div className={tab === "rx" ? "" : "hidden"} key={`rx-${journey.encounterId}`}>
            <Rx encounterId={journey.encounterId} refetchQueue={refetchQueue} />
          </div>
          <div className={tab === "bill" ? "" : "hidden"} key={`bill-${journey.encounterId}`}>
            <Billing encounterId={journey.encounterId} />
          </div>
        </div>

        {showSidepane && (
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <CopilotSidepane 
              patientId={journey.patientId} 
              tab={tab}
              encounterId={journey.encounterId}
              sel={sel}
              toggle={toggleTest}
              suggestions={suggestions}
              loadingSuggestions={loadingSuggestions}
              onGetSuggestions={() => getSuggestions(journey.encounterId!)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface SidepaneProps {
  patientId: string;
  tab: string;
  encounterId: string | null;
  sel: string[];
  toggle: (t: string) => void;
  suggestions: any[];
  loadingSuggestions: boolean;
  onGetSuggestions: () => void;
}

/* ------------------------------------------------------------------ Copilot Sidepane */
function CopilotSidepane({
  patientId,
  tab,
  encounterId,
  sel,
  toggle,
  suggestions,
  loadingSuggestions,
  onGetSuggestions,
}: SidepaneProps) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["p360", patientId],
    queryFn: () => api.patient360(patientId),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <Card className="text-center py-6 text-xs text-[var(--dim)]">Loading Copilot context...</Card>;
  if (!data) return null;

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.generateSummary(patientId);
      qc.invalidateQueries({ queryKey: ["p360", patientId] });
    } finally {
      setGenerating(false);
    }
  }

  const summaryText = data.ai_summary?.result?.summary;

  return (
    <div className="space-y-3">
      {tab === "labs" ? (
        /* AI Suggested Orders Banner in place of Clinical Summary */
        <Card className="border border-dashed border-[var(--cyan)]/25 relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.08), transparent)" }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> AI Suggested Orders
            </div>
            <AgentBadge label="AI" />
          </div>
          {suggestions.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>Click below to query Gemini AI for clinically indicated diagnostics.</p>
              <button 
                onClick={onGetSuggestions} 
                disabled={loadingSuggestions} 
                className="btn w-full !py-1 text-xs font-bold"
                style={{ background: "rgba(52,225,232,0.08)", border: "1px solid rgba(52,225,232,0.25)", color: "var(--cyan)" }}
              >
                {loadingSuggestions ? "Consulting AI..." : "Get AI Suggestions"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-[12.5px]">
              {suggestions.map((s: any, idx: number) => {
                const isSelected = sel.includes(s.test);
                return (
                  <div key={idx} className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200">{s.test}</span>
                      <button
                        onClick={() => toggle(s.test)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded transition ${
                          isSelected
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
                        }`}
                      >
                        {isSelected ? "Selected" : "Add to Order"}
                      </button>
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] leading-relaxed">
                      {s.reason}
                    </div>
                  </div>
                );
              })}
              <button 
                onClick={onGetSuggestions} 
                disabled={loadingSuggestions} 
                className="text-[11px] text-[var(--cyan)] hover:underline block mt-2 text-right w-full"
              >
                {loadingSuggestions ? "Refreshing..." : "↻ Refresh Suggestions"}
              </button>
            </div>
          )}
        </Card>
      ) : (
        /* AI Summary Banner */
        <Card className="relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.08), transparent)" }}>
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> AI Clinical Summary
            </div>
            {summaryText && (
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="text-[9px] text-[var(--cyan)] hover:text-cyan-300 font-bold uppercase tracking-wider transition disabled:opacity-50"
              >
                {generating ? "Updating..." : "↻ Refresh"}
              </button>
            )}
          </div>
          
          {summaryText ? (
            <p className="text-[11.5px] leading-relaxed text-[#d2e2ff] whitespace-pre-line">
              {summaryText}
            </p>
          ) : (
            <div className="text-center py-1">
              <p className="text-[11px] text-[var(--muted)] mb-2">History summary has not been generated yet.</p>
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="btn text-[11px] !py-1 !px-2.5 w-full justify-center"
              >
                {generating ? "Generating..." : "Generate AI Summary"}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Allergies & Alerts */}
      <Card className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Allergies & Alerts</div>
        {data.allergies.length ? data.allergies.map((a: any) => (
          <div key={a.substance} className="inline-block mr-1.5"><Tag tone="red">⚠ {a.substance}</Tag></div>
        )) : <div className="text-[11px] text-[var(--muted)]">No known allergies</div>}
      </Card>

      {/* Used/Active Medications */}
      <Card className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Active Medications</div>
        {data.active_medications.length ? (
          <ul className="space-y-1 text-[11.5px]" style={{ color: "var(--muted)" }}>
            {data.active_medications.map((m: string, i: number) => <li key={i}>• {m}</li>)}
          </ul>
        ) : <div className="text-[11px] text-[var(--muted)]">None recorded</div>}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Historical Visit Dropdown */
function HistoricalVisitDropdown({ encounter }: { encounter: any }) {
  const [open, setOpen] = useState(false);

  // Fetch full details of selected encounter dynamically
  const { data: details, isLoading } = useQuery({
    queryKey: ["encounter-details", encounter.encounter_id],
    queryFn: () => api.encounter(encounter.encounter_id),
    enabled: open,
  });

  return (
    <div className="border rounded-xl transition" style={{ borderColor: "var(--glass-border)", background: open ? "rgba(255,255,255,0.015)" : "transparent" }}>
      <button 
        onClick={() => setOpen(!open)}
        className="w-full text-left p-2 flex items-center justify-between text-xs font-semibold hover:bg-white/5 rounded-xl transition"
      >
        <div className="truncate">
          <span className="text-white font-bold">{encounter.date}</span>
          <span className="text-[var(--dim)] ml-1.5">· {encounter.department}</span>
        </div>
        <span className="text-[var(--cyan)] font-bold text-[13px] ml-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="p-3 border-t border-[var(--glass-border)] space-y-3 text-[11px] leading-relaxed">
          {isLoading ? (
            <div className="text-center py-2 text-[var(--dim)]">Retrieving raw EMR records...</div>
          ) : details ? (
            <>
              {/* Vitals */}
              {details.vitals ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Vitals:</div>
                  <div className="grid grid-cols-3 gap-1 text-[10.5px]">
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>BP</small><br /><b>{details.vitals.bp}</b></div>
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b>{details.vitals.spo2}%</b></div>
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>Temp</small><br /><b>{details.vitals.temperature}°F</b></div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Vitals:</div>
                  <span className="text-[var(--muted)]">No vitals captured.</span>
                </div>
              )}

              {/* SOAP Note Text */}
              {details.note ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Clinical Note (SOAP):</div>
                  <div className="p-2 rounded bg-white/5 border border-white/5 text-[10.5px] whitespace-pre-line text-slate-300">
                    {details.note.final_text}
                  </div>
                  {details.note.icd10_codes?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {details.note.icd10_codes.map((icd: any) => (
                        <span key={icd.code} className="text-[9.5px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                          {icd.code}: {icd.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Clinical Note (SOAP):</div>
                  <span className="text-[var(--muted)]">Not documented or pending.</span>
                </div>
              )}

              {/* Prescription Items */}
              {details.prescription && details.prescription.items?.length > 0 ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Prescribed Medications:</div>
                  <ul className="list-disc list-inside text-[var(--muted)] space-y-0.5 text-[10.5px]">
                    {details.prescription.items.map((item: any, idx: number) => (
                      <li key={idx}>
                        <span className="text-slate-300 font-medium">{item.drug_name}</span> ({item.dose}) — <span className="italic">{item.frequency}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Prescribed Medications:</div>
                  <span className="text-[var(--muted)]">No medications prescribed.</span>
                </div>
              )}

              {/* Lab Results */}
              {details.labs?.length > 0 ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Lab Results:</div>
                  <div className="space-y-1">
                    {details.labs.map((o: any) => (
                      <div key={o.lab_order_id} className="p-1.5 border border-white/5 rounded bg-white/5">
                        <div className="font-semibold text-slate-300 text-[10.5px]">{o.test}</div>
                        {o.results?.map((r: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[10px] mt-0.5 text-[var(--muted)]">
                            <span>• {r.analyte}</span>
                            <span className={r.flag !== "N" ? "text-amber-400 font-bold" : ""}>
                              {r.value} {r.unit} {r.flag !== "N" ? `(${r.flag})` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-center text-red-400">Failed to load visit details.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Patient 360 */
function Patient360({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["p360", patientId], queryFn: () => api.patient360(patientId), retry: false,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <Card>Loading record…</Card>;
  if (error) {
    return (
      <Card className="space-y-3">
        <div className="alertbox">Consent required to read this record.</div>
        <button className="btn" onClick={async () => { await api.consent(patientId); qc.invalidateQueries({ queryKey: ["p360", patientId] }); }}>
          Capture consent &amp; assemble Patient 360
        </button>
      </Card>
    );
  }
  const flag = (f: string) => (f === "N" ? "green" : f === "H" || f === "L" ? "amber" : "red");
  return (
    <div className="space-y-4">
      {/* Latest Vitals Card at the Top */}
      <Card>
        <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Latest vitals</h4>
        {data.latest_vitals ? (
          <div className="grid grid-cols-4 gap-3 text-[13px]">
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Blood Pressure</small><br /><b className="text-[15px]">{data.latest_vitals.bp}</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b className="text-[15px]">{data.latest_vitals.spo2}%</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Heart Rate</small><br /><b className="text-[15px]">{data.latest_vitals.heart_rate} bpm</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Temperature</small><br /><b className="text-[15px]">{data.latest_vitals.temperature}°F</b></div>
          </div>
        ) : <Empty>No vitals captured yet for this patient.</Empty>}
      </Card>

      {/* Side-by-Side balanced layout for wider displays */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Column 1: Recent Results */}
        <Card className="flex flex-col h-full">
          <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Recent results</h4>
          <div className="flex-1 overflow-auto">
            {data.recent_results.length ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: "var(--dim)" }} className="border-b border-[var(--glass-border)]">
                    <th className="text-left pb-2">Analyte</th>
                    <th className="text-left pb-2">Value</th>
                    <th className="text-left pb-2">Flag</th>
                    <th className="text-left pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.recent_results.map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-medium text-slate-300">{r.analyte}</td>
                      <td className="py-2.5">{r.value} {r.unit}</td>
                      <td className="py-2.5"><Tag tone={flag(r.flag)}>{r.flag}</Tag></td>
                      <td className="py-2.5" style={{ color: "var(--dim)" }}>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No results</Empty>}
          </div>
        </Card>

        {/* Column 2: Previous visit records (Raw history) */}
        <Card className="flex flex-col h-full">
          <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Previous visit records (Raw history)</h4>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {data.encounters.map((e: any) => (
              <HistoricalVisitDropdown key={e.encounter_id} encounter={e} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Ambient SOAP */
function Ambient({ encounterId }: { encounterId: string }) {
  const [transcript, setTranscript] = useState(
    "Patient has fever and productive cough for three days with mild breathlessness. On examination temperature 101.2°F, chest with scattered crepitations, no chest pain."
  );
  const [draft, setDraft] = useState<any>(null);
  const [finalText, setFinalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  async function generate() {
    setBusy(true); setApproved(false);
    try {
      const r = await api.ambient(encounterId, transcript);
      setDraft(r); setFinalText(r.result.draft_text);
    } finally { setBusy(false); }
  }
  async function approve() {
    setBusy(true);
    try {
      await api.approveNote(draft.note_id, { final_text: finalText, icd10_codes: draft.result.icd10, approved_by: "Dr. Mehta" });
      setApproved(true);
    } finally { setBusy(false); }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold" style={{ color: "#d7e5ff" }}>Consultation transcript</h4>
          <span className="flex items-center gap-2"><Wave /> <span className="live">REC</span></span>
        </div>
        <textarea className="input" rows={7} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        <button className="btn mt-3 w-full" disabled={busy} onClick={generate}>
          <Mic size={15} /> {busy ? "Transcribing…" : "Generate SOAP draft"}
        </button>
      </Card>
      <Card>
        {!draft ? <Empty>The Ambient Docs agent will draft a SOAP note here — you approve before it's committed.</Empty> : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold" style={{ color: "#d7e5ff" }}>SOAP draft</h4>
              <AgentBadge label="AI draft — needs approval" />
            </div>
            <div className="holo whitespace-pre-wrap text-[13px]">
              <div><b>S:</b> {draft.result.soap.S}</div>
              <div><b>O:</b> {draft.result.soap.O}</div>
              <div><b>A:</b> {draft.result.soap.A}</div>
              <div><b>P:</b> {draft.result.soap.P}</div>
            </div>
            <div className="my-2 flex flex-wrap gap-1">
              {draft.result.icd10.map((c: any) => <Tag key={c.code} tone="blue">{c.code} · {c.label}</Tag>)}
            </div>
            <textarea className="input" rows={4} value={finalText} onChange={(e) => setFinalText(e.target.value)} />
            {approved ? (
              <div className="mt-2 flex items-center gap-2" style={{ color: "var(--mint)" }}><CheckCircle2 size={16} /> Note approved &amp; committed.</div>
            ) : (
              <button className="btn g mt-3 w-full" disabled={busy} onClick={approve}><BadgeCheck size={16} /> Approve note</button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Labs */
const TEST_MENU = ["CBC", "CRP", "HbA1c", "Lipid Profile", "TSH", "RFT", "Chest X-ray"];
interface LabsProps {
  encounterId: string;
  sel: string[];
  setSel: React.Dispatch<React.SetStateAction<string[]>>;
  toggle: (t: string) => void;
}

function Labs({ encounterId, sel, setSel, toggle }: LabsProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<Record<string, any>>({});
  const [customTest, setCustomTest] = useState("");
  const [menu, setMenu] = useState(TEST_MENU);
  const { data } = useQuery({ queryKey: ["lab", encounterId], queryFn: () => api.encounterLab(encounterId) });

  const handleAddCustom = () => {
    const val = customTest.trim();
    if (!val) return;
    if (!menu.includes(val)) {
      setMenu([...menu, val]);
    }
    if (!sel.includes(val)) {
      setSel((s) => [...s, val]);
    }
    setCustomTest("");
  };

  async function order() {
    setBusy(true);
    try { await api.createLabOrders(encounterId, sel); qc.invalidateQueries({ queryKey: ["lab", encounterId] }); }
    finally { setBusy(false); }
  }
  async function publish(id: string) {
    const r = await api.publishResult(id);
    setAi((prev) => ({ ...prev, [id]: r }));
    qc.invalidateQueries({ queryKey: ["lab", encounterId] });
  }
  const flagTone = (f: string) => (f === "N" ? "green" : f === "H" || f === "L" ? "amber" : "red");

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
      <div className="space-y-3">
        <Card>
          <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Order tests (CPOE)</h4>
          <div className="flex flex-wrap gap-2">
            {menu.map((t) => (
              <button key={t} onClick={() => toggle(t)} className="chip" style={{ borderColor: sel.includes(t) ? "var(--lit)" : "var(--line2)" }}>
                {sel.includes(t) ? "✓ " : ""}{t}
              </button>
            ))}
          </div>
          
          <div className="mt-3 flex gap-2">
            <input 
              type="text" 
              value={customTest} 
              onChange={(e) => setCustomTest(e.target.value)} 
              placeholder="Other test (e.g. Urinalysis)" 
              className="input !py-1 text-xs"
              style={{ flex: 1 }}
            />
            <button 
              type="button" 
              onClick={handleAddCustom} 
              className="btn ghost !py-1 !px-3 text-xs"
            >
              + Add
            </button>
          </div>

          <button className="btn mt-3 w-full" disabled={busy || !sel.length} onClick={order}>Order selected</button>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--dim)" }}>Auto-creates order + bill + patient QR. Lab Intelligence checks duplicates.</p>
        </Card>
      </div>

      <div className="space-y-3">
        {!data?.orders?.length ? <Empty>No lab orders yet.</Empty> : data.orders.map((o: any) => (
          <Card key={o.lab_order_id}>
            <div className="flex items-center justify-between">
              <div><b style={{ color: "#dce9ff" }}>{o.test}</b> <span className="text-[11px]" style={{ color: "var(--dim)" }}>· {o.qr_code}</span></div>
              {o.status === "RESULTED" ? <Tag tone="green">RESULTED</Tag> : (
                <button className="btn ghost" onClick={() => publish(o.lab_order_id)}>Simulate result</button>
              )}
            </div>
            {ai[o.lab_order_id]?.result?.abnormal?.length > 0 && (
              <div className="alertbox mt-2">🚨 {ai[o.lab_order_id].result.summary} <AgentBadge label="Lab AI" /></div>
            )}
            {o.results.length > 0 && (
              <table className="mt-2 w-full text-[13px]">
                <thead><tr style={{ color: "var(--dim)" }}><th className="text-left">Analyte</th><th className="text-left">Value</th><th className="text-left">Ref</th><th className="text-left">Flag</th></tr></thead>
                <tbody>
                  {o.results.map((r: any, i: number) => (
                    <tr key={i}><td>{r.analyte}</td><td>{r.value} {r.unit}</td>
                      <td style={{ color: "var(--dim)" }}>{r.reference_low}–{r.reference_high}</td>
                      <td><Tag tone={flagTone(r.flag)}>{r.flag}</Tag></td></tr>
                  ))}
                </tbody>
              </table>
            )}

            {o.status === "RESULTED" && (o.notes || o.attachment_uri) && (
              <div className="mt-2.5 pt-2 border-t border-white/5 space-y-1.5 text-[12.5px] bg-white/[0.01] p-2.5 rounded-xl">
                {o.notes && (
                  <div style={{ color: "var(--muted)" }}>
                    <b>Lab Findings:</b> <span className="text-slate-200">{o.notes}</span>
                  </div>
                )}
                {o.attachment_uri && (
                  <div>
                    <a
                      href={`${import.meta.env.VITE_API_BASE_URL ?? ""}${o.attachment_uri}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[var(--cyan)] hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      📄 View Uploaded Diagnostic Scan
                    </a>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Prescription + CDS */
type Item = { drug_name: string; dose: string; frequency: string };
function Rx({ encounterId, refetchQueue }: { encounterId: string; refetchQueue?: () => void }) {
  const journey = useJourney();
  const [items, setItems] = useState<Item[]>([{ drug_name: "Amoxicillin 500mg", dose: "500 mg", frequency: "1-0-1" }]);
  const [cds, setCds] = useState<any>(null);
  const [rxId, setRxId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState(false);
  const [override, setOverride] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: stock } = useQuery({
    queryKey: ["pharmacy-stock"],
    queryFn: () => api.stock(),
    refetchInterval: 10000,
  });

  const setItem = (i: number, k: keyof Item, val: string) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)));
  const add = (preset?: Item) => setItems((s) => [...s, preset || { drug_name: "", dose: "", frequency: "1-0-1" }]);
  const del = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

  const applySuggestion = (forDrug: string, newDrug: string) => {
    setItems((s) => s.map((it) => {
      // Direct exact match or fuzzy match
      const isMatch = it.drug_name.toLowerCase().trim() === forDrug.toLowerCase().trim() || 
                      it.drug_name.toLowerCase().includes(forDrug.toLowerCase().trim()) || 
                      forDrug.toLowerCase().includes(it.drug_name.toLowerCase().trim());
      return isMatch ? { ...it, drug_name: newDrug } : it;
    }));
    setCds(null);
    setErr(null);
  };

  async function runCds() {
    setBusy(true); setDone(null); setErr(null);
    try {
      const r = await api.createRx({ encounter_id: encounterId, items });
      setCds(r.result); setRxId(r.rx_id);
    } finally { setBusy(false); }
  }
  async function approve() {
    if (!rxId) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.approveRx(rxId, { approved_by: "Dr. Mehta", accept_substitutions: accept, override_warnings: override });
      setDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr("Blocked by CDS — resolve the allergy conflict, accept a substitution, or override warning.");
        setCds((e.detail as any)?.cds?.result || cds);
      }
    } finally { setBusy(false); }
  }

  const sevTone = (s: string) => (s === "BLOCK" ? "red" : s === "MAJOR" || s === "WARN" ? "amber" : "blue");

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold" style={{ color: "#d7e5ff" }}>Prescription</h4>
          <div className="flex gap-1">
            <button className="chip" onClick={() => add({ drug_name: "Azithromycin 500mg", dose: "500 mg", frequency: "1-0-0" })}>+ Azithromycin</button>
            <button className="chip" onClick={() => add({ drug_name: "Paracetamol 650mg", dose: "650 mg", frequency: "SOS" })}>+ Paracetamol</button>
          </div>
        </div>

        {items.map((it, i) => {
          // Perform live stock matching
          const searchVal = it.drug_name.toLowerCase().trim();
          const matched = stock?.find((s: any) => {
            const nameLower = s.drug_name.toLowerCase();
            return nameLower === searchVal || nameLower.includes(searchVal) || searchVal.includes(nameLower);
          });
          const available = matched ? matched.available : 0;

          return (
            <div key={i} className="mb-3 p-3 rounded-xl border" style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}>
              <div className="grid grid-cols-[1fr_70px_70px_28px] gap-2">
                <input className="input" value={it.drug_name} placeholder="Drug (e.g. Paracetamol)" onChange={(e) => setItem(i, "drug_name", e.target.value)} />
                <input className="input" value={it.dose} placeholder="Dose" onChange={(e) => setItem(i, "dose", e.target.value)} />
                <input className="input" value={it.frequency} placeholder="Freq" onChange={(e) => setItem(i, "frequency", e.target.value)} />
                <button className="chip" onClick={() => del(i)}><Trash2 size={14} /></button>
              </div>
              
              {it.drug_name.trim() && (
                <div className="mt-1.5 px-1 flex items-center justify-between text-[11px]">
                  {matched ? (
                    <span className={available > 0 ? "text-[var(--mint)] font-medium" : "text-rose-400 font-semibold"}>
                      {available > 0 ? `✓ In stock: ${available} left` : "⚠ OUT OF STOCK"} 
                      <span className="text-[var(--dim)] ml-1.5">({matched.salt})</span>
                    </span>
                  ) : (
                    <span className="text-amber-400 font-semibold">⚠ Not found in stock</span>
                  )}
                  {matched && !matched.formulary && (
                    <span className="text-amber-500 font-bold uppercase text-[9px] tracking-wider">Non-Formulary</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div className="flex gap-2 mt-3">
          <button className="btn ghost" onClick={() => add()}><Plus size={15} /> Add</button>
          <button className="btn flex-1" disabled={busy || !items.length} onClick={runCds}><Pill size={15} /> Run CDS</button>
        </div>
      </Card>

      <Card>
        {!cds ? <Empty>The Rx CDS agent checks allergy, interactions, dose, formulary and live stock.</Empty> : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold" style={{ color: "#d7e5ff" }}>Clinical decision support</h4>
              <AgentBadge label="Rx CDS" />
            </div>
            {cds.block && <div className="alertbox mb-2"><ShieldAlert size={15} className="inline" /> Prescription contains a blocking allergy conflict.</div>}
            <div className="space-y-1.5">
              {cds.alerts.length ? cds.alerts.map((a: any, i: number) => (
                <div key={i} className="kv"><span>{a.drug}</span><span className="flex-1 px-2 text-[12.5px]" style={{ color: "var(--muted)" }}>{a.message}</span><Tag tone={sevTone(a.severity)}>{a.severity}</Tag></div>
              )) : <div style={{ color: "var(--mint)" }}>✓ No conflicts — safe to prescribe.</div>}
            </div>
            {cds.suggestions?.length > 0 && (
              <div className="holo mt-2 text-[12.5px] space-y-1.5">
                <div className="font-semibold text-white"><AgentBadge label="AI" /> Suggested alternatives (click to apply):</div>
                {cds.suggestions.map((s: any, i: number) => {
                  const isErr = s.suggestion === "AI responses did not give any response";
                  return isErr ? (
                    <div key={i} className="text-left w-full p-2.5 rounded text-rose-400 border border-rose-500/20 bg-rose-950/10 mt-1 font-semibold">
                      ⚠ {s.suggestion} — <span className="text-[11.5px] text-[var(--muted)]">{s.reason}</span>
                    </div>
                  ) : (
                    <button
                      key={i}
                      onClick={() => applySuggestion(s.for, s.suggestion)}
                      className="block text-left w-full hover:bg-white/5 p-1 rounded transition text-[var(--cyan)] border border-dashed border-[var(--cyan)]/20 px-2 py-1 mt-1"
                    >
                      • Use <b>{s.suggestion}</b> for {s.for} — <span className="text-[11.5px] text-[var(--muted)]">{s.reason}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-2 mt-2">
              <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
                <input type="checkbox" checked={accept} onChange={(e) => { setAccept(e.target.checked); if (e.target.checked) setOverride(false); }} /> Accept AI substitutions
              </label>
              {cds.block && (
                <label className="flex items-center gap-2 text-[12.5px] text-rose-400 font-semibold cursor-pointer">
                  <input type="checkbox" checked={override} onChange={(e) => { setOverride(e.target.checked); if (e.target.checked) setAccept(false); }} /> Override allergy conflict warning (sign anyway)
                </label>
              )}
            </div>
            {err && <div className="alertbox mt-2">{err}</div>}
            {done ? (
              <div className="space-y-3 mt-3">
                <div className="flex items-center gap-2" style={{ color: "var(--mint)" }}><CheckCircle2 size={16} /> Approved &amp; e-signed. Pharmacy stock reserved.</div>
                <button
                  onClick={async () => {
                    if (confirm("Are you sure you want to complete the consultation and discharge this patient?")) {
                      try {
                        await api.discharge(encounterId);
                        journey.reset();
                        if (refetchQueue) refetchQueue();
                      } catch (err: any) {
                        alert(err?.message || "Failed to discharge patient.");
                      }
                    }
                  }}
                  className="btn w-full text-[13px] font-bold"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "white" }}
                >
                  ✓ Complete Consultation &amp; Discharge
                </button>
              </div>
            ) : (
              <button className="btn g mt-3 w-full" disabled={busy || (cds.block && !accept && !override)} onClick={approve}>
                <BadgeCheck size={16} /> Approve &amp; e-sign
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Billing & Discharge */
function Billing({ encounterId }: { encounterId: string }) {
  const qc = useQueryClient();
  const { data: inv } = useQuery({ queryKey: ["invoice", encounterId], queryFn: () => api.invoice(encounterId) });
  const [busy, setBusy] = useState(false);
  const [discharge, setDischarge] = useState<any>(null);

  async function pay() {
    if (!inv) return; setBusy(true);
    try { await api.pay(inv.invoice_id, "UPI"); qc.invalidateQueries({ queryKey: ["invoice", encounterId] }); }
    finally { setBusy(false); }
  }
  async function claim() {
    if (!inv) return; setBusy(true);
    try { await api.claim(inv.invoice_id, { payer: "Star Health", tpa: "MediAssist", policy_no: "POL-99321", claim_type: "CASHLESS" }); qc.invalidateQueries({ queryKey: ["invoice", encounterId] }); }
    finally { setBusy(false); }
  }
  async function doDischarge() {
    setBusy(true);
    try { setDischarge(await api.discharge(encounterId)); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Invoice</h4>
        {!inv ? <Empty>Loading…</Empty> : (
          <>
            {inv.lines.map((l: any, i: number) => (
              <div key={i} className="kv"><span>{l.description}</span><b>₹{l.amount.toFixed(0)}</b></div>
            ))}
            {inv.insurance_adj > 0 && <div className="kv"><span>Insurance adjustment</span><b style={{ color: "var(--mint)" }}>−₹{inv.insurance_adj.toFixed(0)}</b></div>}
            <div className="kv text-base"><span>Balance</span><b className="grad-text">₹{inv.balance.toFixed(0)}</b></div>
            <div className="mt-1"><Tag tone={inv.status === "PAID" ? "green" : "amber"}>{inv.status}</Tag></div>
            <div className="mt-3 flex gap-2">
              <button className="btn flex-1" disabled={busy || inv.status === "PAID"} onClick={pay}>Pay via UPI</button>
              <button className="btn ghost" disabled={busy} onClick={claim}>Cashless claim</button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Discharge</h4>
        {!discharge ? (
          <>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>The Compliance agent checks documentation completeness before closure, then pushes the discharge bundle to the ABDM PHR.</p>
            <button className="btn mt-3 w-full" disabled={busy} onClick={doDischarge}>Run compliance &amp; discharge</button>
          </>
        ) : (
          <div className="space-y-2">
            {discharge.compliance.result.complete ? (
              <div className="flex items-center gap-2" style={{ color: "var(--mint)" }}><CheckCircle2 size={16} /> Compliance complete — no gaps.</div>
            ) : (
              <div className="alertbox">Open gaps: {discharge.compliance.result.gaps.map((g: any) => g.area).join(", ")}</div>
            )}
            <div className="holo text-[12.5px]">
              <div className="mb-1"><b>Diagnosis:</b> {discharge.discharge_summary.diagnosis.map((d: any) => d.code).join(", ") || "—"}</div>
              <div className="mb-1"><b>Medications:</b> {discharge.discharge_summary.medications.join("; ") || "—"}</div>
              <div><b>Follow-up:</b> {discharge.discharge_summary.follow_up}</div>
            </div>
            <div className="text-[11.5px]" style={{ color: "var(--dim)" }}>PHR: {discharge.discharge_summary.phr_uri}</div>
            <Tag tone="green">DISCHARGED</Tag>
          </div>
        )}
      </Card>
    </div>
  );
}
