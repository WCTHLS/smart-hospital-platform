import React, { useState, useMemo } from "react";
import {
  Users,
  UserCheck,
  Stethoscope,
  Building2,
  FlaskConical,
  Pill,
  Calendar,
  Clock,
  MapPin,
  Search,
  Filter,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Phone,
  Mail,
  ShieldCheck,
  Award,
  CalendarPlus,
  ArrowUpRight
} from "lucide-react";

export interface CareStaffMember {
  staff_id: string;
  name: string;
  role: string;
  role_title?: string;
  department?: string;
  specialty?: string;
  room?: string;
  floor?: string;
  badge?: string;
  action_performed?: string;
  interaction_stage?: string;
  status?: string;
  last_date?: string;
  interaction_count?: number;
  last_appointment_reason?: string;
  contact_email?: string;
  contact_ext?: string;
}

export interface AppointmentCareTeamGroup {
  appointment_id: string;
  encounter_id?: string | null;
  date: string;
  department: string;
  doctor_name: string;
  reason?: string;
  status?: string;
  staff_count?: number;
  staff_members: CareStaffMember[];
}

interface CareTeamSectionProps {
  careTeam?: CareStaffMember[];
  careTeamByAppointment?: AppointmentCareTeamGroup[];
  onBookWithDoctor?: (doctorName: string) => void;
}

export default function CareTeamSection({
  careTeam = [],
  careTeamByAppointment = [],
  onBookWithDoctor,
}: CareTeamSectionProps) {
  const [viewMode, setViewMode] = useState<"APPOINTMENTS" | "DIRECTORY">("APPOINTMENTS");
  const [selectedRole, setSelectedRole] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Role badges & styling configuration
  const getRoleConfig = (role?: string) => {
    const r = (role || "").toUpperCase();
    if (r.includes("DOCTOR") || r.includes("PHYSICIAN")) {
      return {
        label: "Attending Doctor",
        badgeBg: "bg-blue-50 text-[#0078d4] border-blue-200",
        avatarBg: "bg-gradient-to-br from-blue-500 to-[#0078d4] text-white",
        avatarRing: "ring-blue-100",
        icon: Stethoscope,
        category: "DOCTOR",
      };
    }
    if (r.includes("NURSE") || r.includes("TRIAGE")) {
      return {
        label: "Triage Nurse",
        badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        avatarBg: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
        avatarRing: "ring-emerald-100",
        icon: UserCheck,
        category: "NURSE",
      };
    }
    if (r.includes("RECEPTION") || r.includes("FRONT_DESK") || r.includes("DESK")) {
      return {
        label: "Front Desk / Reception",
        badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
        avatarBg: "bg-gradient-to-br from-amber-500 to-orange-500 text-white",
        avatarRing: "ring-amber-100",
        icon: Building2,
        category: "RECEPTION",
      };
    }
    if (r.includes("LAB") || r.includes("PATHOLOGY") || r.includes("DIAGNOSTIC")) {
      return {
        label: "Diagnostic Technologist",
        badgeBg: "bg-purple-50 text-purple-700 border-purple-200",
        avatarBg: "bg-gradient-to-br from-purple-500 to-indigo-600 text-white",
        avatarRing: "ring-purple-100",
        icon: FlaskConical,
        category: "LAB_TECH",
      };
    }
    if (r.includes("PHARMACIST") || r.includes("PHARMACY")) {
      return {
        label: "Hospital Pharmacist",
        badgeBg: "bg-teal-50 text-teal-700 border-teal-200",
        avatarBg: "bg-gradient-to-br from-teal-500 to-emerald-600 text-white",
        avatarRing: "ring-teal-100",
        icon: Pill,
        category: "PHARMACIST",
      };
    }
    return {
      label: "Healthcare Staff",
      badgeBg: "bg-slate-50 text-slate-700 border-slate-200",
      avatarBg: "bg-gradient-to-br from-slate-500 to-slate-700 text-white",
      avatarRing: "ring-slate-100",
      icon: Users,
      category: "STAFF",
    };
  };

  // Summary counts
  const doctorCount = useMemo(() => careTeam.filter(s => getRoleConfig(s.role).category === "DOCTOR").length, [careTeam]);
  const nurseCount = useMemo(() => careTeam.filter(s => getRoleConfig(s.role).category === "NURSE").length, [careTeam]);
  const supportCount = useMemo(() => careTeam.filter(s => ["RECEPTION", "LAB_TECH", "PHARMACIST"].includes(getRoleConfig(s.role).category)).length, [careTeam]);

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return careTeamByAppointment.map((group) => {
      let filteredStaff = group.staff_members || [];
      if (selectedRole !== "ALL") {
        filteredStaff = filteredStaff.filter((s) => getRoleConfig(s.role).category === selectedRole);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filteredStaff = filteredStaff.filter((s) =>
          s.name.toLowerCase().includes(q) ||
          (s.department || "").toLowerCase().includes(q) ||
          (s.specialty || "").toLowerCase().includes(q) ||
          (s.action_performed || "").toLowerCase().includes(q) ||
          (s.room || "").toLowerCase().includes(q)
        );
      }
      return {
        ...group,
        staff_members: filteredStaff,
      };
    }).filter((group) => group.staff_members.length > 0 || !searchQuery.trim());
  }, [careTeamByAppointment, selectedRole, searchQuery]);

  // Filtered Directory Staff
  const filteredDirectoryStaff = useMemo(() => {
    return careTeam.filter((s) => {
      if (selectedRole !== "ALL" && getRoleConfig(s.role).category !== selectedRole) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.department || "").toLowerCase().includes(q) ||
          (s.specialty || "").toLowerCase().includes(q) ||
          (s.role_title || "").toLowerCase().includes(q) ||
          (s.room || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [careTeam, selectedRole, searchQuery]);

  const initials = (name: string) => {
    const clean = name.replace(/^Dr\.\s*/i, "").replace(/^Nurse\s*/i, "").trim();
    const parts = clean.split(" ");
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : clean.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. TOP HEADER & SUMMARY METRICS BANNER */}
      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-r from-blue-50/80 via-indigo-50/30 to-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#0078d4] text-white shadow-2xs">
                <Users size={16} />
              </span>
              <h2 className="text-[18px] font-black text-slate-900 tracking-tight">
                My Healthcare &amp; Clinical Care Team
              </h2>
              <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                {careTeam.length} Professionals Involved
              </span>
            </div>
            <p className="text-[12.5px] text-slate-600 max-w-2xl leading-relaxed">
              All healthcare practitioners, triage nurses, front desk coordinators, and diagnostic specialists who have interacted with you during your hospital appointments.
            </p>
          </div>

          {/* Metric Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-white/90 border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs text-center min-w-[85px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Doctors</span>
              <span className="text-[16px] font-black text-blue-700">{doctorCount || 1}</span>
            </div>
            <div className="bg-white/90 border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs text-center min-w-[85px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Triage Nurses</span>
              <span className="text-[16px] font-black text-emerald-700">{nurseCount || 1}</span>
            </div>
            <div className="bg-white/90 border border-slate-200 rounded-xl px-3.5 py-2 shadow-2xs text-center min-w-[85px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Support Staff</span>
              <span className="text-[16px] font-black text-purple-700">{supportCount || 3}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. FILTER & VIEW MODE CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("APPOINTMENTS")}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition ${viewMode === "APPOINTMENTS"
                ? "bg-white text-[#0078d4] shadow-xs"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Grouped by Appointments
          </button>
          <button
            type="button"
            onClick={() => setViewMode("DIRECTORY")}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-bold transition ${viewMode === "DIRECTORY"
                ? "bg-white text-[#0078d4] shadow-xs"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Care Team Directory ({careTeam.length})
          </button>
        </div>

        {/* Search Bar & Role Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end flex-wrap sm:flex-nowrap">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff, role, action, or room..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-[12px] text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-[#0078d4] transition"
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-700 outline-none focus:border-[#0078d4] shrink-0"
          >
            <option value="ALL">All Roles</option>
            <option value="DOCTOR">👨‍⚕️ Doctors</option>
            <option value="NURSE">👩‍⚕️ Triage Nurses</option>
            <option value="RECEPTION">🏛️ Front Desk</option>
            <option value="LAB_TECH">🧪 Laboratory</option>
            <option value="PHARMACIST">💊 Pharmacy</option>
          </select>
        </div>
      </div>

      {/* 3. GROUPED BY APPOINTMENTS VIEW */}
      {viewMode === "APPOINTMENTS" && (
        <div className="space-y-4">
          {filteredAppointments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
              <Users size={32} className="mx-auto text-slate-300" />
              <h4 className="font-extrabold text-[14px] text-slate-700">No appointment care staff found</h4>
              <p className="text-[12px] text-slate-400">Try changing your search query or role filter.</p>
            </div>
          ) : (
            filteredAppointments.map((group, groupIdx) => {
              const statusPillText = (group.status || "COMPLETED").toUpperCase().replace(/-/g, "_");
              const isStatusCompleted = statusPillText === "COMPLETED" || statusPillText === "DISCHARGED" || statusPillText === "CLOSED";
              const isStatusTriaged = statusPillText === "TRIAGED" || statusPillText === "TRIAGE_COMPLETED";
              const isStatusInConsult = statusPillText === "IN_CONSULT" || statusPillText === "IN_CONSULTATION" || statusPillText === "CONSULTING";

              return (
                <div
                  key={group.appointment_id || groupIdx}
                  className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden transition hover:border-slate-300"
                >
                  {/* Appointment Header Banner */}
                  <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 font-black text-[14.5px] text-slate-900">
                          <Calendar size={15} className="text-[#0078d4]" />
                          {group.date}
                        </span>
                        <span className="rounded-lg bg-blue-50 text-[#0078d4] border border-blue-200/70 px-2.5 py-0.5 text-[11px] font-bold">
                          {group.department}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold border ${isStatusCompleted
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : isStatusTriaged
                              ? "bg-purple-100 text-purple-800 border-purple-200"
                              : isStatusInConsult
                                ? "bg-blue-100 text-[#0078d4] border-blue-200"
                                : "bg-teal-100 text-teal-800 border-teal-200"
                          }`}>
                          ● {isStatusCompleted ? "Completed" : isStatusTriaged ? "Triaged" : isStatusInConsult ? "In Consultation" : "Checked In"}
                        </span>
                      </div>

                      {group.reason && (
                        <div className="text-[12px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800">Health Concern:</span>
                          <span>{group.reason}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-bold text-slate-800">Primary Doctor:</span>
                          <span className="text-[#0078d4] font-semibold">{group.doctor_name}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-auto">
                      <span className="rounded-full bg-white border border-slate-200 px-3 py-1 text-[11px] font-extrabold text-slate-700 shadow-2xs flex items-center gap-1.5">
                        <Users size={13} className="text-[#0078d4]" />
                        {group.staff_members.length} Staff Interaction{group.staff_members.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  {/* Staff Members Workflow Grid for this Appointment */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 bg-white">
                    {group.staff_members.map((staff, sIdx) => {
                      const cfg = getRoleConfig(staff.role);
                      const Icon = cfg.icon;

                      return (
                        <div
                          key={staff.staff_id || sIdx}
                          className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 space-y-3 flex flex-col justify-between hover:bg-white hover:shadow-sm transition"
                        >
                          {/* Staff Header */}
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`grid h-10 w-10 place-items-center rounded-xl font-bold text-[13px] shadow-xs shrink-0 ring-2 ${cfg.avatarBg} ${cfg.avatarRing}`}>
                                  {initials(staff.name)}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-extrabold text-[13.5px] text-slate-900 truncate">
                                    {staff.name}
                                  </h4>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${cfg.badgeBg} mt-0.5`}>
                                    <Icon size={11} /> {staff.role_title || cfg.label}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Stage & Action Performed */}
                            <div className="rounded-lg bg-white border border-slate-200/80 p-2.5 space-y-1">
                              <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block">
                                {staff.interaction_stage || "Clinical Action"}
                              </span>
                              <p className="text-[11.5px] font-medium text-slate-700 leading-snug">
                                {staff.action_performed || "Assisted patient during consultation."}
                              </p>
                            </div>
                          </div>

                          {/* Location & Meta Footer */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                            <span className="flex items-center gap-1 truncate max-w-[170px]" title={`${staff.room || "Room 101"}, ${staff.floor || "Ground Floor"}`}>
                              <MapPin size={12} className="text-slate-400 shrink-0" />
                              {staff.room || "Room 101"} ({staff.floor || "Ground Floor"})
                            </span>

                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle2 size={11} /> {staff.status || "Completed"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. ALL CARE TEAM DIRECTORY VIEW */}
      {viewMode === "DIRECTORY" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDirectoryStaff.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
              <Users size={32} className="mx-auto text-slate-300" />
              <h4 className="font-extrabold text-[14px] text-slate-700">No staff members found</h4>
              <p className="text-[12px] text-slate-400">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            filteredDirectoryStaff.map((staff, sIdx) => {
              const cfg = getRoleConfig(staff.role);
              const Icon = cfg.icon;
              const isDoctor = cfg.category === "DOCTOR";

              return (
                <div
                  key={staff.staff_id || sIdx}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-3.5 flex flex-col justify-between shadow-2xs hover:shadow-sm hover:border-slate-300 transition"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`grid h-12 w-12 place-items-center rounded-2xl font-black text-[14.5px] shadow-xs shrink-0 ring-3 ${cfg.avatarBg} ${cfg.avatarRing}`}>
                          {initials(staff.name)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-extrabold text-[14px] text-slate-900 truncate">
                            {staff.name}
                          </h4>
                          <div className="text-[11.5px] font-semibold text-slate-600 truncate">
                            {staff.specialty || staff.department || "Clinical Staff"}
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${cfg.badgeBg} mt-1`}>
                            <Icon size={11} /> {staff.badge || cfg.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Department & Location */}
                    <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 space-y-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 font-bold uppercase text-[9.5px]">Department</span>
                        <span className="font-bold text-slate-800">{staff.department || "General OPD"}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400 font-bold uppercase text-[9.5px]">Room / Floor</span>
                        <span className="font-bold text-slate-800">{staff.room || "Room 101"} · {staff.floor || "1st Floor"}</span>
                      </div>
                      {staff.last_date && (
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="text-slate-400 font-bold uppercase text-[9.5px]">Last Visit</span>
                          <span className="font-semibold text-slate-700">{staff.last_date}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500">
                      {staff.interaction_count || 1} Interaction{(staff.interaction_count || 1) === 1 ? "" : "s"}
                    </span>

                    {isDoctor && onBookWithDoctor && (
                      <button
                        type="button"
                        onClick={() => onBookWithDoctor(staff.name)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[#0078d4] hover:underline"
                      >
                        Book Appointment <ChevronRight size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
