import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, ShieldAlert, BadgeCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, AgentBadge, Empty } from "../../../components/ui";

interface CopilotSidepaneProps {
  patientId: string;
  tab: string;
  encounterId: string | null;
  chiefComplaint?: string | null;
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
  chiefComplaint,
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

  if (isLoading) return <Card className="text-center py-6 text-xs text-[var(--dim)]">Loading clinical context...</Card>;
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
    <div className="space-y-3 animate-in fade-in duration-300">
      {tab === "labs" ? (
        /* Suggested Orders Banner in place of Clinical Summary */
        <Card className="border border-dashed border-[var(--cyan)]/25 relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(37,100,207,0.08), transparent)" }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> Suggested Orders
            </div>
            <AgentBadge label="Suggested" />
          </div>
          {suggestions.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[12px] leading-relaxed text-[var(--muted)]">Click below to check for clinically indicated diagnostics.</p>
              <button 
                onClick={onGetSuggestions} 
                disabled={loadingSuggestions} 
                className="btn w-full !py-1 text-xs font-bold"
                style={{ background: "rgba(37,100,207,0.08)", border: "1px solid rgba(37,100,207,0.25)", color: "var(--cyan)" }}
              >
                {loadingSuggestions ? "Checking..." : "Get Suggested Orders"}
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
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
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
        /* Summary Banner */
        <Card className="relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(37,100,207,0.08), transparent)" }}>
          <div className="flex items-center justify-between gap-1.5 mb-2">
            <div className="flex items-center gap-1.5 font-extrabold text-[11px] text-[var(--cyan)] uppercase tracking-wider">
              <Activity size={13} /> Clinical Summary
            </div>
            {summaryText && (
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="text-[9px] text-[var(--cyan)] hover:text-sky-400 font-bold uppercase tracking-wider transition disabled:opacity-50"
              >
                {generating ? "Updating..." : "↻ Refresh"}
              </button>
            )}
          </div>
          
          {summaryText ? (
            <p className="text-[11.5px] leading-relaxed text-[var(--ink)] whitespace-pre-line">
              {summaryText}
            </p>
          ) : (
            <div className="text-center py-1">
              <p className="text-[11px] text-[var(--muted)] mb-2">History summary has not been generated yet.</p>
              <button 
                onClick={handleGenerate} 
                disabled={generating} 
                className="btn text-[11px] !py-1 !px-2.5 w-full justify-center"
              >
                {generating ? "Generating..." : "Generate Summary"}
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Clinical Decision Support Output Card when on Rx tab */}
      {tab === "rx" && (
        <Card className="border border-[var(--glass-border)] relative overflow-hidden mt-3" style={{ background: "rgba(255,255,255,0.01)" }}>
          {rxDone ? (
            <div className="space-y-3 py-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-xs" style={{ color: "var(--mint)" }}>
                <CheckCircle2 size={18} /> Approved &amp; e-signed.
              </div>
              <p className="text-[11.5px] text-[var(--muted)]">Prescription finalized successfully.</p>
            </div>
          ) : !cds ? (
            <Empty>Allergy, interaction, dose, formulary and live stock are checked automatically.</Empty>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h4 className="font-bold text-slate-100" style={{ color: "#123a7a" }}>Clinical Decision Support</h4>
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
                    <AgentBadge label="Suggested" /> Suggested alternatives (click to apply):
                  </div>
                  {cds.suggestions.map((s: any, i: number) => {
                    const isErr = s.suggestion === "No response was returned";
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
                  <input type="checkbox" checked={rxAccept} onChange={(e) => { setRxAccept(e.target.checked); if (e.target.checked) setRxOverride(false); }} /> Accept suggested substitutions
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

      {summaryText && (
        <>
          {/* Previous Issues & Warnings */}
          <Card className="space-y-2 animate-in fade-in duration-300">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Previous Issues &amp; Warnings</div>
            {(() => {
              const filteredIssues = data.issues?.filter((i: any) => {
                if (!chiefComplaint) return true;
                return i.issue_name.toLowerCase().trim() !== chiefComplaint.toLowerCase().trim();
              }) || [];
              
              if (filteredIssues.length === 0) {
                return <div className="text-[11px] text-[var(--muted)]">No warning alerts recorded</div>;
              }
              
              return filteredIssues.map((i: any) => (
                <div key={i.issue_id} className="inline-block mr-1.5">
                  <Tag tone="red">⚠ {i.issue_name} {i.onset_info ? `(${i.onset_info})` : ""}</Tag>
                </div>
              ));
            })()}
          </Card>

          {/* Used/Active Medications */}
          <Card className="space-y-2 animate-in fade-in duration-300">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Active Medications</div>
            {data.active_medications.length ? (
              <ul className="space-y-1 text-[11.5px] text-[var(--muted)]">
                {data.active_medications.map((m: string, i: number) => <li key={i}>• {m}</li>)}
              </ul>
            ) : <div className="text-[11px] text-[var(--muted)]">None recorded</div>}
          </Card>
        </>
      )}
    </div>
  );
}
