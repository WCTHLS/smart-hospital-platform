import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, ShieldAlert, BadgeCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, AgentBadge, Empty } from "../../../components/ui";

interface CopilotSidepaneProps {
  patientId: string;
  tab: string;
  encounterId: string | null;
  sel: string[];
  toggle: (t: string) => void;
  suggestions: any[];
  loadingSuggestions: boolean;
  onGetSuggestions: () => void;

  // Hoisted Rx properties
  rxItems: any[];
  setRxItems: React.Dispatch<React.SetStateAction<any[]>>;
  cds: any;
  setCds: (cds: any) => void;
  rxId: string | null;
  rxBusy: boolean;
  rxAccept: boolean;
  setRxAccept: (accept: boolean) => void;
  rxOverride: boolean;
  setRxOverride: (override: boolean) => void;
  rxDone: any;
  rxErr: string | null;
  approveRx: () => void;
  runCds: (items: any[]) => void;
}

export default function CopilotSidepane({
  patientId,
  tab,
  encounterId,
  sel,
  toggle,
  suggestions,
  loadingSuggestions,
  onGetSuggestions,

  rxItems,
  setRxItems,
  cds,
  setCds,
  rxId,
  rxBusy,
  rxAccept,
  setRxAccept,
  rxOverride,
  setRxOverride,
  rxDone,
  rxErr,
  approveRx,
  runCds,
}: CopilotSidepaneProps) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  
  const { data, isLoading } = useQuery({
    queryKey: ["p360", patientId],
    queryFn: () => api.patient360(patientId),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <Card className="text-center py-6 text-xs text-[var(--dim)]">Loading Copilot context...</Card>;
  if (!data) return null;

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.generateSummary(patientId);
      qc.invalidateQueries({ queryKey: ["p360", patientId] });
    } finally {
      setGenerating(false);
    }
  }

  const summaryText = data.ai_summary?.result?.summary;
  const vitalsUpdatedLabel = (() => {
    const capturedAt = data.latest_vitals?.captured_at;
    if (!capturedAt) return null;
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(capturedAt).getTime()) / 60000));
    if (elapsedMinutes < 1) return "updated just now";
    if (elapsedMinutes < 60) return `updated ${elapsedMinutes} min ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `updated ${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
    return `updated ${new Date(capturedAt).toLocaleDateString()}`;
  })();

  const sevTone = (s: string) => (s === "BLOCK" ? "red" : s === "MAJOR" || s === "WARN" ? "amber" : "blue");

  const applySuggestion = (forDrug: string, newDrug: string) => {
    setRxItems((s) => s.map((it) => {
      const isMatch = it.drug_name.toLowerCase().trim() === forDrug.toLowerCase().trim() || 
                      it.drug_name.toLowerCase().includes(forDrug.toLowerCase().trim()) || 
                      forDrug.toLowerCase().includes(it.drug_name.toLowerCase().trim());
      return isMatch ? { ...it, drug_name: newDrug } : it;
    }));
    setCds(null);
  };

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-300">
      {tab === "labs" ? (
        /* AI Suggested Orders Banner in place of Clinical Summary */
        <Card className="order-2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #ffffff, rgba(207,239,239,.45))", borderColor: "#cfefef" }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> AI Suggested Orders
            </div>
            <AgentBadge label="AI" />
          </div>
          {suggestions.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">Click below to query Gemini AI for clinically indicated diagnostics.</p>
              <button 
                onClick={onGetSuggestions} 
                disabled={loadingSuggestions} 
                className="btn w-full !py-1 text-xs font-bold"
                style={{ background: "rgba(52,225,232,0.08)", border: "1px solid rgba(52,225,232,0.25)", color: "var(--cyan)" }}
              >
                {loadingSuggestions ? "Consulting AI..." : "Get AI Suggestions"}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-[12.5px]">
              {suggestions.map((s: any, idx: number) => {
                const isSelected = sel.includes(s.test);
                return (
                  <div key={idx} className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200">{s.test}</span>
                      <button
                        onClick={() => toggle(s.test)}
                        className={`text-[11px] font-bold px-2 py-0.5 rounded transition ${
                          isSelected
                            ? "bg-[#277154] !text-white border border-[#277154]"
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {isSelected ? "Selected" : "Add to Order"}
                      </button>
                    </div>
                    <div className="text-[11.5px] text-[var(--muted)] leading-relaxed">
                      {s.reason}
                    </div>
                  </div>
                );
              })}
              <button 
                onClick={onGetSuggestions} 
                disabled={loadingSuggestions} 
                className="text-[11px] text-[var(--cyan)] hover:underline block mt-2 text-right w-full"
              >
                {loadingSuggestions ? "Refreshing..." : "↻ Refresh Suggestions"}
              </button>
            </div>
          )}
        </Card>
      ) : (
        /* AI Summary Banner */
        <Card className="ai-summary-card order-2 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #ffffff, rgba(207,239,239,.55))", borderColor: "#cfefef" }}>
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> AI Clinical Summary
            </div>
            {summaryText && (
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="text-[9px] text-[var(--cyan)] hover:text-cyan-300 font-bold uppercase tracking-wider transition disabled:opacity-50"
              >
                {generating ? "Updating..." : "↻ Refresh"}
              </button>
            )}
          </div>
          
          {summaryText ? (
            <p className="text-[11.5px] leading-relaxed text-slate-700 whitespace-pre-line">
              {summaryText}
            </p>
          ) : (
            <div className="text-center py-1">
              <p className="text-[11px] text-[var(--muted)] mb-2">History summary has not been generated yet.</p>
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="btn ghost text-[11px] !py-1.5 !px-2.5 w-full justify-center"
              >
                {generating ? "Generating..." : "Generate AI Summary"}
              </button>
            </div>
          )}
        </Card>
      )}

      <Card className="order-1 max-h-[386px] space-y-3 overflow-y-auto" style={{ background: "#ffffff" }}>
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--dim)]">Clinical snapshot</div>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#277154]">Live record</span>
          </div>
          {data.latest_vitals ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Vitals</span>
                {vitalsUpdatedLabel && <span className="text-[9px] font-medium text-emerald-700">{vitalsUpdatedLabel}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <div className="flex justify-between gap-2"><span className="text-slate-500">BP</span><b>{data.latest_vitals.bp}</b></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">SpO₂</span><b>{data.latest_vitals.spo2}%</b></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Heart rate</span><b>{data.latest_vitals.heart_rate} bpm</b></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Temp</span><b>{data.latest_vitals.temperature}°F</b></div>
                {data.latest_vitals.weight != null && <div className="flex justify-between gap-2"><span className="text-slate-500">Weight</span><b>{data.latest_vitals.weight} kg</b></div>}
                {data.latest_vitals.height != null && <div className="flex justify-between gap-2"><span className="text-slate-500">Height</span><b>{data.latest_vitals.height} cm</b></div>}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-2 text-[10px] text-[var(--muted)]">No current vitals available.</div>
          )}
          <div>
            <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Allergies</div>
            <div className="flex flex-wrap gap-1.5">
              {data.allergies?.length ? data.allergies.map((allergy: any, index: number) => (
                <Tag key={`${allergy.substance}-${index}`} tone="red">{allergy.substance}{allergy.severity ? ` · ${allergy.severity}` : ""}</Tag>
              )) : <span className="text-[11px] text-[var(--muted)]">None recorded</span>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Issues</div>
            <div className="flex flex-wrap gap-1.5">
              {data.issues?.length ? data.issues.map((issue: any) => (
                <Tag key={issue.issue_id} tone="amber">{issue.issue_name}</Tag>
              )) : <span className="text-[11px] text-[var(--muted)]">None recorded</span>}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Active medications</div>
            {data.active_medications?.length ? (
              <ul className="space-y-1 text-[11px] text-slate-600">
                {data.active_medications.map((medication: string, index: number) => <li key={`${medication}-${index}`}>• {medication}</li>)}
              </ul>
            ) : <span className="text-[11px] text-[var(--muted)]">None recorded</span>}
          </div>
      </Card>

      {/* CDS Agent Output Card when on Rx tab */}
      {tab === "rx" && (
        <Card className="order-3 border border-[var(--glass-border)] relative overflow-hidden" style={{ background: "#ffffff" }}>
          {rxDone ? (
            <div className="space-y-3 py-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-xs" style={{ color: "var(--mint)" }}>
                <CheckCircle2 size={18} /> Approved &amp; e-signed.
              </div>
              <p className="text-[11.5px] text-[var(--muted)]">Prescription finalized successfully.</p>
            </div>
          ) : !cds ? (
            <Empty>The Rx CDS agent checks allergy, interactions, dose, formulary and live stock.</Empty>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Clinical Decision Support</h4>
                <AgentBadge label="Rx CDS" />
              </div>
              {cds.block && (
                <div className="alertbox mb-2">
                  <ShieldAlert size={15} className="inline mr-1" /> Prescription contains a blocking allergy conflict.
                </div>
              )}
              <div className="space-y-1.5">
                {cds.alerts.length ? (
                  cds.alerts.map((a: any, i: number) => (
                    <div key={i} className="kv">
                      <span>{a.drug}</span>
                      <span className="flex-1 px-2 text-[11.5px]" style={{ color: "var(--muted)" }}>{a.message}</span>
                      <Tag tone={sevTone(a.severity)}>{a.severity}</Tag>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--mint)" }} className="font-semibold">✓ No conflicts — safe to prescribe.</div>
                )}
              </div>
              {cds.suggestions?.length > 0 && (
                <div className="holo mt-2 text-[11.5px] space-y-1.5 bg-white/[0.01] p-2.5 rounded-xl border border-white/5">
                  <div className="font-semibold text-white flex items-center gap-1">
                    <AgentBadge label="AI" /> Suggested alternatives (click to apply):
                  </div>
                  {cds.suggestions.map((s: any, i: number) => {
                    const isErr = s.suggestion === "AI responses did not give any response";
                    return isErr ? (
                      <div key={i} className="text-left w-full p-2 rounded text-rose-400 border border-rose-500/20 bg-rose-950/10 mt-1 font-semibold text-[10.5px]">
                        ⚠ {s.suggestion} — <span className="text-[10px] text-[var(--muted)]">{s.reason}</span>
                      </div>
                    ) : (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applySuggestion(s.for, s.suggestion)}
                        className="block text-left w-full hover:bg-white/5 p-1 rounded transition text-[var(--cyan)] border border-dashed border-[var(--cyan)]/25 px-2 py-0.5 mt-1 text-[11px]"
                      >
                        • Use <b>{s.suggestion}</b> for {s.for} — <span className="text-[10.5px] text-[var(--muted)]">{s.reason}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-white/5">
                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer" style={{ color: "var(--muted)" }}>
                  <input type="checkbox" checked={rxAccept} onChange={(e) => { setRxAccept(e.target.checked); if (e.target.checked) setRxOverride(false); }} /> Accept AI substitutions
                </label>
                {cds.block && (
                  <label className="flex items-center gap-2 text-[11.5px] text-rose-400 font-semibold cursor-pointer">
                    <input type="checkbox" checked={rxOverride} onChange={(e) => { setRxOverride(e.target.checked); if (e.target.checked) setRxAccept(false); }} /> Override allergy conflict warning (sign anyway)
                  </label>
                )}
              </div>
              {rxErr && <div className="alertbox mt-2 text-rose-400 border-rose-500/10 bg-rose-950/5">{rxErr}</div>}
              <button 
                className="btn g mt-3 w-full justify-center font-bold" 
                disabled={rxBusy || (cds.block && !rxAccept && !rxOverride)} 
                onClick={approveRx}
              >
                <BadgeCheck size={16} /> {rxBusy ? "Signing..." : "Approve & E-sign"}
              </button>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}
