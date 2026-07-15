import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, AgentBadge } from "../../../components/ui";

interface CopilotSidepaneProps {
  patientId: string;
  tab: string;
  encounterId: string | null;
  sel: string[];
  toggle: (t: string) => void;
  suggestions: any[];
  loadingSuggestions: boolean;
  onGetSuggestions: () => void;
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

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {tab === "labs" ? (
        /* AI Suggested Orders Banner in place of Clinical Summary */
        <Card className="border border-dashed border-[var(--cyan)]/25 relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.08), transparent)" }}>
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
        /* AI Summary Banner */
        <Card className="relative overflow-hidden" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.08), transparent)" }}>
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
            <p className="text-[11.5px] leading-relaxed text-[#d2e2ff] whitespace-pre-line">
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
                {generating ? "Generating..." : "Generate AI Summary"}
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
            {data.issues?.length ? data.issues.map((i: any) => (
              <div key={i.issue_id} className="inline-block mr-1.5">
                <Tag tone="red">⚠ {i.issue_name} {i.onset_info ? `(${i.onset_info})` : ""}</Tag>
              </div>
            )) : <div className="text-[11px] text-[var(--muted)]">No warning alerts recorded</div>}
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
