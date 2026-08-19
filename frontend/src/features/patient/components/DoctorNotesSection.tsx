import React, { useState } from "react";
import {
  FileText,
  Calendar,
  Stethoscope,
  Lightbulb,
  Pill as PillIcon,
  FlaskConical,
  HeartPulse,
  Search,
  CheckCircle2,
  CalendarPlus,
  Printer,
  ChevronDown,
  ChevronUp,
  Tag
} from "lucide-react";

export interface AppointmentDoctorNote {
  appointment_id?: string;
  encounter_id?: string;
  date?: string;
  doctor_name: string;
  department: string;
  specialty?: string;
  reason?: string;
  status?: string;
  clinical_note_raw?: string | null;
  assessment?: string;
  advice: string[];
  icd10_codes?: Array<{ code: string; label?: string }>;
  triage?: {
    chief_complaint?: string;
    symptom_summary?: string;
  } | null;
  prescriptions?: Array<{
    drug_name: string;
    dose?: string;
    frequency?: string;
    instructions?: string;
    duration_days?: number;
  }>;
  ordered_investigations?: Array<{
    test_name: string;
    category?: string;
    status?: string;
    finding?: string;
  }>;
  vitals_at_visit?: {
    bp?: string;
    heart_rate?: number | string;
    spo2?: number | string;
    temperature?: number | string;
    nurse_name?: string;
    captured_time?: string;
  } | null;
}

interface DoctorNotesSectionProps {
  notesByAppointment?: AppointmentDoctorNote[];
  onBookFollowUp?: (doctorName: string, specialty?: string) => void;
}

export default function DoctorNotesSection({
  notesByAppointment = [],
  onBookFollowUp,
}: DoctorNotesSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSoapId, setExpandedSoapId] = useState<string | null>(null);

  const filteredNotes = notesByAppointment.filter((n) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (n.doctor_name || "").toLowerCase().includes(q) ||
      (n.department || "").toLowerCase().includes(q) ||
      (n.reason || "").toLowerCase().includes(q) ||
      (n.assessment || "").toLowerCase().includes(q) ||
      (n.clinical_note_raw || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4 text-left animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-[19px] font-black text-slate-900 flex items-center gap-2">
              <FileText className="text-[#0078d4]" size={22} /> Doctor Consultation Notes &amp; Clinical Advice
            </h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Verified clinical diagnoses, treatment plans, home care instructions, and doctor advice recorded in the hospital database.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11.5px] font-bold transition shadow-2xs cursor-pointer"
            >
              <Printer size={13} className="text-slate-500" /> Print Notes
            </button>
            <span className="rounded-full bg-blue-50 text-[#0078d4] border border-blue-200/80 px-3 py-1 text-[11.5px] font-extrabold">
              {filteredNotes.length} Consultation{filteredNotes.length === 1 ? "" : "s"}
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
            placeholder="Search by doctor name, department, diagnosis, advice, or health concern..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-[12.5px] text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#0078d4] focus:ring-2 focus:ring-blue-500/15 transition shadow-2xs"
          />
        </div>
      </div>

      {/* Appointment Notes List */}
      <div className="space-y-4">
        {filteredNotes.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-2">
            <FileText size={36} className="mx-auto text-slate-300" />
            <h4 className="font-extrabold text-[14px] text-slate-700">No doctor consultation notes found</h4>
            <p className="text-[12px] text-slate-400">
              {notesByAppointment.length === 0
                ? "No completed clinical consultations are currently on record."
                : "No notes match your search criteria."}
            </p>
          </div>
        ) : (
          filteredNotes.map((note, idx) => {
            const cardKey = note.appointment_id || note.encounter_id || `appt-${idx}`;
            const isCompleted =
              (note.status || "").toUpperCase() === "COMPLETED" ||
              (note.status || "").toUpperCase() === "DISCHARGED" ||
              (note.status || "").toUpperCase() === "CLOSED";

            const hasSoap = Boolean(note.clinical_note_raw);
            const isSoapExpanded = expandedSoapId === cardKey;

            return (
              <div
                key={cardKey}
                className="rounded-2xl border border-slate-200/90 bg-white shadow-sm overflow-hidden transition hover:border-slate-300"
              >
                {/* 1. Appointment Card Header */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50/70 via-slate-50 to-white border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0078d4] text-white font-black text-[15px] shadow-sm">
                      <Stethoscope size={22} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-black text-[15.5px] text-slate-900">
                          {note.doctor_name}
                        </span>
                        <span className="rounded-lg bg-blue-100/70 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[11px] font-bold">
                          {note.department || "Consultation"}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold border ${isCompleted
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-teal-100 text-teal-800 border-teal-200"
                            }`}
                        >
                          ● {isCompleted ? "Completed Consultation" : "In Progress"}
                        </span>
                      </div>

                      <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap pt-0.5">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Calendar size={13} className="text-[#0078d4]" /> {note.date || "Recent Visit"}
                        </span>
                        {note.reason && (
                          <>
                            <span>·</span>
                            <span>
                              Reason: <b className="text-slate-800 font-semibold">{note.reason}</b>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top Right Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {hasSoap && (
                      <button
                        type="button"
                        onClick={() => setExpandedSoapId(isSoapExpanded ? null : cardKey)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11.5px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      >
                        <FileText size={13} className="text-[#0078d4]" />
                        <span>{isSoapExpanded ? "Hide SOAP Note" : "View Full SOAP Note"}</span>
                        {isSoapExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}

                    {onBookFollowUp && (
                      <button
                        type="button"
                        onClick={() => onBookFollowUp(note.doctor_name, note.department)}
                        className="px-3 py-1.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[11.5px] font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                      >
                        <CalendarPlus size={13} /> Book Follow-Up
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Main Appointment Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* Expanded Full SOAP Note from DB */}
                  {isSoapExpanded && note.clinical_note_raw && (
                    <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-2 shadow-inner">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-[11.5px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                          <FileText size={14} /> Full Clinician Approved SOAP Note
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">EMR Recorded</span>
                      </div>
                      <pre className="text-[12px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {note.clinical_note_raw}
                      </pre>
                    </div>
                  )}

                  {/* Assessment & Clinical Diagnosis */}
                  {note.assessment && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <Stethoscope size={14} className="text-[#0078d4]" /> Clinical Assessment &amp; Diagnosis
                        </div>
                        {note.icd10_codes && note.icd10_codes.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {note.icd10_codes.map((c, cIdx) => (
                              <span
                                key={cIdx}
                                className="px-2 py-0.5 rounded bg-blue-50 text-[#0078d4] border border-blue-200 text-[10px] font-mono font-bold"
                              >
                                ICD-10: {c.code} {c.label ? `(${c.label})` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[12.5px] text-slate-800 font-medium leading-relaxed">
                        {note.assessment}
                      </p>
                    </div>
                  )}

                  {/* Doctor's Advice & Instructions (Key Highlight from DB) */}
                  {note.advice && note.advice.length > 0 ? (
                    <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/90 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] font-extrabold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                          <Lightbulb size={16} className="text-amber-600" /> Doctor&apos;s Advice &amp; Home Care Instructions
                        </div>
                        <span className="text-[10.5px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                          {note.advice.length} Action Point{note.advice.length === 1 ? "" : "s"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                        {note.advice.map((item, aIdx) => (
                          <div
                            key={aIdx}
                            className="p-2.5 rounded-xl bg-white/90 border border-amber-200/70 text-[11.5px] text-slate-800 leading-snug flex items-start gap-2 shadow-2xs"
                          >
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-amber-500 text-white font-black text-[9px] mt-0.5">
                              {aIdx + 1}
                            </span>
                            <span className="font-medium text-slate-800">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Prescriptions & Diagnostic Investigations Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Prescriptions Issued */}
                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <PillIcon size={14} className="text-emerald-600" /> Prescriptions Issued
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.2 rounded">
                          {(note.prescriptions || []).length} Medicines
                        </span>
                      </div>

                      {note.prescriptions && note.prescriptions.length > 0 ? (
                        <div className="space-y-1.5">
                          {note.prescriptions.map((rx, rIdx) => (
                            <div
                              key={rIdx}
                              className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] flex items-center justify-between gap-2"
                            >
                              <div>
                                <span className="font-bold text-slate-800">{rx.drug_name}</span>
                                {rx.dose && <span className="text-slate-500 font-semibold ml-1">· {rx.dose}</span>}
                                {rx.instructions && (
                                  <div className="text-[10px] text-slate-500">{rx.instructions}</div>
                                )}
                              </div>
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                {rx.frequency || "Prescribed"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 text-center text-slate-400 text-[11px] bg-white rounded-lg border border-dashed border-slate-200">
                          No prescription medications issued during this visit.
                        </div>
                      )}
                    </div>

                    {/* Diagnostic Investigations Ordered */}
                    <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <FlaskConical size={14} className="text-indigo-600" /> Diagnostic Investigations
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.2 rounded">
                          {(note.ordered_investigations || []).length} Tests / Scans
                        </span>
                      </div>

                      {note.ordered_investigations && note.ordered_investigations.length > 0 ? (
                        <div className="space-y-1.5">
                          {note.ordered_investigations.map((inv, iIdx) => (
                            <div
                              key={iIdx}
                              className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 truncate block">{inv.test_name}</span>
                                <span className="text-[10px] text-slate-500">
                                  {inv.finding || inv.category || "Investigation"}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[9.5px] font-bold border shrink-0 ${(inv.status || "").toLowerCase().includes("complete") ||
                                    (inv.status || "").toLowerCase().includes("result")
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-amber-50 text-amber-800 border-amber-200"
                                  }`}
                              >
                                {inv.status || "Ordered"}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 text-center text-slate-400 text-[11px] bg-white rounded-lg border border-dashed border-slate-200">
                          No diagnostic tests or imaging investigations ordered.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Triage Baseline Vitals strip */}
                  {note.vitals_at_visit && (
                    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-[11px] text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <HeartPulse size={14} className="text-[#0078d4]" />
                        <span>
                          Baseline Intake Vitals (
                          {note.vitals_at_visit.nurse_name || "Triage Nurse"}
                          {note.vitals_at_visit.captured_time ? ` · ${note.vitals_at_visit.captured_time}` : ""}):
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11.5px] flex-wrap font-semibold text-slate-700">
                        {note.vitals_at_visit.bp && (
                          <span>
                            BP: <b className="text-slate-900">{note.vitals_at_visit.bp}</b> mmHg
                          </span>
                        )}
                        {note.vitals_at_visit.heart_rate && (
                          <span>
                            HR: <b className="text-slate-900">{note.vitals_at_visit.heart_rate}</b> bpm
                          </span>
                        )}
                        {note.vitals_at_visit.spo2 && (
                          <span>
                            SpO2: <b className="text-slate-900">{note.vitals_at_visit.spo2}%</b>
                          </span>
                        )}
                        {note.vitals_at_visit.temperature && (
                          <span>
                            Temp: <b className="text-slate-900">{note.vitals_at_visit.temperature}°F</b>
                          </span>
                        )}
                      </div>
                    </div>
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
