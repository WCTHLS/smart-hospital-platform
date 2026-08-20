import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes, IndianRupee, FileText, Truck, ArrowLeftRight, Building2,
  Filter, Download, MoreHorizontal, Star, RefreshCw, Search,
} from "lucide-react";
import { api } from "../../lib/api";

const card = "rounded-2xl border border-black/[0.07] bg-white shadow-sm";
const th = "border-b border-black/[0.06] text-[10.5px] font-bold uppercase tracking-wider text-slate-400";
const cellHead = "pb-2 font-bold";

function donutGradient(segments: { pct: number; color: string }[]): string {
  let acc = 0;
  const stops: string[] = [];
  segments.forEach((s) => {
    const start = acc;
    acc += s.pct;
    stops.push(`${s.color} ${start}% ${acc}%`);
  });
  if (acc < 100) {
    stops.push(`#e2e8f0 ${acc}% 100%`);
  }
  return stops.join(", ");
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold"
      style={{ background: `${tone}18`, color: tone }}
    >
      {children}
    </span>
  );
}

function KpiRow({ items }: { items: { value: string | number; label: string; sub?: string; icon: any; color: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((k) => (
        <div key={k.label} className={`${card} flex items-center gap-3 p-3.5 transition hover:shadow-md`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${k.color}1a`, color: k.color }}>
            <k.icon size={19} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium leading-tight text-slate-500">{k.label}</div>
            <div className="text-[18px] font-extrabold leading-none text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
              {k.value}
            </div>
            {k.sub && <div className="mt-0.5 text-[9.5px] text-slate-400">{k.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutCard({
  title,
  action,
  center,
  sub,
  segments,
  legend,
}: {
  title: string;
  action?: string;
  center: string;
  sub: string;
  segments: { pct: number; color: string }[];
  legend: { label: string; value: string; color: string }[];
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[#0c3b63]">{title}</h3>
        {action && <button type="button" className="text-[11px] font-semibold text-[#0078d4] hover:underline">{action}</button>}
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <div
          className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full shadow-inner"
          style={{ background: `conic-gradient(${donutGradient(segments)})` }}
        >
          <div className="grid h-[74px] w-[74px] place-items-center rounded-full bg-white text-center shadow-xs">
            <div>
              <div className="text-[15px] font-extrabold text-slate-800 leading-tight">{center}</div>
              <div className="text-[8px] uppercase tracking-wider text-slate-400 font-semibold">{sub}</div>
            </div>
          </div>
        </div>
        <div className="flex-1 w-full space-y-1.5">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-[11.5px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
              <span className="flex-1 text-slate-600 truncate">{l.label}</span>
              <span className="font-semibold text-slate-700 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{l.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelHead({ title, action }: { title: string; action?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h3 className="text-[13px] font-bold text-[#0c3b63]">{title}</h3>
      {action && <button type="button" className="text-[11px] font-semibold text-[#0078d4] hover:underline">{action}</button>}
    </div>
  );
}

export default function InventoryWorkspace() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [wlTab, setWlTab] = useState("All Items");

  const { data: inv, isLoading, isRefetching } = useQuery({
    queryKey: ["inventory-command-center"],
    queryFn: () => api.inventory(),
    staleTime: 15_000,
  });

  const ik = inv?.kpis;
  const kpis = [
    { value: ik ? ik.totalItems.toLocaleString() : "36", label: "Total Items", icon: Boxes, color: "#0078d4" },
    { value: ik ? ik.stockValue : "₹ 18.52 L", label: "Stock Value", icon: IndianRupee, color: "#16a34a" },
    { value: ik ? ik.purchaseOrders.toLocaleString() : "6", label: "Purchase Orders", icon: FileText, color: "#8764B8" },
    { value: ik ? ik.grnPending.toLocaleString() : "2", label: "GRN Pending", icon: Truck, color: "#CA5010" },
    { value: ik ? ik.transfersInTransit.toLocaleString() : "1", label: "Transfers in Transit", icon: ArrowLeftRight, color: "#038387" },
    { value: ik ? ik.suppliers.toLocaleString() : "5", label: "Suppliers", icon: Building2, color: "#334155" },
  ];

  const tc = inv?.tabCounts;
  const wlTabs: [string, number][] = [
    ["All Items", tc?.allItems ?? 36],
    ["Low Stock", tc?.lowStock ?? 3],
    ["Out of Stock", tc?.outOfStock ?? 2],
    ["Expiring Soon", tc?.expiringSoon ?? 4],
    ["Non-moving", tc?.nonMoving ?? 4],
  ];

  const itemTone = (s: string) => {
    switch (s) {
      case "In Stock": return "#16a34a";
      case "Low Stock": return "#CA5010";
      case "Out of Stock": return "#D13438";
      case "Non-moving": return "#94a3b8";
      case "Expired": return "#8764B8";
      default: return "#0078d4";
    }
  };

  const items = inv?.items?.length
    ? inv.items.map((r: any) => ({
        code: r.code,
        name: r.name,
        cat: r.category,
        unit: r.unit,
        cur: r.current,
        min: r.min,
        max: r.max,
        status: r.status,
        tone: itemTone(r.status),
        upd: r.updated,
      }))
    : [
        { code: "MED-000123", name: "Paracetamol 650mg Tablet", cat: "Pharmaceutical", unit: "Tablet", cur: "1,250", min: "500", max: "2,000", status: "In Stock", tone: "#16a34a", upd: "May 20, 2024" },
        { code: "CON-000456", name: "Surgical Gloves (M)", cat: "Medical Consumable", unit: "Box", cur: "85", min: "100", max: "500", status: "Low Stock", tone: "#CA5010", upd: "May 20, 2024" },
        { code: "CON-000789", name: "IV Cannula 22G", cat: "Medical Consumable", unit: "Pcs", cur: "0", min: "200", max: "1,000", status: "Out of Stock", tone: "#D13438", upd: "May 20, 2024" },
        { code: "SUR-000321", name: "Syringe 5ml", cat: "Medical Consumable", unit: "Pcs", cur: "2,860", min: "500", max: "5,000", status: "In Stock", tone: "#16a34a", upd: "May 20, 2024" },
        { code: "EQU-000654", name: "BP Monitor", cat: "Equipment", unit: "Pcs", cur: "12", min: "5", max: "20", status: "In Stock", tone: "#16a34a", upd: "May 20, 2024" },
      ];

  const poTone = (s: string) => (s === "Delivered" ? "#16a34a" : s === "Approved" ? "#8764B8" : s === "Partially Received" ? "#CA5010" : "#0078d4");
  const orders = inv?.purchaseOrders?.length
    ? inv.purchaseOrders.map((o: any) => ({
        po: o.po,
        supplier: o.supplier,
        date: o.date,
        status: o.status,
        tone: poTone(o.status),
        value: o.value,
      }))
    : [
        { po: "PO-240520-001", supplier: "Medlink Pvt Ltd", date: "May 20, 2024", status: "Ordered", tone: "#0078d4", value: "₹ 2.45 L" },
        { po: "PO-240519-010", supplier: "HealthSupplies India", date: "May 19, 2024", status: "Approved", tone: "#8764B8", value: "₹ 1.12 L" },
        { po: "PO-240518-018", supplier: "Surgitech Solutions", date: "May 18, 2024", status: "Partially Received", tone: "#CA5010", value: "₹ 3.68 L" },
        { po: "PO-240518-015", supplier: "PharmaCare Pvt Ltd", date: "May 18, 2024", status: "Delivered", tone: "#16a34a", value: "₹ 0.98 L" },
        { po: "PO-240517-009", supplier: "Global Medicals", date: "May 17, 2024", status: "Ordered", tone: "#0078d4", value: "₹ 1.75 L" },
      ];

  const expiring = inv?.expiring?.length ? inv.expiring : [
    { name: "Ceftriaxone 1gm Inj.", batch: "B240315", exp: "Jun 05, 2024", qty: "150" },
    { name: "Pantoprazole 40mg Inj.", batch: "B240410", exp: "Jun 12, 2024", qty: "90" },
    { name: "Normal Saline 100ml", batch: "B240401", exp: "Jun 18, 2024", qty: "200" },
    { name: "Metronidazole 100ml", batch: "B240310", exp: "Jun 25, 2024", qty: "120" },
    { name: "Meropenem 1gm Inj.", batch: "B240402", exp: "Jun 28, 2024", qty: "60" },
  ];

  const consumed = inv?.topConsumed?.length ? inv.topConsumed : [
    { name: "Paracetamol 650mg Tablet", qty: "12,450", unit: "Tablet" },
    { name: "IV Fluid NS 100ml", qty: "8,320", unit: "Bottle" },
    { name: "Surgical Gloves (M)", qty: "7,850", unit: "Box" },
    { name: "Syringe 5ml", qty: "6,240", unit: "Pcs" },
    { name: "IV Cannula 22G", qty: "5,910", unit: "Pcs" },
  ];

  const stores = inv?.stores?.length ? inv.stores : [
    { store: "Central Store", total: "2,458", inStock: "2,102", low: "86", out: "18", value: "₹ 4.25 Cr" },
    { store: "Pharmacy Store", total: "1,245", inStock: "1,050", low: "28", out: "9", value: "₹ 2.16 Cr" },
    { store: "OT Store", total: "583", inStock: "506", low: "7", out: "5", value: "₹ 1.02 Cr" },
    { store: "ICU Store", total: "300", inStock: "260", low: "3", out: "2", value: "₹ 0.65 Cr" },
  ];

  const suppliers = inv?.suppliers?.length ? inv.suppliers : [
    { name: "Medlink Pvt Ltd", otd: "98%", quality: "4.6", fill: "96%", rating: 5 },
    { name: "HealthSupplies India", otd: "95%", quality: "4.3", fill: "94%", rating: 4 },
    { name: "Surgitech Solutions", otd: "92%", quality: "4.4", fill: "91%", rating: 4 },
    { name: "PharmaCare Pvt Ltd", otd: "90%", quality: "4.1", fill: "88%", rating: 4 },
    { name: "Global Medicals", otd: "89%", quality: "4.2", fill: "87%", rating: 4 },
  ];

  const stockOv = inv?.stockOverview
    ? {
        center: inv.stockOverview.total,
        segments: inv.stockOverview.segments.map((s: any) => ({ pct: s.pct, color: s.color })),
        legend: inv.stockOverview.segments.map((s: any) => ({ label: s.label, value: s.value, color: s.color })),
      }
    : {
        center: "36",
        segments: [
          { pct: 83.8, color: "#16a34a" },
          { pct: 8.3, color: "#CA5010" },
          { pct: 5.5, color: "#D13438" },
          { pct: 2.4, color: "#94a3b8" },
        ],
        legend: [
          { label: "In Stock", value: "30 (83.8%)", color: "#16a34a" },
          { label: "Low Stock", value: "3 (8.3%)", color: "#CA5010" },
          { label: "Out of Stock", value: "2 (5.5%)", color: "#D13438" },
          { label: "Non-moving", value: "1 (2.4%)", color: "#94a3b8" },
        ],
      };

  const valCat = inv?.valueByCategory
    ? {
        center: inv.valueByCategory.total,
        segments: inv.valueByCategory.segments.map((s: any) => ({ pct: s.pct, color: s.color })),
        legend: inv.valueByCategory.segments.map((s: any) => ({ label: s.label, value: `${s.value} · ${s.pct}%`, color: s.color })),
      }
    : {
        center: "₹ 18.52 L",
        segments: [
          { pct: 37.7, color: "#0078d4" },
          { pct: 27.9, color: "#16a34a" },
          { pct: 17.6, color: "#CA8A04" },
          { pct: 11.1, color: "#8764B8" },
          { pct: 5.7, color: "#94a3b8" },
        ],
        legend: [
          { label: "Pharmaceuticals", value: "₹ 6.98 L · 37.7%", color: "#0078d4" },
          { label: "Medical Consumables", value: "₹ 5.16 L · 27.9%", color: "#16a34a" },
          { label: "Surgical Items", value: "₹ 3.25 L · 17.6%", color: "#CA8A04" },
          { label: "Equipment", value: "₹ 2.05 L · 11.1%", color: "#8764B8" },
          { label: "Others", value: "₹ 1.08 L · 5.7%", color: "#94a3b8" },
        ],
      };

  const q = search.trim().toLowerCase();
  const shownItems = items.filter((r: any) => {
    const matchesTab =
      wlTab === "All Items" ||
      (wlTab === "Low Stock" && r.status === "Low Stock") ||
      (wlTab === "Out of Stock" && r.status === "Out of Stock") ||
      (wlTab === "Expiring Soon" && (r.status === "Expired" || r.status === "Low Stock" || r.cat === "Pharmaceutical")) ||
      (wlTab === "Non-moving" && r.status === "Non-moving");

    const matchesQuery =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      r.cat.toLowerCase().includes(q);

    return matchesTab && matchesQuery;
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight text-[#0c3b63]">Inventory Command Center</h1>
          <p className="text-[12.5px] text-slate-500">Real-time overview of medical stock, consumption, POs & suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items, code, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 rounded-xl border border-black/[0.08] bg-white pl-8 pr-3 text-[12px] text-slate-700 shadow-xs focus:border-[#0078d4] focus:outline-none w-56 sm:w-64"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["inventory-command-center"] });
            }}
            disabled={isLoading || isRefetching}
            className="flex items-center gap-1 rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition"
          >
            <RefreshCw size={13} className={isRefetching ? "animate-spin text-[#0078d4]" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <KpiRow items={kpis} />

      {/* Stock Overview & Valuation Donut Cards */}
      <div className="grid gap-3 md:grid-cols-2">
        <DonutCard
          title="Stock Overview"
          action="View Analytics"
          center={stockOv.center}
          sub="Total Items"
          segments={stockOv.segments}
          legend={stockOv.legend}
        />
        <DonutCard
          title="Stock Value by Category"
          action="View Full Report"
          center={valCat.center}
          sub="Total Value"
          segments={valCat.segments}
          legend={valCat.legend}
        />
      </div>

      {/* Inventory Worklist */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-4 flex-wrap">
            <h3 className="text-[13.5px] font-bold text-[#0c3b63]">Inventory Worklist</h3>
            <div className="flex items-center gap-2 overflow-x-auto">
              {wlTabs.map(([label, n]) => {
                const isActive = wlTab === label;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setWlTab(label)}
                    className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 rounded-lg text-[12px] font-semibold transition ${
                      isActive
                        ? "bg-sky-50 text-[#0078d4] font-bold"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`rounded-full px-1.5 text-[10px] font-bold ${
                      isActive ? "bg-sky-100 text-[#0078d4]" : "bg-slate-100 text-slate-500"
                    }`}>
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-2xs hover:bg-slate-50"
            >
              <Filter size={12} /> Filters
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-2xs hover:bg-slate-50"
            >
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[11.5px]">
            <thead>
              <tr className={th}>
                <th className={cellHead}>Item Code</th>
                <th className={cellHead}>Item Name</th>
                <th className={cellHead}>Category</th>
                <th className={cellHead}>Unit</th>
                <th className={cellHead}>Current Stock</th>
                <th className={cellHead}>Min Level</th>
                <th className={cellHead}>Max Level</th>
                <th className={cellHead}>Status</th>
                <th className={cellHead}>Last Updated</th>
                <th className="pb-2 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shownItems.map((r: any) => (
                <tr key={r.code} className="border-t border-black/[0.04] hover:bg-slate-50/60 transition">
                  <td className="py-2.5 pr-3 font-semibold text-[#0078d4] font-mono">{r.code}</td>
                  <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.name}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{r.cat}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.unit}</td>
                  <td
                    className="py-2.5 pr-3 font-bold"
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: r.status === "Out of Stock" ? "#D13438" : r.status === "Low Stock" ? "#CA5010" : "#1e293b",
                    }}
                  >
                    {r.cur}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.min}</td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.max}</td>
                  <td className="py-2.5 pr-3">
                    <Pill tone={r.tone}>{r.status}</Pill>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500">{r.upd}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded border border-black/[0.08] text-slate-400 hover:text-slate-600 hover:bg-white inline-block"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shownItems.length === 0 && (
          <div className="py-8 text-center text-[12px] text-slate-400">No inventory items match your criteria.</div>
        )}
        <div className="mt-3 text-[11px] text-slate-400 font-medium">
          Showing {shownItems.length} of {ik ? ik.totalItems.toLocaleString() : "36"} items
        </div>
      </div>

      {/* Purchase Orders, Expiring, Top Consumed Grid */}
      <div className="grid gap-3 xl:grid-cols-3">
        {/* Recent Purchase Orders */}
        <div className={`${card} p-4`}>
          <PanelHead title="Recent Purchase Orders" action="View All" />
          <div className="space-y-2">
            {orders.map((o: any) => (
              <div key={o.po} className="flex items-center gap-2.5 rounded-xl border border-black/[0.05] bg-slate-50/60 p-2.5 hover:bg-slate-50 transition">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold text-[#0078d4] font-mono">{o.po}</div>
                  <div className="truncate text-[10px] text-slate-400">{o.supplier} · {o.date}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill tone={o.tone}>{o.status}</Pill>
                  <span className="text-[11px] font-bold text-slate-700">{o.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expiring Items */}
        <div className={`${card} p-4`}>
          <PanelHead title="Expiring Items (Next 30 Days)" action="View Report" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] text-left text-[11.5px]">
              <thead>
                <tr className={th}>
                  <th className={cellHead}>Item Name</th>
                  <th className={cellHead}>Batch</th>
                  <th className={cellHead}>Expiry</th>
                  <th className="pb-2 font-bold text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((e: any) => (
                  <tr key={e.batch} className="border-t border-black/[0.04]">
                    <td className="py-2 pr-2 font-semibold text-slate-800 truncate max-w-[120px]">{e.name}</td>
                    <td className="py-2 pr-2 text-slate-500 font-mono text-[10.5px]">{e.batch}</td>
                    <td className="py-2 pr-2 font-bold text-[#CA5010]">{e.exp}</td>
                    <td className="py-2 text-slate-700 font-bold text-right">{e.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Consumed Items */}
        <div className={`${card} p-4`}>
          <PanelHead title="Top Consumed Items (This Month)" action="View Report" />
          <div className="space-y-2.5">
            {consumed.map((c: any, i: number) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[rgba(0,120,212,.1)] text-[10.5px] font-bold text-[#0078d4]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-slate-700">{c.name}</div>
                  <div className="text-[10px] text-slate-400">{c.unit}</div>
                </div>
                <span className="text-[12.5px] font-extrabold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {c.qty}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Store-wise Stock & Supplier Performance */}
      <div className="grid gap-3 xl:grid-cols-3">
        {/* Store-wise Stock */}
        <div className={`${card} p-4`}>
          <PanelHead title="Store-wise Stock Status" action="View All" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-left text-[11.5px]">
              <thead>
                <tr className={th}>
                  <th className={cellHead}>Store</th>
                  <th className={cellHead}>Total</th>
                  <th className={cellHead}>In Stock</th>
                  <th className={cellHead}>Low</th>
                  <th className={cellHead}>Out</th>
                  <th className="pb-2 font-bold text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s: any) => (
                  <tr key={s.store} className="border-t border-black/[0.04]">
                    <td className="py-2 pr-2 font-semibold text-slate-800">{s.store}</td>
                    <td className="py-2 pr-2 text-slate-500">{s.total}</td>
                    <td className="py-2 pr-2 font-semibold text-[#16a34a]">{s.inStock}</td>
                    <td className="py-2 pr-2 font-semibold text-[#CA5010]">{s.low}</td>
                    <td className="py-2 pr-2 font-semibold text-[#D13438]">{s.out}</td>
                    <td className="py-2 font-bold text-slate-700 text-right">{s.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Supplier Performance */}
        <div className={`${card} p-4 xl:col-span-2`}>
          <PanelHead title="Supplier Performance (Top 5)" action="View Report" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {suppliers.map((s: any) => (
              <div key={s.name} className="rounded-xl border border-black/[0.05] bg-slate-50/70 p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-bold text-slate-800 truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={11} className={i < s.rating ? "fill-[#f5a623] text-[#f5a623]" : "text-slate-300"} />
                    ))}
                  </div>
                </div>
                <div className="space-y-0.5 text-[10.5px] text-slate-500 border-t border-slate-200/60 pt-2">
                  <div className="flex justify-between"><span>On-time:</span> <b className="text-slate-700">{s.otd}</b></div>
                  <div className="flex justify-between"><span>Quality:</span> <b className="text-slate-700">{s.quality}</b></div>
                  <div className="flex justify-between"><span>Fill Rate:</span> <b className="text-slate-700">{s.fill}</b></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
