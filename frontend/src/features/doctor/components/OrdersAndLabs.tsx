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
  const flag = summary.match(/(?:Case Flag|Status):\s*(POSITIVE|BORDERLINE|NORMAL|HIGH|MODERATE)/i)?.[1]?.toUpperCase();
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

  const isAlreadyOrdered = (testName: string) => {
    return data?.orders?.some((o: any) => o.test.toLowerCase() === testName.toLowerCase() && o.status !== "CANCELLED");
  };

  async function handleDirectOrder(testName: string) {
    setBusy(true);
    try {
      await api.createLabOrders(encounterId, [testName], doctorName);
      qc.invalidateQueries({ queryKey: ["lab", encounterId] });
    } catch (e) {
      console.error("Direct order creation failed:", e);
    } finally {
      setBusy(false);
    }
  }

  const filteredCatalog = MASTER_TEST_CATALOG.filter((item) => {
    const matchesCat = selectedCategory === "ALL" || item.category === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

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
    <div className="grid gap-3 lg:grid-cols-[400px_1fr] animate-in fade-in duration-300">
      <div>
        <Card className="rounded-2xl border border-black/[0.08] bg-white p-4 text-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between font-extrabold text-[#0c3b63]">
            <span>CPOE Diagnostic Catalog</span>
            <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">✦ Direct Order</span>
          </div>

          {/* Quick Popular Picks */}
          <div className="mt-3">
            <p className="text-[10.5px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">Quick Popular Orders:</p>
            <div className="flex flex-wrap gap-1">
              {POPULAR_QUICK_MENU.map((t) => {
                const ordered = isAlreadyOrdered(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={busy || ordered}
                    onClick={() => handleDirectOrder(t)}
                    className={`text-[10.5px] font-bold py-1 px-2 rounded-lg border transition ${
                      ordered 
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 opacity-75 cursor-default" 
                        : "bg-white border-black/[0.08] text-slate-700 hover:bg-slate-50 shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
                    }`}
                  >
                    {ordered ? `✓ ${t}` : `+ ${t}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3.5 flex flex-wrap gap-1 border-t border-black/[0.05] pt-2.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`text-[10.5px] px-2.5 py-0.5 rounded-full transition ${
                  selectedCategory === cat
                    ? "bg-[#0078d4]/10 text-[#0078d4] font-extrabold border border-[#0078d4]/20"
                    : "text-slate-455 hover:text-slate-650 hover:bg-slate-50 font-bold border border-transparent"
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
              className="w-full text-xs p-2 rounded-xl bg-slate-50 border border-black/[0.08] text-slate-700 outline-none focus:border-[#0078d4] placeholder-slate-400 font-semibold"
            />
          </div>

          {/* Catalog Selection List */}
          <div className="mt-2.5 max-h-[220px] overflow-y-auto space-y-1 pr-1 custom-scrollbar border border-black/[0.05] rounded-xl p-1.5 bg-slate-50/50">
            {filteredCatalog.length === 0 ? (
              <p className="text-[11px] text-slate-400 p-2 text-center font-medium italic">No matching tests found. Type query to add custom order.</p>
            ) : (
              filteredCatalog.map((item) => {
                const ordered = isAlreadyOrdered(item.name);
                return (
                  <div
                    key={item.name}
                    onClick={() => !ordered && !busy && handleDirectOrder(item.name)}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs transition border ${
                      ordered
                        ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-600 cursor-default opacity-85"
                        : "bg-white border-black/[0.03] hover:bg-slate-50 hover:border-black/[0.06] text-slate-700 cursor-pointer shadow-[0_1px_2.5px_rgba(0,0,0,0.01)]"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-extrabold">{item.name}</span>
                      <span className="text-[9.5px] text-slate-400 font-bold">{item.category}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11.5px] font-bold text-[#0078d4]">₹{item.price}</span>
                      <span className={`text-xs font-bold ${ordered ? "text-emerald-600" : "text-slate-400"}`}>
                        {ordered ? "✓" : "+"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Allow custom entry if not in catalog */}
          {searchQuery && !filteredCatalog.some(i => i.name.toLowerCase() === searchQuery.toLowerCase()) && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (searchQuery.trim()) {
                  await handleDirectOrder(searchQuery.trim());
                  setSearchQuery("");
                }
              }}
              className="mt-2 text-xs text-[#0078d4] font-extrabold hover:underline flex items-center gap-1 text-left"
            >
              + Add custom order "{searchQuery}"
            </button>
          )}

          <div className="mt-3 p-2 bg-blue-50/20 border border-blue-500/10 rounded-xl">
            <p className="text-[10.5px] text-slate-400 font-semibold leading-normal text-left">
              💡 Clicking a diagnostic test immediately places the active order for this encounter (auto-creates billing item and billing status).
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        {!data?.orders?.length ? <Empty>No lab orders yet.</Empty> : data.orders.map((o: any) => (
          <Card key={o.lab_order_id} className="rounded-2xl border border-black/[0.08] bg-white p-3.5 text-slate-800 shadow-[0_2px_10px_rgba(0,0,0,0.015)]">
            <div className="flex items-center justify-between text-left">
              <div>
                <b className="text-slate-800 font-extrabold">{o.test}</b> 
                <span className="text-[11px] text-slate-400 font-semibold"> · {o.qr_code}</span>
                <span className="ml-2 text-[11px]">
                  {o.status === "CREATED" && (
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-extrabold bg-amber-50 border border-amber-500/20 text-amber-600">PENDING PAY</span>
                  )}
                  {o.status === "CONFIRMED" && (
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-extrabold bg-blue-50 border border-blue-500/20 text-[#0078d4]">CONFIRMED</span>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {(o.status === "RESULTED" || o.attachment_uri) && (
                  <button 
                    className="bg-[#0078d4]/10 hover:bg-[#0078d4]/15 border border-[#0078d4]/20 text-[#0078d4] text-[10.5px] font-extrabold px-2.5 py-1 rounded-lg transition" 
                    disabled={analyzing[o.lab_order_id]}
                    onClick={() => handleLocalAnalyze(o.lab_order_id)}
                  >
                    {analyzing[o.lab_order_id] ? "Analyzing..." : "⚡ Run Local AI Analysis"}
                  </button>
                )}
                {o.status === "RESULTED" ? <Tag tone="green">RESULTED</Tag> : (
                  <>
                    {o.status === "CONFIRMED" && (
                      <button className="border border-black/[0.08] bg-white text-slate-700 text-[10.5px] font-extrabold px-2.5 py-1 rounded-lg hover:bg-slate-50 transition shadow-[0_1px_2px_rgba(0,0,0,0.01)]" onClick={() => publish(o.lab_order_id)}>Simulate result</button>
                    )}
                    <button 
                      className="border border-black/[0.08] bg-white text-rose-600 text-[10.5px] font-extrabold px-2.5 py-1 rounded-lg hover:bg-rose-50 transition shadow-[0_1px_2px_rgba(0,0,0,0.01)]"
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
              <div className="mt-2.5 pt-2 border-t border-white/5 space-y-2 text-[12.5px] bg-white/[0.01] p-3 rounded-xl">
                <div className="flex items-center justify-between gap-2 w-full min-w-0">
                  {storedAiFlag(o.ai_analysis_summary) && (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] tracking-wide truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[340px] md:max-w-[400px] lg:max-w-[480px] shrink ${
                          storedAiFlag(o.ai_analysis_summary)?.flag === "NORMAL"
                            ? "border-emerald-500/30 bg-emerald-500/10 font-extrabold uppercase text-emerald-500"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-500"
                        }`}
                        title={storedAiFlag(o.ai_analysis_summary)?.label}
                      >
                        {storedAiFlag(o.ai_analysis_summary)?.flag === "NORMAL" ? (
                          "Normal"
                        ) : (
                          <span className="truncate">
                            <span className="mr-1 font-semibold">Detected</span>
                            <span className="font-extrabold">{storedAiFlag(o.ai_analysis_summary)?.label}</span>
                          </span>
                        )}
                      </span>
                      {storedGradcamUri(o.ai_analysis_summary) && (
                        <button
                          type="button"
                          onClick={() => setImagePreview({
                            uri: `${import.meta.env.VITE_API_BASE_URL ?? ""}${storedGradcamUri(o.ai_analysis_summary)}?v=${Date.now()}`,
                            title: "Grad-CAM++ Heatmap",
                          })}
                          className="btn ghost inline-flex text-xs !py-0.5 font-bold text-rose-500 shrink-0"
                          title="View Grad-CAM++ class activation heatmap"
                        >
                          View Grad-CAM++
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {o.ai_analysis_summary && (
                      <button
                        type="button"
                        className="btn ghost text-xs !py-0.5 font-bold"
                        onClick={() => setExpandedAnalysis((current) => ({
                          ...current,
                          [o.lab_order_id]: !current[o.lab_order_id],
                        }))}
                        aria-expanded={Boolean(expandedAnalysis[o.lab_order_id])}
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${expandedAnalysis[o.lab_order_id] ? "rotate-180" : ""}`}
                        />
                        {expandedAnalysis[o.lab_order_id] ? "Collapse AI Result" : "Expand AI Result"}
                      </button>
                    )}
                    {o.attachment_uri && (
                      <button
                        type="button"
                        onClick={() => setImagePreview({
                          uri: `${o.attachment_uri.startsWith("http") || o.attachment_uri.startsWith("/imaging") ? o.attachment_uri : `${import.meta.env.VITE_API_BASE_URL ?? ""}${o.attachment_uri}`}${o.attachment_uri.includes("?") ? "&" : "?"}v=${Date.now()}`,
                          title: o.attachment_name || `${o.test} — Original Scan`,
                        })}
                        className="btn ghost inline-flex text-xs !py-0.5 font-bold"
                        title={o.attachment_name || "View uploaded lab document"}
                      >
                        <FileText size={13} /> View
                      </button>
                    )}
                  </div>
                </div>
                {o.notes && !o.notes.includes("LOCAL PYTORCH") && (
                  <div style={{ color: "var(--muted)" }}>
                    <b className="text-slate-300 block mb-1">Technician Notes:</b>
                    <div className="whitespace-pre-wrap text-slate-300 text-[12px] leading-relaxed p-2 rounded-lg bg-black/10 border border-white/5">
                      {o.notes}
                    </div>
                  </div>
                )}
                {o.ai_analysis_summary && expandedAnalysis[o.lab_order_id] && (
                  <div className="space-y-2" style={{ color: "var(--muted)" }}>
                    <b className="text-sky-400 block mb-1">AI Imaging Assessment:</b>
                    <div className="whitespace-pre-wrap text-slate-200 text-[12px] leading-relaxed font-mono bg-black/20 p-2.5 rounded-lg border border-white/5">
                      {doctorFacingAiSummary(o.ai_analysis_summary)}
                    </div>
                  </div>
                )}
                {expandedAnalysis[o.lab_order_id] && /LOCAL PYTORCH|AI IMAGING ASSESSMENT/.test(o.ai_analysis_summary || o.notes || "") && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11.5px] font-bold flex items-center gap-1.5 shadow-sm">
                    <span>⚠️ Preliminary AI Finding — Requires Physician Verification</span>
                  </div>
                )}
              </div>
            )}
            {!o.attachment_uri && (
              <div className="mt-2.5 rounded-lg border border-dashed border-white/10 bg-white/[0.01] p-2.5 text-[11px] text-[var(--muted)]">
                Document: <span className="font-semibold text-slate-400">No document uploaded.</span>
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
