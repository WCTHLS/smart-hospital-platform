import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Stethoscope, Users, User, Clock } from "lucide-react";
import { api } from "../../lib/api";
import { Card, Ring, Tag, Field, SectionTitle, AgentBadge, Empty } from "../../components/ui";

const ACUITY_PCT: Record<string, number> = { "1": 92, "2": 76, "3": 58, "4": 38, "5": 22 };
const acuityTone = (a: string) => (a <= "2" ? "red" : a === "3" ? "amber" : "green");

export default function Triage() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const [selectedEncounter, setSelectedEncounter] = useState<any | null>(null);
  const [symptom, setSymptom] = useState("Fever and cough for 3 days, mild breathlessness");
  const [duration, setDuration] = useState("3 days");
  const [v, setV] = useState({ bp_systolic: 128, bp_diastolic: 82, spo2: 97, heart_rate: 96, temperature: 101.2 });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: api.triageQueue,
    refetchInterval: 5000,
  });

  const upd = (k: string, val: string) => setV((s) => ({ ...s, [k]: Number(val) }));

  const handleSelectPatient = (enc: any) => {
    setSelectedEncounter(enc);
    setRes(null);
    setSymptom("Fever and cough for 3 days, mild breathlessness");
    setDuration("3 days");
    setV({ bp_systolic: 128, bp_diastolic: 82, spo2: 97, heart_rate: 96, temperature: 101.2 });
  };

  async function run() {
    if (!selectedEncounter) return;
    setBusy(true);
    try {
      const r = await api.triage(selectedEncounter.encounter_id, {
        encounter_id: selectedEncounter.encounter_id, 
        symptom_text: symptom, 
        duration, 
        vitals: v,
      });
      setRes(r);
      refetchQueue();
      qc.invalidateQueries({ queryKey: ["doctor-queue"] });
    } catch (err: any) {
      alert(err?.message || "Failed to submit triage.");
    } finally {
      setBusy(false);
    }
  }

  const tr = res?.triage?.result;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title Header */}
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
            <HeartPulse size={22} className="text-[var(--cyan)]" /> Triage Desk Workspace
          </h2>
          <p className="text-[13px] mt-1 text-[var(--muted)]">
            Capture patient vitals and presenting symptoms. Run ESI AI triage classifier to assign urgency tokens.
          </p>
        </div>
        <span className="live">LIVE REFRESH</span>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr_380px]">
        {/* Left Column: Checked-In Triage Queue */}
        <Card className="h-fit">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-100">
            <Users size={16} /> Checked-In Queue ({queue?.length || 0})
          </h3>
          {!queue?.length ? (
            <Empty>No patients waiting for triage.</Empty>
          ) : (
            <div className="space-y-2">
              {queue.map((enc: any) => {
                const isSelected = selectedEncounter?.encounter_id === enc.encounter_id;
                return (
                  <div
                    key={enc.encounter_id}
                    onClick={() => handleSelectPatient(enc)}
                    className={`p-2.5 border rounded-xl cursor-pointer transition text-xs flex flex-col gap-1 ${
                      isSelected
                        ? "border-[var(--cyan)] bg-[var(--cyan)]/5"
                        : "border-[var(--glass-border)] hover:bg-white/5 bg-white/[0.01]"
                    }`}
                  >
                    <div className="font-bold text-slate-200">{enc.patient?.name}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {enc.patient?.age}y · {enc.patient?.gender} · {enc.visit_type}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock size={10} /> Checked-in: {new Date(enc.arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Middle Column: Symptoms + Vitals Form */}
        <Card className="h-fit">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-100">
            <Stethoscope size={16} /> Triage Form
          </h3>

          {selectedEncounter ? (
            <div className="space-y-4">
              <div className="p-3 border border-[var(--glass-border)] rounded-xl bg-white/5 space-y-1 text-xs text-slate-300">
                <div className="font-bold text-[var(--cyan)] flex items-center gap-1.5 mb-1">
                  <User size={13} /> Active Triage Session
                </div>
                <div>Patient: <b>{selectedEncounter.patient?.name}</b> ({selectedEncounter.patient?.age}y · {selectedEncounter.patient?.gender})</div>
                <div>MRN: <b>{selectedEncounter.patient?.mrn}</b></div>
              </div>

              <Field label="Presenting complaint">
                <textarea 
                  className="input text-xs" 
                  rows={3} 
                  value={symptom} 
                  onChange={(e) => setSymptom(e.target.value)} 
                  disabled={!!res || busy}
                />
              </Field>

              <Field label="Duration">
                <input 
                  className="input text-xs" 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)} 
                  disabled={!!res || busy}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label="BP systolic">
                  <input 
                    className="input text-xs text-center" 
                    type="number" 
                    value={v.bp_systolic} 
                    onChange={(e) => upd("bp_systolic", e.target.value)} 
                    disabled={!!res || busy}
                  />
                </Field>
                <Field label="BP diastolic">
                  <input 
                    className="input text-xs text-center" 
                    type="number" 
                    value={v.bp_diastolic} 
                    onChange={(e) => upd("bp_diastolic", e.target.value)} 
                    disabled={!!res || busy}
                  />
                </Field>
                <Field label="SpO₂ %">
                  <input 
                    className="input text-xs text-center" 
                    type="number" 
                    value={v.spo2} 
                    onChange={(e) => upd("spo2", e.target.value)} 
                    disabled={!!res || busy}
                  />
                </Field>
                <Field label="Heart rate">
                  <input 
                    className="input text-xs text-center" 
                    type="number" 
                    value={v.heart_rate} 
                    onChange={(e) => upd("heart_rate", e.target.value)} 
                    disabled={!!res || busy}
                  />
                </Field>
                <Field label="Temp °F">
                  <input 
                    className="input text-xs text-center" 
                    type="number" 
                    step="0.1" 
                    value={v.temperature} 
                    onChange={(e) => upd("temperature", e.target.value)} 
                    disabled={!!res || busy}
                  />
                </Field>
              </div>

              {!res && (
                <button 
                  className="btn w-full" 
                  disabled={busy} 
                  onClick={run}
                  style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
                >
                  <HeartPulse size={16} /> {busy ? "Assessing Vitals via AI…" : "Calculate Acuity & Run AI Triage"}
                </button>
              )}
            </div>
          ) : (
            <Empty>Select a patient from the queue to start triage assessment.</Empty>
          )}
        </Card>

        {/* Right Column: Triage Results */}
        <div>
          {!res ? (
            <Card className="flex h-full items-center justify-center text-center py-12 text-slate-400">
              <div>
                <Stethoscope className="mx-auto mb-2 opacity-30" size={32} />
                <p className="text-xs">Run triage to view AI acuity results and issue token.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4 animate-in zoom-in-95 duration-200">
              {tr.red_flag && (
                <div className="alertbox">🚨 <b>Red flag:</b> {tr.red_flag_reason} — priority escalation.</div>
              )}
              <Card>
                <div className="flex items-center gap-4">
                  <Ring percent={ACUITY_PCT[tr.acuity_level] ?? 50} label="ESI" sub={`Priority ${tr.acuity_level}`} />
                  <div className="flex-1 text-xs">
                    <div className="kv"><span>Routed to</span><b>{tr.specialty}</b></div>
                    <div className="kv"><span>Doctor</span><b>{res.doctor?.name || "—"}</b></div>
                    <div className="mt-1">
                      <Tag tone={acuityTone(tr.acuity_level)}>Acuity {tr.acuity_level}</Tag> 
                      <AgentBadge label="Triage" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 holo text-[12.5px] text-slate-300">
                  <b>Rationale:</b> {tr.rationale}
                </div>
              </Card>

              <Card className="text-center space-y-2">
                <div className="text-[10px] text-[var(--dim)] font-bold">ISSUED QUEUE TOKEN</div>
                <div className="grad-text text-4xl font-extrabold">{res.token.number}</div>
                <div className="inline-block">
                  <Tag tone="blue">{res.token.room} · {res.token.floor} · ~{res.token.eta_minutes} min wait</Tag>
                </div>
                
                <button 
                  className="btn w-full mt-4" 
                  onClick={() => {
                    setSelectedEncounter(null);
                    setRes(null);
                  }}
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Clear &amp; Next Patient
                </button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
