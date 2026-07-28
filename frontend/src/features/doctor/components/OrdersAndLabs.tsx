import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, X } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty, AgentBadge } from "../../../components/ui";

const MASTER_TEST_CATALOG = [
  // Radiographic Imaging (X-Ray)
  { name: "Chest X-ray", category: "X-Ray", price: 500 },
  { name: "Hand X-ray", category: "X-Ray", price: 600 },
  { name: "Knee X-ray", category: "X-Ray", price: 600 },

  // CT Scans (Tomography)
  { name: "CT scan for brain", category: "CT Scan", price: 2500 },
  { name: "Chest CT Scan", category: "CT Scan", price: 3000 },
  { name: "Abdominal CT Scan", category: "CT Scan", price: 3500 },

  // MRI Scans (Resonance)
  { name: "MRI Brain", category: "MRI", price: 4500 },
  { name: "MRI Knee Joint", category: "MRI", price: 4500 },
  { name: "MRI Spine", category: "MRI", price: 5000 },

  // Cardiology
  { name: "ECG", category: "Cardiology", price: 350 },

  // Pathology / Blood & Urine
  { name: "CBC", category: "Pathology", price: 300 },
  { name: "CRP", category: "Pathology", price: 400 },
  { name: "HbA1c", category: "Pathology", price: 450 },
  { name: "Lipid Profile", category: "Pathology", price: 600 },
  { name: "TSH", category: "Pathology", price: 350 },
  { name: "RFT", category: "Pathology", price: 500 },
  { name: "LFT", category: "Pathology", price: 550 },
];

const POPULAR_QUICK_MENU = ["CT scan for brain", "MRI Brain", "Chest CT Scan", "Chest X-ray", "ECG", "CBC", "HbA1c", "Lipid Profile"];

function storedAiFlag(summary?: string | null): { flag: string; label: string } | null {
  if (!summary) return null;
  const flag = summary.match(/(?:Case Flag|Status):\s*(POSITIVE|BORDERLINE|NORMAL)/i)?.[1]?.toUpperCase();
  if (!flag) return null;
  if (flag === "NORMAL") return { flag, label: "Normal" };

  const finding = summary.match(/(?:Primary Finding|Finding):\s*([^\r\n]+)/i)?.[1]?.trim() || "Abnormal finding";
  return {
    flag,
    label: `${finding.replace(/^Borderline finding:\s*/i, "")} · ${flag}`,
  };
}

function storedGradcamUri(summary?: string | null): string | null {
  const value = summary?.match(/Grad-CAM(?:\+\+)? Heatmap:\s*(\/uploads\/[^\s\r\n]+)/i)?.[1];
  return value || null;
}

function doctorFacingAiSummary(summary: string): string {
  // New summaries are already concise; hide the machine-readable heatmap URI
  // because the dedicated View Grad-CAM++ button owns that interaction.
  if (summary.includes("AI IMAGING ASSESSMENT")) {
    return summary
      .split(/\r?\n/)
      .filter((line) => !/Grad-CAM(?:\+\+)? Heatmap:/i.test(line))
      .join("\n")
      .trim();
  }

  // Present legacy stored summaries cleanly without requiring re-analysis.
  if (summary.includes("LOCAL PYTORCH VISION AI")) {
    const finding = summary.match(/Primary Finding:\s*([^\r\n]+)/i)?.[1]?.trim();
    const severity = summary.match(/Severity:\s*([^( \r\n]+)/i)?.[1]?.trim();
    const confidence = summary.match(/Confidence:\s*([\d.]+%)/i)?.[1]?.trim();
    const recommendation = summary.match(/Recommendation:\s*([^\r\n]+)/i)?.[1]?.trim();
    const scores = summary.match(/Top Pathology Scores:\s*([^\r\n]+)/i)?.[1]
      ?.split("|")
      .map((value) => value.trim())
      .filter((value) => value && !value.toLowerCase().startsWith(`${finding?.toLowerCase()}:`))
      .slice(0, 3);

    return [
      "AI IMAGING ASSESSMENT",
      finding ? `• Finding: ${finding}` : null,
      confidence || severity ? `• Confidence: ${confidence || "N/A"}${severity ? ` · Severity: ${severity}` : ""}` : null,
      scores?.length ? `• Other considerations: ${scores.join(", ")}` : null,
      storedGradcamUri(summary) ? "• Grad-CAM++: Available via the “View Grad-CAM++” button." : null,
      recommendation ? `• Recommendation: ${recommendation}` : null,
    ].filter(Boolean).join("\n");
  }

  return summary;
}

interface OrdersAndLabsProps {
  encounterId: string;
  sel: string[];
  setSel: React.Dispatch<React.SetStateAction<string[]>>;
  doctorName?: string | null;
}

export default function OrdersAndLabs({ encounterId, sel, setSel, doctorName }: OrdersAndLabsProps) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<Record<string, any>>({});
  const [expandedAnalysis, setExpandedAnalysis] = useState<Record<string, boolean>>({});
  const [imagePreview, setImagePreview] = useState<{ uri: string; title: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  // Lab side (LabWorkspace.tsx) polls every 5s and can publish a result at any time —
  // this view is only ever invalidated by the doctor's OWN order actions below, so
  // without its own poll a "RESULTED" status would never appear until the doctor
  // navigates away and back. Same gap/fix as the patient "My Status" board.
  const { data } = useQuery({ 
    queryKey: ["lab", encounterId], 
    queryFn: () => api.encounterLab(encounterId),
    refetchInterval: 5000,
    staleTime: 0,
  });

  const toggleTest = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const filteredCatalog = MASTER_TEST_CATALOG.filter((item) => {
    const matchesCat = selectedCategory === "ALL" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  async function order() {
    setBusy(true);
    try { 
      await api.createLabOrders(encounterId, sel, doctorName); 
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

  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});

  async function handleLocalAnalyze(id: string) {
    setAnalyzing((prev) => ({ ...prev, [id]: true }));
    try {
      await api.localAnalyzeLabOrder(id);
      await qc.invalidateQueries({ queryKey: ["lab", encounterId] });
      setExpandedAnalysis((current) => ({ ...current, [id]: true }));
    } catch (e) {
      console.error("Local analyze error:", e);
    } finally {
      setAnalyzing((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function handleCancelOrder(id: string) {
    try {
      await api.cancelLabOrder(id);
      qc.invalidateQueries({ queryKey: ["lab", encounterId] });
    } catch (e) {
      console.error("Cancel order error:", e);
    }
  }

  const flagTone = (f: string) => (f === "N" ? "green" : f === "H" || f === "L" ? "amber" : "red");

  const CATEGORIES = ["ALL", "CT Scan", "MRI", "X-Ray", "Cardiology", "Pathology"];

  return (
    <div className="grid gap-3 text-slate-800 lg:grid-cols-[340px_1fr] animate-in fade-in duration-300">
      <div>
        <Card>
          <div className="flex items-center justify-between font-bold text-slate-800">
            <span>CPOE Diagnostic Catalog</span>
            <AgentBadge label="Order Sets" />
          </div>

          {/* Quick Popular Picks */}
          <div className="mt-2.5">
            <p className="mb-1.5 text-[11px] font-semibold text-slate-600">Quick Popular Orders:</p>
            <div className="flex flex-wrap gap-1">
              {POPULAR_QUICK_MENU.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTest(t)}
                  className={`btn text-[11px] !py-0.5 !px-2 ${sel.includes(t) ? "cyan font-bold" : "ghost"}`}
                >
                  {sel.includes(t) ? `✓ ${t}` : `+ ${t}`}
                </button>
              ))}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-200 pt-2.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-[10.5px] px-2 py-0.5 rounded-full transition-all ${
                  selectedCategory === cat
                    ? "border border-teal-300 bg-teal-50 font-semibold text-teal-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="mt-2.5">
            <input
              type="text"
              placeholder="Search test by name or category (e.g. Brain, CT, MRI)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15"
            />
          </div>

          {/* Catalog Selection List */}
          <div className="custom-scrollbar mt-2.5 max-h-[220px] space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 pr-1">
            {filteredCatalog.length === 0 ? (
              <p className="p-2 text-center text-[11px] text-slate-500">No matching tests found. Doctor can type custom indication below.</p>
            ) : (
              filteredCatalog.map((item) => (
                <div
                  key={item.name}
                  onClick={() => toggleTest(item.name)}
                  className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                    sel.includes(item.name)
                      ? "border border-teal-300 bg-teal-50 text-slate-900"
                      : "text-slate-700 hover:bg-white"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-[10px] text-slate-500">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-teal-700">₹{item.price}</span>
                    <span className={`text-xs font-bold ${sel.includes(item.name) ? "text-teal-700" : "text-slate-500"}`}>
                      {sel.includes(item.name) ? "✓" : "+"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Allow custom entry if not in catalog */}
          {searchQuery && !filteredCatalog.some(i => i.name.toLowerCase() === searchQuery.toLowerCase()) && (
            <button
              onClick={() => {
                if (searchQuery.trim() && !sel.includes(searchQuery.trim())) {
                  setSel((s) => [...s, searchQuery.trim()]);
                  setSearchQuery("");
                }
              }}
              className="mt-2 flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-600 hover:underline"
            >
              + Add custom order "{searchQuery}"
            </button>
          )}

          <button className="btn mt-3 w-full" disabled={busy || !sel.length} onClick={order}>
            Order Selected ({sel.length})
          </button>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--dim)" }}>
            Auto-creates standardized lab order + billing item + patient QR.
          </p>
        </Card>
      </div>

      <div className="space-y-3">
        {!data?.orders?.length ? <Empty>No lab orders yet.</Empty> : data.orders.map((o: any) => (
          <Card key={o.lab_order_id}>
            <div className="flex items-center justify-between">
              <div>
                <b className="text-slate-800">{o.test}</b> 
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
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {(o.status === "RESULTED" || o.attachment_uri) && (
                  <button 
                    className="btn cyan text-xs !py-0.5 font-bold" 
                    disabled={analyzing[o.lab_order_id]}
                    onClick={() => handleLocalAnalyze(o.lab_order_id)}
                  >
                    {analyzing[o.lab_order_id] ? "Analyzing..." : "⚡ Run Local AI Analysis"}
                  </button>
                )}
                {o.status === "RESULTED" ? <Tag tone="green">RESULTED</Tag> : (
                  <>
                    {o.status === "CONFIRMED" && (
                      <button className="btn ghost text-xs !py-0.5" onClick={() => publish(o.lab_order_id)}>Simulate result</button>
                    )}
                    <button 
                      className="btn ghost text-xs !py-0.5 font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => handleCancelOrder(o.lab_order_id)}
                      title="Remove this test"
                    >
                      ✕ Remove
                    </button>
                  </>
                )}
              </div>
            </div>
            {ai[o.lab_order_id]?.result?.abnormal?.length > 0 && (
              <div className="alertbox mt-2">🚨 {ai[o.lab_order_id].result.summary} <AgentBadge label="Flagged" /></div>
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

            {o.status === "RESULTED" && (o.notes || o.ai_analysis_summary || o.attachment_uri) && (
              <div className="mt-2.5 space-y-2 rounded-xl border-t border-slate-200 bg-slate-50 p-3 pt-2 text-[12.5px]">
                {o.notes && !o.notes.includes("LOCAL PYTORCH") && (
                  <div style={{ color: "var(--muted)" }}>
                    <b className="mb-1 block text-slate-700">Technician Notes:</b>
                    <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[12px] leading-relaxed text-slate-700">
                      {o.notes}
                    </div>
                  </div>
                )}
                {o.ai_analysis_summary && (
                  <div style={{ color: "var(--muted)" }}>
                    <b className="mb-1 block text-teal-700">Local PyTorch Diagnostic Analysis (Doctor Only):</b>
                    <div className="whitespace-pre-wrap rounded-lg border border-teal-100 bg-white p-2.5 font-mono text-[12px] leading-relaxed text-slate-700">
                      {o.ai_analysis_summary}
                    </div>
                  </div>
                )}
                {(o.ai_analysis_summary || o.notes)?.includes("LOCAL PYTORCH") && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11.5px] font-bold text-amber-800 shadow-sm">
                    <span>⚠️ Preliminary AI Finding — Requires Physician Verification</span>
                  </div>
                )}
              </div>
            )}
            {!o.attachment_uri && (
              <div className="mt-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                Document: <span className="font-semibold text-slate-600">No document uploaded.</span>
              </div>
            )}
          </Card>
        ))}
      </div>

      {imagePreview && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={imagePreview.title}
          onClick={() => setImagePreview(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <h3 className="truncate text-sm font-bold text-white">{imagePreview.title}</h3>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={() => setImagePreview(null)}
                aria-label="Close image preview"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-black/40 p-3">
              <img
                src={imagePreview.uri}
                alt={imagePreview.title}
                className="mx-auto h-auto max-h-[80vh] w-full max-w-4xl rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
