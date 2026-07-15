import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pill, Trash2, Plus, ShieldAlert, CheckCircle2, BadgeCheck } from "lucide-react";
import { api, ApiError } from "../../../lib/api";
import { useJourney } from "../../../lib/store";
import { Card, Tag, Empty, AgentBadge } from "../../../components/ui";

type Item = { drug_name: string; dose: string; frequency: string };

interface PrescriptionProps {
  encounterId: string;
}

export default function Prescription({ encounterId }: PrescriptionProps) {
  const journey = useJourney();
  const [items, setItems] = useState<Item[]>([]);
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

  const setItem = (i: number, k: keyof Item, val: string) => {
    setItems((s) => s.map((it, idx) => (idx === i ? { ...it, [k]: val } : it)));
    setCds(null);
    setRxId(null);
    setDone(null);
  };
  const add = (preset?: Item) => {
    setItems((s) => [...s, preset || { drug_name: "", dose: "", frequency: "1-0-1" }]);
    setCds(null);
    setRxId(null);
    setDone(null);
  };
  const del = (i: number) => {
    setItems((s) => s.filter((_, idx) => idx !== i));
    setCds(null);
    setRxId(null);
    setDone(null);
  };

  const applySuggestion = (forDrug: string, newDrug: string) => {
    setItems((s) => s.map((it) => {
      const isMatch = it.drug_name.toLowerCase().trim() === forDrug.toLowerCase().trim() || 
                      it.drug_name.toLowerCase().includes(forDrug.toLowerCase().trim()) || 
                      forDrug.toLowerCase().includes(it.drug_name.toLowerCase().trim());
      return isMatch ? { ...it, drug_name: newDrug } : it;
    }));
    setCds(null);
    setErr(null);
  };

  async function runCds() {
    setBusy(true); 
    setDone(null); 
    setErr(null);
    try {
      const r = await api.createRx({ encounter_id: encounterId, items });
      setCds(r.result); 
      setRxId(r.rx_id);
    } finally { 
      setBusy(false); 
    }
  }

  async function approve() {
    if (!rxId) return;
    setBusy(true); 
    setErr(null);
    try {
      const r = await api.approveRx(rxId, { approved_by: "Dr. Mehta", accept_substitutions: accept, override_warnings: override });
      setDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr("Blocked by CDS — resolve the allergy conflict, accept a substitution, or override warning.");
        setCds((e.detail as any)?.cds?.result || cds);
      }
    } finally { 
      setBusy(false); 
    }
  }

  async function approveNoMeds() {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const draft = await api.createRx({ encounter_id: encounterId, items: [] });
      const r = await api.approveRx(draft.rx_id, { approved_by: "Dr. Mehta", accept_substitutions: false, override_warnings: false });
      setDone(r);
    } catch (e: any) {
      setErr(e.message || "Failed to e-sign empty prescription");
    } finally {
      setBusy(false);
    }
  }

  const sevTone = (s: string) => (s === "BLOCK" ? "red" : s === "MAJOR" || s === "WARN" ? "amber" : "blue");

  return (
    <div className="grid gap-3 lg:grid-cols-2 animate-in fade-in duration-300">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Prescription</h4>
          <div className="flex gap-1">
            <button type="button" className="chip" onClick={() => add({ drug_name: "Azithromycin 500mg", dose: "500 mg", frequency: "1-0-0" })}>+ Azithromycin</button>
            <button type="button" className="chip" onClick={() => add({ drug_name: "Paracetamol 650mg", dose: "650 mg", frequency: "SOS" })}>+ Paracetamol</button>
          </div>
        </div>

        {items.map((it, i) => {
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
                <button type="button" className="chip" onClick={() => del(i)}><Trash2 size={14} /></button>
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

        {err && <div className="alertbox mt-2">{err}</div>}
        <div className="flex gap-2 mt-3">
          <button type="button" className="btn ghost" onClick={() => add()}><Plus size={15} /> Add</button>
          {items.length > 0 ? (
            <button type="button" className="btn flex-1" disabled={busy} onClick={runCds}><Pill size={15} /> Run CDS</button>
          ) : (
            <button type="button" className="btn flex-1 g" disabled={busy} onClick={approveNoMeds}><BadgeCheck size={16} /> E-Sign (No Meds)</button>
          )}
        </div>
      </Card>

      <Card>
        {done ? (
          <div className="space-y-3 mt-2 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold" style={{ color: "var(--mint)" }}>
              <CheckCircle2 size={18} /> Approved &amp; e-signed. Prescription finalized.
            </div>
            <div className="p-3 rounded-xl bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 text-[var(--cyan)] text-center text-xs font-bold">
              👈 Proceed to the "Billing &amp; Discharge" tab to finalize the consultation.
            </div>
          </div>
        ) : !cds ? (
          <Empty>The Rx CDS agent checks allergy, interactions, dose, formulary and live stock.</Empty>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Clinical decision support</h4>
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
                      type="button"
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
            <button className="btn g mt-3 w-full" disabled={busy || (cds.block && !accept && !override)} onClick={approve}>
              <BadgeCheck size={16} /> Approve &amp; e-sign
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
