import React, { useState, useMemo } from "react";
import {
  FlaskConical,
  TestTubes,
  ScanLine,
  Calendar,
  FileText,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Stethoscope,
  Sparkles,
  User,
  MapPin
} from "lucide-react";

export interface LabResultItem {
  result_id?: string;
  analyte?: string;
  value?: number | string | null;
  unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  reference_range?: string | null;
  abnormal_flag?: string | null;
  status?: string | null;
}

export interface LabReportRecord {
  lab_order_id?: string;
  order_id?: string;
  report_id?: string;
  encounter_id?: string;
  name?: string;
  test?: string;
  panel?: string;
  modality?: string;
  price?: number | null;
  status?: string;
  raw_status?: string;
  date?: string;
  value?: string | null;
  flag?: string | null;
  finding?: string | null;
  notes?: string | null;
  booking_date?: string | null;
  booking_slot?: string | null;
  attachment_name?: string | null;
  attachment_uri?: string | null;
  is_imaging?: boolean;
  results?: LabResultItem[];
  doctor?: {
    name?: string;
    specialty?: string;
    room?: string;
    floor?: string;
  } | null;
  appointment?: {
    appointment_id?: string;
    date?: string;
    reason?: string;
    department?: string;
  } | null;
}

interface ConsultationLabGroup {
  groupId: string;
  encounter_id?: string;
  date: string;
  dateTimestamp: number;
  doctor?: {
    name?: string;
    specialty?: string;
    room?: string;
    floor?: string;
  } | null;
  concern?: string | null;
  orders: LabReportRecord[];
}

interface LabReportsSectionProps {
  labReports?: LabReportRecord[];
  scansAndDiagnostics?: LabReportRecord[];
}

export default function LabReportsSection({
  labReports = [],
  scansAndDiagnostics = [],
}: LabReportsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "LAB" | "IMAGING">("ALL");
  const [expandedPastGroupIds, setExpandedPastGroupIds] = useState<Set<string>>(new Set());

  // Format date helper (Date only, e.g. 18 Aug 2026)
  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "Recent Consultation";
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      // ignore
    }
    return dateStr;
  };

  // Group all investigations appointment-wise / consultation-wise
  const consultationGroups: ConsultationLabGroup[] = useMemo(() => {
    const rawList: LabReportRecord[] = [];
    const seenOrderIds = new Set<string>();

    const addItems = (list: LabReportRecord[], defaultIsImaging: boolean) => {
      for (const item of list) {
        const id = item.lab_order_id || item.order_id || item.report_id || `inv-${Math.random()}`;
        if (!seenOrderIds.has(id)) {
          seenOrderIds.add(id);
          rawList.push({
            ...item,
            lab_order_id: id,
            is_imaging: item.is_imaging ?? defaultIsImaging,
          });
        }
      }
    };

    addItems(labReports, false);
    addItems(scansAndDiagnostics, true);

    // Group items by encounter_id or appointment_id or date
    const groupsMap = new Map<string, ConsultationLabGroup>();

    for (const item of rawList) {
      const gId =
        item.appointment?.appointment_id ||
        item.encounter_id ||
        (item.appointment?.date ? `date-${item.appointment.date}` : `date-${item.date}`) ||
        "general-consultation";

      const itemDateStr = item.appointment?.date || item.date || "";
      const itemTimestamp = itemDateStr ? new Date(itemDateStr).getTime() : 0;

      if (!groupsMap.has(gId)) {
        groupsMap.set(gId, {
          groupId: gId,
          encounter_id: item.encounter_id,
          date: formatDateDisplay(itemDateStr),
          dateTimestamp: isNaN(itemTimestamp) ? 0 : itemTimestamp,
          doctor: item.doctor || null,
          concern: item.appointment?.reason || null,
          orders: [],
        });
      }

      const grp = groupsMap.get(gId)!;
      if (!grp.doctor && item.doctor) grp.doctor = item.doctor;
      if (!grp.concern && item.appointment?.reason) grp.concern = item.appointment.reason;
      grp.orders.push(item);
    }

    // Sort groups descending by date (latest first)
    return Array.from(groupsMap.values()).sort((a, b) => b.dateTimestamp - a.dateTimestamp);
  }, [labReports, scansAndDiagnostics]);

  // Filter groups by search query and category tabs
  const filteredGroups = useMemo(() => {
    return consultationGroups
      .map((grp) => {
        // Filter orders inside group by tab
        const tabFilteredOrders = grp.orders.filter((order) => {
          if (activeTab === "LAB" && order.is_imaging) return false;
          if (activeTab === "IMAGING" && !order.is_imaging) return false;
          return true;
        });

        if (tabFilteredOrders.length === 0) return null;

        // Filter by search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const docName = (grp.doctor?.name || "").toLowerCase();
          const concern = (grp.concern || "").toLowerCase();
          const dateStr = grp.date.toLowerCase();

          const matchesGroupHeader =
            docName.includes(q) || concern.includes(q) || dateStr.includes(q);

          const matchingOrders = tabFilteredOrders.filter((o) => {
            const testName = (o.test || o.name || "").toLowerCase();
            const panel = (o.panel || o.modality || "").toLowerCase();
            const notes = (o.notes || o.finding || "").toLowerCase();
            const analyteMatch = (o.results || []).some((r) =>
              (r.analyte || "").toLowerCase().includes(q)
            );
            return (
              matchesGroupHeader ||
              testName.includes(q) ||
              panel.includes(q) ||
              notes.includes(q) ||
              analyteMatch
            );
          });

          if (matchingOrders.length === 0) return null;

          return {
            ...grp,
            orders: matchingOrders,
          };
        }

        return {
          ...grp,
          orders: tabFilteredOrders,
        };
      })
      .filter(Boolean) as ConsultationLabGroup[];
  }, [consultationGroups, activeTab, searchQuery]);

  // Toggle expand/collapse for past consultation groups
  const togglePastGroupExpand = (groupId: string) => {
    setExpandedPastGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const totalAllCount = consultationGroups.reduce((acc, g) => acc + g.orders.length, 0);
  const totalLabCount = consultationGroups.reduce(
    (acc, g) => acc + g.orders.filter((o) => !o.is_imaging).length,
    0
  );
  const totalScanCount = consultationGroups.reduce(
    (acc, g) => acc + g.orders.filter((o) => o.is_imaging).length,
    0
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div>
          <h3 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
            <FlaskConical size={18} className="text-[#0078d4]" /> Diagnostic Investigations &amp; Lab Orders
          </h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Prescribed blood tests, pathology panels, and radiology scans organized by doctor consultation
          </p>
        </div>

        {/* Search input & Print */}
        <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search test, doctor, concern..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#0078d4] focus:outline-none focus:ring-2 focus:ring-[#0078d4]/10 transition"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 text-[11.5px] font-bold text-[#0078d4] bg-blue-50 border border-blue-200/60 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition shrink-0"
          >
            <Download size={13} /> Print
          </button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition ${
            activeTab === "ALL"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          All Reports ({totalAllCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("LAB")}
          className={`rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition flex items-center gap-1.5 ${
            activeTab === "LAB"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <TestTubes size={14} /> Laboratory Tests ({totalLabCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("IMAGING")}
          className={`rounded-xl px-3.5 py-1.5 text-[12px] font-bold transition flex items-center gap-1.5 ${
            activeTab === "IMAGING"
              ? "bg-[#0078d4] text-white shadow-sm"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ScanLine size={14} /> Scans &amp; Imaging ({totalScanCount})
        </button>
      </div>

      {/* Consultation Groups List */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
          <FlaskConical size={32} className="mx-auto text-slate-300 mb-2" />
          <h4 className="text-[13px] font-bold text-slate-700">No Reports Found</h4>
          <p className="text-[11.5px] text-slate-400 mt-0.5">
            {searchQuery
              ? "No diagnostic reports matching your search query."
              : "No diagnostic tests or scans recorded in your medical chart."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group, groupIndex) => {
            const isLatestGroup = groupIndex === 0;
            const isGroupExpanded = isLatestGroup || expandedPastGroupIds.has(group.groupId);
            const doc = group.doctor;
            const concern = group.concern || "Doctor Consultation & Clinical Assessment";
            const labCount = group.orders.filter((o) => !o.is_imaging).length;
            const scanCount = group.orders.filter((o) => o.is_imaging).length;

            return (
              <div
                key={group.groupId}
                className={`rounded-2xl border bg-white shadow-sm transition overflow-hidden ${
                  isLatestGroup
                    ? "border-blue-300 ring-1 ring-blue-500/10"
                    : "border-slate-200/80 hover:border-slate-300"
                }`}
              >
                {/* 1. TOP CONSULTATION CONTEXT HEADER BAR */}
                <div
                  onClick={() => !isLatestGroup && togglePastGroupExpand(group.groupId)}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                    !isLatestGroup ? "cursor-pointer select-none hover:bg-slate-50/70" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] border border-blue-200/60 shrink-0">
                        <FlaskConical size={16} />
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                        <Calendar size={13} className="text-[#0078d4]" />
                        {group.date}
                      </span>
                    </div>

                    {isLatestGroup && (
                      <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                        ● Latest Consultation
                      </span>
                    )}

                    {/* Prescribing Doctor */}
                    {doc?.name && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-800 bg-blue-50/60 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                        <Stethoscope size={13} className="text-[#0078d4]" />
                        {doc.name}
                        {doc.specialty && (
                          <span className="font-normal text-slate-500">({doc.specialty})</span>
                        )}
                      </span>
                    )}

                    {/* Health Concern */}
                    {concern && (
                      <span className="text-[12px] text-slate-700 bg-amber-50/80 border border-amber-200/70 px-2.5 py-0.5 rounded-lg font-medium">
                        <b className="text-amber-900 font-bold">Concern:</b> {concern}
                      </span>
                    )}
                  </div>

                  {/* Right Header Status / Expand Actions */}
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
                    {/* Summary Count Tag */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold">
                      {group.orders.length} Prescribed Test{group.orders.length === 1 ? "" : "s"}
                      <span className="text-slate-400 font-normal">
                        ({[labCount > 0 ? `${labCount} Lab` : null, scanCount > 0 ? `${scanCount} Scan` : null].filter(Boolean).join(", ")})
                      </span>
                    </span>

                    {/* Expand/Collapse Button for Past Consultations */}
                    {!isLatestGroup && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePastGroupExpand(group.groupId);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition ml-1"
                      >
                        {isGroupExpanded ? (
                          <>
                            <ChevronUp size={13} /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown size={13} /> View Details
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. EXPANDED GROUP BODY: LIST OF PRESCRIBED TESTS */}
                {isGroupExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100/80 space-y-3 animate-in fade-in duration-150">
                    <div className="space-y-3 pt-3">
                      {group.orders.map((item, itemIdx) => {
                        const rawStatus = (item.raw_status || item.status || "").toUpperCase();
                        const isCompleted =
                          rawStatus === "COMPLETED" ||
                          rawStatus === "RESULTED" ||
                          rawStatus === "DISCHARGED";
                        const isSampleCollected =
                          !isCompleted && rawStatus === "SAMPLE_COLLECTED";
                        const isBooked =
                          !isCompleted &&
                          !isSampleCollected &&
                          (rawStatus === "BOOKED" ||
                            rawStatus === "SCHEDULED" ||
                            rawStatus === "CONFIRMED" ||
                            Boolean(item.booking_slot));
                        const isPending =
                          !isCompleted &&
                          !isSampleCollected &&
                          !isBooked &&
                          (rawStatus === "CREATED" || rawStatus === "PENDING");
                        const isAbnormal = Boolean(item.flag && item.flag !== "N");
                        const results = item.results || [];
                        const hasAnalytes = results.length > 0;
                        const findingsNotes =
                          item.notes && !item.notes.includes("LOCAL PYTORCH")
                            ? item.notes
                            : null;
                        const testName = item.test || item.name || "Diagnostic Test";
                        const panelName =
                          item.panel ||
                          item.modality ||
                          (item.is_imaging ? "Radiology & Imaging" : "Clinical Laboratory");

                        return (
                          <div
                            key={item.lab_order_id || itemIdx}
                            className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5 space-y-3"
                          >
                            {/* Individual Item Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div
                                  className={`grid h-7 w-7 place-items-center rounded-lg border shrink-0 ${
                                    item.is_imaging
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-200/60"
                                      : "bg-blue-50 text-[#0078d4] border-blue-200/60"
                                  }`}
                                >
                                  {item.is_imaging ? (
                                    <ScanLine size={14} />
                                  ) : (
                                    <TestTubes size={14} />
                                  )}
                                </div>
                                <span className="font-extrabold text-[13.5px] text-slate-800">
                                  {testName}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-white text-slate-600 border border-slate-200">
                                  {panelName}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                                  ID: <span className="font-bold text-slate-600">{item.lab_order_id?.slice(0, 10)}</span>
                                </span>
                              </div>

                              {/* Status Badge */}
                              <div>
                                {isCompleted ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                                    <CheckCircle2 size={12} />{" "}
                                    {isAbnormal ? "Resulted (Flagged)" : "Resulted / Ready"}
                                  </span>
                                ) : isSampleCollected ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                                    ● Sample Collected · In Lab Analysis
                                  </span>
                                ) : isBooked ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                                    ● Slot Booked &amp; Confirmed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 text-[10.5px] font-bold">
                                    <Clock size={11} className="text-amber-600 animate-pulse" /> Pending Collection
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* In-hospital process message for Booked / Collected / Pending */}
                            {isSampleCollected ? (
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-[12px] text-indigo-900 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 font-medium">
                                  <CheckCircle2 size={15} className="text-indigo-600 shrink-0" />
                                  <span>Sample / Scan captured. Laboratory technicians are currently analyzing the findings.</span>
                                </div>
                                <span className="text-[10.5px] font-bold bg-white border border-indigo-200 px-2 py-0.5 rounded-md text-indigo-700">
                                  In Laboratory Analysis
                                </span>
                              </div>
                            ) : isBooked ? (
                              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[12px] text-blue-900 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 font-medium">
                                  <CheckCircle2 size={15} className="text-[#0078d4] shrink-0" />
                                  <span>
                                    Hospital slot booked {item.booking_slot ? `for ${item.booking_slot}` : ""}. Please proceed to the diagnostics department for sample collection / scan.
                                  </span>
                                </div>
                                <span className="text-[10.5px] font-bold bg-white border border-blue-200 px-2 py-0.5 rounded-md text-[#0078d4]">
                                  In-Hospital Process
                                </span>
                              </div>
                            ) : isPending ? (
                              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[12px] text-amber-900 flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2 font-medium">
                                  <Clock size={15} className="text-amber-600 shrink-0" />
                                  <span>Test order prescribed by clinician. Pending sample collection &amp; processing.</span>
                                </div>
                              </div>
                            ) : null}

                            {/* Measured Analytes Table (if resulted) */}
                            {hasAnalytes && (
                              <div className="space-y-1.5">
                                <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                                  <TestTubes size={12} className="text-[#0078d4]" /> Analyte Test Results ({results.length})
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                                  <table className="min-w-[560px] w-full text-xs text-left">
                                    <thead>
                                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                                        <th className="px-3 py-2">Analyte / Parameter</th>
                                        <th className="px-3 py-2">Measured Value</th>
                                        <th className="px-3 py-2">Reference Range</th>
                                        <th className="px-3 py-2 text-right">Status / Flag</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {results.map((r, i) => {
                                        const flag = (r.abnormal_flag || "").toUpperCase();
                                        const isRowAbnormal = flag && flag !== "N";
                                        const refRange =
                                          r.reference_range ||
                                          (r.reference_low != null && r.reference_high != null
                                            ? `${r.reference_low} - ${r.reference_high} ${r.unit || ""}`
                                            : "--");

                                        return (
                                          <tr key={i} className="hover:bg-slate-50/60 transition">
                                            <td className="px-3 py-2 font-extrabold text-slate-800">
                                              {r.analyte}
                                            </td>
                                            <td className="px-3 py-2 font-bold tabular-nums">
                                              <span
                                                className={
                                                  isRowAbnormal
                                                    ? "text-red-700 font-black"
                                                    : "text-slate-900"
                                                }
                                              >
                                                {r.value} {r.unit || ""}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-600 font-medium">
                                              {refRange}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                              {isRowAbnormal ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 text-[9.5px] font-extrabold">
                                                  ⚠ Flagged ({flag})
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[9.5px] font-bold">
                                                  Normal
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Clinician Notes (when present in DB) */}
                            {findingsNotes && (
                              <div className="rounded-xl border border-slate-200 bg-white p-3 text-[12px] space-y-1">
                                <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-400 block">
                                  Diagnostic Findings &amp; Clinical Impression
                                </span>
                                <div className="text-slate-800 font-medium whitespace-pre-line leading-relaxed">
                                  {findingsNotes}
                                </div>
                              </div>
                            )}

                            {/* Verified PDF Attachment */}
                            {item.attachment_uri && (
                              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white text-[12px]">
                                <span className="text-slate-700 font-semibold flex items-center gap-2 truncate max-w-sm">
                                  <FileText size={14} className="text-[#0078d4] shrink-0" />
                                  {item.attachment_name || "Diagnostic Report"}
                                </span>
                                <a
                                  href={
                                    item.attachment_uri.startsWith("http") ||
                                    item.attachment_uri.startsWith("/imaging")
                                      ? item.attachment_uri
                                      : `${import.meta.env.VITE_API_BASE_URL ?? ""}${item.attachment_uri}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-white bg-[#0078d4] hover:bg-[#0a6ec2] font-bold px-2.5 py-1 rounded-lg transition shadow-2xs shrink-0"
                                >
                                  <Download size={11} /> View PDF
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
