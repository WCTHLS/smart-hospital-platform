import React, { useState, useMemo } from "react";
import {
  Activity,
  Heart,
  Wind,
  Thermometer,
  Calendar,
  Stethoscope,
  Weight,
  Ruler,
  TrendingUp,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronUp
} from "lucide-react";

export interface VitalRecord {
  vital_id?: string;
  encounter_id?: string;
  captured_ts?: string;
  date?: string;
  bp?: string;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  spo2?: number | null;
  heart_rate?: number | null;
  respiratory_rate?: number | null;
  temperature?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
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
    visit_type?: string;
  } | null;
  health_concern?: string | null;
  department?: string | null;
}

interface VitalsSectionProps {
  vitalsHistory?: VitalRecord[];
  latestVitals?: any;
  patientName?: string;
}

export default function VitalsSection({
  vitalsHistory = [],
  latestVitals,
}: VitalsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPastIds, setExpandedPastIds] = useState<Set<string>>(new Set());

  // Format date helper
  const formatDateDisplay = (dateStr?: string, ts?: string) => {
    const raw = dateStr || ts;
    if (!raw) return "Not recorded";
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch {
      // ignore
    }
    return dateStr || ts || "Not recorded";
  };

  // Compile real list from DB only
  const records: VitalRecord[] = useMemo(() => {
    const list: VitalRecord[] = [];
    const seen = new Set<string>();

    if (Array.isArray(vitalsHistory) && vitalsHistory.length > 0) {
      for (const item of vitalsHistory) {
        const id = item.vital_id || item.encounter_id || `v-${item.captured_ts || Math.random()}`;
        if (!seen.has(id)) {
          seen.add(id);
          list.push({ ...item, vital_id: id });
        }
      }
    } else if (
      latestVitals &&
      (latestVitals.bp ||
        latestVitals.bp_systolic ||
        latestVitals.heart_rate ||
        latestVitals.temperature ||
        latestVitals.spo2)
    ) {
      list.push({
        vital_id: latestVitals.vital_id || "latest",
        captured_ts: latestVitals.captured_ts,
        date: formatDateDisplay(undefined, latestVitals.captured_ts),
        bp:
          latestVitals.bp ||
          (latestVitals.bp_systolic && latestVitals.bp_diastolic
            ? `${latestVitals.bp_systolic}/${latestVitals.bp_diastolic}`
            : undefined),
        bp_systolic: latestVitals.bp_systolic,
        bp_diastolic: latestVitals.bp_diastolic,
        spo2: latestVitals.spo2,
        heart_rate: latestVitals.heart_rate,
        temperature: latestVitals.temperature,
        weight_kg: latestVitals.weight_kg,
        height_cm: latestVitals.height_cm,
        bmi: latestVitals.bmi,
        doctor: latestVitals.doctor || null,
        appointment: latestVitals.appointment || null,
        health_concern: latestVitals.health_concern || null,
        department: latestVitals.department || null,
      });
    }

    // Sort by latest captured timestamp descending
    return list.sort((a, b) => {
      const tA = a.captured_ts ? new Date(a.captured_ts).getTime() : 0;
      const tB = b.captured_ts ? new Date(b.captured_ts).getTime() : 0;
      return tB - tA;
    });
  }, [vitalsHistory, latestVitals]);

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((r) => {
      const docName = (r.doctor?.name || "").toLowerCase();
      const docSpec = (r.doctor?.specialty || "").toLowerCase();
      const concern = (r.health_concern || r.appointment?.reason || "").toLowerCase();
      const dept = (r.department || r.appointment?.department || "").toLowerCase();
      const dateStr = formatDateDisplay(r.date, r.captured_ts).toLowerCase();

      return (
        docName.includes(q) ||
        docSpec.includes(q) ||
        concern.includes(q) ||
        dept.includes(q) ||
        dateStr.includes(q)
      );
    });
  }, [records, searchQuery]);

  // Toggle expand/collapse for past records
  const togglePastExpand = (id: string) => {
    setExpandedPastIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Evaluate abnormal status based on medical thresholds
  const evaluateVitals = (v: VitalRecord) => {
    const sys = v.bp_systolic ?? (v.bp ? parseInt(v.bp.split("/")[0], 10) : null);
    const dia = v.bp_diastolic ?? (v.bp ? parseInt(v.bp.split("/")[1], 10) : null);
    const hr = v.heart_rate != null ? Number(v.heart_rate) : null;
    const spo2 = v.spo2 != null ? Number(v.spo2) : null;
    const temp = v.temperature != null ? Number(v.temperature) : null;

    const isBpAbnormal = Boolean((sys && (sys >= 140 || sys < 90)) || (dia && (dia >= 90 || dia < 60)));
    const isHrAbnormal = Boolean(hr && (hr > 100 || hr < 60));
    const isSpo2Abnormal = Boolean(spo2 && spo2 < 95);
    const isTempAbnormal = Boolean(temp && (temp > 99.5 || temp < 97.0));

    const isFlagged = isBpAbnormal || isHrAbnormal || isSpo2Abnormal || isTempAbnormal;

    return {
      sys,
      dia,
      hr,
      spo2,
      temp,
      isBpAbnormal,
      isHrAbnormal,
      isSpo2Abnormal,
      isTempAbnormal,
      isFlagged,
    };
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header bar & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0078d4] text-white shadow-sm">
            <Activity size={18} className="stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-[15px] font-extrabold text-[#0c3b63]">
              Recorded Vitals History
            </h3>
            <p className="text-[11.5px] text-slate-500 font-medium">
              Vitals recorded during clinical encounters and triage assessments
            </p>
          </div>
        </div>

        {/* Search input & Record Count */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search doctor, concern, date..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#0078d4] focus:outline-none focus:ring-2 focus:ring-[#0078d4]/10 transition"
            />
          </div>

          <span className="rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600 shrink-0">
            {records.length} {records.length === 1 ? "Record" : "Records"}
          </span>
        </div>
      </div>

      {/* Vitals List */}
      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
          <Activity size={32} className="mx-auto text-slate-300 mb-2" />
          <h4 className="text-[13px] font-bold text-slate-700">No Vitals Found</h4>
          <p className="text-[11.5px] text-slate-400 mt-0.5">
            {searchQuery ? "No vital sign records matching your search query." : "No vital sign records found in your medical chart."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record, index) => {
            const ev = evaluateVitals(record);
            const isLatest = index === 0;
            const id = record.vital_id || `v-${index}`;
            const isExpanded = isLatest || expandedPastIds.has(id);
            const dateStr = formatDateDisplay(record.date, record.captured_ts);
            const doc = record.doctor;
            const appt = record.appointment;
            const healthConcern = record.health_concern || appt?.reason || null;
            const department = record.department || appt?.department || doc?.specialty || null;

            return (
              <div
                key={id}
                className={`rounded-2xl border bg-white shadow-sm transition overflow-hidden ${
                  isLatest
                    ? "border-blue-300 ring-1 ring-blue-500/10"
                    : "border-slate-200/80 hover:border-slate-300"
                }`}
              >
                {/* 1. TOP CONTEXT BAR: Date + Doctor + Health Concern + Status (+ Expand/Collapse for past) */}
                <div
                  onClick={() => !isLatest && togglePastExpand(id)}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 ${
                    !isLatest ? "cursor-pointer select-none hover:bg-slate-50/70" : ""
                  } ${isExpanded && !isLatest ? "bg-slate-50/40" : ""}`}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {/* Timestamp */}
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                      <Calendar size={13} className="text-[#0078d4]" />
                      {dateStr}
                    </span>

                    {isLatest && (
                      <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                        ● Latest Vitals
                      </span>
                    )}

                    {/* Attending Doctor */}
                    {doc?.name && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-800 bg-blue-50/60 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                        <Stethoscope size={13} className="text-[#0078d4]" />
                        {doc.name}
                        {doc.specialty && <span className="font-normal text-slate-500">({doc.specialty})</span>}
                      </span>
                    )}

                    {/* Department / Room */}
                    {(department || doc?.room) && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin size={11} className="text-slate-400" />
                        {[department, doc?.room].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>

                  {/* Health Concern, Flag status & Expand Toggle for Past */}
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
                    {healthConcern && (
                      <span
                        className="text-[11.5px] text-slate-700 bg-amber-50/80 border border-amber-200/70 px-2.5 py-0.5 rounded-lg font-medium truncate max-w-md"
                        title={healthConcern}
                      >
                        <b className="text-amber-900 font-bold">Concern:</b> {healthConcern}
                      </span>
                    )}

                    {ev.isFlagged ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 border border-red-200 px-2.5 py-0.5 text-[10px] font-extrabold">
                        <AlertTriangle size={11} /> Flagged
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold">
                        <CheckCircle2 size={11} /> Normal
                      </span>
                    )}

                    {/* Expand/Collapse toggle for past vitals */}
                    {!isLatest && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePastExpand(id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition ml-1"
                      >
                        {isExpanded ? (
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

                {/* 2. VITALS METRICS ROW (Single Organized Line) */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100/80 animate-in fade-in duration-150">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 pt-3">
                      {/* 1. Blood Pressure */}
                      <div
                        className={`rounded-xl border p-2 text-center transition ${
                          ev.isBpAbnormal
                            ? "bg-red-50/90 border-red-200 text-red-700"
                            : "bg-slate-50/70 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Heart size={10} className="text-red-500" /> BP
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.bp ||
                            (record.bp_systolic && record.bp_diastolic
                              ? `${record.bp_systolic}/${record.bp_diastolic}`
                              : "--")}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          mmHg {ev.isBpAbnormal && "· High"}
                        </div>
                      </div>

                      {/* 2. Heart Rate / Pulse */}
                      <div
                        className={`rounded-xl border p-2 text-center transition ${
                          ev.isHrAbnormal
                            ? "bg-red-50/90 border-red-200 text-red-700"
                            : "bg-slate-50/70 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Activity size={10} className="text-rose-500" /> Pulse
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.heart_rate != null ? record.heart_rate : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          bpm {ev.isHrAbnormal && "· Alert"}
                        </div>
                      </div>

                      {/* 3. SpO2 */}
                      <div
                        className={`rounded-xl border p-2 text-center transition ${
                          ev.isSpo2Abnormal
                            ? "bg-red-50/90 border-red-200 text-red-700"
                            : "bg-slate-50/70 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Wind size={10} className="text-cyan-500" /> SpO₂
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.spo2 != null ? `${record.spo2}%` : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          {ev.isSpo2Abnormal ? "Low SpO₂" : "Optimal"}
                        </div>
                      </div>

                      {/* 4. Temperature */}
                      <div
                        className={`rounded-xl border p-2 text-center transition ${
                          ev.isTempAbnormal
                            ? "bg-red-50/90 border-red-200 text-red-700"
                            : "bg-slate-50/70 border-slate-200 text-slate-800"
                        }`}
                      >
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Thermometer size={10} className="text-amber-500" /> Temp
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.temperature != null ? `${record.temperature}°F` : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          {ev.isTempAbnormal ? "Fever" : "Normal"}
                        </div>
                      </div>

                      {/* 5. Weight */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-center text-slate-800">
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Weight size={10} className="text-slate-500" /> Weight
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.weight_kg != null ? `${record.weight_kg} kg` : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          Mass
                        </div>
                      </div>

                      {/* 6. Height */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-center text-slate-800">
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <Ruler size={10} className="text-slate-500" /> Height
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.height_cm != null ? `${record.height_cm} cm` : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          Stature
                        </div>
                      </div>

                      {/* 7. BMI */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2 text-center text-slate-800">
                        <div className="text-[9.5px] font-bold uppercase text-slate-400 flex items-center justify-center gap-1">
                          <TrendingUp size={10} className="text-teal-600" /> BMI
                        </div>
                        <div className="text-[14px] font-black tracking-tight my-0.5 tabular-nums">
                          {record.bmi != null
                            ? record.bmi
                            : record.weight_kg && record.height_cm
                            ? (record.weight_kg / ((record.height_cm / 100) ** 2)).toFixed(1)
                            : "--"}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-500">
                          kg/m²
                        </div>
                      </div>
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
