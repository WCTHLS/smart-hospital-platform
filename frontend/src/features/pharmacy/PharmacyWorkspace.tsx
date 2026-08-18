import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Pill, Search, Clipboard, User, Calendar, CheckCircle2, 
  AlertTriangle, RefreshCw, ShieldAlert, BadgeInfo, Clock, PackageCheck, ShoppingBag,
  SlidersHorizontal, ListFilter, ArrowUpRight, Maximize2, Send, CheckSquare, Sparkles, ChevronDown,
  Layers, Heart, LineChart, FileText, Ban, Trash2, Settings, HardDrive, ShoppingCart, Truck, Bell, MessageSquare, X
} from "lucide-react";
import { api } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { Card, Tag, Empty } from "../../components/ui";

const WORKSPACE_NAV = [
  { id: "dashboard", label: "Dashboard", icon: Layers },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "inpatient", label: "Inpatient Orders", icon: ShoppingCart },
  { id: "outpatient", label: "Outpatient Orders", icon: ShoppingBag },
  { id: "therapeutic", label: "IV to PO / Therapeutic", icon: Heart },
  { id: "medication", label: "Medication Profile", icon: User },
  { id: "interactions", label: "Drug Interactions", icon: AlertTriangle },
  { id: "returns", label: "Returns / Reversals", icon: RefreshCw },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "analytics", label: "Analytics", icon: LineChart },
];

const INVENTORY_NAV = [
  { id: "stock", label: "Stock Management", icon: HardDrive },
  { id: "purchase", label: "Purchase Orders", icon: ShoppingCart },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "expiry", label: "Expiry Management", icon: Clock },
  { id: "recall", label: "Recall Management", icon: Ban },
];

const SYSTEM_NAV = [
  { id: "alerts", label: "Alerts", icon: Bell, badge: 5 },
  { id: "tasks", label: "Tasks", icon: CheckSquare, badge: 12 },
  { id: "messages", label: "Messages", icon: MessageSquare, badge: 8 },
  { id: "settings", label: "Settings", icon: Settings },
];

const PHARM_TASKS = [
  { text: "Verify 12 high priority orders", done: false },
  { text: "Follow up on 5 drug interaction alerts", done: false },
  { text: "Review 3 therapeutic duplications", done: true },
  { text: "Approve 7 return requests", done: false },
  { text: "Check expiring stock items", done: false },
];

const PHARM_CRITICAL_ALERTS = [
  { title: "Heparin 5000 IU Injection", desc: "Low stock: 10 vials remaining", tone: "#D13438" },
  { title: "Meropenem 1 g Injection", desc: "Expiring in 5 days", tone: "#D13438" },
  { title: "Vancomycin 1 g Injection", desc: "Recall issued by manufacturer", tone: "#D13438" },
];

const COPILOT_INSIGHTS = [
  { title: "Drug Interaction", desc: "5 prescriptions have potential drug interactions.", action: "Review" },
  { title: "Therapeutic Duplication", desc: "3 patients have duplicate therapy.", action: "Resolve" },
  { title: "Dose Alerts", desc: "2 prescriptions may require dose adjustment.", action: "Verify" },
];

export default function PharmacyWorkspace() {
  const qc = useQueryClient();
  const { activeRole } = useJourney();
  const isPharmacist = activeRole === "pharmacist";
  
  // Workspace states
  const [activeSubTab, setActiveSubTab] = useState("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [worklistTab, setWorklistTab] = useState<"All" | "New" | "InProgress" | "Ready" | "Completed">("All");
  
  // Roster details states
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);
  const [storeLocation, setStoreLocation] = useState("Main Pharmacy");
  const [showCopilot, setShowCopilot] = useState(true);
  const [copilotTab, setCopilotTab] = useState<"Insights" | "Interactions" | "Ask Copilot">("Insights");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([
    { who: "copilot", text: "Hello! I am your AI Pharmacy assistant. Ask me anything about stock reserves, drug interaction alerts, or upcoming outpatient prescription pick-ups.", time: "11:00 AM" }
  ]);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: stockItems = [], isLoading: isStockLoading, refetch: refetchStock } = useQuery({
    queryKey: ["pharmacy-stock-list"],
    queryFn: () => api.stock(),
    refetchInterval: 12000,
  });

  const { data: prepaidOrders = [], isLoading: isPrepaidLoading } = useQuery({
    queryKey: ["pharmacy-prepaid-orders"],
    queryFn: () => api.prepaidPrescriptions(),
    refetchInterval: 6000,
  });

  const { data: allPrescriptions = [], isLoading: isAllPrescriptionsLoading } = useQuery({
    queryKey: ["pharmacy-all-prescriptions"],
    queryFn: () => api.prescriptions(),
    refetchInterval: 12000,
  });

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Mutations
  const dispenseMutation = useMutation({
    mutationFn: (rxId: string) => api.dispensePrescription(rxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy-all-prescriptions"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-stock-list"] });
      qc.invalidateQueries({ queryKey: ["p360"] });
      alert("Prescription successfully DISPENSED. Stock quantities decremented.");
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to dispense prescription.");
    }
  });

  const readyMutation = useMutation({
    mutationFn: (rxId: string) => api.readyPrescription(rxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy-prepaid-orders"] });
      alert("Medications packed and marked READY for pickup at Counter 3.");
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to mark prescription as ready.");
    }
  });

  const pickupMutation = useMutation({
    mutationFn: (rxId: string) => api.pickupPrescription(rxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy-prepaid-orders"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-stock-list"] });
      qc.invalidateQueries({ queryKey: ["p360"] });
      alert("Online order marked as PICKED UP. Transaction closed successfully.");
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to mark prescription as picked up.");
    }
  });

  const reorderMutation = useMutation({
    mutationFn: (drugName: string) => api.reorderStock(drugName, 50),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["pharmacy-stock-list"] });
      alert(`Restocked 50 units for ${data.drug_name}. Available quantity updated.`);
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to reorder stock.");
    }
  });

  const releaseMutation = useMutation({
    mutationFn: () => api.releaseExpiredReservations(),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["pharmacy-stock-list"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-all-prescriptions"] });
      alert(`Released ${data.released_count} expired reservation(s) back to available stock.`);
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to trigger release.");
    }
  });

  // Combine standard prescriptions and prepaid orders
  const unifiedPrescriptions: any[] = [];
  const processedRxIds = new Set<string>();

  // Add prepaid orders first
  prepaidOrders.forEach((p: any) => {
    unifiedPrescriptions.push({
      rx_id: p.rx_id,
      patient_name: p.patient_name,
      patient_mobile: p.patient_mobile,
      doctor_name: p.doctor_name,
      department: p.department || "Outpatient",
      status: p.status || "PREPAID",
      date: p.date,
      pickup_token: p.pickup_token,
      items: p.items || [],
      priority: p.items?.some((i: any) => i.drug_name.toLowerCase().includes("heparin") || i.drug_name.toLowerCase().includes("meropenem")) ? "High" : "Normal",
      sla: p.pickup_token?.status === "READY" ? "Ready" : "15 min",
    });
    processedRxIds.add(p.rx_id);
  });

  // Add standard prescriptions
  allPrescriptions.forEach((rx: any) => {
    if (processedRxIds.has(rx.rx_id)) return;
    
    // Attempt to parse prescription structure from standard list
    const patientName = rx.patient?.full_name || rx.patient_name || `Patient ${rx.patient_id?.slice(0, 5) || ""}`;
    const docName = rx.doctor_name || rx.prescribed_by || "Assigned Doctor";
    
    unifiedPrescriptions.push({
      rx_id: rx.rx_id,
      patient_name: patientName,
      patient_mobile: rx.patient?.mobile || rx.patient_mobile || "",
      doctor_name: docName,
      department: rx.department || "General Medicine",
      status: rx.status,
      date: rx.created_ts ? new Date(rx.created_ts).toISOString().split("T")[0] : rx.date || "",
      pickup_token: null,
      items: rx.items || [],
      priority: rx.status === "APPROVED" ? "High" : "Normal",
      sla: rx.status === "DISPENSED" ? "Completed" : "30 min",
    });
    processedRxIds.add(rx.rx_id);
  });

  // Apply tab filters
  const filteredRxList = unifiedPrescriptions.filter((rx: any) => {
    // Search query filter
    const matchSearch = searchQuery === "" || 
      rx.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rx.rx_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rx.items.some((i: any) => i.drug_name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchSearch) return false;

    // Tab filter
    if (worklistTab === "New") return rx.status === "APPROVED";
    if (worklistTab === "InProgress") return rx.status === "PREPAID" && rx.pickup_token?.status === "WAITING";
    if (worklistTab === "Ready") return rx.status === "PREPAID" && rx.pickup_token?.status === "READY";
    if (worklistTab === "Completed") return rx.status === "DISPENSED";
    
    return true;
  });

  const selectedRx = unifiedPrescriptions.find(rx => rx.rx_id === selectedRxId) || filteredRxList[0];

  // Dynamic statistics calculations
  const totalOrdersToday = unifiedPrescriptions.length + 120; // Simulated offset
  const totalDispensed = unifiedPrescriptions.filter(rx => rx.status === "DISPENSED").length + 280;
  const totalPending = unifiedPrescriptions.filter(rx => rx.status === "APPROVED" || rx.status === "PREPAID").length;
  
  const lowStockCount = stockItems.filter((i: any) => i.available < 15).length;
  const criticalStockCount = stockItems.filter((i: any) => i.available < 5).length;

  const lowStockList = stockItems
    .filter((i: any) => i.available < 25)
    .slice(0, 5)
    .map((item: any) => ({
      name: item.drug_name,
      available: item.available,
      reorderLevel: 25,
      unit: item.drug_class === "Injection" || item.drug_name.toLowerCase().includes("inj") ? "Vial" : "Tab",
    }));

  const recentDispensedList = unifiedPrescriptions
    .filter(rx => rx.status === "DISPENSED")
    .slice(0, 4)
    .map(rx => ({
      rxNumber: `RX-${rx.rx_id.slice(0, 8).toUpperCase()}`,
      patient: rx.patient_name,
      medication: rx.items[0]?.drug_name || "Medicines",
      dispensedBy: "Pharm. Ayesha",
      time: "10:24 AM",
    }));

  const handleAskCopilot = (text: string) => {
    if (!text.trim()) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages((prev) => [...prev, { who: "user", text, time }]);
    setChatInput("");
    setLoadingChat(true);

    setTimeout(() => {
      let reply = "I've analyzed the pharmacy inventory. Stock levels are stable except for some low-stock injectables like Heparin. Do you want me to initiate a reorder request?";
      const query = text.toLowerCase();
      if (query.includes("heparin") || query.includes("meropenem") || query.includes("low stock")) {
        const lowItems = stockItems.filter((i: any) => i.available < 15).slice(0, 3);
        reply = `The current low stock items are: ${lowItems.map((i: any) => `${i.drug_name} (${i.available} left)`).join(", ")}. I suggest placing a reorder immediately.`;
      } else if (query.includes("prepaid") || query.includes("token")) {
        reply = `We currently have ${prepaidOrders.length} active prepaid orders in the queue. ${prepaidOrders.filter((p: any) => p.pickup_token?.status === "WAITING").length} are in packing and ${prepaidOrders.filter((p: any) => p.pickup_token?.status === "READY").length} are ready for pickup.`;
      }
      setChatMessages((prev) => [...prev, { who: "copilot", text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setLoadingChat(false);
    }, 800);
  };

  const initials = (name: string) => {
    return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  };

  return (
    <div className="flex gap-4 items-start relative text-left animate-in fade-in duration-300">
      
      {/* Sub Sidebar Navigation */}
      <aside className="w-[200px] shrink-0 border border-black/[0.08] bg-white rounded-2xl p-3 shadow-sm space-y-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-2">Workspace</span>
          <nav className="space-y-1">
            {WORKSPACE_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveSubTab(n.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                  activeSubTab === n.id ? "bg-sky-500/10 text-[#0078d4]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <n.icon size={13} className={activeSubTab === n.id ? "text-[#0078d4]" : "text-slate-450"} />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-2">Inventory</span>
          <nav className="space-y-1">
            {INVENTORY_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveSubTab(n.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                  activeSubTab === n.id ? "bg-sky-500/10 text-[#0078d4]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <n.icon size={13} className="text-slate-450" />
                <span className="truncate">{n.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-2 mb-2">System</span>
          <nav className="space-y-1">
            {SYSTEM_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveSubTab(n.id)}
                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-bold transition ${
                  activeSubTab === n.id ? "bg-sky-500/10 text-[#0078d4]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <n.icon size={13} className="text-slate-450 shrink-0" />
                  <span className="truncate">{n.label}</span>
                </span>
                {n.badge && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-extrabold text-slate-650">{n.badge}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Store selector dropdown */}
        <div className="border-t border-black/[0.08] pt-3 px-2">
          <label className="text-[9px] font-bold uppercase tracking-wide text-slate-400 block mb-1">Store / Location</label>
          <div className="relative">
            <select
              value={storeLocation}
              onChange={(e) => setStoreLocation(e.target.value)}
              className="w-full text-xs font-bold text-slate-700 bg-white border border-black/[0.08] rounded-lg p-1.5 pr-6 appearance-none focus:outline-none"
            >
              <option value="Main Pharmacy">Main Pharmacy</option>
              <option value="ICU Sattelite">ICU Satellite</option>
              <option value="ER Pharmacy">ER Pharmacy</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-3 text-slate-450 pointer-events-none" />
          </div>
        </div>
      </aside>

      {/* Main Command Center workspace */}
      <div className="flex-1 space-y-4 min-w-0">
        
        {/* Header Stats strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[
            { value: String(totalOrdersToday), label: "Rx Orders Today", sub: "Dispatched & pending", icon: Clipboard, color: "#0078d4" },
            { value: String(totalDispensed), label: "Dispensed", sub: "Completed transactions", icon: CheckCircle2, color: "#16a34a" },
            { value: String(totalPending), label: "Pending", sub: "Awaiting packaging/pickup", icon: Clock, color: "#CA5010" },
            { value: String(criticalStockCount), label: "Critical Alerts", sub: "Critically low stock", icon: AlertTriangle, color: "#D13438" },
            { value: String(lowStockCount), label: "Stock Alerts", sub: "Below safety margins", icon: Pill, color: "#CA5010" },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-black/[0.08] bg-white relative overflow-hidden p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: k.color }} />
              <div className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${k.color}1a`, color: k.color }}><k.icon size={18} /></div>
              <div className="text-[22px] font-extrabold leading-none text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
              <div className="mt-1 text-[11.5px] font-medium text-slate-500">{k.label}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Prescription Worklist panel + Details view */}
        <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
          
          {/* Prescription Worklist */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.05] pb-2">
              <h3 className="text-[13px] font-bold text-[#0c3b63]">Prescription Worklist</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search patients, drugs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 pr-2.5 py-1 border border-black/[0.08] rounded-lg text-[10.5px] w-36 bg-white focus:outline-none"
                  />
                </div>
                <button type="button" className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white/70 px-2 py-1 text-[10.5px] font-semibold text-slate-600">
                  <ListFilter size={11} /> Filters
                </button>
              </div>
            </div>

            {/* Worklist Tabs */}
            <div className="mb-3 flex flex-wrap gap-2 border-b border-black/[0.04] text-[11.5px] pb-1.5">
              {[
                { id: "All", label: "All", count: unifiedPrescriptions.length },
                { id: "New", label: "New / Approved", count: unifiedPrescriptions.filter(rx => rx.status === "APPROVED").length },
                { id: "InProgress", label: "In Progress (Packing)", count: prepaidOrders.filter((rx: any) => rx.pickup_token?.status === "WAITING").length },
                { id: "Ready", label: "Ready for Pickup", count: prepaidOrders.filter((rx: any) => rx.pickup_token?.status === "READY").length },
                { id: "Completed", label: "Completed", count: unifiedPrescriptions.filter(rx => rx.status === "DISPENSED").length },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setWorklistTab(t.id as any);
                    setSelectedRxId(null);
                  }}
                  className={`pb-1.5 px-2.5 font-bold transition focus:outline-none relative ${
                    worklistTab === t.id ? "text-[#0078d4]" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <span>{t.label}</span>
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1 py-0.2 text-[9px] font-extrabold text-slate-500">{t.count}</span>
                  {worklistTab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[#0078d4]" />}
                </button>
              ))}
            </div>

            {/* Worklist Table */}
            {filteredRxList.length === 0 ? (
              <Empty>
                <div className="font-semibold text-slate-700">No prescriptions found</div>
                <div className="text-slate-400 text-xs mt-1">Adjust search parameters or try another tab.</div>
              </Empty>
            ) : (
              <div className="overflow-x-auto max-h-[380px] scrollbar-thin">
                <table className="w-full min-w-[620px] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-black/[0.08] pb-1.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="pb-1.5 font-bold">Priority</th>
                      <th className="pb-1.5 font-bold">Rx Number</th>
                      <th className="pb-1.5 font-bold">Patient</th>
                      <th className="pb-1.5 font-bold">Medication</th>
                      <th className="pb-1.5 font-bold">Ordered By</th>
                      <th className="pb-1.5 font-bold">Status</th>
                      <th className="pb-1.5 font-bold text-center">SLA</th>
                      <th className="pb-1.5 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {filteredRxList.map((rx: any) => {
                      const isSel = rx.rx_id === selectedRx?.rx_id;
                      const hasToken = rx.pickup_token?.number;
                      return (
                        <tr
                          key={rx.rx_id}
                          onClick={() => setSelectedRxId(rx.rx_id)}
                          className={`hover:bg-slate-50/50 cursor-pointer transition ${isSel ? "bg-sky-500/5 font-medium" : ""}`}
                        >
                          <td className="py-2.5 pr-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[8.5px] font-extrabold border ${
                              rx.priority === "High"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                            }`}>
                              {rx.priority}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 font-mono text-slate-650">
                            {hasToken ? rx.pickup_token.number : `RX-${rx.rx_id.slice(0, 5).toUpperCase()}`}
                          </td>
                          <td className="py-2.5 pr-2 font-bold text-slate-700">{rx.patient_name}</td>
                          <td className="py-2.5 pr-2 text-slate-500 truncate max-w-[130px]" title={rx.items[0]?.drug_name}>
                            {rx.items[0]?.drug_name || "Medicines"} {rx.items.length > 1 ? `+${rx.items.length - 1}` : ""}
                          </td>
                          <td className="py-2.5 pr-2 text-slate-500">{rx.doctor_name}</td>
                          <td className="py-2.5 pr-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold border ${
                              rx.status === "DISPENSED"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : rx.status === "PREPAID"
                                ? "bg-sky-500/10 text-sky-600 border-sky-500/20"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                            }`}>
                              {rx.status === "PREPAID" ? (rx.pickup_token?.status === "READY" ? "Ready" : "Packing") : rx.status}
                            </span>
                          </td>
                          <td className="py-2.5 pr-2 font-semibold text-slate-600 text-center">{rx.sla}</td>
                          <td className="py-2.5 text-right font-bold">
                            {isPharmacist ? (
                              <>
                                {rx.status === "APPROVED" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dispenseMutation.mutate(rx.rx_id);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-850"
                                  >
                                    Dispense
                                  </button>
                                )}
                                {rx.status === "PREPAID" && rx.pickup_token?.status === "WAITING" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      readyMutation.mutate(rx.rx_id);
                                    }}
                                    className="text-[#0078d4] hover:text-sky-800"
                                  >
                                    Pack Order
                                  </button>
                                )}
                                {rx.status === "PREPAID" && rx.pickup_token?.status === "READY" && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      pickupMutation.mutate(rx.rx_id);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-850"
                                  >
                                    Dispatch
                                  </button>
                                )}
                                {rx.status === "DISPENSED" && <span className="text-slate-400 font-normal">Completed</span>}
                              </>
                            ) : (
                              <span className="text-slate-400 font-normal text-xs">{rx.status === "DISPENSED" ? "Completed" : "Read-Only"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Prescription details panel */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-4">
            {selectedRx ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] pb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order Summary</span>
                    <h4 className="text-sm font-extrabold text-slate-800">{selectedRx.patient_name}</h4>
                  </div>
                  <Tag tone={selectedRx.status === "DISPENSED" ? "green" : selectedRx.status === "PREPAID" ? "blue" : "amber"}>
                    {selectedRx.status}
                  </Tag>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 text-[11px] text-left">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Prescribed By</span>
                    <span className="font-semibold text-slate-700">{selectedRx.doctor_name} ({selectedRx.department})</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Order Date</span>
                    <span className="font-semibold text-slate-700">{selectedRx.date}</span>
                  </div>
                </div>

                {/* Items table */}
                <div className="border-t border-black/[0.05] pt-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">Prescribed Items</span>
                  <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-slate-50/20">
                    <table className="w-full text-[10.5px] text-left">
                      <thead>
                        <tr className="border-b border-black/[0.06] bg-slate-50 text-slate-400 font-bold">
                          <th className="p-2">Medicine</th>
                          <th className="p-2">Instructions</th>
                          <th className="p-2 text-right">Price</th>
                          <th className="p-2 text-right">Qty</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.03] text-slate-700">
                        {selectedRx.items.map((item: any, i: number) => {
                          const qty = item.quantity || 1;
                          const price = item.unit_price || 15.0;
                          return (
                            <tr key={i} className="hover:bg-slate-50/40 transition">
                              <td className="p-2">
                                <div className="font-bold text-slate-750">{item.drug_name}</div>
                                <div className="text-[9px] text-slate-400 leading-none mt-0.5">{item.dose || "—"} · {item.frequency || "daily"}</div>
                              </td>
                              <td className="p-2 truncate max-w-[80px] text-slate-450" title={item.instructions}>{item.instructions || "—"}</td>
                              <td className="p-2 text-right text-slate-500">₹{price.toFixed(2)}</td>
                              <td className="p-2 text-right font-semibold text-slate-700">{qty}</td>
                              <td className="p-2 text-right font-semibold text-slate-800">₹{(qty * price).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Prepaid Token section if prepaid */}
                {selectedRx.pickup_token && (
                  <div className="flex justify-between items-center bg-sky-500/5 p-3 border border-dashed border-sky-500/20 rounded-xl text-[11px]">
                    <div>
                      <div className="text-[9px] text-sky-600 font-bold uppercase">PREPAID PICKUP TOKEN</div>
                      <span className="text-sm font-black text-[#0078d4] font-mono tracking-wider">
                        {selectedRx.pickup_token.number}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-sky-600 font-bold uppercase block">Pickup Location</span>
                      <span className="text-slate-700 font-bold">
                        {selectedRx.pickup_token.room} ({selectedRx.pickup_token.floor})
                      </span>
                    </div>
                  </div>
                )}

                {/* Detail action buttons */}
                {isPharmacist && (
                  <div className="flex justify-end gap-2 border-t border-black/[0.05] pt-3">
                    {selectedRx.status === "APPROVED" && (
                      <button
                        type="button"
                        onClick={() => dispenseMutation.mutate(selectedRx.rx_id)}
                        disabled={dispenseMutation.isPending}
                        className="btn font-bold text-xs bg-[#0078d4] hover:bg-[#0078d4]/90 text-white rounded-lg px-4 py-2 transition"
                      >
                        Confirm &amp; Dispense
                      </button>
                    )}
                    
                    {selectedRx.status === "PREPAID" && selectedRx.pickup_token?.status === "WAITING" && (
                      <button
                        type="button"
                        onClick={() => readyMutation.mutate(selectedRx.rx_id)}
                        disabled={readyMutation.isPending}
                        className="btn font-bold text-xs bg-[#0078d4] hover:bg-[#0078d4]/90 text-white rounded-lg px-4 py-2 transition flex items-center gap-1"
                      >
                        <PackageCheck size={13} /> Pack &amp; Mark Ready
                      </button>
                    )}

                    {selectedRx.status === "PREPAID" && selectedRx.pickup_token?.status === "READY" && (
                      <button
                        type="button"
                        onClick={() => pickupMutation.mutate(selectedRx.rx_id)}
                        disabled={pickupMutation.isPending}
                        className="btn font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 transition flex items-center gap-1"
                      >
                        <CheckCircle2 size={13} /> Dispatch to Patient
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Empty>Select an active prescription to view packaging lists.</Empty>
            )}
          </div>
        </div>

        {/* Inventory Overview + Recent Dispensed Orders + Drug Utilization */}
        <div className="grid gap-3 lg:grid-cols-3">
          
          {/* Inventory Overview card */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold text-[#0c3b63]">Inventory Overview</h3>
              <button 
                type="button" 
                onClick={() => refetchStock()}
                className="text-[10px] font-semibold text-[#0078d4] hover:underline"
              >
                View All
              </button>
            </div>
            
            {/* Small stats row */}
            <div className="grid grid-cols-4 gap-1 text-[9px] text-center" style={{ fontVariantNumeric: "tabular-nums" }}>
              <div className="bg-slate-50 border border-black/[0.03] p-1.5 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-0.5">Available</span>
                <span className="font-extrabold text-[12px] text-slate-800">1,256</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-1.5 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-0.5">Low Stock</span>
                <span className="font-extrabold text-[12px] text-amber-600">{lowStockCount}</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-1.5 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-0.5">Out of Stock</span>
                <span className="font-extrabold text-[12px] text-rose-600">8</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-1.5 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-0.5">Expiring</span>
                <span className="font-extrabold text-[12px] text-slate-650">31</span>
              </div>
            </div>

            {/* Low stock list table */}
            <div className="overflow-x-auto text-[10px] text-left pt-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/[0.05] pb-1 text-slate-400 font-bold text-[8.5px] uppercase tracking-wider">
                    <th className="pb-1">Medication</th>
                    <th className="pb-1 text-center">Available</th>
                    <th className="pb-1 text-center">Reorder</th>
                    <th className="pb-1 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.03]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {lowStockList.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-1.5 font-bold text-slate-700 truncate max-w-[120px]">{item.name}</td>
                      <td className="py-1.5 text-center font-bold text-slate-500">{item.available}</td>
                      <td className="py-1.5 text-center text-slate-400 font-semibold">{item.reorderLevel} {item.unit}</td>
                      <td className="py-1.5 text-right">
                        {isPharmacist ? (
                          <button
                            type="button"
                            disabled={reorderMutation.isPending}
                            onClick={() => reorderMutation.mutate(item.name)}
                            className="rounded-md border border-[rgba(0,120,212,.3)] bg-white px-2 py-0.5 text-[9px] font-bold text-[#0a5aa8] hover:bg-sky-50 transition"
                          >
                            Reorder
                          </button>
                        ) : (
                          <span className="text-slate-400 font-semibold text-[9px]">Disabled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Dispensed Orders card */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-[#0c3b63]">Recent Dispensed Orders</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0078d4] hover:underline">View All</button>
              </div>

              <div className="space-y-1.5 pt-2 text-[10.5px] text-left">
                {recentDispensedList.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">No completed orders today.</div>
                ) : (
                  recentDispensedList.map((rx, idx) => (
                    <div key={idx} className="flex items-center justify-between border-b border-black/[0.03] pb-1.5">
                      <div>
                        <div className="font-bold text-slate-700">{rx.patient}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[160px]">{rx.medication} · {rx.dispensedBy}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-[9.5px] font-extrabold text-sky-600 bg-sky-500/10 px-1 rounded block">{rx.rxNumber}</span>
                        <span className="text-[8.5px] text-slate-400 font-bold block mt-0.5">{rx.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <button type="button" className="mx-auto text-[11px] font-semibold text-[#0078d4] hover:underline block pt-2 border-t border-black/[0.04] w-full text-center">
              Open Dispatch Log →
            </button>
          </div>

          {/* Drug Utilization card */}
          <div className="rounded-2xl border border-black/[0.08] bg-white p-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] space-y-3">
            <h3 className="text-[13px] font-bold text-[#0c3b63]">Drug Utilization (This Month)</h3>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
              <div className="bg-slate-50 border border-black/[0.03] p-2 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-1">Total Expenditure</span>
                <span className="font-black text-[13px] text-slate-800">₹8.62M</span>
                <span className="text-[8px] text-emerald-600 block mt-0.5 font-bold">↑ +12.5% vs last month</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-2 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-1">Top Therapeutic Class</span>
                <span className="font-black text-[13px] text-slate-800 truncate block">Antibiotics</span>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-bold">₹2.14M (24.8% share)</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-2 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-1">Most Used Medication</span>
                <span className="font-black text-[13px] text-slate-800 truncate block" title="Piperacillin / Tazobactam">Piperacillin</span>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-bold">1,245 units dispensed</span>
              </div>
              <div className="bg-slate-50 border border-black/[0.03] p-2 rounded-lg">
                <span className="text-slate-400 block font-bold leading-none mb-1">Cost Savings</span>
                <span className="font-black text-[13px] text-emerald-600">₹1.26M</span>
                <span className="text-[8px] text-slate-400 block mt-0.5 font-bold">Via generic substitutes</span>
              </div>
            </div>
            
            {/* Simulated mini line chart */}
            <div className="h-10 w-full flex items-end justify-between px-1.5 pt-2 border-t border-black/[0.04]">
              {[30, 45, 25, 60, 50, 40, 75, 55, 65, 80, 70, 90, 85].map((val, idx) => (
                <div
                  key={idx}
                  className="w-1.5 bg-[#0078d4]/70 hover:bg-[#0078d4] rounded-t transition-all cursor-pointer"
                  style={{ height: `${val}%` }}
                  title={`Day ${idx + 1}: ₹${(val * 10).toFixed(0)}k`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* AI Copilot Side Drawer */}
      {showCopilot && (
        <aside className="w-[310px] shrink-0 border border-black/[0.08] bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col h-[780px] sticky top-6 text-left animate-in slide-in-from-right-3 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3 mb-2">
            <span className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-[#0a5aa8]">
              <Sparkles size={15} /> AI Copilot
            </span>
            <button 
              type="button" 
              onClick={() => setShowCopilot(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>

          {/* Sidebar Tabs */}
          <div className="flex gap-4 border-b border-black/[0.06] mb-3">
            {["Insights", "Interactions", "Ask Copilot"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCopilotTab(t as any)}
                className="relative pb-2 text-[12px] font-semibold transition focus:outline-none"
                style={{ color: copilotTab === t ? "#0078d4" : "#6b7280" }}
              >
                {t}
                {copilotTab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[#0078d4]" />}
              </button>
            ))}
          </div>

          {/* Tab content area */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
            {copilotTab === "Insights" && (
              <>
                {/* Confidence meter */}
                <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-emerald-600 font-bold block uppercase">AI Model Accuracy</span>
                    <span className="text-[13px] font-extrabold text-slate-800">EMR Analysis Engine</span>
                  </div>
                  <span className="text-sm font-black text-emerald-600">92%</span>
                </div>

                {/* Copilot Insights list */}
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Clinical Warnings</div>
                  <div className="space-y-2">
                    {COPILOT_INSIGHTS.map((n) => (
                      <div key={n.title} className="rounded-xl border border-black/[0.05] bg-slate-50/50 p-2.5">
                        <div className="flex gap-2">
                          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600">
                            <AlertTriangle size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11.5px] font-bold text-slate-700 leading-none">{n.title}</span>
                              <button
                                onClick={() => handleAskCopilot(n.title)}
                                className="text-[9.5px] text-[#0078d4] font-bold hover:underline"
                              >
                                {n.action}
                              </button>
                            </div>
                            <p className="text-[10px] leading-snug text-slate-500 mt-1">{n.desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Critical Alerts */}
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Critical Alerts</div>
                  <div className="space-y-1.5">
                    {PHARM_CRITICAL_ALERTS.map((a, idx) => (
                      <div key={idx} className="rounded-lg border border-black/[0.07] bg-white/70 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-rose-500" />
                          <span className="text-[11.5px] font-bold text-slate-700">{a.title}</span>
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-1 leading-snug">{a.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Administrative tasks list */}
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">My Tasks ({PHARM_TASKS.filter(t=>!t.done).length})</div>
                  <div className="space-y-1.5">
                    {PHARM_TASKS.map((task, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded-lg border border-black/[0.04] bg-slate-50/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.done}
                          readOnly
                          className="mt-0.5 rounded border-slate-350 accent-[#0078d4] h-3.5 w-3.5"
                        />
                        <span className={`text-[11px] leading-snug font-semibold ${task.done ? "line-through text-slate-400" : "text-slate-600"}`}>
                          {task.text}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            {copilotTab === "Interactions" && (
              <div className="space-y-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Active Warning Feeds</div>
                {[
                  { drugA: "Heparin", drugB: "Aspirin", risk: "High Hemorrhage Risk", count: 2 },
                  { drugA: "Metformin", drugB: "Contrast Media", risk: "Lactic Acidosis Risk", count: 1 },
                  { drugA: "Atorvastatin", drugB: "Clarithromycin", risk: "Myopathy Risk", count: 3 }
                ].map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border border-black/[0.04] bg-slate-50/50 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold text-slate-700">
                      <span className="text-[#D13438]">{item.drugA} + {item.drugB}</span>
                      <span className="rounded bg-rose-500/10 px-1 text-[9px] text-rose-600 border border-rose-500/20">{item.count} Patients</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{item.risk}</p>
                  </div>
                ))}
              </div>
            )}

            {copilotTab === "Ask Copilot" && (
              <div className="flex flex-col h-full space-y-3">
                {/* Messages list */}
                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[460px] pr-1">
                  {chatMessages.map((msg, i) => {
                    const isMe = msg.who === "user";
                    return (
                      <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`rounded-xl p-2.5 max-w-[230px] shadow-sm text-[11.5px] leading-snug font-medium ${
                          isMe ? "bg-[#0078d4] text-white rounded-br-none" : "bg-slate-100 text-slate-800 rounded-bl-none"
                        }`}>
                          <div>{msg.text}</div>
                          <div className={`text-[8.5px] text-right mt-1 font-semibold ${isMe ? "text-white/70" : "text-slate-400"}`}>{msg.time}</div>
                        </div>
                      </div>
                    );
                  })}
                  {loadingChat && (
                    <div className="flex justify-start">
                      <div className="rounded-xl p-2.5 bg-slate-100 text-slate-500 text-[11px] italic flex items-center gap-1.5">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-100" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 delay-200" />
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input box */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAskCopilot(chatInput);
                  }}
                  className="flex gap-1.5 border-t border-black/[0.08] pt-2"
                >
                  <input
                    type="text"
                    placeholder="Ask copilot..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="input flex-1 p-2 text-xs border border-black/[0.08] rounded-lg focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-[#0078d4] text-white rounded-lg hover:bg-[#0078d4]/90 transition shrink-0"
                  >
                    <Send size={13} />
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      )}

    </div>
  );
}
