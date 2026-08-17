import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  FlaskConical, CheckCircle2, User, Play, Search, Send, BarChart2,
  FileText, Activity, AlertTriangle, CheckCircle, RefreshCw, XCircle
} from "lucide-react";
import { api } from "../../lib/api";
import { Card, Tag } from "../../components/ui";
import LabResultForm from "./components/LabResultForm";

export default function LabWorkspace() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<string>("overview");
  const [copilotTab, setCopilotTab] = useState<"insights" | "tasks" | "ask">("insights");
  const [chatQuery, setChatQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<any[]>([
    { sender: "copilot", text: "Hello! I am your Lab AI Assistant. Critical Troponin levels detected for Ahmed Khan (MRN: CLN-00012345). Recommend immediate clinical notification." }
  ]);

  const { data: orders, refetch } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: api.labOrders,
    refetchInterval: 5000,
  });

  // Filter orders to render only Pathology and Cardiology tests
  const labOrders = orders?.filter((o: any) => o.category !== "RADIOLOGY") || [];

  const pending = labOrders.filter((o: any) => o.status === "CONFIRMED");
  const collected = labOrders.filter((o: any) => o.status === "SAMPLE_COLLECTED");
  const completed = labOrders.filter((o: any) => o.status === "RESULTED");

  // Keep selected order in sync
  const liveSelectedOrder = selectedOrder
    ? orders?.find((o: any) => o.lab_order_id === selectedOrder.lab_order_id) || selectedOrder
    : null;

  // Handle chat submission
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim()) return;
    const userMsg = { sender: "user", text: chatQuery };
    setChatHistory(prev => [...prev, userMsg]);
    
    // Simulate AI response
    setTimeout(() => {
      let aiText = "Analyzing lab data. Please verify instrument status and control samples.";
      if (chatQuery.toLowerCase().includes("critical")) {
        aiText = "There are 18 critical alerts active, mostly relating to Troponin I and Potassium levels in ICU-07.";
      } else if (chatQuery.toLowerCase().includes("tat")) {
        aiText = "Average Turnaround Time (TAT) is 58 minutes, which is within the target of < 60 minutes.";
      }
      setChatHistory(prev => [...prev, { sender: "copilot", text: aiText }]);
    }, 800);
    setChatQuery("");
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200" style={{ fontFamily: '"Segoe UI Variable Text","Segoe UI",Inter,sans-serif' }}>
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 text-left">
        <div>
          <h2 className="text-[16px] font-extrabold text-[#0c3b63]">Laboratory Dashboard</h2>
          <p className="text-[11.5px] text-slate-500 font-semibold">Real-time overview of laboratory diagnostics and clinical processing.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Lab Status: Operational
          </span>
          <button onClick={() => refetch()} className="p-1 rounded hover:bg-slate-100 transition text-slate-400" title="Refresh data">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* 6 KPI Sparkline Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 text-left">
        {[
          { label: "Total Samples", value: "1,248", change: "+12% vs yesterday", color: "#0078d4", points: [10, 15, 8, 14, 20, 15, 25, 22, 28] },
          { label: "Pending Collection", value: "188", change: "+8% vs yesterday", color: "#CA5010", points: [25, 20, 28, 22, 19, 21, 15, 17, 18] },
          { label: "In Process", value: "426", change: "--", color: "#8764B8", points: [10, 12, 14, 11, 15, 13, 17, 19, 20] },
          { label: "Results Ready", value: "962", change: "+10% vs yesterday", color: "#16a34a", points: [15, 18, 22, 25, 20, 24, 28, 30, 32] },
          { label: "Critical Results", value: "18", change: "-5% vs yesterday", color: "#D13438", points: [8, 12, 7, 9, 11, 8, 6, 4, 3] },
          { label: "Rejected Samples", value: "22", change: "+2% vs yesterday", color: "#e11d48", points: [4, 5, 2, 4, 6, 3, 5, 4, 2] }
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-black/[0.07] bg-white relative overflow-hidden p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)]">
            <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: k.color }} />
            <div className="text-[19px] font-extrabold leading-none text-slate-800">{k.value}</div>
            <div className="mt-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{k.label}</div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] text-slate-400 font-semibold">{k.change}</span>
              {/* Micro Sparkline */}
              <svg className="w-12 h-6" viewBox="0 0 40 20">
                <polyline
                  fill="none"
                  stroke={k.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={k.points.map((val, idx) => `${idx * 5},${20 - val * 0.6}`).join(" ")}
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs Row */}
      <div className="flex border-b border-black/[0.06] pb-px overflow-x-auto whitespace-nowrap">
        {[
          { id: "overview", label: "Overview" },
          { id: "sample_mgmt", label: "Sample Management" },
          { id: "results", label: "Results Queue" },
          { id: "qc", label: "Quality Control" },
          { id: "analytics", label: "Analytics" },
          { id: "instruments", label: "Instrument Status" },
          { id: "departments", label: "Departments" },
          { id: "config", label: "Configuration" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 text-[12.5px] font-extrabold transition border-b-2 -mb-px ${
              activeSubTab === tab.id
                ? "border-[#0078d4] text-[#0078d4]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid Layout split (Overview tab active) */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_310px]">
        
        {/* Left Side: Overview Workspace */}
        <div className="space-y-4 min-w-0">
          
          {activeSubTab === "overview" ? (
            <>
              {/* Analytics row */}
              <div className="grid gap-4 md:grid-cols-3 text-left">
                {/* Donut Chart Widget */}
                <Card className="p-4 flex flex-col justify-between min-h-[220px]">
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-3">Sample Status</h4>
                  <div className="flex items-center justify-around gap-2 flex-1">
                    {/* SVG Donut */}
                    <div className="relative w-28 h-28 shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                        {/* 15% Pending Collection */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#CA5010" strokeWidth="3.2" strokeDasharray="15 85" strokeDashoffset="100" />
                        {/* 34% In Process */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#8764B8" strokeWidth="3.2" strokeDasharray="34 66" strokeDashoffset="85" />
                        {/* 48% Results Ready */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#16a34a" strokeWidth="3.2" strokeDasharray="48 52" strokeDashoffset="51" />
                        {/* 3% Critical/Rejected */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#D13438" strokeWidth="3.2" strokeDasharray="3 97" strokeDashoffset="3" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[15px] font-extrabold text-slate-800 leading-none">1,248</span>
                        <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest mt-0.5">Samples</span>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="space-y-1 text-[10px] font-extrabold text-slate-500">
                      <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#16a34a]" /> Ready (77%)</div>
                      <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#8764B8]" /> Process (34%)</div>
                      <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#CA5010]" /> Pending (15%)</div>
                      <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#D13438]" /> Urgent (2%)</div>
                    </div>
                  </div>
                </Card>

                {/* Line Chart Widget */}
                <Card className="p-4 flex flex-col justify-between min-h-[220px]">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="text-[12.5px] font-extrabold text-[#0c3b63]">TAT Performance (Avg)</h4>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 font-bold px-1.5 py-0.2 rounded border border-emerald-100">Goal &lt; 60m</span>
                  </div>
                  <div className="text-[18px] font-extrabold text-slate-800">58 min <span className="text-xs text-emerald-600 font-bold">Within Target</span></div>
                  <div className="flex-1 min-h-[110px] flex items-end">
                    {/* SVG Line Graph */}
                    <svg className="w-full h-24" viewBox="0 0 160 60">
                      {/* Grid Lines */}
                      <line x1="0" y1="10" x2="160" y2="10" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="30" x2="160" y2="30" stroke="#f1f5f9" strokeWidth="1" />
                      <line x1="0" y1="50" x2="160" y2="50" stroke="#f1f5f9" strokeWidth="1" />
                      {/* Target Limit Line (Red dashed) */}
                      <line x1="0" y1="20" x2="160" y2="20" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" />
                      {/* Trend Curve */}
                      <path
                        fill="none"
                        stroke="#0078d4"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        d="M 10 45 Q 35 30 55 35 T 100 25 T 145 15"
                      />
                      {/* Data point dots */}
                      <circle cx="10" cy="45" r="3.5" fill="#ffffff" stroke="#0078d4" strokeWidth="2" />
                      <circle cx="55" cy="35" r="3.5" fill="#ffffff" stroke="#0078d4" strokeWidth="2" />
                      <circle cx="100" cy="25" r="3.5" fill="#ffffff" stroke="#0078d4" strokeWidth="2" />
                      <circle cx="145" cy="15" r="3.5" fill="#ffffff" stroke="#0078d4" strokeWidth="2" />
                    </svg>
                  </div>
                </Card>

                {/* Priority distribution card */}
                <Card className="p-4 flex flex-col justify-between min-h-[220px]">
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-3">Samples by Priority</h4>
                  <div className="space-y-2 text-[10.5px] font-extrabold text-slate-500">
                    <div>
                      <div className="flex justify-between mb-0.5"><span>Routine</span><span>892 (71%)</span></div>
                      <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#16a34a]" style={{ width: "71%" }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5"><span>STAT</span><span>228 (18%)</span></div>
                      <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#CA5010]" style={{ width: "18%" }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5"><span>Urgent</span><span>106 (8%)</span></div>
                      <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#D13438]" style={{ width: "8%" }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5"><span>ASAP</span><span>22 (2%)</span></div>
                      <div className="h-2 rounded bg-slate-100 overflow-hidden"><div className="h-full bg-[#8764B8]" style={{ width: "2%" }} /></div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Recent Samples Table */}
              <Card className="p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.01)]">
                <h3 className="text-[13.5px] font-extrabold text-[#0c3b63] mb-3 pb-1 border-b border-black/[0.04]">Recent Samples Worklist</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-black/[0.08] pb-2 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
                        <th className="pb-2 pr-3">Sample ID</th>
                        <th className="pb-2 pr-3">Patient Name</th>
                        <th className="pb-2 pr-3">Test / Profile</th>
                        <th className="pb-2 pr-3">Priority</th>
                        <th className="pb-2 pr-3">Collected On</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.04] font-semibold text-slate-700">
                      {labOrders.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 italic">No samples in queue.</td>
                        </tr>
                      ) : (
                        labOrders.slice(0, 8).map((o: any) => {
                          const priority = o.test === "CRP" ? "Urgent" : o.test === "CBC" ? "STAT" : "Routine";
                          const isSelected = selectedOrder?.lab_order_id === o.lab_order_id;
                          return (
                            <tr 
                              key={o.lab_order_id} 
                              className={`hover:bg-slate-50/70 transition cursor-pointer ${isSelected ? "bg-[#0078d4]/5 text-[#0078d4]" : ""}`}
                              onClick={() => setSelectedOrder(o)}
                            >
                              <td className="py-2.5 pr-3 font-mono text-[11px] text-slate-500">SMP-{o.lab_order_id.slice(-8).toUpperCase()}</td>
                              <td className="py-2.5 pr-3 font-extrabold text-slate-800">{o.patient_name}</td>
                              <td className="py-2.5 pr-3">{o.test}</td>
                              <td className="py-2.5 pr-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-extrabold border ${
                                  priority === "STAT" ? "bg-red-50 text-red-700 border-red-200" :
                                  priority === "Urgent" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  "bg-green-50 text-green-700 border-green-200"
                                }`}>
                                  {priority}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-slate-400 font-semibold">{o.ordered_ts ? new Date(o.ordered_ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "N/A"}</td>
                              <td className="py-2.5 pr-3">
                                {o.status === "CONFIRMED" && <span className="text-amber-600 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded text-[10px]">PENDING</span>}
                                {o.status === "SAMPLE_COLLECTED" && <span className="text-[#0078d4] bg-blue-50 border border-blue-200/50 px-1.5 py-0.5 rounded text-[10px]">IN PROCESS</span>}
                                {o.status === "RESULTED" && <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1.5 py-0.5 rounded text-[10px]">RESULTS READY</span>}
                              </td>
                              <td className="py-2.5">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setSelectedOrder(o); }}
                                  className="text-[#0078d4] hover:underline font-bold text-xs inline-flex items-center gap-1"
                                >
                                  {o.status === "RESULTED" ? "Edit" : "Enter Results"}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Bottom Widgets Row */}
              <div className="grid gap-4 md:grid-cols-4 text-left">
                {/* Critical Results (18) */}
                <Card className="p-4 flex flex-col justify-between">
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-2">Critical Results (18)</h4>
                  <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[140px] pr-1 scrollbar-thin">
                    {[
                      { name: "Ahmed Khan", value: "Troponin I: 1.52 ng/mL", time: "5 min ago" },
                      { name: "Imran Ali", value: "Potassium: 6.2 mmol/L", time: "7 min ago" },
                      { name: "Sara Noor", value: "CRP: 98 mg/L", time: "12 min ago" },
                    ].map((c, i) => (
                      <div key={i} className="p-1.5 rounded-lg bg-rose-50 border border-rose-100 text-[10px] font-semibold text-slate-700 flex justify-between items-start gap-1">
                        <div>
                          <b className="text-rose-600 block">{c.name}</b>
                          <span className="text-slate-500">{c.value}</span>
                        </div>
                        <span className="text-[8.5px] text-slate-400 shrink-0 font-bold">{c.time}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Instrument Status Table */}
                <Card className="p-4 flex flex-col justify-between col-span-2">
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] mb-2">Instrument Status</h4>
                  <div className="overflow-x-auto flex-1 max-h-[140px] scrollbar-thin">
                    <table className="w-full text-left text-[10.5px] font-semibold text-slate-600">
                      <thead>
                        <tr className="border-b border-black/[0.04] text-[9.5px] font-bold text-slate-400">
                          <th className="pb-1">Instrument</th>
                          <th className="pb-1">Department</th>
                          <th className="pb-1 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.03]">
                        {[
                          { name: "Cobas 8000", dept: "Biochemistry", status: "Online", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                          { name: "XN-550", dept: "Hematology", status: "Online", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                          { name: "Architect i2000", dept: "Immunoassay", status: "Warning", tone: "bg-amber-50 text-amber-700 border-amber-200" },
                          { name: "Bact/ALERT 3D", dept: "Microbiology", status: "Online", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                          { name: "GeneXpert IV", dept: "Molecular", status: "Maintenance", tone: "bg-blue-50 text-blue-700 border-blue-200" },
                        ].map((item) => (
                          <tr key={item.name}>
                            <td className="py-1 font-bold text-slate-800">{item.name}</td>
                            <td className="py-1">{item.dept}</td>
                            <td className="py-1 text-right">
                              <span className={`px-1 py-0.1 rounded text-[9.5px] font-extrabold border ${item.tone}`}>{item.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Quality Control Gauge */}
                <Card className="p-4 flex flex-col items-center justify-between text-center">
                  <h4 className="text-[12.5px] font-extrabold text-[#0c3b63] w-full text-left">Quality Control</h4>
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#16a34a" strokeWidth="4" strokeDasharray="95 5" strokeDashoffset="100" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[16px] font-extrabold text-[#16a34a] leading-none">95%</span>
                      <span className="text-[8px] font-bold text-slate-400 mt-0.5">QC PASS</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide">Total QC Samples: 520</span>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-12 text-center text-slate-400 italic">
              Features under development. Please check back later.
            </Card>
          )}

        </div>

        {/* Right Side: AI Copilot side pane (Image 2) */}
        <div className="space-y-4 min-w-0">
          <Card className="p-3.5 text-left border border-black/[0.08] shadow-[0_2px_14px_rgba(0,0,0,0.02)] flex flex-col justify-between min-h-[580px]">
            <div>
              {/* Copilot Header */}
              <div className="flex items-center gap-2 pb-2.5 border-b border-black/[0.04] mb-3">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#0078d4]/10 text-[#0078d4] shrink-0">
                  <Activity size={14} />
                </span>
                <div>
                  <h4 className="text-[13px] font-extrabold text-slate-800 leading-none flex items-center gap-1.5">
                    AI Copilot <span className="rounded bg-sky-100 px-1 py-0.2 text-[8px] font-extrabold text-[#0078d4] uppercase">Beta</span>
                  </h4>
                  <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">LIS Intelligence Assistant</span>
                </div>
              </div>

              {/* Copilot Tabs */}
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-50 border border-black/[0.05] rounded-lg mb-3">
                {[
                  { id: "insights", label: "Insights" },
                  { id: "tasks", label: "Tasks (6)" },
                  { id: "ask", label: "Ask Copilot" }
                ].map((ct) => (
                  <button
                    key={ct.id}
                    onClick={() => setCopilotTab(ct.id as any)}
                    className={`py-1 text-[10.5px] font-extrabold rounded transition ${
                      copilotTab === ct.id
                        ? "bg-white text-slate-800 shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-black/[0.03]"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              {copilotTab === "insights" && (
                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-xl border border-red-500/10 bg-red-500/5 text-xs font-semibold text-slate-700 relative pl-7 shadow-sm text-left">
                    <AlertTriangle size={14} className="text-red-500 absolute left-2 top-2.5" />
                    <b className="text-red-600 block text-[11px] mb-0.5">18 Critical Results</b>
                    <span className="text-[10.5px] text-slate-500">ICU Potassium &amp; Cardiac panels require immediate physician notifications.</span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-blue-500/10 bg-blue-500/5 text-xs font-semibold text-slate-700 relative pl-7 shadow-sm text-left">
                    <Activity size={14} className="text-blue-500 absolute left-2 top-2.5" />
                    <b className="text-[#0078d4] block text-[11px] mb-0.5">TAT Performance</b>
                    <span className="text-[10.5px] text-slate-500">Average Turnaround Time (TAT) is 58 minutes. Within targeted goal threshold.</span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-amber-500/10 bg-amber-500/5 text-xs font-semibold text-slate-700 relative pl-7 shadow-sm text-left">
                    <AlertTriangle size={14} className="text-amber-600 absolute left-2 top-2.5" />
                    <b className="text-amber-700 block text-[11px] mb-0.5">Sample Rejection</b>
                    <span className="text-[10.5px] text-slate-500">22 samples rejected today. Check QC protocols for hemolysed blood specimens.</span>
                  </div>

                  {/* Recommended Actions */}
                  <div className="pt-2 border-t border-black/[0.04]">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">Recommended Actions</span>
                    <div className="space-y-1.5 text-xs font-bold">
                      <div className="flex justify-between items-center p-2 rounded-lg border border-black/[0.04] bg-white hover:bg-slate-50 transition cursor-pointer">
                        <span className="text-slate-650 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Review Critical Results</span>
                        <span className="text-[9.5px] text-[#0078d4]">Open</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded-lg border border-black/[0.04] bg-white hover:bg-slate-50 transition cursor-pointer">
                        <span className="text-slate-650 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Approve Pending Results</span>
                        <span className="text-[9.5px] text-[#0078d4]">Review</span>
                      </div>
                      <div className="flex justify-between items-center p-2 rounded-lg border border-black/[0.04] bg-white hover:bg-slate-50 transition cursor-pointer">
                        <span className="text-slate-650 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Check Instrument Alerts</span>
                        <span className="text-[9.5px] text-[#0078d4]">View</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {copilotTab === "tasks" && (
                <div className="space-y-2 text-xs font-bold text-slate-600">
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-black/[0.03]">
                    <input type="checkbox" className="mt-0.5" defaultChecked />
                    <span className="line-through text-slate-400">Calibrate Cobas 8000 chemistry assay module</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-black/[0.03]">
                    <input type="checkbox" className="mt-0.5" />
                    <span>Approve troponin results for Swagath Reddy</span>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-black/[0.03]">
                    <input type="checkbox" className="mt-0.5" />
                    <span>Release lipid panel summary for John Doe</span>
                  </div>
                </div>
              )}

              {copilotTab === "ask" && (
                <div className="space-y-2">
                  <div className="h-[260px] overflow-y-auto border border-black/[0.05] rounded-xl bg-slate-50 p-2.5 space-y-2 text-[11px] font-semibold text-slate-700 scrollbar-thin">
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`p-2 rounded-xl text-left max-w-[85%] ${
                        msg.sender === "copilot"
                          ? "bg-white border border-black/[0.04] mr-auto"
                          : "bg-[#0078d4] text-white-force ml-auto"
                      }`}>
                        {msg.text}
                      </div>
                    ))}
                  </div>
                  <form onSubmit={handleSendChat} className="flex gap-1.5 pt-1">
                    <input 
                      type="text" 
                      placeholder="Ask anything about the lab..." 
                      className="input text-xs flex-1"
                      value={chatQuery}
                      onChange={(e) => setChatQuery(e.target.value)}
                    />
                    <button type="submit" className="bg-[#0078d4] hover:bg-[#0078d4]/90 p-2 rounded-xl text-white-force shadow">
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}

            </div>

            {/* Quick Ask Suggestion block */}
            <div className="pt-3 border-t border-black/[0.04] text-[10px] space-y-1.5">
              <span className="font-extrabold text-slate-400 uppercase tracking-wider block">Quick Ask</span>
              <button onClick={() => setChatQuery("Show critical results")} className="w-full text-left p-1.5 rounded-lg border border-black/[0.04] hover:bg-slate-50 transition text-slate-500 font-semibold truncate">
                Which samples are delayed?
              </button>
              <button onClick={() => setChatQuery("Release warning alerts")} className="w-full text-left p-1.5 rounded-lg border border-black/[0.04] hover:bg-slate-50 transition text-slate-500 font-semibold truncate">
                Verify troponin calibrator controls
              </button>
            </div>
          </Card>
        </div>

      </div>

      {/* Result Entry Modal Dialog Overlay */}
      {liveSelectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setSelectedOrder(null)}>
          <div 
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-black/15 flex flex-col text-slate-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto p-4 max-h-[85vh]">
              <LabResultForm
                selectedOrder={liveSelectedOrder}
                onClearSelection={() => setSelectedOrder(null)}
                onSubmitSuccess={() => {
                  setSelectedOrder(null);
                  refetch();
                  qc.invalidateQueries({ queryKey: ["lab"] });
                  qc.invalidateQueries({ queryKey: ["portal-p360"] });
                }}
              />
            </div>
            <div className="border-t border-black/10 px-5 py-3 bg-slate-50 text-right">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="bg-white hover:bg-slate-100 border border-black/[0.08] text-slate-700 font-bold text-xs py-1.5 px-4 rounded-lg transition"
              >
                Close Editor
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
