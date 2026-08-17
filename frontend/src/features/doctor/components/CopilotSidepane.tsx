import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Activity, CheckCircle2, ShieldAlert, BadgeCheck, Plus, AlertTriangle, 
  ChevronDown, ChevronUp, Sparkles, MessageSquare, Send, CheckSquare, 
  ArrowUpRight, Maximize2
} from "lucide-react";
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

const cardClass = "rounded-xl border border-black/[0.05] bg-white/80 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)]";

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
  const [copilotTab, setCopilotTab] = useState<"Insights" | "Tasks" | "Ask Copilot">("Insights");
  
  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ sender: "user" | "copilot"; text: string }>>([
    { sender: "copilot", text: "Hello! I am your ClinIQ AI Copilot. Ask me anything about this patient's medical records, drugs, or lab findings." }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const { data: p360Data } = useQuery({
    queryKey: ["p360", patientId],
    queryFn: () => api.patient360(patientId),
    enabled: !!patientId,
  });

  const previousIssues = p360Data?.issues?.filter(
    (issue: any) => !chiefComplaint || issue.issue_name.toLowerCase().trim() !== chiefComplaint.toLowerCase().trim()
  ) || [];

  const warningItems = [
    ...(p360Data?.allergies || []).map((allergy: any, index: number) => ({
      key: `allergy-${allergy.substance}-${index}`,
      label: `Allergy: ${allergy.substance}`,
      tone: "red",
    })),
    ...previousIssues.map((issue: any) => ({
      key: issue.issue_id,
      label: `${issue.issue_name}${issue.onset_info ? ` (${issue.onset_info})` : ""}`,
      tone: "amber",
    })),
  ];

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

  const handleSendChat = (e?: React.FormEvent, customText?: string) => {
    if (e) e.preventDefault();
    const textToSend = customText || chatInput;
    if (!textToSend.trim()) return;

    setChatHistory((h) => [...h, { sender: "user", text: textToSend }]);
    setChatInput("");
    setChatLoading(true);

    setTimeout(() => {
      let response = "I've analyzed the patient's record. Let me know if you need specific details.";
      const lower = textToSend.toLowerCase();
      
      if (lower.includes("summarize") || lower.includes("summary")) {
        response = p360Data?.ai_summary?.result?.summary || "Ahmed Khan (58 Y, Male) is admitted under suspicion of NSTEMI. Current vitals: BP 128/80, HR 76, SpO2 98%. Active allergies include Penicillin.";
      } else if (lower.includes("interaction") || lower.includes("contraindication")) {
        response = "Prescription analysis reveals a potential Major interaction: Clopidogrel and Omeprazole may interact to reduce antiplatelet efficacy. Consider Pantoprazole as a gastroprotective alternative.";
      } else if (lower.includes("troponin") || lower.includes("labs")) {
        response = "The patient's troponin I is elevated at 1.52 ng/mL (High). Serial troponin monitoring is recommended every 6 hours to rule out myocardial infarction.";
      } else if (lower.includes("vital") || lower.includes("bp")) {
        response = "Latest vitals captured at 10:15 AM: Blood Pressure: 128/80 mmHg (Normal), Heart Rate: 76 bpm (Stable), SpO2: 98% (Adequate).";
      }

      setChatHistory((h) => [...h, { sender: "copilot", text: response }]);
      setChatLoading(false);
    }, 800);
  };

  return (
    <aside className="flex flex-col border border-black/[0.06] rounded-2xl bg-white/70 shadow-[0_10px_26px_rgba(28,33,51,.05)] h-[660px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0078d4]"><Sparkles size={14} /> Copilot Desk</span>
        <div className="flex items-center gap-1 text-slate-400">
          <button type="button" className="grid h-6 w-6 place-items-center rounded hover:bg-black/[0.04]"><ArrowUpRight size={13} /></button>
          <button type="button" className="grid h-6 w-6 place-items-center rounded hover:bg-black/[0.04]"><Maximize2 size={12} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-black/[0.06] px-4">
        {(["Insights", "Tasks", "Ask Copilot"] as const).map((t) => (
          <button 
            key={t} 
            type="button" 
            onClick={() => setCopilotTab(t)}
            className="relative py-2.5 text-[12px] font-extrabold transition outline-none animate-none"
            style={{ color: copilotTab === t ? "#0078d4" : "#64748b" }}
          >
            {t}
            {copilotTab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[#0078d4]" />}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        
        {/* INSIGHTS TAB */}
        {copilotTab === "Insights" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Clinical Insights warnings */}
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Clinical Insights</div>
              <div className="space-y-2">
                {warningItems.map((n, i) => (
                  <div key={i} className={`${cardClass} flex gap-2.5 p-2.5`}>
                    <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-${n.tone === "red" ? "rose-50" : "amber-50"} text-${n.tone === "red" ? "rose-600" : "amber-600"}`}>
                      <ShieldAlert size={14} />
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[11.5px] font-extrabold text-slate-700">{n.label}</div>
                      <p className="text-[10px] leading-snug text-slate-400 font-bold">{n.tone === "red" ? "Active EMR Allergy Alert" : "Chronic Problem List"}</p>
                    </div>
                  </div>
                ))}
                {warningItems.length === 0 && <div className="text-[11px] text-slate-400 font-semibold italic text-center py-2">No active warning codes.</div>}
              </div>
            </div>

            {/* Suggested lab/imaging orders */}
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Suggested Labs &amp; Orders</div>
              {suggestions.length === 0 ? (
                <div className={`${cardClass} space-y-2 text-center`}>
                  <p className="text-[11.5px] leading-relaxed text-slate-500 font-semibold">Indicated diagnostics suggestions.</p>
                  <button 
                    onClick={onGetSuggestions} 
                    disabled={loadingSuggestions} 
                    className="btn w-full justify-center !py-1 text-xs font-bold border border-black/[0.08] hover:bg-slate-50 text-[#0078d4] bg-white rounded-xl shadow-[0_2px_6px_rgba(0,0,0,0.01)]"
                  >
                    {loadingSuggestions ? "Checking..." : "Analyze & Get Suggestions"}
                  </button>
                </div>
              ) : (
                <div className="space-y-2 text-[12px] text-left">
                  {suggestions.map((s: any, idx: number) => {
                    const isSelected = sel.includes(s.test);
                    return (
                      <div key={idx} className={`${cardClass} flex flex-col gap-1.5 p-2.5`}>
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-slate-700 truncate max-w-[150px]">{s.test}</span>
                          <button
                            onClick={() => toggle(s.test)}
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border transition ${
                              isSelected
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-white text-slate-500 border-black/[0.08] hover:bg-slate-50"
                            }`}
                          >
                            {isSelected ? "Selected" : "Add Order"}
                          </button>
                        </div>
                        <div className="text-[10.5px] text-slate-400 leading-snug font-semibold">{s.reason}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Ask */}
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Quick Ask Copilot</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Summarize this patient",
                  "Explain high troponin",
                  "Check drug interactions"
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setCopilotTab("Ask Copilot");
                      handleSendChat(undefined, q);
                    }}
                    className="text-[10.5px] border border-black/[0.08] bg-white/95 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-slate-600 font-bold transition shadow-[0_2px_6px_rgba(0,0,0,0.01)] text-left w-full"
                  >
                    • {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Patient Similarity Finder */}
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient Similarity Finder</div>
              <div className={`${cardClass} p-2.5 text-left`}>
                <div className="text-[11.5px] font-extrabold text-slate-700">Similar Patient Match</div>
                <div className="text-[10.5px] text-slate-400 mt-1 font-semibold leading-snug">
                  56 Y · Male · NSTEMI diagnosis. Currently showing 89% treatment similarity plan.
                </div>
                <button className="text-[10px] font-bold text-[#0078d4] hover:underline mt-1.5 block">Compare Treatment Plans</button>
              </div>
            </div>

          </div>
        )}

        {/* TASKS TAB */}
        {copilotTab === "Tasks" && (
          <div className="space-y-3 text-left animate-in fade-in duration-200">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Workflow Checklist</div>
            {[
              { label: "Review patient triage complain", checked: !!chiefComplaint },
              { label: "Check latest triage vitals", checked: !!p360Data?.latest_vitals },
              { label: "Add chronic diseases (if any)", checked: (p360Data?.issues || []).length > 0 },
              { label: "Review diagnostic lab order options", checked: sel.length > 0 || suggestions.length > 0 },
              { label: "Prescribe active medications & e-sign", checked: !!rxDone },
            ].map((taskItem, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2 bg-white/40 border border-black/[0.04] rounded-lg">
                <CheckSquare size={14} className={taskItem.checked ? "text-emerald-500" : "text-slate-300"} />
                <span className={`text-[11px] font-bold ${taskItem.checked ? "text-slate-400 line-through" : "text-slate-600"}`}>
                  {taskItem.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ASK COPILOT (CHAT) TAB */}
        {copilotTab === "Ask Copilot" && (
          <div className="flex flex-col h-[520px] justify-between animate-in fade-in duration-200">
            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[440px] pr-1">
              {chatHistory.map((chat, idx) => (
                <div key={idx} className={`flex flex-col ${chat.sender === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] p-2.5 rounded-2xl text-[11.5px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.01)] ${
                    chat.sender === "user" 
                      ? "bg-[#0078d4] text-white rounded-tr-none font-semibold text-right" 
                      : "bg-white/80 border border-black/[0.05] text-slate-700 rounded-tl-none font-medium text-left"
                  }`}>
                    {chat.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-semibold pl-2">
                  <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-[#0078d4]" />
                  Copilot is analyzing...
                </div>
              )}
            </div>
            
            <form onSubmit={handleSendChat} className="flex gap-1.5 mt-2 border-t border-black/[0.06] pt-2">
              <input 
                type="text" 
                placeholder="Ask about labs, warnings..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 px-3 py-2 border border-black/[0.08] bg-white rounded-xl text-xs outline-none"
              />
              <button 
                type="submit" 
                className="bg-[#0078d4] hover:bg-[#0078d4]/90 text-white p-2 rounded-xl"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Clinical Decision Support Output Card inside the Sidepane when Medications tab is selected */}
      {tab === "medications" && (
        <div className="border-t border-black/[0.06] bg-slate-50/50 p-3.5 space-y-3 text-left">
          {rxDone ? (
            <div className="space-y-2 py-1 animate-in fade-in">
              <div className="flex items-center gap-2 font-extrabold text-[11px] text-emerald-600">
                <CheckCircle2 size={16} /> Approved &amp; E-signed.
              </div>
              <p className="text-[10.5px] text-slate-400 font-semibold">Prescription finalized successfully.</p>
            </div>
          ) : !cds ? (
            <div className="text-[10px] text-slate-400 font-semibold italic text-center">
              Allergies, dosage warning, and live stock are checked automatically after adding drugs.
            </div>
          ) : (
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-black/[0.04] pb-1.5">
                <h4 className="font-extrabold text-slate-700 text-[11px]">Clinical Decision Support</h4>
                <AgentBadge label="Rx CDS" />
              </div>
              
              {cds.block && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2 rounded-xl text-[10.5px] font-bold flex items-start gap-1">
                  <ShieldAlert size={14} className="shrink-0 mt-px" />
                  <span>Prescription blocked by a severe allergy conflict.</span>
                </div>
              )}
              
              <div className="space-y-1.5">
                {cds.alerts.length ? (
                  cds.alerts.map((a: any, i: number) => (
                    <div key={i} className="flex justify-between items-start gap-2 bg-white p-2 border border-black/[0.04] rounded-lg">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-700 text-[10.5px]">{a.drug}</div>
                        <div className="text-[10px] text-slate-400 font-semibold leading-tight">{a.message}</div>
                      </div>
                      <Tag tone={sevTone(a.severity)}>{a.severity}</Tag>
                    </div>
                  ))
                ) : (
                  <div className="text-emerald-600 font-extrabold text-[11px]">✓ No conflicts — safe to prescribe.</div>
                )}
              </div>
              
              {cds.suggestions?.length > 0 && (
                <div className="mt-2 text-[10.5px] space-y-1.5 bg-white p-2.5 rounded-xl border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
                  <div className="font-extrabold text-slate-700 flex items-center gap-1.5">
                    <AgentBadge label="Suggested" /> Suggested alternatives:
                  </div>
                  {cds.suggestions.map((s: any, i: number) => {
                    const isErr = s.suggestion === "No response was returned";
                    return isErr ? (
                      <div key={i} className="p-2 rounded-lg text-rose-500 border border-rose-100 bg-rose-50/20 font-semibold text-[10px]">
                        ⚠ {s.suggestion} — <span className="text-[9.5px] text-slate-400 font-normal">{s.reason}</span>
                      </div>
                    ) : (
                      <button
                        key={i}
                        type="button"
                        onClick={() => applySuggestion(s.for, s.suggestion)}
                        className="block text-left w-full hover:bg-slate-50 p-1.5 rounded-lg border border-dashed border-[#0078d4]/20 text-[#0078d4] px-2 mt-1 text-[10px] font-bold"
                      >
                        Use <b>{s.suggestion}</b> for {s.for} — <span className="text-[9.5px] text-slate-400 font-normal">{s.reason}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              
              <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-black/[0.04]">
                <label className="flex items-center gap-2 text-[10.5px] font-bold text-slate-500 cursor-pointer">
                  <input type="checkbox" checked={rxAccept} onChange={(e) => { setRxAccept(e.target.checked); if (e.target.checked) setRxOverride(false); }} className="h-3 w-3 accent-[#0078d4]" /> Accept suggested substitutions
                </label>
                {cds.block && (
                  <label className="flex items-center gap-2 text-[10.5px] text-rose-500 font-extrabold cursor-pointer">
                    <input type="checkbox" checked={rxOverride} onChange={(e) => { setRxOverride(e.target.checked); if (e.target.checked) setRxAccept(false); }} className="h-3 w-3 accent-rose-500" /> Override warnings &amp; sign anyway
                  </label>
                )}
              </div>
              
              {rxErr && <div className="bg-rose-50 border border-rose-200 text-rose-700 p-2 rounded-xl text-[10px] font-bold mt-2">{rxErr}</div>}
              
              <button 
                className="btn mt-2.5 w-full justify-center font-extrabold bg-[#0078d4] text-white-force hover:bg-[#0078d4]/90 p-2 rounded-xl shadow-[0_4px_12px_rgba(0,120,212,0.2)]" 
                disabled={rxBusy || (cds.block && !rxAccept && !rxOverride)} 
                onClick={approveRx}
              >
                <BadgeCheck size={14} className="inline mr-1" /> {rxBusy ? "Signing..." : "Approve & E-sign"}
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
