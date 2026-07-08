import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HeartPulse, ArrowRight, Stethoscope } from "lucide-react";
import { api } from "../lib/api";
import { useJourney } from "../lib/store";
import { Card, Ring, Tag, Field, SectionTitle, AgentBadge } from "../components/ui";

const ACUITY_PCT: Record<string, number> = { "1": 92, "2": 76, "3": 58, "4": 38, "5": 22 };
const acuityTone = (a: string) => (a <= "2" ? "red" : a === "3" ? "amber" : "green");

export default function Triage() {
  const nav = useNavigate();
  const loc = useLocation();
  const journey = useJourney();
  const setJourney = useJourney((s) => s.set);

  const [symptom, setSymptom] = useState<string>((loc.state as any)?.symptom || "Fever and cough for 3 days, mild breathlessness");
  const [duration, setDuration] = useState("3 days");
  const [v, setV] = useState({ bp_systolic: 128, bp_diastolic: 82, spo2: 97, heart_rate: 96, temperature: 101.2 });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  const upd = (k: string, val: string) => setV((s) => ({ ...s, [k]: Number(val) }));

  async function run() {
    if (!journey.encounterId) return;
    setBusy(true);
    try {
      const r = await api.triage(journey.encounterId, {
        encounter_id: journey.encounterId, symptom_text: symptom, duration, vitals: v,
      });
      setRes(r);
      setJourney({ token: r.token.number, department: r.token.department });
    } finally {
      setBusy(false);
    }
  }

  if (!journey.encounterId) {
    return (
      <Card>
        <SectionTitle>Triage</SectionTitle>
        <p style={{ color: "var(--muted)" }}>
          No active encounter. Start at <button className="btn ghost" onClick={() => nav("/checkin")}>Check-in</button> first.
        </p>
      </Card>
    );
  }

  const tr = res?.triage?.result;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      {/* Form */}
      <div>
        <SectionTitle sub="Symptoms + vitals in, acuity + routing + token out — in seconds.">Intake &amp; Triage</SectionTitle>
        <Card className="space-y-3">
          <Field label="Presenting complaint">
            <textarea className="input" rows={3} value={symptom} onChange={(e) => setSymptom(e.target.value)} />
          </Field>
          <Field label="Duration"><input className="input" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="BP systolic"><input className="input" type="number" value={v.bp_systolic} onChange={(e) => upd("bp_systolic", e.target.value)} /></Field>
            <Field label="BP diastolic"><input className="input" type="number" value={v.bp_diastolic} onChange={(e) => upd("bp_diastolic", e.target.value)} /></Field>
            <Field label="SpO₂ %"><input className="input" type="number" value={v.spo2} onChange={(e) => upd("spo2", e.target.value)} /></Field>
            <Field label="Heart rate"><input className="input" type="number" value={v.heart_rate} onChange={(e) => upd("heart_rate", e.target.value)} /></Field>
            <Field label="Temp °F"><input className="input" type="number" step="0.1" value={v.temperature} onChange={(e) => upd("temperature", e.target.value)} /></Field>
          </div>
          <button className="btn w-full" disabled={busy} onClick={run}>
            <HeartPulse size={16} /> {busy ? "Assessing…" : "Run AI triage"}
          </button>
          <p className="text-[11.5px]" style={{ color: "var(--dim)" }}>
            Acuity is computed by rules (ESI + vital thresholds). The nurse can always override.
          </p>
        </Card>
      </div>

      {/* Result */}
      <div>
        {!res ? (
          <Card className="flex h-full items-center justify-center text-center">
            <div style={{ color: "var(--dim)" }}>
              <Stethoscope className="mx-auto mb-2" /> Run triage to see acuity, routing and your smart token.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {tr.red_flag && (
              <div className="alertbox">🚨 <b>Red flag:</b> {tr.red_flag_reason} — priority escalation.</div>
            )}
            <Card>
              <div className="flex items-center gap-4">
                <Ring percent={ACUITY_PCT[tr.acuity_level] ?? 50} label="ESI" sub={`Priority ${tr.acuity_level}`} />
                <div className="flex-1">
                  <div className="kv"><span>Chief complaint</span><b>{res.intake.result.chief_complaint}</b></div>
                  <div className="kv"><span>Routed to</span><b>{tr.specialty}</b></div>
                  <div className="kv"><span>Doctor</span><b>{res.doctor?.name || "—"}</b></div>
                  <div className="mt-1"><Tag tone={acuityTone(tr.acuity_level)}>Acuity {tr.acuity_level}</Tag> <AgentBadge label="Triage" /></div>
                </div>
              </div>
              <div className="mt-3 holo text-[12.5px]"><b>Rationale:</b> {tr.rationale}</div>
            </Card>

            <Card className="text-center">
              <div className="text-[11px]" style={{ color: "var(--dim)" }}>YOUR TOKEN</div>
              <div className="grad-text text-4xl font-extrabold">{res.token.number}</div>
              <Tag tone="blue">{res.token.room} · {res.token.floor} · ~{res.token.eta_minutes} min</Tag>
              <button className="btn mt-4 w-full" onClick={() => nav("/copilot")}>
                Open in Doctor Copilot <ArrowRight size={16} />
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
