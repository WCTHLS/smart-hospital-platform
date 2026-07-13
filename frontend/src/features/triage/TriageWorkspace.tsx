import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Stethoscope, Users, User, Clock, ShieldAlert, LockKeyhole, ArrowRight, MapPin } from "lucide-react";
import { api } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { Card, Ring, Tag, Field, SectionTitle, AgentBadge, Empty } from "../../components/ui";

const ACUITY_PCT: Record<string, number> = { "1": 92, "2": 76, "3": 58, "4": 38, "5": 22 };
const acuityTone = (a: string) => (a <= "2" ? "red" : a === "3" ? "amber" : "green");

export default function Triage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const journey = useJourney();
  const setJourney = useJourney((s) => s.set);

  const [selectedStaffId, setSelectedStaffId] = useState(() => localStorage.getItem("selected_triage_staff_id") || "");
  const [unlockedStaffId, setUnlockedStaffId] = useState(() => sessionStorage.getItem("unlocked_triage_staff_id") || "");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [symptom, setSymptom] = useState("Fever and cough for 3 days, mild breathlessness");
  const [duration, setDuration] = useState("3 days");
  const [v, setV] = useState({ bp_systolic: 128, bp_diastolic: 82, spo2: 97, heart_rate: 96, temperature: 101.2 });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const { data: staff } = useQuery({ 
    queryKey: ["triage-staff"], 
    queryFn: api.triageStaff 
  });

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: api.pendingTriageEncounters,
    enabled: !!selectedStaffId && selectedStaffId === unlockedStaffId,
    refetchInterval: 5000,
  });

  const activeStaff = staff?.find((member: any) => member.staff_id === selectedStaffId);

  const selectStaff = (staffId: string) => {
    setSelectedStaffId(staffId);
    localStorage.setItem("selected_triage_staff_id", staffId);
    setPin("");
    setPinError("");
  };

  const verifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !pin) return;
    setVerifyingPin(true);
    setPinError("");
    try {
      await api.verifyTriagePin(selectedStaffId, pin);
      journey.reset();
      setRes(null);
      setUnlockedStaffId(selectedStaffId);
      sessionStorage.setItem("unlocked_triage_staff_id", selectedStaffId);
    } catch (err: any) {
      setPinError(err.message || "Incorrect PIN code. Access denied.");
    } finally {
      setVerifyingPin(false);
    }
  };

  const lockPortal = () => {
    journey.reset();
    setUnlockedStaffId("");
    sessionStorage.removeItem("unlocked_triage_staff_id");
    setPin("");
    setPinError("");
    setRes(null);
  };

  const selectPatient = (encounter: any) => {
    setRes(null);
    setJourney({
      patientId: encounter.patient.patient_id,
      patientName: encounter.patient.name,
      encounterId: encounter.encounter_id,
      department: encounter.department,
      token: null,
      chiefComplaint: null,
    });
  };

  const backToQueue = () => {
    journey.reset();
    setRes(null);
    refetchQueue();
    qc.invalidateQueries({ queryKey: ["triage-queue"] });
  };

  const upd = (k: string, val: string) => setV((s) => ({ ...s, [k]: Number(val) }));

  async function run() {
    if (!journey.encounterId) return;
    setBusy(true);
    try {
      const r = await api.triage(journey.encounterId, {
        encounter_id: journey.encounterId, 
        symptom_text: symptom, 
        duration, 
        vitals: v,
      });
      setRes(r);
      setJourney({ token: r.token.number, department: r.token.department });
      qc.invalidateQueries({ queryKey: ["triage-queue"] });
      qc.invalidateQueries({ queryKey: ["doctor-queue"] });
    } catch (err: any) {
      alert(err?.message || "Failed to submit triage.");
    } finally {
      setBusy(false);
    }
  }

  const tr = res?.triage?.result;

  // Render Login state
  if (!selectedStaffId || selectedStaffId !== unlockedStaffId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
              <HeartPulse size={22} className="text-[var(--cyan)]" /> Triage Portal Login
            </h2>
            <p className="text-[13px] mt-1 text-[var(--muted)]">
              Select your clinical profile to view today's hospital-wide pending triage queue.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <User size={15} className="text-[var(--dim)]" />
            <select 
              value={selectedStaffId} 
              onChange={(e) => selectStaff(e.target.value)} 
              className="input !py-1.5 !px-3 !w-auto text-[13.5px] font-bold"
              style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
            >
              <option value="">-- Choose Clinical Profile --</option>
              {staff?.map((member: any) => (
                <option key={member.staff_id} value={member.staff_id}>
                  {member.name} ({member.specialty})
                </option>
              ))}
            </select>
          </div>
        </Card>

        {selectedStaffId && (
          <div className="max-w-[440px] mx-auto py-8">
            <Card className="space-y-4">
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 flex items-center justify-center text-[var(--cyan)]">
                  <User size={24} />
                </div>
                <h3 className="font-extrabold text-[15px] text-slate-100">{activeStaff?.name}</h3>
                <p className="text-[12px] text-[var(--muted)]">
                  {activeStaff?.specialty} · {activeStaff?.room} ({activeStaff?.floor})
                </p>
              </div>
              <form onSubmit={verifyPin} className="space-y-3.5 text-xs">
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
                {pinError && (
                  <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-1.5 justify-center">
                    <ShieldAlert size={14} />{pinError}
                  </div>
                )}
                <button type="submit" disabled={verifyingPin} className="btn w-full font-bold py-2">
                  {verifyingPin ? "Verifying..." : "Unlock Triage Workspace"}
                </button>
              </form>
            </Card>
          </div>
        )}

        {!selectedStaffId && (
          <Card className="text-center py-10">
            <HeartPulse size={48} className="mx-auto text-[var(--dim)] opacity-40 mb-3" />
            <h3 className="font-bold text-base text-slate-200">Select Profile to Begin</h3>
            <p className="text-[13px] mt-1 text-[var(--muted)]">
              Choose your triage clinical profile and enter your PIN to retrieve today's queue.
            </p>
          </Card>
        )}
      </div>
    );
  }

  // If unlocked, but no patient is selected
  if (!journey.encounterId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
              <HeartPulse size={22} className="text-[var(--cyan)]" /> Triage Queue
            </h2>
            <p className="text-[13px] mt-1 text-[var(--muted)]">
              Currently logged in as: <b>{activeStaff?.name} ({activeStaff?.specialty})</b>
            </p>
          </div>
          <button onClick={lockPortal} className="btn ghost !py-1.5 !px-3 text-xs text-red-400 font-bold border-red-500/10">
            Lock Session
          </button>
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-bold flex items-center gap-2 text-slate-100">
              <Users size={18} /> Active Patient Queue
            </h3>
            <span className="live">LIVE REFRESH</span>
          </div>

          {!queue?.length ? (
            <Empty>No patients are waiting for triage today.</Empty>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {queue.map((encounter: any) => (
                <Card key={encounter.encounter_id} className="hover-border flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Tag tone="amber">Pending triage</Tag>
                      <span className="text-[11px] text-[var(--muted)]">{encounter.visit_type}</span>
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-[#dce9ff]">{encounter.patient?.name}</h4>
                      <p className="text-[12px] text-[var(--muted)]">
                        {encounter.patient?.age} yrs · {encounter.patient?.gender} · {encounter.patient?.mobile}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--dim)]">
                      <Clock size={12} />
                      <span>Checked in {new Date(encounter.arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--dim)]">
                      <MapPin size={12} />
                      <span>{encounter.department || "Department pending"} · {encounter.channel || "Walk-in"}</span>
                    </div>
                  </div>
                  <button onClick={() => selectPatient(encounter)} className="btn mt-4 w-full">
                    Start Triage <ArrowRight size={14} />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Triage View
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="grad-text text-2xl font-extrabold">{journey.patientName}</h1>
          <p className="text-[12px] text-[var(--muted)]">Triage assessment in progress</p>
        </div>
        <button className="btn ghost" onClick={backToQueue}>
          ← Back to Patient Queue
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* Left/Middle Column: Entry Form */}
        <div>
          <SectionTitle sub="Symptoms + vitals in, acuity + routing + token out — in seconds.">Intake &amp; Triage</SectionTitle>
          <Card className="space-y-3">
            <Field label="Presenting complaint">
              <textarea 
                className="input" 
                rows={3} 
                value={symptom} 
                onChange={(e) => setSymptom(e.target.value)} 
                disabled={busy || !!res}
              />
            </Field>
            <Field label="Duration">
              <input 
                className="input" 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)} 
                disabled={busy || !!res}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="BP systolic">
                <input 
                  className="input text-center" 
                  type="number" 
                  value={v.bp_systolic} 
                  onChange={(e) => upd("bp_systolic", e.target.value)} 
                  disabled={busy || !!res}
                />
              </Field>
              <Field label="BP diastolic">
                <input 
                  className="input text-center" 
                  type="number" 
                  value={v.bp_diastolic} 
                  onChange={(e) => upd("bp_diastolic", e.target.value)} 
                  disabled={busy || !!res}
                />
              </Field>
              <Field label="SpO₂ %">
                <input 
                  className="input text-center" 
                  type="number" 
                  value={v.spo2} 
                  onChange={(e) => upd("spo2", e.target.value)} 
                  disabled={busy || !!res}
                />
              </Field>
              <Field label="Heart rate">
                <input 
                  className="input text-center" 
                  type="number" 
                  value={v.heart_rate} 
                  onChange={(e) => upd("heart_rate", e.target.value)} 
                  disabled={busy || !!res}
                />
              </Field>
              <Field label="Temp °F">
                <input 
                  className="input text-center" 
                  type="number" 
                  step="0.1" 
                  value={v.temperature} 
                  onChange={(e) => upd("temperature", e.target.value)} 
                  disabled={busy || !!res}
                />
              </Field>
            </div>
            {!res && (
              <button className="btn w-full" disabled={busy} onClick={run}>
                <HeartPulse size={16} /> {busy ? "Assessing Vitals via AI…" : "Calculate Acuity & Run AI Triage"}
              </button>
            )}
          </Card>
        </div>

        {/* Right Column: AI Triage results */}
        <div>
          {!res ? (
            <Card className="flex h-full items-center justify-center text-center py-12 text-slate-400">
              <div>
                <Stethoscope className="mx-auto mb-2 opacity-30" size={32} />
                <p className="text-xs">Run triage to see acuity, routing and patient token.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-3 animate-in zoom-in-95 duration-200">
              {tr.red_flag && (
                <div className="alertbox">🚨 <b>Red flag:</b> {tr.red_flag_reason} — priority escalation.</div>
              )}
              <Card>
                <div className="flex items-center gap-4">
                  <div className="flex-1 text-xs">
                    <div className="kv"><span>Chief complaint</span><b>{res.intake.result.chief_complaint}</b></div>
                    <div className="kv"><span>Routed to</span><b>{tr.specialty}</b></div>
                    <div className="kv"><span>Doctor</span><b>{res.doctor?.name || "—"}</b></div>
                    <div className="mt-2 flex gap-1.5 items-center">
                      {tr.red_flag && <Tag tone="red">RED FLAG</Tag>}
                      <AgentBadge label="Triage" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 holo text-[12.5px] text-slate-300">
                  <b>Rationale:</b> {tr.rationale}
                </div>
              </Card>

              <Card className="text-center space-y-2">
                <div className="text-[11px] text-[var(--dim)] font-bold">PATIENT TOKEN</div>
                <div className="grad-text text-4xl font-extrabold">{res.token.number}</div>
                <div className="inline-block">
                  <Tag tone="blue">{res.token.room} · {res.token.floor} · ~{res.token.eta_minutes} min</Tag>
                </div>
                <button className="btn mt-4 w-full" onClick={backToQueue}>
                  Complete &amp; Return to Queue <ArrowRight size={16} />
                </button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
