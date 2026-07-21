import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, ShieldAlert, BadgeCheck, Stethoscope, Landmark, Edit, X, Calendar, Clock, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { Card, Tag, SectionTitle, Empty } from "../../components/ui";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SPECIALTY_DEPARTMENTS = [
  "General Medicine",
  "Cardiology",
  "Pulmonology",
  "Dermatology",
  "Orthopaedics",
  "Gastroenterology",
  "Paediatrics",
  "Obstetrics & Gynaecology",
  "Ophthalmology",
  "ENT",
  "Dentistry",
  "Psychiatry",
  "Endocrinology",
];

export default function AdminPortal() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<"DOCTOR" | "NURSE">("DOCTOR");
  const [specialty, setSpecialty] = useState("General Medicine");
  const [experience, setExperience] = useState("");
  const [room, setRoom] = useState("");
  const [floor, setFloor] = useState("");
  const [fee, setFee] = useState("500");
  const [pin, setPin] = useState("");
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);
  
  // Roster States
  const [schedulingDoctor, setSchedulingDoctor] = useState<any | null>(null);
  const [scheduleDays, setScheduleDays] = useState<Record<number, { active: boolean; start: string; end: string; duration: string }>>({});
  
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [removingDoctorId, setRemovingDoctorId] = useState<string | null>(null);

  const { data: doctors, isLoading } = useQuery({
    queryKey: ["admin-doctors"],
    queryFn: api.adminDoctors,
  });

  const normalizedSearch = directorySearch.trim().toLowerCase();
  const filteredDoctors = doctors?.filter((doctor: any) =>
    [doctor.name, doctor.specialty, doctor.department, doctor.role, doctor.room, doctor.floor]
      .some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch))
  );

  const handleRemoveDoctor = async (doctor: any) => {
    if (!window.confirm(`Remove ${doctor.name} from the Clinical Directory? Their historical clinical records will be preserved.`)) return;

    setRemovingDoctorId(doctor.doctor_id);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      await api.removeDoctor(doctor.doctor_id);
      if (editingDoctorId === doctor.doctor_id) setEditingDoctorId(null);
      if (schedulingDoctor?.doctor_id === doctor.doctor_id) setSchedulingDoctor(null);
      setSuccessMsg(`${doctor.name} was removed from the Clinical Directory.`);
      await qc.invalidateQueries({ queryKey: ["admin-doctors"] });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to remove practitioner.");
    } finally {
      setRemovingDoctorId(null);
    }
  };

  const handleStartEdit = (d: any) => {
    setEditingDoctorId(d.doctor_id);
    setName(d.name);
    setRole(d.role || "DOCTOR");
    setSpecialty(d.specialty);
    setExperience(String(d.experience_years));
    setRoom(d.room);
    setFloor(d.floor);
    setFee(String(d.opd_fee));
    setPin(d.access_pin);
    setSchedulingDoctor(null); // Close scheduling view if open
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleCancelEdit = () => {
    setEditingDoctorId(null);
    setName("");
    setRole("DOCTOR");
    setExperience("");
    setRoom("");
    setFloor("");
    setFee("500");
    setPin("");
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleOpenRoster = async (d: any) => {
    setSchedulingDoctor(d);
    setEditingDoctorId(null); // Close edit form view if open
    setSuccessMsg("");
    setErrorMsg("");
    
    // Initialize default structure
    const initial: Record<number, { active: boolean; start: string; end: string; duration: string }> = {};
    for (let i = 0; i < 7; i++) {
      initial[i] = {
        active: i < 5, // Mon-Fri active by default
        start: "09:00",
        end: "13:00",
        duration: "15"
      };
    }

    try {
      const existing = await api.listDoctorSchedule(d.doctor_id);
      if (existing && existing.length > 0) {
        // Reset all to inactive first
        for (let i = 0; i < 7; i++) {
          initial[i].active = false;
        }
        // Populate existing ones
        existing.forEach((item: any) => {
          initial[item.day_of_week] = {
            active: true,
            start: item.start_time,
            end: item.end_time,
            duration: String(item.slot_duration_minutes)
          };
        });
      }
      setScheduleDays(initial);
    } catch (err: any) {
      console.error("Failed to load schedules", err);
    }
  };

  const handleDayToggle = (dayIdx: number) => {
    setScheduleDays((prev) => ({
      ...prev,
      [dayIdx]: { ...prev[dayIdx], active: !prev[dayIdx].active }
    }));
  };

  const handleTimeChange = (dayIdx: number, field: "start" | "end" | "duration", val: string) => {
    setScheduleDays((prev) => ({
      ...prev,
      [dayIdx]: { ...prev[dayIdx], [field]: val }
    }));
  };

  const handleSaveRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingDoctor) return;

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payload = Object.entries(scheduleDays)
      .filter(([_, day]) => day.active)
      .map(([idx, day]) => ({
        day_of_week: parseInt(idx, 10),
        start_time: day.start,
        end_time: day.end,
        slot_duration_minutes: parseInt(day.duration, 10),
      }));

    try {
      await api.updateDoctorSchedule(schedulingDoctor.doctor_id, payload);
      setSuccessMsg(`Successfully updated schedule for ${schedulingDoctor.name}!`);
      setSchedulingDoctor(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update doctor schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !experience || !room || !floor || !pin) {
      setErrorMsg("Please fill out all required fields.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payloadDept = role === "NURSE" ? "Triage" : specialty;
    const payloadSpec = role === "NURSE" ? "Triage Nursing" : specialty;
    const payloadFee = role === "NURSE" ? 0.0 : parseFloat(fee || "0");

    try {
      if (editingDoctorId) {
        await api.updateDoctor(editingDoctorId, {
          name,
          role,
          department: payloadDept,
          specialty: payloadSpec,
          experience_years: parseInt(experience, 10),
          room,
          floor,
          access_pin: pin,
          opd_fee: payloadFee,
        });
        setSuccessMsg(`Successfully updated ${name}!`);
      } else {
        await api.registerDoctor({
          name,
          role,
          department: payloadDept,
          specialty: payloadSpec,
          experience_years: parseInt(experience, 10),
          room,
          floor,
          access_pin: pin,
          opd_fee: payloadFee,
        });
        setSuccessMsg(`Successfully registered ${name}!`);
      }

      // Reset form
      setName("");
      setExperience("");
      setRoom("");
      setFloor("");
      setFee("500");
      setPin("");
      setEditingDoctorId(null);
      qc.invalidateQueries({ queryKey: ["admin-doctors"] });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save doctor details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="grad-text text-3xl font-extrabold tracking-tight">⚙ Hospital Administration</h1>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            Configure clinical staff directory, room rosters, consultation pricing, and security codes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cyan)]/20 bg-[var(--cyan)]/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)]">
            <Landmark size={12} /> Master Admin Session
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[clamp(340px,28vw,480px)_minmax(0,1fr)] 2xl:gap-7">
        
        <div className="space-y-4">
          {/* Onboard / Edit Doctor */}
          {!schedulingDoctor && (
            <>
              <SectionTitle>{editingDoctorId ? "Modify Practitioner" : "Onboard Practitioner"}</SectionTitle>
              <Card className="space-y-4 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(139,92,246,0.06), transparent)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {editingDoctorId ? <Edit className="text-amber-400" size={16} /> : <Plus className="text-violet-400" size={16} />}
                    <span className="font-extrabold text-[12px] text-violet-300 uppercase tracking-widest">
                      {editingDoctorId ? "Edit Form" : "Registration Form"}
                    </span>
                  </div>
                  {editingDoctorId && (
                    <button type="button" onClick={handleCancelEdit} className="text-[10px] font-bold text-red-400 hover:text-red-300 flex items-center gap-0.5">
                      <X size={10} /> Cancel Edit
                    </button>
                  )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="block font-bold text-slate-300">Staff Role *</label>
                    <select
                      className="input text-xs select"
                      value={role}
                      onChange={(e) => setRole(e.target.value as "DOCTOR" | "NURSE")}
                    >
                      <option value="DOCTOR">Doctor</option>
                      <option value="NURSE">Nurse</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block font-bold text-slate-300">
                      {role === "NURSE" ? "Nurse Full Name *" : "Doctor Full Name *"}
                    </label>
                    <input
                      type="text"
                      placeholder={role === "NURSE" ? "e.g. Priya Sharma" : "e.g. Dr. Ananya Mehta"}
                      className="input text-xs"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  {role === "DOCTOR" ? (
                    <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                      <div className="space-y-1">
                        <label className="block font-bold text-slate-300">Specialty Department</label>
                        <select
                          className="input text-xs select"
                          value={specialty}
                          onChange={(e) => setSpecialty(e.target.value)}
                        >
                          {SPECIALTY_DEPARTMENTS.map((department) => (
                            <option key={department} value={department}>{department}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="block font-bold text-slate-300">Experience (Years) *</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 10"
                          className="input text-xs"
                          value={experience}
                          onChange={(e) => setExperience(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 animate-in fade-in duration-200">
                      <div className="space-y-1">
                        <label className="block font-bold text-[var(--dim)]">Role Specialty</label>
                        <input
                          type="text"
                          className="input text-xs cursor-not-allowed opacity-60"
                          value="Triage Nursing (Triage)"
                          disabled
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block font-bold text-slate-300">Experience (Years) *</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 6"
                          className="input text-xs"
                          value={experience}
                          onChange={(e) => setExperience(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block font-bold text-slate-300">Room Assignment *</label>
                      <input
                        type="text"
                        placeholder="e.g. Room 104"
                        className="input text-xs"
                        value={room}
                        onChange={(e) => setRoom(e.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block font-bold text-slate-300">Floor Number *</label>
                      <input
                        type="text"
                        placeholder="e.g. Floor 2"
                        className="input text-xs"
                        value={floor}
                        onChange={(e) => setFloor(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {role === "DOCTOR" ? (
                      <div className="space-y-1">
                        <label className="block font-bold text-slate-300">OPD Consultation Fee (₹)</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="500"
                          className="input text-xs"
                          value={fee}
                          onChange={(e) => setFee(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="block font-bold text-[var(--dim)]">OPD Consultation Fee</label>
                        <input
                          type="text"
                          className="input text-xs cursor-not-allowed opacity-60"
                          value="N/A (Free)"
                          disabled
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="block font-bold text-slate-300">Security Login PIN *</label>
                      <input
                        type="text"
                        pattern="[0-9A-Za-z]{4,8}"
                        placeholder="4-8 characters"
                        className="input text-xs"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Feedbacks */}
                  {errorMsg && (
                    <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-1.5">
                      <ShieldAlert size={14} className="shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {successMsg && (
                    <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex items-center gap-1.5">
                      <BadgeCheck size={14} className="shrink-0" />
                      <span>{successMsg}</span>
                    </div>
                  )}

                  <div className="flex gap-2.5 mt-2">
                    {editingDoctorId && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="btn ghost font-bold py-2 flex-1 text-center"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn font-bold py-2 flex-[2] text-center"
                      style={{ background: editingDoctorId ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "white", border: "none" }}
                    >
                      {submitting ? "Saving..." : editingDoctorId ? "Save Changes" : "Register Doctor"}
                    </button>
                  </div>
                </form>
              </Card>
            </>
          )}

          {/* Roster & Slots Scheduler */}
          {schedulingDoctor && (
            <>
              <SectionTitle>Roster Settings</SectionTitle>
              <Card className="space-y-4 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.06), transparent)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="text-[var(--cyan)]" size={16} />
                    <span className="font-extrabold text-[12px] text-[var(--cyan)] uppercase tracking-wider"> Roster &amp; Slots</span>
                  </div>
                  <button type="button" onClick={() => setSchedulingDoctor(null)} className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-0.5">
                    <X size={10} /> Close
                  </button>
                </div>

                <div className="pb-1.5 border-b border-white/5">
                  <h4 className="font-extrabold text-[14px] text-slate-100">{schedulingDoctor.name}</h4>
                  <p className="text-[11px] text-[var(--muted)]">{schedulingDoctor.specialty} · {schedulingDoctor.room}</p>
                </div>

                <form onSubmit={handleSaveRoster} className="space-y-4 text-xs">
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {DAYS_OF_WEEK.map((dayName, idx) => {
                      const dayState = scheduleDays[idx] || { active: false, start: "09:00", end: "13:00", duration: "15" };
                      return (
                        <div key={idx} className={`p-2.5 rounded-xl border transition ${dayState.active ? "border-white/10 bg-white/[0.01]" : "border-transparent opacity-50"}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="flex items-center gap-2 font-bold text-slate-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dayState.active}
                                onChange={() => handleDayToggle(idx)}
                                className="w-3.5 h-3.5 accent-[var(--cyan)] rounded"
                              />
                              {dayName}
                            </label>
                          </div>

                          {dayState.active && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_80px]">
                              <div>
                                <span className="block text-[10px] text-[var(--dim)] mb-0.5">Start</span>
                                <input
                                  type="time"
                                  value={dayState.start}
                                  onChange={(e) => handleTimeChange(idx, "start", e.target.value)}
                                  className="input !py-0.5 !px-1.5 text-[11px] font-bold"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--dim)] mb-0.5">End</span>
                                <input
                                  type="time"
                                  value={dayState.end}
                                  onChange={(e) => handleTimeChange(idx, "end", e.target.value)}
                                  className="input !py-0.5 !px-1.5 text-[11px] font-bold"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-[var(--dim)] mb-0.5">Slot</span>
                                <select
                                  value={dayState.duration}
                                  onChange={(e) => handleTimeChange(idx, "duration", e.target.value)}
                                  className="input !py-0.5 !px-1 text-[11px]"
                                >
                                  <option value="10">10m</option>
                                  <option value="15">15m</option>
                                  <option value="20">20m</option>
                                  <option value="30">30m</option>
                                  <option value="45">45m</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-1.5">
                      <ShieldAlert size={14} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSchedulingDoctor(null)}
                      className="btn ghost font-bold py-2 flex-1 text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn font-bold py-2 flex-[2] text-center"
                      style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
                    >
                      {submitting ? "Saving..." : "Save Roster"}
                    </button>
                  </div>
                </form>
              </Card>
            </>
          )}
        </div>

        {/* Doctor Directory List */}
        <div className="space-y-4">
          <SectionTitle>Clinical Directory</SectionTitle>
          <Card className="min-h-[400px]">
            <div className="mb-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)]" />
                <input
                  type="search"
                  className="input w-full !pl-9 text-xs"
                  placeholder="Search by name, specialty, role, room or floor"
                  value={directorySearch}
                  onChange={(event) => setDirectorySearch(event.target.value)}
                />
              </div>
              <button type="button" className="btn ghost inline-flex items-center gap-1.5 text-xs" onClick={() => setDirectorySearch(directorySearch.trim())}>
                <Search size={13} /> Search
              </button>
            </div>
            {isLoading ? (
              <div className="text-center py-12 text-xs text-[var(--dim)]">Loading doctor records...</div>
            ) : !doctors?.length ? (
              <Empty>No doctors registered in the system yet.</Empty>
            ) : !filteredDoctors?.length ? (
              <Empty>No practitioners match “{directorySearch}”.</Empty>
            ) : (
              <div className="overflow-x-auto text-[12px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-[var(--dim)] font-bold">
                      <th className="pb-3">Practitioner</th>
                      <th className="pb-3">Specialty</th>
                      <th className="pb-3">Room / Location</th>
                      <th className="pb-3 text-right">OPD Fee</th>
                      <th className="pb-3 text-center">Login PIN</th>
                      <th className="pb-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDoctors.map((d: any) => (
                      <tr key={d.doctor_id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.01] transition-colors ${editingDoctorId === d.doctor_id || schedulingDoctor?.doctor_id === d.doctor_id ? "bg-white/[0.02]" : ""}`}>
                        <td className="py-3.5 flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[11px] ${d.role === "NURSE" ? "bg-cyan-500/10 border border-cyan-500/25 text-cyan-400" : "bg-violet-500/10 border border-violet-500/25 text-violet-400"}`}>
                            {d.name.split(" ").slice(-1)[0][0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-200 flex items-center gap-1.5">
                              {d.name}
                              {d.role === "NURSE" && <Tag tone="blue">Nurse</Tag>}
                            </div>
                            <div className="text-[10px] text-[var(--muted)]">{d.experience_years} years exp</div>
                          </div>
                        </td>
                        <td className="py-3.5 text-slate-300">
                          <span className="flex items-center gap-1"><Stethoscope size={13} className="text-emerald-400" /> {d.specialty}</span>
                        </td>
                        <td className="py-3.5 text-slate-300">
                          <div>{d.room}</div>
                          <div className="text-[10px] text-[var(--muted)]">{d.floor}</div>
                        </td>
                        <td className="py-3.5 text-right font-mono font-bold text-slate-200">
                          {d.role === "NURSE" ? "N/A" : `₹${d.opd_fee}`}
                        </td>
                        <td className="py-3.5 text-center font-mono font-bold text-violet-400">
                          {d.access_pin}
                        </td>
                        <td className="py-3.5 text-center">
                          <div className="flex gap-2 justify-center">
                            <button
                              onClick={() => handleStartEdit(d)}
                              className="btn ghost !py-1 !px-2 text-[10.5px] font-bold inline-flex items-center gap-0.5 text-slate-300 hover:text-white"
                            >
                              <Edit size={10.5} /> Profile
                            </button>
                            {d.role !== "NURSE" && (
                              <button
                                onClick={() => handleOpenRoster(d)}
                                className="btn ghost !py-1 !px-2 text-[10.5px] font-bold inline-flex items-center gap-0.5 text-[var(--cyan)] hover:text-cyan-300"
                              >
                                <Calendar size={10.5} /> Roster
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveDoctor(d)}
                              disabled={removingDoctorId === d.doctor_id}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-500/25 bg-rose-500/10 text-rose-400 transition-colors hover:border-rose-400/40 hover:bg-rose-500/20 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Remove ${d.name}`}
                              title={removingDoctorId === d.doctor_id ? "Removing practitioner" : `Remove ${d.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
}
