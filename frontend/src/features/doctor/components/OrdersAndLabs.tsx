import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Card, Tag, Empty, AgentBadge } from "../../../components/ui";

const TEST_MENU = ["CBC", "CRP", "HbA1c", "Lipid Profile", "TSH", "RFT", "Chest X-ray"];

interface OrdersAndLabsProps {
  encounterId: string;
  sel: string[];
  setSel: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function OrdersAndLabs({ encounterId, sel, setSel }: OrdersAndLabsProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<Record<string, any>>({});
  const [customTest, setCustomTest] = useState("");
  const [menu, setMenu] = useState(TEST_MENU);

  const { data } = useQuery({ 
    queryKey: ["lab", encounterId], 
    queryFn: () => api.encounterLab(encounterId) 
  });

  const toggleTest = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

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
    try { 
      await api.createLabOrders(encounterId, sel); 
      setSel([]);
      qc.invalidateQueries({ queryKey: ["lab", encounterId] }); 
    } finally { 
      setBusy(false); 
    }
  }

  async function publish(id: string) {
    const r = await api.publishResult(id);
    setAi((prev) => ({ ...prev, [id]: r }));
    qc.invalidateQueries({ queryKey: ["lab", encounterId] });
  }

  const flagTone = (f: string) => (f === "N" ? "green" : f === "H" || f === "L" ? "amber" : "red");

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_1fr] animate-in fade-in duration-300">
      <div className="space-y-3">
        <Card>
          <h4 className="mb-2 font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Order tests (CPOE)</h4>
          <div className="flex flex-wrap gap-2">
            {menu.map((t) => (
              <button 
                key={t} 
                onClick={() => toggleTest(t)} 
                className="chip" 
                style={{ borderColor: sel.includes(t) ? "var(--lit)" : "var(--line2)" }}
              >
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
              <div>
                <b style={{ color: "#dce9ff" }}>{o.test}</b> 
                <span className="text-[11px]" style={{ color: "var(--dim)" }}> · {o.qr_code}</span>
                <span className="ml-2 text-[11px]">
                  {o.status === "CREATED" && (
                    <Tag tone="amber">PENDING PAY</Tag>
                  )}
                  {o.status === "CONFIRMED" && (
                    <Tag tone="blue">CONFIRMED</Tag>
                  )}
                </span>
              </div>
              {o.status === "RESULTED" ? <Tag tone="green">RESULTED</Tag> : (
                o.status === "CONFIRMED" && (
                  <button className="btn ghost text-xs !py-0.5" onClick={() => publish(o.lab_order_id)}>Simulate result</button>
                )
              )}
            </div>
            {ai[o.lab_order_id]?.result?.abnormal?.length > 0 && (
              <div className="alertbox mt-2">🚨 {ai[o.lab_order_id].result.summary} <AgentBadge label="Lab AI" /></div>
            )}
            {o.results?.length > 0 && (
              <table className="mt-2 w-full text-[13px]">
                <thead>
                  <tr style={{ color: "var(--dim)" }}>
                    <th className="text-left">Analyte</th>
                    <th className="text-left">Value</th>
                    <th className="text-left">Ref</th>
                    <th className="text-left">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {o.results.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.analyte}</td>
                      <td>{r.value} {r.unit}</td>
                      <td style={{ color: "var(--dim)" }}>{r.reference_low}–{r.reference_high}</td>
                      <td><Tag tone={flagTone(r.flag)}>{r.flag}</Tag></td>
                    </tr>
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
