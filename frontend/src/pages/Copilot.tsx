import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, FileText, FlaskConical, Pill, Receipt, CheckCircle2, Mic, Plus, Trash2, BadgeCheck,
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

  if (!journey.encounterId || !journey.patientId) {
    return (
      <Card>
        <SectionTitle>Doctor Copilot</SectionTitle>
        <p style={{ color: "var(--muted)" }}>
          No active encounter. Start at{" "}
          <button className="btn ghost" onClick={() => nav("/checkin")}>Check-in</button> then run triage.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="grad-text text-2xl font-extrabold">{journey.patientName}</h1>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
            <Tag tone="green">ABHA verified</Tag>
            {journey.department && <Tag tone="blue">{journey.department}</Tag>}
            {journey.token && <Tag tone="violet">Token {journey.token}</Tag>}
          </div>
        </div>
        <span className="ai-badge"><Mic size={13} /> Copilot session</span>
      </div>

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

      {tab === "p360" && <Patient360 patientId={journey.patientId} />}
      {tab === "soap" && <Ambient encounterId={journey.encounterId} />}
      {tab === "labs" && <Labs encounterId={journey.encounterId} />}
      {tab === "rx" && <Rx encounterId={journey.encounterId} />}
      {tab === "bill" && <Billing encounterId={journey.encounterId} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Patient 360 */
function Patient360({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery({
    queryKey: ["p360", patientId], queryFn: () => api.patient360(patientId), retry: false,
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
    <div className="grid gap-3 md:grid-cols-3">
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Allergies</h4>
        {data.allergies.length ? data.allergies.map((a: any) => (
          <div key={a.substance} className="mb-1"><Tag tone="red">⚠ {a.substance}{a.severity ? ` · ${a.severity}` : ""}</Tag></div>
        )) : <Empty>No known allergies</Empty>}
      </Card>
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Active medications</h4>
        {data.active_medications.length ? (
          <ul className="space-y-1 text-[13px]" style={{ color: "var(--muted)" }}>
            {data.active_medications.map((m: string, i: number) => <li key={i}>• {m}</li>)}
          </ul>
        ) : <Empty>None recorded</Empty>}
      </Card>
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Latest vitals</h4>
        {data.latest_vitals ? (
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div className="holo text-center"><small style={{ color: "var(--dim)" }}>BP</small><br /><b>{data.latest_vitals.bp}</b></div>
            <div className="holo text-center"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b>{data.latest_vitals.spo2}%</b></div>
            <div className="holo text-center"><small style={{ color: "var(--dim)" }}>HR</small><br /><b>{data.latest_vitals.heart_rate}</b></div>
            <div className="holo text-center"><small style={{ color: "var(--dim)" }}>Temp</small><br /><b>{data.latest_vitals.temperature}°F</b></div>
          </div>
        ) : <Empty>No vitals yet</Empty>}
      </Card>
      <Card className="md:col-span-2">
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Recent results</h4>
        {data.recent_results.length ? (
          <table className="w-full text-[13px]">
            <thead><tr style={{ color: "var(--dim)" }}><th className="text-left">Analyte</th><th className="text-left">Value</th><th className="text-left">Flag</th><th className="text-left">Date</th></tr></thead>
            <tbody>
              {data.recent_results.map((r: any, i: number) => (
                <tr key={i}><td>{r.analyte}</td><td>{r.value} {r.unit}</td><td><Tag tone={flag(r.flag)}>{r.flag}</Tag></td><td style={{ color: "var(--dim)" }}>{r.date}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No results</Empty>}
      </Card>
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Recent visits</h4>
        {data.encounters.map((e: any) => (
          <div key={e.encounter_id} className="kv"><span>{e.date}</span><b>{e.department || "—"}</b><Tag tone="blue">{e.status}</Tag></div>
        ))}
      </Card>
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
function Labs({ encounterId }: { encounterId: string }) {
  const qc = useQueryClient();
  const [sel, setSel] = useState<string[]>(["CBC", "CRP"]);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<Record<string, any>>({});
  const { data } = useQuery({ queryKey: ["lab", encounterId], queryFn: () => api.encounterLab(encounterId) });

  const toggle = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

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
      <Card>
        <h4 className="mb-2 font-bold" style={{ color: "#d7e5ff" }}>Order tests (CPOE)</h4>
        <div className="flex flex-wrap gap-2">
          {TEST_MENU.map((t) => (
            <button key={t} onClick={() => toggle(t)} className="chip" style={{ borderColor: sel.includes(t) ? "var(--lit)" : "var(--line2)" }}>
              {sel.includes(t) ? "✓ " : ""}{t}
            </button>
          ))}
        </div>
        <button className="btn mt-3 w-full" disabled={busy || !sel.length} onClick={order}>Order selected</button>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--dim)" }}>Auto-creates order + bill + patient QR. Lab Intelligence checks duplicates.</p>
      </Card>

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
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Prescription + CDS */
type Item = { drug_name: string; dose: string; frequency: string };
function Rx({ encounterId }: { encounterId: string }) {
  const [items, setItems] = useState<Item[]>([{ drug_name: "Amoxicillin 500mg", dose: "500 mg", frequency: "1-0-1" }]);
  const [cds, setCds] = useState<any>(null);
  const [rxId, setRxId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accept, setAccept] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const setItem = (i: number, k: keyof Item, val: string) =>
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)));
  const add = (preset?: Item) => setItems((s) => [...s, preset || { drug_name: "", dose: "", frequency: "1-0-1" }]);
  const del = (i: number) => setItems((s) => s.filter((_, idx) => idx !== i));

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
      const r = await api.approveRx(rxId, { approved_by: "Dr. Mehta", accept_substitutions: accept });
      setDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setErr("Blocked by CDS — resolve the allergy conflict or accept a substitution."); setCds((e.detail as any)?.cds?.result || cds); }
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
        {items.map((it, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_70px_70px_28px] gap-2">
            <input className="input" value={it.drug_name} placeholder="Drug" onChange={(e) => setItem(i, "drug_name", e.target.value)} />
            <input className="input" value={it.dose} placeholder="Dose" onChange={(e) => setItem(i, "dose", e.target.value)} />
            <input className="input" value={it.frequency} placeholder="Freq" onChange={(e) => setItem(i, "frequency", e.target.value)} />
            <button className="chip" onClick={() => del(i)}><Trash2 size={14} /></button>
          </div>
        ))}
        <div className="flex gap-2">
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
              <div className="holo mt-2 text-[12.5px]">
                <AgentBadge label="AI" /> Suggested alternatives:
                {cds.suggestions.map((s: any, i: number) => <div key={i}>• <b>{s.suggestion}</b> for {s.for} — {s.reason}</div>)}
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--muted)" }}>
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> Accept AI substitutions
            </label>
            {err && <div className="alertbox mt-2">{err}</div>}
            {done ? (
              <div className="mt-2 flex items-center gap-2" style={{ color: "var(--mint)" }}><CheckCircle2 size={16} /> Approved &amp; e-signed. Pharmacy stock reserved.</div>
            ) : (
              <button className="btn g mt-3 w-full" disabled={busy || (cds.block && !accept)} onClick={approve}>
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
