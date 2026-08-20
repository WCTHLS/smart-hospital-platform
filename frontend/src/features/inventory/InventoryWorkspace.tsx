import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  HeartPulse, Search, Plus, Sparkles, Bell, ChevronDown,
  LayoutDashboard, Boxes, FileText, Receipt, ArrowLeftRight, RefreshCw,
  Users, Folder, CalendarX, QrCode, FileSpreadsheet, TrendingUp,
  AlertTriangle, CheckSquare, MessageSquare, Settings, Building2,
  FileCheck, Award, Layers, Filter, Columns, Download, MoreHorizontal,
  ExternalLink, ArrowUpRight, Check, X, Star, Clock, Box, ShieldAlert,
  ChevronLeft, ChevronRight, CheckCircle2, RotateCcw, Truck, CornerDownLeft
} from "lucide-react";
import { api } from "../../lib/api";
import { getOsSession, clearOsSession, osInitials } from "../os/osSession";
export default function InventoryWorkspace() {
  const navigate = useNavigate();

  // Top nav & filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSidebarNav, setActiveSidebarNav] = useState("Dashboard");
  const [selectedLocation, setSelectedLocation] = useState("All Locations");
  const [worklistTab, setWorklistTab] = useState<"ALL" | "LOW_STOCK" | "OUT_OF_STOCK" | "EXPIRING" | "NON_MOVING">("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [rightRailOpen, setRightRailOpen] = useState(true);
  const [copilotExpanded, setCopilotExpanded] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotChat, setCopilotChat] = useState<Array<{ role: "user" | "ai"; text: string }>>([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);


  // Dynamic user profile from logged-in session
  const currentUser = useMemo(() => {
    const osSession = getOsSession();
    if (osSession?.name) {
      return {
        name: osSession.name,
        role: osSession.roleLabel || osSession.role || "Inventory Manager",
        initials: osInitials(osSession.name),
        email: `${osSession.name.toLowerCase().replace(/[^a-z0-9]/g, "")}@cliniq.hospital`,
      };
    }
    return {
      name: "Dr. Ahmed Ali",
      role: "Inventory Manager",
      initials: "DA",
      email: "inventory@cliniq.hospital",
    };
  }, []);


  // Today's tasks state
  const [tasks, setTasks] = useState([
    { id: 1, text: "Review 18 pending GRNs", done: false },
    { id: 2, text: "Approve 6 purchase orders", done: false },
    { id: 3, text: "Transfer stock to ICU store", done: false },
    { id: 4, text: "Review expiring items", done: false },
    { id: 5, text: "Update minimum stock levels", done: false },
  ]);

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };


  // Live query from backend
  const { data: inv, isLoading } = useQuery({
    queryKey: ["inventory-command-center"],
    queryFn: () => api.inventory(),
    staleTime: 30_000,
  });

  // Default fallback worklist items matching the design + backend items
  const rawItems = useMemo(() => {
    if (inv?.items && inv.items.length > 0) {
      return inv.items;
    }
    return [
      {
        id: "1",
        code: "MED-000123",
        name: "Paracetamol 650mg Tablet",
        category: "Pharmaceutical",
        unit: "Tablet",
        currentStock: 1250,
        minLevel: 500,
        maxLevel: 2000,
        status: "In Stock",
        lastUpdated: "May 20, 2024",
      },
      {
        id: "2",
        code: "CON-000456",
        name: "Surgical Gloves (M)",
        category: "Medical Consumable",
        unit: "Box",
        currentStock: 85,
        minLevel: 100,
        maxLevel: 500,
        status: "Low Stock",
        lastUpdated: "May 20, 2024",
      },
      {
        id: "3",
        code: "CON-000789",
        name: "IV Cannula 22G",
        category: "Medical Consumable",
        unit: "Pcs",
        currentStock: 0,
        minLevel: 200,
        maxLevel: 1000,
        status: "Out of Stock",
        lastUpdated: "May 20, 2024",
      },
      {
        id: "4",
        code: "SUR-000321",
        name: "Syringe 5ml",
        category: "Medical Consumable",
        unit: "Pcs",
        currentStock: 2860,
        minLevel: 500,
        maxLevel: 5000,
        status: "In Stock",
        lastUpdated: "May 20, 2024",
      },
      {
        id: "5",
        code: "EQU-000654",
        name: "BP Monitor",
        category: "Equipment",
        unit: "Nos",
        currentStock: 12,
        minLevel: 5,
        maxLevel: 20,
        status: "In Stock",
        lastUpdated: "May 20, 2024",
      },
    ];
  }, [inv]);

  // Display KPIs (merged with live backend numbers)
  const kpis = useMemo(() => {
    return {
      totalItems: inv?.kpis?.totalItems ?? rawItems.length,
      stockValue: inv?.kpis?.stockValue ?? "₹ 23.21 L",
      purchaseOrders: inv?.kpis?.purchaseOrders ?? 6,
      grnPending: inv?.kpis?.grnPending ?? 4,
      transfersInTransit: inv?.kpis?.transfersInTransit ?? 1,
      suppliers: inv?.kpis?.suppliers ?? 5,
    };
  }, [inv, rawItems]);

  // Live tab counts from backend
  const tabCounts = useMemo(() => {
    if (inv?.tabCounts) {
      return {
        all: inv.tabCounts.allItems ?? rawItems.length,
        low: inv.tabCounts.lowStock ?? 0,
        out: inv.tabCounts.outOfStock ?? 0,
        expiring: inv.tabCounts.expiringSoon ?? 0,
        nonMoving: inv.tabCounts.nonMoving ?? 0,
      };
    }
    return {
      all: rawItems.length,
      low: rawItems.filter((i: any) => i.status === "Low Stock").length,
      out: rawItems.filter((i: any) => i.status === "Out of Stock").length,
      expiring: rawItems.filter((i: any) => i.status === "Expiring Soon" || i.status === "Expired").length,
      nonMoving: rawItems.filter((i: any) => i.status === "Non-moving").length,
    };
  }, [inv, rawItems]);

  // Dynamic stock overview segments
  const stockOverviewSegments = useMemo(() => {
    if (inv?.stockOverview?.segments && inv.stockOverview.segments.length > 0) {
      return inv.stockOverview.segments;
    }
    return [
      { label: "In Stock", value: "3,842 (83.8%)", pct: 83.8, color: "#10b981" },
      { label: "Low Stock", value: "126 (2.7%)", pct: 2.7, color: "#f59e0b" },
      { label: "Out of Stock", value: "28 (0.6%)", pct: 0.6, color: "#ef4444" },
      { label: "Non-moving (90+ Days)", value: "132 (2.9%)", pct: 2.9, color: "#64748b" },
      { label: "Expired", value: "58 (1.3%)", pct: 1.3, color: "#8b5cf6" },
    ];
  }, [inv]);

  // Dynamic category value segments
  const categoryValueSegments = useMemo(() => {
    if (inv?.valueByCategory?.segments && inv.valueByCategory.segments.length > 0) {
      return inv.valueByCategory.segments;
    }
    return [
      { label: "Pharmaceutical", value: "₹ 14.50 L (62.5%)", pct: 62.5, color: "#0284c7" },
      { label: "Medical Consumable", value: "₹ 5.20 L (22.4%)", pct: 22.4, color: "#14b8a6" },
      { label: "Surgical", value: "₹ 2.10 L (9.0%)", pct: 9.0, color: "#f59e0b" },
      { label: "Equipment", value: "₹ 1.41 L (6.1%)", pct: 6.1, color: "#a855f7" },
    ];
  }, [inv]);

  // Dynamic POs
  const purchaseOrdersList = useMemo(() => {
    if (inv?.purchaseOrders && inv.purchaseOrders.length > 0) {
      return inv.purchaseOrders;
    }
    return [
      { po: "PO-240520-001", supplier: "Medlink Pvt Ltd", date: "May 20, 2024", status: "Ordered", value: "₹ 2.45 L" },
      { po: "PO-240519-010", supplier: "HealthSupplies India", date: "May 19, 2024", status: "Approved", value: "₹ 1.12 L" },
      { po: "PO-240518-018", supplier: "Surgitech Solutions", date: "May 18, 2024", status: "Partially Received", value: "₹ 3.68 L" },
      { po: "PO-240518-015", supplier: "PharmaCare Pvt Ltd", date: "May 18, 2024", status: "Delivered", value: "₹ 0.98 L" },
      { po: "PO-240517-009", supplier: "Global Medicals", date: "May 17, 2024", status: "Ordered", value: "₹ 1.75 L" },
    ];
  }, [inv]);

  // Dynamic Expiring Items
  const expiringList = useMemo(() => {
    if (inv?.expiring && inv.expiring.length > 0) {
      return inv.expiring;
    }
    return [
      { name: "Ceftriaxone 1gm Inj.", batch: "B240315", exp: "Jun 05, 2024", qty: "150" },
      { name: "Pantoprazole 40mg Inj.", batch: "B240410", exp: "Jun 12, 2024", qty: "90" },
      { name: "Normal Saline 100ml", batch: "B240401", exp: "Jun 18, 2024", qty: "200" },
      { name: "Metronidazole 100ml", batch: "B240310", exp: "Jun 25, 2024", qty: "120" },
      { name: "Meropenem 1gm Inj.", batch: "B240402", exp: "Jun 28, 2024", qty: "60" },
    ];
  }, [inv]);

  // Dynamic Top Consumed
  const topConsumedList = useMemo(() => {
    if (inv?.topConsumed && inv.topConsumed.length > 0) {
      return inv.topConsumed;
    }
    return [
      { name: "Paracetamol 650mg Tablet", qty: "12,450", unit: "Tablet" },
      { name: "IV Fluid NS 100ml", qty: "8,320", unit: "Bottle" },
      { name: "Surgical Gloves (M)", qty: "7,850", unit: "Box" },
      { name: "Syringe 5ml", qty: "6,240", unit: "Pcs" },
      { name: "IV Cannula 22G", qty: "5,910", unit: "Pcs" },
    ];
  }, [inv]);

  // Dynamic Stores
  const storeList = useMemo(() => {
    if (inv?.stores && inv.stores.length > 0) {
      return inv.stores;
    }
    return [
      { store: "Central Store", total: "24", inStock: "18", low: "4", out: "2", value: "₹ 14.50 L" },
      { store: "Pharmacy Store", total: "12", inStock: "10", low: "1", out: "1", value: "₹ 8.71 L" },
    ];
  }, [inv]);

  // Dynamic Suppliers
  const supplierList = useMemo(() => {
    if (inv?.suppliers && inv.suppliers.length > 0) {
      return inv.suppliers;
    }
    return [
      { name: "Medlink Pvt Ltd", otd: "98%", quality: "4.6", fill: "96%", rating: 5 },
      { name: "PharmaCorp Healthcare", otd: "95%", quality: "4.3", fill: "94%", rating: 4 },
      { name: "SurgiCare Instruments", otd: "92%", quality: "4.4", fill: "91%", rating: 4 },
      { name: "LifeHealth Medical", otd: "90%", quality: "4.1", fill: "88%", rating: 4 },
      { name: "Apex BioTech", otd: "89%", quality: "4.2", fill: "87%", rating: 4 },
    ];
  }, [inv]);

  // Tab filtered items
  const filteredItems = useMemo(() => {
    return rawItems.filter((item: any) => {
      const matchesSearch =
        !searchQuery ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.code && item.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      if (worklistTab === "LOW_STOCK") return item.status === "Low Stock" || item.rawStatus === "Low Stock";
      if (worklistTab === "OUT_OF_STOCK") return item.status === "Out of Stock" || item.rawStatus === "Out of Stock";
      if (worklistTab === "EXPIRING") return item.isExpiringSoon || item.status === "Expiring Soon" || item.status === "Expired" || item.rawStatus === "Expired";
      if (worklistTab === "NON_MOVING") return item.status === "Non-moving" || item.rawStatus === "Non-moving";
      return true;
    });
  }, [rawItems, searchQuery, worklistTab]);

  // Pagination calculation
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredItems.length);
  const paginatedItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, startIndex, endIndex]);


  const handleAskCopilot = (promptText?: string) => {
    const q = (promptText || copilotInput).trim();
    if (!q) return;
    setCopilotChat((prev) => [
      ...prev,
      { role: "user", text: q },
      {
        role: "ai",
        text: `Analysis: Based on real-time consumption records, ${q.toLowerCase().includes("reorder") ? "PO recommended for 4 critical low-stock items (Surgical Gloves M, Ceftriaxone, Heparin, IV Cannula 22G)." : "stock turns are operating at 4.2x with ₹8.64 Cr total asset valuation."}`,
      },
    ]);
    setCopilotInput("");
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#f4f6f9] text-[#1e293b] font-sans">
      {/* ========================================================================= TOP NAVIGATION BAR */}
      <header className="flex h-14 w-full shrink-0 items-center justify-between border-b border-[#e2e8f0] bg-white px-4">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/os")}
            className="flex items-center gap-2 text-left"
            title="ClinIQ Smart Hospital OS"
          >
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-[#cbd5e1] bg-white text-[#0284c7] shadow-sm">
              <Boxes size={18} className="text-[#0284c7]" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1 text-[15px] font-bold tracking-tight text-[#0f172a]">
                ClinIQ
              </div>
              <div className="text-[10px] font-medium text-[#64748b]">Smart Hospital OS</div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="relative mx-3 flex max-w-sm flex-1 items-center">
          <Search size={14} className="absolute left-3 text-[#94a3b8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items, categories, suppliers, orders..."
            className="h-8 w-full rounded-lg border border-[#e2e8f0] bg-[#f8fafc] pl-8 pr-12 text-xs text-[#334155] placeholder-[#94a3b8] outline-none transition focus:border-[#0284c7] focus:bg-white focus:ring-1 focus:ring-[#0284c7]"
          />
          <span className="absolute right-2.5 rounded border border-[#cbd5e1] bg-white px-1.5 py-0.5 text-[9.5px] font-semibold text-[#94a3b8]">
            ⌘ K
          </span>
        </div>

        {/* Quick Top Metric Badges */}
        <div className="hidden items-center gap-3 xl:flex">
          {/* Total Items */}
          <div className="border-r border-[#e2e8f0] pr-3 text-left">
            <div className="text-[9.5px] font-medium text-[#64748b]">Total Items</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-bold text-[#0f172a]">{Number(kpis.totalItems).toLocaleString()}</span>
              <button
                type="button"
                onClick={() => setWorklistTab("ALL")}
                className="text-[9.5px] font-medium text-[#0284c7] hover:underline"
              >
                View All
              </button>
            </div>
          </div>

          {/* Low Stock */}
          <div className="border-r border-[#e2e8f0] pr-3 text-left">
            <div className="text-[9.5px] font-medium text-[#64748b]">Low Stock</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-bold text-[#e11d48]">{tabCounts.low}</span>
              <button
                type="button"
                onClick={() => setWorklistTab("LOW_STOCK")}
                className="text-[9.5px] font-medium text-[#0284c7] hover:underline"
              >
                View List
              </button>
            </div>
          </div>

          {/* Out of Stock */}
          <div className="border-r border-[#e2e8f0] pr-3 text-left">
            <div className="text-[9.5px] font-medium text-[#64748b]">Out of Stock</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-bold text-[#e11d48]">{tabCounts.out}</span>
              <button
                type="button"
                onClick={() => setWorklistTab("OUT_OF_STOCK")}
                className="text-[9.5px] font-medium text-[#0284c7] hover:underline"
              >
                View List
              </button>
            </div>
          </div>

          {/* Expiring Soon */}
          <div className="border-r border-[#e2e8f0] pr-3 text-left">
            <div className="text-[9.5px] font-medium text-[#64748b]">Expiring Soon</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-bold text-[#f59e0b]">{tabCounts.expiring}</span>
              <button
                type="button"
                onClick={() => setWorklistTab("EXPIRING")}
                className="text-[9.5px] font-medium text-[#0284c7] hover:underline"
              >
                View List
              </button>
            </div>
          </div>

          {/* Total Value */}
          <div className="flex items-center gap-2 pl-1 text-left">
            <div>
              <div className="text-[9.5px] font-medium text-[#64748b]">Total Value</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[12.5px] font-bold text-[#0f172a]">{kpis.stockValue}</span>
                <span className="text-[9.5px] font-medium text-[#0284c7]">View Valuation</span>
              </div>
            </div>
            {/* Mini sparkline curve */}
            <svg width="42" height="18" className="stroke-[#0284c7] fill-none">
              <path d="M 2 14 Q 10 4, 18 10 T 32 6 T 40 2" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>


        {/* Right Actions */}
        <div className="flex items-center gap-2 pl-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] shadow-sm hover:bg-[#f8fafc]"
          >
            <Plus size={13} className="text-[#0284c7]" /> Quick Action
          </button>

          <button
            type="button"
            onClick={() => setRightRailOpen((open) => !open)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
              rightRailOpen
                ? "border-[#0284c7] bg-[#e0f2fe] text-[#0284c7]"
                : "border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f8fafc]"
            }`}
            title={rightRailOpen ? "Hide AI Copilot & Right Panel" : "Open AI Copilot & Right Panel"}
          >
            <Sparkles size={13} className="text-[#0284c7]" /> AI Copilot
          </button>


          {/* Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((o) => !o)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] shadow-xs hover:bg-[#f8fafc] hover:text-[#0f172a]"
              title="Notifications (12 new)"
            >
              <Bell size={16} />
              <span
                className="absolute -top-1.5 -right-1.5 z-20 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold leading-none shadow-sm ring-2 ring-white"
                style={{ backgroundColor: "#0f172a", color: "#ffffff" }}
              >
                12
              </span>
            </button>



            {notificationsOpen && (
              <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xl animate-in fade-in">
                <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                  <div className="text-xs font-bold text-[#0f172a]">Alerts & Notifications</div>
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9.5px] font-bold text-rose-600">
                    12 New
                  </span>
                </div>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
                  <div className="flex items-start gap-2 rounded-lg bg-rose-50/60 p-2">
                    <AlertTriangle size={13} className="mt-0.5 text-red-500 shrink-0" />
                    <div className="flex-1 text-[11px]">
                      <div className="font-bold text-[#0f172a]">126 items are low in stock</div>
                      <div className="text-[10px] text-[#64748b]">Reorder recommended • 09:15 AM</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-red-50/60 p-2">
                    <ShieldAlert size={13} className="mt-0.5 text-red-600 shrink-0" />
                    <div className="flex-1 text-[11px]">
                      <div className="font-bold text-[#0f172a]">28 items are out of stock</div>
                      <div className="text-[10px] text-[#64748b]">Immediate action required • 08:50 AM</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50/60 p-2">
                    <Clock size={13} className="mt-0.5 text-amber-500 shrink-0" />
                    <div className="flex-1 text-[11px]">
                      <div className="font-bold text-[#0f172a]">58 items are expired</div>
                      <div className="text-[10px] text-[#64748b]">Remove from stock • 07:45 AM</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Profile */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserDropdownOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-transparent p-1 hover:bg-[#f1f5f9]"
            >
              <div className="grid h-7 w-7 place-items-center rounded-full bg-[#e2e8f0] text-[11px] font-bold text-[#334155]">
                {currentUser.initials}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-bold leading-none text-[#0f172a]">{currentUser.name}</div>
                <div className="text-[10px] text-[#64748b]">{currentUser.role}</div>
              </div>
              <ChevronDown size={13} className="text-[#94a3b8]" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 top-11 z-50 w-44 rounded-xl border border-[#e2e8f0] bg-white p-1 shadow-lg animate-in fade-in">
                <div className="border-b border-[#f1f5f9] px-3 py-2">
                  <div className="text-xs font-bold text-[#0f172a]">{currentUser.name}</div>
                  <div className="text-[10px] text-[#64748b]">{currentUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-[#334155] hover:bg-[#f8fafc]"
                >
                  <Settings size={13} /> Admin Portal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearOsSession();
                    navigate("/login");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#e11d48] hover:bg-rose-50"
                >
                  <RotateCcw size={13} /> Sign Out
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ========================================================================= MAIN LAYOUT CONTAINER */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* --------------------------------------------------------------------- LEFT SIDEBAR */}
        <aside className="flex w-52 shrink-0 flex-col justify-between overflow-y-auto border-r border-[#e2e8f0] bg-white py-3">
          <div className="space-y-4 px-3">
            {/* WORKSPACE SECTION */}
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
                WORKSPACE
              </div>
              <nav className="space-y-0.5">
                {[
                  { name: "Dashboard", icon: LayoutDashboard },
                  { name: "Stock Overview", icon: Boxes },
                  { name: "Purchase Orders", icon: FileText },
                  { name: "Goods Receipt", icon: Receipt },
                  { name: "Stock Transfer", icon: ArrowLeftRight },
                  { name: "Stock Adjustment", icon: RefreshCw },
                  { name: "Suppliers", icon: Users },
                  { name: "Item Catalogue", icon: Folder },
                  { name: "Expiry Management", icon: CalendarX },
                  { name: "Batch & Serial Tracking", icon: QrCode },
                  { name: "Reports", icon: FileSpreadsheet },
                  { name: "Analytics", icon: TrendingUp },
                ].map((item) => {
                  const isActive = activeSidebarNav === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setActiveSidebarNav(item.name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "bg-[#e0f2fe] text-[#0284c7] font-semibold"
                          : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                      }`}
                    >
                      <item.icon size={14} className={isActive ? "text-[#0284c7]" : "text-[#64748b]"} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* SYSTEM SECTION */}
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
                SYSTEM
              </div>
              <nav className="space-y-0.5">
                {[
                  { name: "Alerts", icon: AlertTriangle, badge: "8" },
                  { name: "Tasks", icon: CheckSquare, badge: "14" },
                  { name: "Messages", icon: MessageSquare, badge: "6" },
                  { name: "Settings", icon: Settings },
                ].map((item) => {
                  const isActive = activeSidebarNav === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setActiveSidebarNav(item.name)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "bg-[#e0f2fe] text-[#0284c7] font-semibold"
                          : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <item.icon size={14} className={isActive ? "text-[#0284c7]" : "text-[#64748b]"} />
                        <span>{item.name}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            item.name === "Alerts"
                              ? "bg-rose-100 text-rose-600"
                              : "bg-[#f1f5f9] text-[#64748b]"
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* INVENTORY MODULES SECTION */}
            <div>
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">
                INVENTORY MODULES
              </div>
              <nav className="space-y-0.5">
                {[
                  { name: "Store & Locations", icon: Building2 },
                  { name: "Indent Management", icon: FileCheck },
                  { name: "Vendor Performance", icon: Award },
                  { name: "Consignment Stock", icon: Layers },
                ].map((item) => {
                  const isActive = activeSidebarNav === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setActiveSidebarNav(item.name)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "bg-[#e0f2fe] text-[#0284c7] font-semibold"
                          : "text-[#475569] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                      }`}
                    >
                      <item.icon size={14} className={isActive ? "text-[#0284c7]" : "text-[#64748b]"} />
                      <span>{item.name}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom Location Selector */}
          <div className="border-t border-[#f1f5f9] px-3 pt-3">
            <div className="mb-1 text-[10px] font-medium text-[#94a3b8]">Location</div>
            <div className="relative">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full appearance-none rounded-lg border border-[#e2e8f0] bg-[#f8fafc] py-1.5 pl-2.5 pr-7 text-xs font-semibold text-[#334155] outline-none focus:border-[#0284c7]"
              >
                <option value="All Locations">All Locations</option>
                <option value="Central Store">Central Store</option>
                <option value="Pharmacy Store">Pharmacy Store</option>
                <option value="OT Store">OT Store</option>
                <option value="ICU Store">ICU Store</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            </div>
          </div>
        </aside>

        {/* --------------------------------------------------------------------- CENTER MAIN CONTENT */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
          {/* Header Title */}
          <div className="flex items-baseline gap-2">
            <h1 className="text-[17px] font-bold text-[#0f172a] tracking-tight">Inventory Command Center</h1>
            <span className="text-xs text-[#64748b]">Real-time overview of inventory operations</span>
          </div>


          {/* Top 6 KPI Cards Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {/* Card 1: Total Items */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0f9ff] text-[#0284c7]">
                  <Boxes size={15} />
                </div>
                <div className="text-[11px] font-medium">Total Items</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{Number(kpis.totalItems).toLocaleString()}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View Items</span>
              </div>
            </div>

            {/* Card 2: Total Stock Value */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0fdf4] text-[#16a34a]">
                  <span className="font-bold text-xs">₹</span>
                </div>
                <div className="text-[11px] font-medium">Total Stock Value</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{kpis.stockValue}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View Valuation</span>
              </div>
            </div>

            {/* Card 3: Purchase Orders */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f5f3ff] text-[#7c3aed]">
                  <FileText size={15} />
                </div>
                <div className="text-[11px] font-medium">Purchase Orders</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{kpis.purchaseOrders}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View Orders</span>
              </div>
            </div>

            {/* Card 4: GRN Pending */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#fff7ed] text-[#ea580c]">
                  <Truck size={15} />
                </div>
                <div className="text-[11px] font-medium">GRN Pending</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{kpis.grnPending}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View GRNs</span>
              </div>
            </div>

            {/* Card 5: Transfers in Transit */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f0fdfa] text-[#0d9488]">
                  <ArrowLeftRight size={15} />
                </div>
                <div className="text-[11px] font-medium">Transfers In Transit</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{kpis.transfersInTransit}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View Details</span>
              </div>
            </div>

            {/* Card 6: Suppliers */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-3 shadow-xs">
              <div className="flex items-center gap-2 text-[#64748b]">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#f8fafc] text-[#475569]">
                  <Users size={15} />
                </div>
                <div className="text-[11px] font-medium">Suppliers</div>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-[#0f172a]">{kpis.suppliers}</span>
                <span className="text-[10px] font-semibold text-[#0284c7] hover:underline cursor-pointer">View Suppliers</span>
              </div>
            </div>
          </div>

          {/* 2 Donut Cards Row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Donut Card 1: Stock Overview */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#0f172a]">Stock Overview</h2>
                <button type="button" className="text-[10.5px] font-medium text-[#0284c7] hover:underline">
                  View Analytics
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                {/* SVG Donut Chart */}
                <div className="relative grid h-32 w-32 shrink-0 place-items-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="4.5" />
                    {(() => {
                      let offset = 0;
                      return stockOverviewSegments.map((seg: any) => {
                        const dash = (seg.pct / 100) * 88;
                        const currentOffset = offset;
                        offset -= dash;
                        return (
                          <circle
                            key={seg.label}
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="4.5"
                            strokeDasharray={`${dash} 88`}
                            strokeDashoffset={currentOffset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute text-center leading-none">
                    <div className="text-sm font-extrabold text-[#0f172a]">{Number(kpis.totalItems).toLocaleString()}</div>
                    <div className="text-[9px] font-semibold text-[#64748b]">Total Items</div>
                  </div>
                </div>

                {/* Legend List */}
                <div className="flex-1 space-y-1 text-xs">
                  {stockOverviewSegments.map((seg: any) => (
                    <div key={seg.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span className="text-[#334155]">{seg.label}</span>
                      </div>
                      <span className="font-semibold text-[#0f172a]">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Donut Card 2: Stock Value by Category */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#0f172a]">Stock Value by Category</h2>
                <button type="button" className="text-[10.5px] font-medium text-[#0284c7] hover:underline">
                  View Full Report
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-4">
                {/* SVG Donut Chart */}
                <div className="relative grid h-32 w-32 shrink-0 place-items-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="4.5" />
                    {(() => {
                      let offset = 0;
                      return categoryValueSegments.map((seg: any) => {
                        const dash = (seg.pct / 100) * 88;
                        const currentOffset = offset;
                        offset -= dash;
                        return (
                          <circle
                            key={seg.label}
                            cx="18"
                            cy="18"
                            r="14"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="4.5"
                            strokeDasharray={`${dash} 88`}
                            strokeDashoffset={currentOffset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute text-center leading-none">
                    <div className="text-xs font-extrabold text-[#0f172a]">{kpis.stockValue}</div>
                    <div className="text-[9px] font-semibold text-[#64748b]">Total Value</div>
                  </div>
                </div>

                {/* Legend List */}
                <div className="flex-1 space-y-1 text-xs">
                  {categoryValueSegments.map((seg: any) => (
                    <div key={seg.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span className="text-[#334155]">{seg.label}</span>
                      </div>
                      <span className="font-semibold text-[#0f172a]">{seg.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* =================================================================== INVENTORY WORKLIST TABLE */}
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
            {/* Header & Tabs Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f5f9] pb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-[#0f172a]">Inventory Worklist</h2>
                <div className="flex items-center gap-1">
                  {[
                    { id: "ALL", label: "All Items", count: Number(tabCounts.all).toLocaleString() },
                    { id: "LOW_STOCK", label: "Low Stock", count: Number(tabCounts.low).toLocaleString() },
                    { id: "OUT_OF_STOCK", label: "Out of Stock", count: Number(tabCounts.out).toLocaleString() },
                    { id: "EXPIRING", label: "Expiring Soon", count: Number(tabCounts.expiring).toLocaleString() },
                    { id: "NON_MOVING", label: "Non-moving", count: Number(tabCounts.nonMoving).toLocaleString() },
                  ].map((tab) => {
                    const isActive = worklistTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setWorklistTab(tab.id as any);
                          setCurrentPage(1);
                        }}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          isActive
                            ? "bg-[#e0f2fe] text-[#0284c7]"
                            : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className={`text-[10px] ${isActive ? "text-[#0284c7]" : "text-[#94a3b8]"}`}>
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Top Action Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] shadow-2xs hover:bg-[#f8fafc]"
                >
                  <Filter size={12} /> Filters
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] shadow-2xs hover:bg-[#f8fafc]"
                >
                  <Columns size={12} /> Columns
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569] shadow-2xs hover:bg-[#f8fafc]"
                >
                  <Download size={12} /> Export
                </button>
                <button
                  type="button"
                  className="grid h-7 w-7 place-items-center rounded-lg border border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]"
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#f1f5f9] text-[10.5px] font-bold uppercase text-[#94a3b8]">
                    <th className="py-2.5 pr-3 font-semibold">ITEM CODE</th>
                    <th className="py-2.5 px-3 font-semibold">ITEM NAME</th>
                    <th className="py-2.5 px-3 font-semibold">CATEGORY</th>
                    <th className="py-2.5 px-3 font-semibold">UNIT</th>
                    <th className="py-2.5 px-3 font-semibold text-right">CURRENT STOCK</th>
                    <th className="py-2.5 px-3 font-semibold text-right">MIN STOCK LEVEL</th>
                    <th className="py-2.5 px-3 font-semibold text-right">MAX STOCK LEVEL</th>
                    <th className="py-2.5 px-3 font-semibold">STATUS</th>
                    <th className="py-2.5 px-3 font-semibold">LAST UPDATED</th>
                    <th className="py-2.5 pl-3 text-center font-semibold">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f8fafc]">
                  {paginatedItems.map((row: any) => {
                    const currentVal = row.current ?? (typeof row.currentStock === "number" ? row.currentStock.toLocaleString() : row.currentStock ?? "0");
                    const minVal = row.min ?? (typeof row.minLevel === "number" ? row.minLevel.toLocaleString() : row.minLevel ?? "100");
                    const maxVal = row.max ?? (typeof row.maxLevel === "number" ? row.maxLevel.toLocaleString() : row.maxLevel ?? "500");
                    const updatedVal = row.updated ?? row.lastUpdated ?? "May 20, 2024";

                    return (
                      <tr key={row.id || row.code} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="py-3 pr-3 font-mono font-semibold text-[#0284c7]">{row.code}</td>
                        <td className="py-3 px-3 font-bold text-[#0f172a]">{row.name}</td>
                        <td className="py-3 px-3 text-[#475569]">{row.category}</td>
                        <td className="py-3 px-3 text-[#64748b]">{row.unit}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#0f172a]">{currentVal}</td>
                        <td className="py-3 px-3 text-right text-[#64748b]">{minVal}</td>
                        <td className="py-3 px-3 text-right text-[#64748b]">{maxVal}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${
                              row.status === "In Stock"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : row.status === "Low Stock"
                                ? "bg-rose-50 text-rose-600 border border-rose-200"
                                : row.status === "Out of Stock"
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : row.status === "Expiring Soon" || row.status === "Expired"
                                ? "bg-amber-50 text-amber-600 border border-amber-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[#64748b]">{updatedVal}</td>
                        <td className="py-3 pl-3 text-center">
                          <button
                            type="button"
                            className="grid h-6 w-6 place-items-center rounded text-[#94a3b8] hover:bg-[#e2e8f0] hover:text-[#334155]"
                          >
                            <MoreHorizontal size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-xs text-[#94a3b8]">
                        No inventory items found matching the selected filter or search query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between border-t border-[#f1f5f9] pt-3 text-xs text-[#64748b]">
              <div>
                Showing {filteredItems.length === 0 ? 0 : startIndex + 1} to {endIndex} of {filteredItems.length} items
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="grid h-7 w-7 place-items-center rounded border border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={13} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`grid h-7 w-7 place-items-center rounded text-xs font-semibold ${
                      safeCurrentPage === page
                        ? "border border-[#0284c7] bg-[#e0f2fe] text-[#0284c7]"
                        : "border border-[#e2e8f0] bg-white text-[#475569] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="grid h-7 w-7 place-items-center rounded border border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>


          </div>

          {/* =================================================================== 3 COLUMN MIDDLE SECTION */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Col 1: Recent Purchase Orders */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Recent Purchase Orders</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View All
                </button>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {purchaseOrdersList.map((p: any) => (
                  <div key={p.po} className="flex items-center justify-between border-b border-[#f8fafc] pb-1.5 last:border-0">
                    <div>
                      <div className="font-mono font-bold text-[#0284c7]">{p.po}</div>
                      <div className="text-[10px] text-[#64748b]">{p.supplier} • {p.date}</div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[9.5px] font-semibold ${
                        p.status === "Delivered"
                          ? "bg-emerald-50 text-emerald-600"
                          : p.status === "Approved"
                          ? "bg-sky-50 text-sky-600"
                          : "bg-amber-50 text-amber-600"
                      }`}>
                        {p.status}
                      </span>
                      <div className="text-[11px] font-bold text-[#0f172a]">{p.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 2: Expiring Items (Next 30 Days) */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Expiring Items (Next 30 Days)</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View All
                </button>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {expiringList.map((e: any) => (
                  <div key={e.name} className="flex items-center justify-between border-b border-[#f8fafc] pb-1.5 last:border-0">
                    <div>
                      <div className="font-bold text-[#0f172a]">{e.name}</div>
                      <div className="text-[10px] text-[#64748b]">Batch: {e.batch} • Exp: {e.exp}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#e11d48]">{e.qty}</span>
                      <div className="text-[9.5px] text-[#94a3b8]">Units</div>
                    </div>
                  </div>
                ))}
                {expiringList.length === 0 && (
                  <div className="py-4 text-center text-xs text-[#94a3b8]">No items expiring in next 30 days.</div>
                )}
              </div>
            </div>

            {/* Col 3: Top Consumed Items (This Month) */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Top Consumed Items (This Month)</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View Report
                </button>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {topConsumedList.map((c: any) => (
                  <div key={c.name} className="flex items-center justify-between border-b border-[#f8fafc] pb-1.5 last:border-0">
                    <div className="font-bold text-[#0f172a]">{c.name}</div>
                    <div className="text-right">
                      <span className="font-bold text-[#0284c7]">{c.qty || c.consumed}</span>
                      <span className="ml-1 text-[10px] text-[#64748b]">{c.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* =================================================================== BOTTOM ROW (Store, Suppliers, Valuation) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Bottom 1: Store-wise Stock Status */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Store-wise Stock Status</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View All
                </button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-[#94a3b8] uppercase">
                      <th className="pb-1.5 font-semibold">Store / Location</th>
                      <th className="pb-1.5 text-right font-semibold">Total</th>
                      <th className="pb-1.5 text-right font-semibold text-emerald-600">In Stock</th>
                      <th className="pb-1.5 text-right font-semibold text-rose-600">Low</th>
                      <th className="pb-1.5 text-right font-semibold text-red-600">Out</th>
                      <th className="pb-1.5 text-right font-semibold">Stock Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f8fafc]">
                    {storeList.map((s: any) => (
                      <tr key={s.store}>
                        <td className="py-1.5 font-bold text-[#0f172a]">{s.store}</td>
                        <td className="py-1.5 text-right text-[#475569]">{s.total}</td>
                        <td className="py-1.5 text-right font-semibold text-emerald-600">{s.inStock}</td>
                        <td className="py-1.5 text-right font-semibold text-rose-600">{s.low}</td>
                        <td className="py-1.5 text-right font-semibold text-red-600">{s.out}</td>
                        <td className="py-1.5 text-right font-bold text-[#0f172a]">{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom 2: Supplier Performance (Top 5) */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Supplier Performance (Top 5)</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View Report
                </button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-[#94a3b8] uppercase">
                      <th className="pb-1.5 font-semibold">Supplier</th>
                      <th className="pb-1.5 text-center font-semibold">On-time Delivery</th>
                      <th className="pb-1.5 text-center font-semibold">Quality Score</th>
                      <th className="pb-1.5 text-center font-semibold">Fill Rate</th>
                      <th className="pb-1.5 text-right font-semibold">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f8fafc]">
                    {supplierList.map((sp: any) => {
                      const ratingNum = Math.min(5, Math.max(1, Number(sp.rating) || 4));
                      return (
                        <tr key={sp.name}>
                          <td className="py-1.5 font-bold text-[#0f172a]">{sp.name}</td>
                          <td className="py-1.5 text-center font-semibold text-emerald-600">{sp.otd || sp.onTime}</td>
                          <td className="py-1.5 text-center text-[#475569]">{sp.quality}</td>
                          <td className="py-1.5 text-center text-[#475569]">{sp.fill}</td>
                          <td className="py-1.5 text-right text-amber-500">
                            {"★".repeat(ratingNum)}{"☆".repeat(5 - ratingNum)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom 3: Inventory Valuation Summary */}
            <div className="rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Inventory Valuation Summary</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View Report
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-4 text-xs">
                {/* Value list */}
                <div className="space-y-1">
                  <div className="text-[11px] font-bold text-[#64748b]">Total Stock Value: <b className="text-sm font-extrabold text-[#0f172a]">{kpis.stockValue}</b></div>
                  {categoryValueSegments.map((seg: any) => (
                    <div key={seg.label} className="text-[#334155]">
                      {seg.label} <span className="font-bold text-[#0f172a]">{seg.value}</span>
                    </div>
                  ))}
                </div>

                {/* Colorful Vertical Bar Chart */}
                <div className="flex h-28 items-end gap-2 pr-2">
                  {categoryValueSegments.map((seg: any, idx: number) => {
                    const heightPx = Math.max(12, Math.round((seg.pct / 100) * 110));
                    return (
                      <div key={idx} className="flex flex-col items-center gap-1" title={`${seg.label}: ${seg.value}`}>
                        <div
                          className="w-4 rounded-t transition-all"
                          style={{ height: `${heightPx}px`, backgroundColor: seg.color }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        </main>

        {/* --------------------------------------------------------------------- RIGHT RAIL (AI COPILOT, ALERTS, TASKS) */}
        {rightRailOpen ? (
          <aside className="w-72 shrink-0 flex-col overflow-y-auto border-l border-[#e2e8f0] bg-white p-3 space-y-3.5 flex animate-in slide-in-from-right duration-200">
            {/* Header with Hide/Close Action */}
            <div className="flex items-center justify-between border-b border-[#f1f5f9] pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0f172a]">
                <Sparkles size={13} className="text-[#0284c7]" />
                <span>AI Copilot & Operations</span>
              </div>
              <button
                type="button"
                onClick={() => setRightRailOpen(false)}
                className="grid h-6 w-6 place-items-center rounded-md text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                title="Hide Copilot & Right Panel"
              >
                <X size={14} />
              </button>
            </div>

            {/* Section 1: Alerts & Notifications */}
            <div className="rounded-xl border border-[#f1f5f9] bg-[#fafafa] p-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Alerts & Notifications</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View All
                </button>
              </div>
              <div className="mt-2 space-y-2.5 text-xs">
                {[
                  { icon: AlertTriangle, color: "text-red-500", title: "126 items are low in stock", sub: "Reorder recommended", time: "09:15 AM" },
                  { icon: ShieldAlert, color: "text-red-600", title: "28 items are out of stock", sub: "Immediate action required", time: "08:50 AM" },
                  { icon: Clock, color: "text-amber-500", title: "58 items are expired", sub: "Remove from stock", time: "07:45 AM" },
                  { icon: CalendarX, color: "text-sky-500", title: "94 items expiring in next 30 days", sub: "Review and plan usage", time: "07:20 AM" },
                  { icon: Box, color: "text-indigo-500", title: "18 GRNs are pending", sub: "Awaiting quality check", time: "06:30 AM" },
                ].map((a, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <a.icon size={14} className={`mt-0.5 shrink-0 ${a.color}`} />
                    <div className="flex-1 leading-tight">
                      <div className="font-bold text-[#0f172a] text-[11px]">{a.title}</div>
                      <div className="text-[10px] text-[#64748b]">{a.sub}</div>
                    </div>
                    <span className="text-[9px] text-[#94a3b8]">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: Today's Tasks */}
            <div className="rounded-xl border border-[#f1f5f9] bg-[#fafafa] p-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Today's Tasks</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View All
                </button>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {tasks.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTask(t.id)}
                      className="h-3.5 w-3.5 rounded border-[#cbd5e1] text-[#0284c7] focus:ring-[#0284c7]"
                    />
                    <span className={`text-[11.5px] ${t.done ? "line-through text-[#94a3b8]" : "text-[#334155]"}`}>
                      {t.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Section 3: AI Copilot BETA */}
            <div className="rounded-xl border border-[#e0f2fe] bg-[#f0f9ff] p-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#bae6fd] pb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[#0284c7]" />
                  <h3 className="text-xs font-bold text-[#0369a1]">AI Copilot</h3>
                  <span className="rounded bg-[#0284c7] px-1 py-0.2 text-[8.5px] font-bold text-white uppercase">
                    BETA
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCopilotExpanded((e) => !e)}
                  className="text-[#0369a1] hover:text-[#0c4a6e]"
                  title="Expand"
                >
                  <ArrowUpRight size={13} />
                </button>
              </div>

              <div className="mt-2 text-xs space-y-1.5">
                <div className="text-[10.5px] font-bold text-[#0c4a6e]">Inventory Insights</div>
                <ul className="space-y-1 text-[10.5px] text-[#0369a1]">
                  <li className="flex items-start gap-1.5">
                    <span className="font-bold">•</span>
                    <span>IV fluids consumption increased by 18% this month.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="font-bold">•</span>
                    <span>Paracetamol 650mg tablets are running low.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="font-bold">•</span>
                    <span>Item 'Surgical Gloves (M)' has high usage in OT.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="font-bold">•</span>
                    <span>Non-moving items worth ₹ 0.42 Cr detected.</span>
                  </li>
                </ul>

                {/* Interactive Chat messages if any */}
                {copilotChat.length > 0 && (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-[#bae6fd] bg-white p-2 max-h-32 overflow-y-auto">
                    {copilotChat.map((msg, i) => (
                      <div key={i} className={`text-[10.5px] ${msg.role === "user" ? "font-bold text-[#0f172a]" : "text-[#0284c7]"}`}>
                        {msg.role === "user" ? "You: " : "AI: "}{msg.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Copilot input box & action button */}
                <div className="mt-2.5 space-y-1.5">
                  <div className="relative">
                    <input
                      type="text"
                      value={copilotInput}
                      onChange={(e) => setCopilotInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAskCopilot()}
                      placeholder="Ask about reorders, consumption..."
                      className="h-7 w-full rounded-lg border border-[#bae6fd] bg-white pl-2 pr-7 text-[10.5px] text-[#0f172a] placeholder-[#94a3b8] outline-none focus:border-[#0284c7]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAskCopilot()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#0284c7] hover:text-[#0369a1]"
                    >
                      <CornerDownLeft size={11} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAskCopilot("Show recommended reorders")}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0284c7] py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#0369a1] transition"
                  >
                    <Sparkles size={12} /> Ask AI Copilot
                  </button>
                </div>
              </div>
            </div>

            {/* Section 4: Stock Movement (This Month) */}
            <div className="rounded-xl border border-[#f1f5f9] bg-[#fafafa] p-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-2">
                <h3 className="text-xs font-bold text-[#0f172a]">Stock Movement (This Month)</h3>
                <button type="button" className="text-[10px] font-semibold text-[#0284c7] hover:underline">
                  View Analytics
                </button>
              </div>

              <div className="mt-3 flex flex-col items-center">
                {/* Donut Chart */}
                <div className="relative grid h-28 w-28 place-items-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#e2e8f0" strokeWidth="4.5" />
                    {/* GRN Received 34.8% */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#10b981" strokeWidth="4.5" strokeDasharray="30.6 88" strokeDashoffset="0" />
                    {/* Issued 38.7% */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#0284c7" strokeWidth="4.5" strokeDasharray="34 88" strokeDashoffset="-30.6" />
                    {/* Transfers 16.7% */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#f59e0b" strokeWidth="4.5" strokeDasharray="14.7 88" strokeDashoffset="-64.6" />
                    {/* Adjustments 6.5% */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#8b5cf6" strokeWidth="4.5" strokeDasharray="5.7 88" strokeDashoffset="-79.3" />
                    {/* Returns 3.3% */}
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="4.5" strokeDasharray="3 88" strokeDashoffset="-85" />
                  </svg>
                  <div className="absolute text-center leading-none">
                    <div className="text-xs font-extrabold text-[#0f172a]">3,248</div>
                    <div className="text-[8.5px] font-semibold text-[#64748b]">Movements</div>
                  </div>
                </div>

                {/* Movement Legend */}
                <div className="mt-3 w-full space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                      <span className="text-[#334155]">GRN Received</span>
                    </div>
                    <span className="font-semibold text-[#0f172a]">1,128 (34.8%)</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#0284c7]" />
                      <span className="text-[#334155]">Issued</span>
                    </div>
                    <span className="font-semibold text-[#0f172a]">1,256 (38.7%)</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                      <span className="text-[#334155]">Transfers</span>
                    </div>
                    <span className="font-semibold text-[#0f172a]">542 (16.7%)</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
                      <span className="text-[#334155]">Adjustments</span>
                    </div>
                    <span className="font-semibold text-[#0f172a]">210 (6.5%)</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                      <span className="text-[#334155]">Returns</span>
                    </div>
                    <span className="font-semibold text-[#0f172a]">112 (3.3%)</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setRightRailOpen(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 rounded-l-xl border-y border-l border-[#bae6fd] bg-[#f0f9ff] py-3 px-1.5 text-xs font-bold text-[#0284c7] shadow-md hover:bg-[#e0f2fe] transition"
            title="Open AI Copilot & Operations Panel"
          >
            <Sparkles size={14} className="text-[#0284c7]" />
            <span className="[writing-mode:vertical-lr] tracking-wider text-[10px] font-extrabold uppercase">AI Copilot</span>
          </button>
        )}

      </div>
    </div>
  );
}
