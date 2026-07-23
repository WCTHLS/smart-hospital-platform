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

  const [symptom, setSymptom] = useState("Fever and cough for 3 days, mild breathlessness");
  const [duration, setDuration] = useState("3 days");
  const [v, setV] = useState({ bp_systolic: 128, bp_diastolic: 82, spo2: 97, heart_rate: 96, temperature: 101.2, weight_kg: 68, height_cm: 165 });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  // Suggested/pre-populated intake — best-effort autofill so the nurse has fewer blank
  // fields to type from scratch. Always editable, never trusted as-is: cleared the
  // moment any vital is hand-edited, and the source is always disclosed in the UI.
  const [vitalsSuggested, setVitalsSuggested] = useState(false);
  const [suggestSource, setSuggestSource] = useState<string | null>(null);

  const [overriding, setOverriding] = useState(false);
  const [overrideAcuity, setOverrideAcuity] = useState("3");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);

  const { data: staff } = useQuery({ 
    queryKey: ["triage-staff"], 
    queryFn: api.triageStaff 
  });

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: api.pendingTriageEncounters,
    enabled: !!selectedStaffId,
    refetchInterval: 5000,
  });

  const activeStaff = staff?.find((member: any) => member.staff_id === selectedStaffId);

  const selectStaff = (staffId: string) => {
    setSelectedStaffId(staffId);
    localStorage.setItem("selected_triage_staff_id", staffId);
    journey.reset();
    setRes(null);
  };

  const lockPortal = () => {
    journey.reset();
    setSelectedStaffId("");
    localStorage.removeItem("selected_triage_staff_id");
    setRes(null);
  };

  // Extract a spoken duration phrase (e.g. "3 days", "2 weeks") out of free-text so the
  // Duration field isn't left blank when the complaint already states it.
  const guessDuration = (text: string): string => {
    const m = (text || "").match(/\b(\d+)\s*(hour|hours|day|days|week|weeks|month|months)\b/i);
    return m ? `${m[1]} ${m[2].toLowerCase()}` : "";
  };

  const selectPatient = async (encounter: any) => {
    setRes(null);
    setOverriding(false);
    setOverrideReason("");
    const reason = encounter.reason || "";
    setSymptom(reason);
    setDuration(guessDuration(reason));
    // Blank until the best-effort suggestion below resolves (or falls back to normal ranges).
    setV({
      bp_systolic: "" as any,
      bp_diastolic: "" as any,
      spo2: "" as any,
      heart_rate: "" as any,
      temperature: "" as any,
      weight_kg: "" as any,
      height_cm: "" as any,
    });
    setVitalsSuggested(false);
    setSuggestSource(null);
    setJourney({
      patientId: encounter.patient.patient_id,
      patientName: encounter.patient.name,
      encounterId: encounter.encounter_id,
      department: encounter.department,
      token: null,
      chiefComplaint: null,
    });

    // Best-effort: pull this patient's last recorded vitals (if any) as a starting point;
    // otherwise fall back to typical normal-range values. Never blocks triage if it fails
    // (e.g. consent not yet on file) — the form just stays blank as before.
    try {
      const p360 = await api.patient360(encounter.patient.patient_id);
      const lv = p360?.latest_vitals;
      if (lv) {
        const [sys, dia] = String(lv.bp || "").split("/").map((n: string) => Number(n));
        setV({
          bp_systolic: (Number.isFinite(sys) ? sys : "") as any,
          bp_diastolic: (Number.isFinite(dia) ? dia : "") as any,
          spo2: (lv.spo2 ?? "") as any,
          heart_rate: (lv.heart_rate ?? "") as any,
          temperature: (lv.temperature ?? "") as any,
          weight_kg: (lv.weight_kg ?? "") as any,
          height_cm: (lv.height_cm ?? "") as any,
        });
        setVitalsSuggested(true);
        setSuggestSource("this patient's last recorded vitals");
      } else {
        setV({ bp_systolic: 120 as any, bp_diastolic: 80 as any, spo2: 98 as any, heart_rate: 78 as any, temperature: 98.6 as any, weight_kg: "" as any, height_cm: "" as any });
        setVitalsSuggested(true);
        setSuggestSource("typical normal range — no prior vitals on file");
      }
    } catch {
      // Leave the form blank; suggestion is purely a convenience, not a requirement.
    }
  };

  const backToQueue = () => {
    if (journey.encounterId && !res) {
      if (!window.confirm("This patient hasn't been triaged yet. Go back to the queue anyway?")) {
        return;
      }
    }
    journey.reset();
    setRes(null);
    refetchQueue();
    qc.invalidateQueries({ queryKey: ["triage-queue"] });
  };

  const upd = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val === "" ? "" : Number(val) }));
    setVitalsSuggested(false); // once hand-edited, this is a real reading — drop the disclaimer
  };

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
      setOverrideAcuity(r.triage.result.acuity_level);
      setJourney({ token: r.token.number, department: r.token.department });
      qc.invalidateQueries({ queryKey: ["triage-queue"] });
      qc.invalidateQueries({ queryKey: ["doctor-queue"] });
    } catch (err: any) {
      alert(err?.message || "Failed to submit triage.");
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride() {
    if (!journey.encounterId || !overrideReason.trim()) return;
    setOverrideBusy(true);
    try {
      const r = await api.overrideTriage(journey.encounterId, {
        acuity_level: overrideAcuity,
        reason: overrideReason.trim(),
        overridden_by: selectedStaffId || undefined,
      });
      setRes((prev: any) => (prev ? {
        ...prev,
        triage: { ...prev.triage, result: { ...prev.triage.result, acuity_level: r.triage.acuity_level } },
        override: r.triage,
        encounter_status: r.encounter_status,
      } : prev));
      setOverriding(false);
      setOverrideReason("");
      qc.invalidateQueries({ queryKey: ["doctor-queue"] });
    } catch (err: any) {
      alert(err?.message || "Failed to override acuity.");
    } finally {
      setOverrideBusy(false);
    }
  }

  const tr = res?.triage?.result;

  // Render Login state
  if (!selectedStaffId) {
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

        {!selectedStaffId && (
          <Card className="text-center py-10">
            <HeartPulse size={48} className="mx-auto text-[var(--dim)] opacity-40 mb-3" />
            <h3 className="font-bold text-base text-slate-200">Select Profile to Begin</h3>
            <p className="text-[13px] mt-1 text-[var(--muted)]">
              Choose your triage clinical profile to retrieve today's queue.
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
                      <h4 className="text-base font-extrabold text-[var(--ink)]">{encounter.patient?.name}</h4>
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
          <h1 className="grad-text-page text-2xl font-extrabold">{journey.patientName}</h1>
          <p className="text-[12px] text-[var(--muted)]">Triage assessment in progress</p>
        </div>
        <button className="btn ghost" onClick={backToQueue}>
          ← Back to Patient Queue
        </button>
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_clamp(340px,28vw,480px)] 2xl:gap-7">
        {/* Left/Middle Column: Entry Form */}
        <div>
          <div className="glass mb-3 px-5 py-4">
            <SectionTitle sub="Symptoms + vitals in, acuity + routing + token out — in seconds.">Intake &amp; Triage</SectionTitle>
          </div>
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
              {vitalsSuggested && (
                <div
                  className="col-span-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold md:col-span-3"
                  style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#92400e" }}
                >
                  ⚡ Suggested from {suggestSource} — please re-measure and confirm before submitting.
                </div>
              )}
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
              <Field label="Weight kg">
                <input
                  className="input text-center"
                  type="number"
                  step="0.1"
                  value={v.weight_kg}
                  onChange={(e) => upd("weight_kg", e.target.value)}
                  disabled={busy || !!res}
                />
              </Field>
              <Field label="Height cm">
                <input
                  className="input text-center"
                  type="number"
                  step="0.1"
                  value={v.height_cm}
                  onChange={(e) => upd("height_cm", e.target.value)}
                  disabled={busy || !!res}
                />
              </Field>
            </div>
            {!res && (
              <button className="btn w-full" disabled={busy} onClick={run}>
                <HeartPulse size={16} /> {busy ? "Assessing Vitals…" : "Calculate Acuity & Triage"}
              </button>
            )}
          </Card>
        </div>

        {/* Right Column: Triage results */}
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
                  <Ring percent={ACUITY_PCT[tr.acuity_level] ?? 50} label={`ESI ${tr.acuity_level}`} sub="acuity" />
                  <div className="flex-1 text-xs">
                    <div className="kv"><span>Chief complaint</span><b>{res.intake.result.chief_complaint}</b></div>
                    <div className="kv"><span>Routed to</span><b>{tr.specialty}</b></div>
                    <div className="kv"><span>Doctor</span><b>{res.doctor?.name || "—"}</b></div>
                    <div className="mt-2 flex gap-1.5 items-center">
                      <Tag tone={acuityTone(tr.acuity_level)}>ESI {tr.acuity_level}</Tag>
                      {tr.red_flag && <Tag tone="red">RED FLAG</Tag>}
                      <AgentBadge label="Triage" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 holo text-[12.5px] text-slate-300">
                  <b>Rationale:</b> {tr.rationale}
                </div>

                {res.override && (
                  <div className="mt-3 text-[12px] text-amber-300">
                    <ShieldAlert size={13} className="inline -mt-0.5 mr-1" />
                    Overridden to ESI {res.override.acuity_level} (AI suggested {res.override.ai_acuity_level}) — {res.override.override_reason}
                  </div>
                )}

                {!overriding ? (
                  <button
                    type="button"
                    className="btn ghost mt-3 w-full text-xs"
                    onClick={() => { setOverrideAcuity(tr.acuity_level); setOverriding(true); }}
                  >
                    <LockKeyhole size={13} /> Override acuity
                  </button>
                ) : (
                  <div className="mt-3 space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <Field label="Corrected ESI level">
                      <select className="input" value={overrideAcuity} onChange={(e) => setOverrideAcuity(e.target.value)}>
                        {["1", "2", "3", "4", "5"].map((level) => (
                          <option key={level} value={level}>ESI {level}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Reason for override (required)">
                      <textarea
                        className="input"
                        rows={2}
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="e.g. Patient appears more distressed than vitals suggest…"
                      />
                    </Field>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn flex-1 text-xs"
                        disabled={overrideBusy || !overrideReason.trim()}
                        onClick={submitOverride}
                      >
                        {overrideBusy ? "Saving…" : "Save override"}
                      </button>
                      <button type="button" className="btn ghost flex-1 text-xs" onClick={() => setOverriding(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="text-center space-y-2">
                <div className="text-[11px] text-[var(--dim)] font-bold">PATIENT TOKEN</div>
                <div className="grad-text text-4xl font-extrabold">{res.token.number}</div>
                <div className="inline-block">
                  <Tag tone="blue">{res.token.room} · {res.token.floor} · ~{res.token.eta_minutes} min</Tag>
                </div>
                {res.scheduled_start && (
                  <div className="text-xs text-[var(--dim)] font-semibold mt-1">
                    Booked Slot Time: <span className="text-white">{new Date(res.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
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
