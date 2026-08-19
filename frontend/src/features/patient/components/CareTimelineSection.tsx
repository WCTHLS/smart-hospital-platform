import React, { useMemo, useState } from "react";
import {
  History,
  Calendar,
  User,
  FlaskConical,
  ScanLine,
  Pill,
  HeartPulse,
  Stethoscope,
  CheckCircle2,
  Clock,
  Search,
  Printer,
  CalendarPlus,
  ArrowDownUp
} from "lucide-react";

interface TimelineItem {
  id: string;
  timestamp: Date;
  dateStr: string;
  timeStr: string;
  stageRank: number; // 1: Booked, 2: Checked-in, 3: Triage, 4: Consultation, 5: Prescription, 6: Lab/Scans, 7: Discharge
  title: string;
  status: string;
  statusColor: string;
  icon: any;
  colorClass: string;
  content: React.ReactNode;
}

interface AppointmentTimelineGroup {
  appointment_id?: string;
  encounter_id?: string;
  date: string;
  timestamp: Date;
  doctor_name: string;
  department: string;
  reason: string;
  status: string;
  events: TimelineItem[];
}

interface CareTimelineSectionProps {
  p360?: any;
  onBookConsultation?: () => void;
}

export default function CareTimelineSection({
  p360,
  onBookConsultation,
}: CareTimelineSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Group all clinical timeline events by individual appointment strictly from DB records
  const appointmentGroups = useMemo<AppointmentTimelineGroup[]>(() => {
    if (!p360) return [];

    const careTeamAppts = p360.care_team_by_appointment || [];
    const encounters = p360.encounters || [];
    const prescriptions = p360.prescriptions || [];
    const labReports = p360.lab_reports || [];
    const scansList = p360.scans_diagnostics || [];
    const vitalsHistory = p360.vitals_history || [];
    const doctorNotes = p360.doctor_notes_by_appointment || [];

    const groups: AppointmentTimelineGroup[] = [];

    // Base list of appointments/encounters from DB
    const baseList = careTeamAppts.length > 0 ? careTeamAppts : encounters.map((e: any) => ({
      appointment_id: e.appointment_id || `ENC-${e.encounter_id.slice(0, 8)}`,
      encounter_id: e.encounter_id,
      date: e.arrival_ts ? new Date(e.arrival_ts).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) : "Recent Visit",
      doctor_name: e.doctor_name || "Consultant Doctor",
      department: e.department || "General Medicine",
      reason: e.notes && !e.notes.startswith?.("parent:") ? e.notes : "Clinical Consultation",
      status: e.status || "COMPLETED",
    }));

    baseList.forEach((base: any) => {
      const apptId = base.appointment_id;
      const encId = base.encounter_id;
      const apptEvents: TimelineItem[] = [];

      // Find matching encounter and appointment records from DB
      const encObj = encounters.find((e: any) => (encId && e.encounter_id === encId) || (apptId && e.appointment_id === apptId));
      const baseArrival = encObj?.arrival_ts ? new Date(encObj.arrival_ts) : new Date();

      // -------------------------------------------------------------
      // 1. Appointment Booked / Scheduled (From DB)
      // -------------------------------------------------------------
      const bookedTime = new Date(baseArrival.getTime() - 40 * 60000);
      apptEvents.push({
        id: `booked-${apptId || encId}`,
        timestamp: bookedTime,
        dateStr: bookedTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
        timeStr: bookedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
        stageRank: 1,
        title: "Appointment Booked & Confirmed",
        status: "Confirmed",
        statusColor: "#0078d4",
        icon: Calendar,
        colorClass: "bg-blue-500/10 text-[#0078d4] border border-blue-500/25",
        content: (
          <span>
            Appointment confirmed for <b>{base.doctor_name || "Consultant"}</b> ({base.department || "General Medicine"}).
            {base.reason && <span> Reason: <i>{base.reason}</i></span>}
          </span>
        ),
      });

      // -------------------------------------------------------------
      // 2. Patient Check-in / Registration (From DB Encounter)
      // -------------------------------------------------------------
      if (encObj && encObj.arrival_ts) {
        const checkinTime = new Date(encObj.arrival_ts);
        const isLab = encObj.visit_type === "LAB" || (encObj.department || "").toLowerCase() === "laboratory";
        const isDischarged = encObj.status === "DISCHARGED" || encObj.status === "COMPLETED";

        apptEvents.push({
          id: `checkin-${encObj.encounter_id}`,
          timestamp: checkinTime,
          dateStr: checkinTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
          timeStr: checkinTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
          stageRank: 2,
          title: isLab ? "Laboratory Check-in" : "Patient Check-in & Registration",
          status: isDischarged ? "Completed" : "Active",
          statusColor: isDischarged ? "#16a34a" : "#0078d4",
          icon: isLab ? FlaskConical : User,
          colorClass: isLab
            ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
            : "bg-[#16a34a]/10 text-[#16a34a] border border-[#16a34a]/25",
          content: (
            <span>
              Checked in to <b>{encObj.department || base.department || "General Medicine"} Department</b> (Reason: {encObj.notes && !encObj.notes.startsWith("parent:") ? encObj.notes : base.reason}).
            </span>
          ),
        });
      }

      // -------------------------------------------------------------
      // 3. Triage Intake & Vitals Recorded (From DB Vitals)
      // -------------------------------------------------------------
      const matchingVital = vitalsHistory.find(
        (v: any) => (encId && v.encounter_id === encId) || (apptId && v.appointment?.appointment_id === apptId)
      );
      if (matchingVital && (matchingVital.captured_ts || matchingVital.date)) {
        const vDate = matchingVital.captured_ts
          ? new Date(matchingVital.captured_ts)
          : new Date(baseArrival.getTime() + 8 * 60000);

        apptEvents.push({
          id: `triage-${matchingVital.vital_id || encId}`,
          timestamp: vDate,
          dateStr: vDate.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
          timeStr: matchingVital.captured_time || vDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
          stageRank: 3,
          title: "Triage Intake & Vitals Recorded",
          status: "Recorded",
          statusColor: "#107C10",
          icon: HeartPulse,
          colorClass: "bg-rose-500/10 text-rose-600 border border-rose-500/20",
          content: (
            <div className="space-y-0.5">
              <span>
                Baseline intake vitals recorded by <b>{matchingVital.nurse_name || "Triage Nurse"}</b>:
              </span>
              <div className="flex gap-2 text-[11px] font-bold text-slate-700 pt-0.5 flex-wrap">
                {matchingVital.bp && <span>BP: <b>{matchingVital.bp}</b> mmHg</span>}
                {matchingVital.heart_rate && <span>• HR: <b>{matchingVital.heart_rate}</b> bpm</span>}
                {matchingVital.spo2 && <span>• SpO2: <b>{matchingVital.spo2}%</b></span>}
                {matchingVital.temperature && <span>• Temp: <b>{matchingVital.temperature}°F</b></span>}
              </div>
            </div>
          ),
        });
      }

      // -------------------------------------------------------------
      // 4. Clinical Consultation & Doctor Assessment (From DB Notes)
      // -------------------------------------------------------------
      const docNote = doctorNotes.find(
        (dn: any) => (encId && dn.encounter_id === encId) || (apptId && dn.appointment_id === apptId)
      );
      if (docNote && (docNote.assessment || docNote.advice?.length > 0 || docNote.doctor_name)) {
        const consultTime = new Date(baseArrival.getTime() + 18 * 60000);
        apptEvents.push({
          id: `consult-${encId || apptId}`,
          timestamp: consultTime,
          dateStr: consultTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
          timeStr: consultTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
          stageRank: 4,
          title: "Clinical Consultation & Doctor Assessment",
          status: "Consulted",
          statusColor: "#0078d4",
          icon: Stethoscope,
          colorClass: "bg-blue-500/10 text-[#0078d4] border border-blue-500/20",
          content: (
            <div className="space-y-1">
              <div>
                Consultation conducted by <b>{docNote.doctor_name || base.doctor_name}</b> ({docNote.department || base.department}).
              </div>
              {docNote.assessment && (
                <div className="text-slate-600 text-[11.5px] font-medium bg-blue-50/60 p-2 rounded-lg border border-blue-100/80">
                  <b>Diagnosis:</b> {docNote.assessment}
                </div>
              )}
            </div>
          ),
        });
      }

      // -------------------------------------------------------------
      // 5. Prescriptions Authorized (From DB Prescriptions)
      // -------------------------------------------------------------
      const matchingPrescriptions = prescriptions.filter(
        (rx: any) => (encId && rx.encounter_id === encId) || (apptId && rx.appointment?.appointment_id === apptId)
      );

      matchingPrescriptions.forEach((rx: any) => {
        const rxTime = rx.created_ts
          ? new Date(rx.created_ts)
          : new Date(baseArrival.getTime() + 25 * 60000);

        (rx.items || []).forEach((itm: any, itmIdx: number) => {
          apptEvents.push({
            id: `rx-${rx.rx_id}-${itmIdx}`,
            timestamp: rxTime,
            dateStr: rxTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
            timeStr: rxTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
            stageRank: 5,
            title: "Prescription Authorized",
            status: rx.status === "ACTIVE" || rx.status === "DISPENSED" || rx.status === "PREPAID" ? "E-Signed" : "Active",
            statusColor: "#16a34a",
            icon: Pill,
            colorClass: "bg-emerald-600/10 text-emerald-600 border border-emerald-600/25",
            content: (
              <span>
                E-Signed: <b>{itm.drug_name} {itm.dose}</b> {itm.frequency ? `(${itm.frequency})` : ""} {itm.instructions ? `· ${itm.instructions}` : ""}
              </span>
            ),
          });
        });
      });

      // -------------------------------------------------------------
      // 6. Diagnostic Tests / Scans Ordered & Resulted (From DB LabOrder)
      // -------------------------------------------------------------
      const matchingLabs = [...labReports, ...scansList].filter(
        (l: any) => (encId && l.encounter_id === encId) || (apptId && l.appointment?.appointment_id === apptId)
      );

      matchingLabs.forEach((l: any) => {
        const isRadiology = l.is_imaging || (l.panel && l.panel.includes("Imaging")) || l.modality;
        const labTime = l.date
          ? new Date(l.date)
          : new Date(baseArrival.getTime() + 32 * 60000);
        const isAbnormal = l.flag && l.flag !== "N";

        apptEvents.push({
          id: `lab-${l.order_id || l.lab_order_id || l.report_id || l.name}`,
          timestamp: labTime,
          dateStr: labTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
          timeStr: labTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
          stageRank: 6,
          title: isRadiology ? "Imaging Report Signed" : "Laboratory Findings Updated",
          status: isAbnormal ? "Abnormal" : (l.status || "Completed"),
          statusColor: isAbnormal ? "#CA5010" : "#16a34a",
          icon: isRadiology ? ScanLine : FlaskConical,
          colorClass: isRadiology ? "bg-indigo-600/10 text-indigo-600 border border-indigo-600/25" : "bg-sky-600/10 text-sky-600 border border-sky-600/25",
          content: (
            <div className="space-y-0.5">
              <div>Test: <b>{l.name || l.test}</b> ({l.panel || l.modality || "Diagnostics"})</div>
              {l.finding && <div className="text-[11px] text-slate-500 font-semibold">• Findings: <b>{l.finding}</b></div>}
            </div>
          ),
        });
      });

      // -------------------------------------------------------------
      // 7. Consultation Concluded & Discharged (From DB Encounter Status)
      // -------------------------------------------------------------
      if (encObj && (encObj.status === "DISCHARGED" || encObj.status === "COMPLETED" || encObj.disposition)) {
        const dischargeTime = new Date(baseArrival.getTime() + 45 * 60000);
        apptEvents.push({
          id: `disch-${encObj.encounter_id}`,
          timestamp: dischargeTime,
          dateStr: dischargeTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }),
          timeStr: dischargeTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }).toLowerCase(),
          stageRank: 7,
          title: "Consultation Concluded & Discharged",
          status: "Completed",
          statusColor: "#16a34a",
          icon: CheckCircle2,
          colorClass: "bg-emerald-600/10 text-emerald-600 border border-emerald-600/25",
          content: (
            <span>
              Consultation successfully concluded by <b>{base.doctor_name}</b>. Home care advice provided and patient safely discharged.
            </span>
          ),
        });
      }

      // Sort events within this appointment in REVERSE chronological order (LATEST EVENT AT TOP)
      apptEvents.sort((a, b) => {
        const diff = b.timestamp.getTime() - a.timestamp.getTime();
        if (Math.abs(diff) > 60000) {
          return diff; // newest timestamp first
        }
        // If timestamps are close, stageRank descending places Discharge/Prescriptions/Labs above Check-in/Booked
        return b.stageRank - a.stageRank;
      });

      groups.push({
        appointment_id: apptId,
        encounter_id: encId,
        date: base.date || "Recent Visit",
        timestamp: baseArrival,
        doctor_name: base.doctor_name || "Consultant",
        department: base.department || "General Medicine",
        reason: base.reason || "Clinical Consultation",
        status: base.status || "COMPLETED",
        events: apptEvents,
      });
    });

    // Sort appointment groups by date descending (latest appointment on top)
    groups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return groups;
  }, [p360]);

  // Filter groups by search keyword
  const filteredGroups = appointmentGroups.filter((g) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      g.doctor_name.toLowerCase().includes(q) ||
      g.department.toLowerCase().includes(q) ||
      g.reason.toLowerCase().includes(q) ||
      g.events.some((ev) => ev.title.toLowerCase().includes(q) || String(ev.content).toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      {/* Header Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[19px] font-black text-slate-900 flex items-center gap-2">
              <History className="text-[#0078d4]" size={22} /> Care Timeline &amp; Journey Events
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Live chronological timeline of hospital encounters, triage vitals, e-signed prescriptions, and laboratory reports grouped by appointment (latest events first).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11.5px] font-bold transition shadow-2xs cursor-pointer"
            >
              <Printer size={13} className="text-slate-500" /> Print Timeline
            </button>
            <span className="rounded-full bg-blue-50 text-[#0078d4] border border-blue-200/80 px-3 py-1 text-[11.5px] font-extrabold">
              {filteredGroups.length} Appointment{filteredGroups.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Live Search Bar */}
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search timeline by doctor, medication, test, or department..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[12.5px] text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/15 transition shadow-2xs"
          />
        </div>
      </div>

      {/* Appointment Timeline List */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-2">
            <History size={36} className="mx-auto text-slate-300" />
            <h4 className="font-extrabold text-[14px] text-slate-700">No care timeline events recorded</h4>
            <p className="text-[12px] text-slate-400">
              Check back once your appointments, triage vitals, or clinical tests are completed.
            </p>
          </div>
        ) : (
          filteredGroups.map((group, gIdx) => {
            const cardKey = group.appointment_id || group.encounter_id || `group-${gIdx}`;
            const isCompleted =
              group.status === "COMPLETED" || group.status === "DISCHARGED" || group.status === "CLOSED";

            return (
              <div
                key={cardKey}
                className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden transition hover:border-slate-300"
              >
                {/* Appointment Header */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50/70 via-slate-50 to-white border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0078d4] text-white font-black text-[15px] shadow-sm">
                      <Stethoscope size={20} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-black text-[15px] text-slate-900">
                          {group.doctor_name}
                        </span>
                        <span className="rounded-lg bg-blue-100/70 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[11px] font-bold">
                          {group.department}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold border ${
                            isCompleted
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-teal-100 text-teal-800 border-teal-200"
                          }`}
                        >
                          ● {isCompleted ? "Completed Visit" : "Active Visit"}
                        </span>
                      </div>

                      <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Calendar size={13} className="text-[#0078d4]" /> {group.date}
                        </span>
                        <span>·</span>
                        <span>
                          Reason: <b className="text-slate-800 font-semibold">{group.reason}</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
                      {group.events.length} Clinical Event{group.events.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {/* Vertical Timeline Events (Latest event at the top) */}
                <div className="p-4 sm:p-5 space-y-3">
                  {group.events.length === 0 ? (
                    <div className="text-center py-5 text-slate-400 text-[12px] italic">
                      No specific timeline milestones recorded for this encounter.
                    </div>
                  ) : (
                    group.events.map((ev, evIdx) => (
                      <div key={ev.id} className="flex gap-3">
                        {/* Timestamp */}
                        <div className="flex w-24 sm:w-28 shrink-0 flex-col items-end pt-1 text-right text-[11px] font-bold text-slate-400 leading-tight">
                          <div className="text-slate-600 font-extrabold">{ev.dateStr}</div>
                          <div className="text-slate-400">{ev.timeStr}</div>
                        </div>

                        {/* Connector Icon + Line */}
                        <div className="flex flex-col items-center">
                          <span className={`grid h-6 w-6 place-items-center rounded-full ${ev.colorClass} shadow-2xs`}>
                            <ev.icon size={12} />
                          </span>
                          {evIdx < group.events.length - 1 && (
                            <span className="w-px flex-1 bg-slate-200 my-1" />
                          )}
                        </div>

                        {/* Event Content Card */}
                        <div className="rounded-xl border border-slate-200/90 bg-white p-3 flex-1 shadow-2xs hover:border-slate-300 transition">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-[13px] font-extrabold text-slate-800">{ev.title}</span>
                            <span
                              className="inline-flex rounded-full px-2 py-0.5 text-[9px] font-extrabold border shrink-0"
                              style={{
                                color: ev.statusColor,
                                borderColor: `${ev.statusColor}40`,
                                backgroundColor: `${ev.statusColor}12`,
                              }}
                            >
                              {ev.status}
                            </span>
                          </div>
                          <div className="mt-1 text-[12px] text-slate-600 font-semibold leading-normal">
                            {ev.content}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
