import { useQuery } from "@tanstack/react-query";
import { Trash2, Plus, CheckCircle2, Pill, BadgeCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { useJourney } from "../../../lib/store";
import { Card } from "../../../components/ui";

type Item = { drug_name: string; dose: string; frequency: string; duration_days?: string | number | null };

interface PrescriptionProps {
  encounterId: string;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  cds: any;
  setCds: (cds: any) => void;
  rxId: string | null;
  setRxId: (id: string | null) => void;
  busy: boolean;
  done: any;
  setDone: (done: any) => void;
  err: string | null;
  setErr: (err: string | null) => void;
  runCds: (items: Item[]) => void;
  approveNoMeds: () => void;
}

export default function Prescription({ 
  encounterId, 
  items, 
  setItems, 
  cds, 
  setCds, 
  rxId, 
  setRxId, 
  busy, 
  done, 
  setDone, 
  err, 
  setErr, 
  runCds, 
  approveNoMeds 
}: PrescriptionProps) {
  const journey = useJourney();

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
    setErr(null);
  };

  const add = (preset?: Item) => {
    setItems((s) => [...s, preset || { drug_name: "", dose: "", frequency: "1-0-1", duration_days: 5 }]);
    setCds(null);
    setRxId(null);
    setDone(null);
    setErr(null);
  };

  const del = (i: number) => {
    setItems((s) => s.filter((_, idx) => idx !== i));
    setCds(null);
    setRxId(null);
    setDone(null);
    setErr(null);
  };

  return (
    <div className="w-full animate-in fade-in duration-300">
      <Card className="space-y-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Prescription Form</h4>
          <div className="flex gap-1">
            <button type="button" className="chip" onClick={() => add({ drug_name: "Azithromycin 500mg", dose: "500 mg", frequency: "1-0-0", duration_days: 3 })}>+ Azithromycin</button>
            <button type="button" className="chip" onClick={() => add({ drug_name: "Paracetamol 650mg", dose: "650 mg", frequency: "SOS", duration_days: 5 })}>+ Paracetamol</button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--dim)] border border-dashed border-white/5 rounded-xl">
            No medications added yet. Click "+ Add" or use the preset buttons to start.
          </div>
        ) : (
          items.map((it, i) => {
            const searchVal = it.drug_name.toLowerCase().trim();
            const matched = stock?.find((s: any) => {
              const nameLower = s.drug_name.toLowerCase();
              return nameLower === searchVal || nameLower.includes(searchVal) || searchVal.includes(nameLower);
            });
            const available = matched ? matched.available : 0;

            return (
              <div key={i} className="mb-3 p-3 rounded-xl border" style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}>
                <div className="grid grid-cols-[1fr_70px_70px_60px_28px] gap-2">
                  <input className="input" value={it.drug_name} placeholder="Drug (e.g. Paracetamol)" onChange={(e) => setItem(i, "drug_name", e.target.value)} />
                  <input className="input" value={it.dose} placeholder="Dose" onChange={(e) => setItem(i, "dose", e.target.value)} />
                  <input className="input" value={it.frequency} placeholder="Freq" onChange={(e) => setItem(i, "frequency", e.target.value)} />
                  <input className="input" type="number" value={it.duration_days ?? ""} placeholder="Days" onChange={(e) => setItem(i, "duration_days", e.target.value)} />
                  <button type="button" className="chip text-rose-400 border-rose-500/10 hover:bg-rose-950/15" onClick={() => del(i)}><Trash2 size={14} /></button>
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
          })
        )}

        {err && <div className="alertbox mt-2 text-rose-400 border-rose-500/10 bg-rose-950/5">{err}</div>}
        
        <div className="flex gap-2 mt-4 pt-2 border-t border-white/5">
          <button type="button" className="btn ghost" onClick={() => add()}><Plus size={15} /> Add Medication</button>
          {items.length > 0 ? (
            <button type="button" className="btn flex-1 justify-center" disabled={busy} onClick={() => runCds(items)}><Pill size={15} /> {busy ? "Analyzing..." : "Analyze & Run CDS"}</button>
          ) : (
            <button type="button" className="btn flex-1 g justify-center" disabled={busy} onClick={approveNoMeds}><BadgeCheck size={16} /> E-Sign (No Meds)</button>
          )}
        </div>

        {done && (
          <div className="space-y-3 mt-4 pt-4 border-t border-dashed border-white/10 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-sm" style={{ color: "var(--mint)" }}>
              <CheckCircle2 size={18} /> Approved &amp; e-signed. Prescription finalized.
            </div>
            <div className="p-3 rounded-xl bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 text-[var(--cyan)] text-center text-xs font-bold">
              👉 Proceed to the "Billing &amp; Discharge" tab to finalize the consultation.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
