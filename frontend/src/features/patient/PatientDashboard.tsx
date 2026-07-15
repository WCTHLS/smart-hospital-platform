import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { 
  LogOut, Clipboard, Camera, UserRound, ArrowLeft, CheckCircle2, 
  AlertCircle, Download, Clock, MapPin, Ticket 
} from "lucide-react";
import { api } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { useRealtime } from "../../lib/realtime";
import { getPortalPatient, savePortalPatient, clearPortalPatient } from "../../lib/patientAuth";
import { Card, Tag, Empty } from "../../components/ui";

import StageTracker from "./components/StageTracker";
import ConsultationSummary from "./components/ConsultationSummary";
import VitalsAndLabs from "./components/VitalsAndLabs";
import PrescriptionSlip from "./components/PrescriptionSlip";
import LabOrdersAlert from "./components/LabOrdersAlert";

const STATUS_STAGE: Record<string, number> = {
  CHECKED_IN: 0,
  TRIAGED: 1,
  EMERGENCY: 1,
  IN_CONSULT: 2,
  DISCHARGED: 6,
};

const TOPIC_STAGE: Record<string, number> = {
  "patient.checkedin": 0,
  "triage.completed": 1,
  "token.issued": 1,
  "note.approved": 2,
  "laborder.created": 3,
  "labresult.published": 4,
  "result.abnormal": 4,
  "prescription.approved": 5,
  "invoice.generated": 5,
  "payment.completed": 5,
  "visit.discharged": 6,
};

export default function PatientDashboard() {
  const nav = useNavigate();
  const journey = useJourney();
  const events = useRealtime((s) => s.events);

  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [showMobileVisitList, setShowMobileVisitList] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInError, setCheckInError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const portalSession = getPortalPatient()!;
  const portalPatientId = portalSession.patient_id;
  const portalPatientName = portalSession.name;

  function timeLabel(value: string) {
    if (!value || value.length < 16) return value || "";
    try {
      const timeStr = value.slice(11, 16);
      if (!timeStr.includes(":")) return timeStr;
      const [hours, minutes] = timeStr.split(":").map(Number);
      if (isNaN(hours) || isNaN(minutes)) return timeStr;
      return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
    } catch {
      return value;
    }
  }

  async function handlePhotoUpload(file?: File) {
    if (!file) return;
    setPhotoError("");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Profile photo must be 2 MB or smaller.");
      return;
    }

    setPhotoUploading(true);
    try {
      const profilePhoto = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const result = await api.updatePatientProfilePhoto(portalPatientId, profilePhoto);
      savePortalPatient({ ...portalSession, profile_photo: result.patient.profile_photo });
      await refetchP360();
    } catch {
      setPhotoError("Unable to upload the profile photo. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  // Query patient records
  const { data: p360, refetch: refetchP360 } = useQuery({
    queryKey: ["portal-p360", portalPatientId],
    queryFn: () => api.patient360(portalPatientId!),
    enabled: !!portalPatientId,
  });

  const { data: appointmentData, refetch: refetchAppointments } = useQuery({
    queryKey: ["portal-upcoming-appointments", portalPatientId],
    queryFn: () => api.upcomingAppointments(portalPatientId),
    enabled: !!portalPatientId,
  });

  const { data: triageQueue } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: () => api.triageQueue(),
    refetchInterval: 5000,
  });

  const { data: triageStaffList } = useQuery({
    queryKey: ["triage-staff"],
    queryFn: () => api.triageStaff(),
  });

  const handleSignOut = () => {
    clearPortalPatient();
    journey.reset();
    nav("/patient/login?redirect=/patient", { replace: true });
  };

  const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const todayEncounters = p360?.encounters?.filter((encounter: any) => encounter.date === today) ?? [];
  const pastEncounters = p360?.encounters?.filter((encounter: any) => encounter.date !== today) ?? [];
  const appointments = appointmentData?.appointments ?? [];
  const latestDischargeEvent = events.find((event) =>
    event.topic === "visit.discharged" &&
    p360?.encounters?.some((encounter: any) => encounter.encounter_id === event.payload?.encounter_id)
  );

  useEffect(() => {
    if (latestDischargeEvent) {
      void refetchP360();
    }
  }, [latestDischargeEvent?.ts, refetchP360]);

  const activeEnc = p360?.encounters?.find((e: any) => e.status !== "DISCHARGED");
  
  const defaultAppId = !selectedEncounterId && !activeEnc && appointments.length > 0
    ? appointments[0].appointment_id
    : null;

  const showAppointmentId = selectedAppointmentId || (selectedEncounterId ? null : defaultAppId);
  const showEncounterId = selectedEncounterId || (showAppointmentId ? null : activeEnc?.encounter_id);

  const { data: encDetails, refetch: refetchEnc } = useQuery({
    queryKey: ["portal-encounter", showEncounterId],
    queryFn: () => api.encounter(showEncounterId!),
    enabled: !!showEncounterId,
    refetchInterval: 5000,
  });

  const { data: labDetails, refetch: refetchLab } = useQuery({
    queryKey: ["portal-lab", showEncounterId],
    queryFn: () => api.encounterLab(showEncounterId!),
    enabled: !!showEncounterId,
    refetchInterval: 5000,
  });

  const mine = events.filter((e) => e.payload?.encounter_id === showEncounterId);
  let stage = STATUS_STAGE[encDetails?.status ?? "CHECKED_IN"] ?? 0;
  if (encDetails?.note?.status === "APPROVED") stage = Math.max(stage, 2);
  if (encDetails?.labs?.length) stage = Math.max(stage, 3);
  if (encDetails?.labs?.some((order: any) => order.results?.length)) stage = Math.max(stage, 4);
  if (encDetails?.prescription?.status === "APPROVED") stage = Math.max(stage, 5);
  for (const e of mine) stage = Math.max(stage, TOPIC_STAGE[e.topic] ?? -1);

  const token = encDetails?.token;

  async function handleDirectCheckin(app: any) {
    if (!app) return;
    setCheckingIn(true);
    setCheckInError("");
    try {
      const result = await api.checkin({
        patient_id: portalPatientId,
        appointment_id: app.appointment_id,
        mobile: portalSession.mobile,
        channel: "PORTAL",
        reason: app.reason,
      });
      journey.set({
        patientId: result.patient.patient_id,
        patientName: result.patient.name,
        encounterId: result.encounter_id
      });
      await Promise.all([
        refetchP360(),
        refetchAppointments(),
      ]);
      setSelectedEncounterId(result.encounter_id);
      setSelectedAppointmentId(null);
    } catch (e: any) {
      setCheckInError(e?.message || "Check-in failed. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  function handleDownloadInvoice(item: any, isEncounter: boolean = false) {
    if (!item) return;
    const appointment = isEncounter ? item.appointment : item;
    const docName = appointment?.doctor?.name || item.triage?.recommended_doctor?.name || "Not assigned";
    const dept = appointment?.specialty || item.triage?.specialty || item.department || "Not recorded";
    const timeVal = appointment?.scheduled_start ? timeLabel(appointment.scheduled_start) : (item.arrival ? timeLabel(item.arrival) : "Not recorded");
    const itemId = isEncounter ? item.encounter_id : item.appointment_id;
    const invId = `INV-${isEncounter ? "ENC" : "APP"}-${itemId.slice(0, 8).toUpperCase()}`;
    const invoiceContent = `================================================\n           SMART HOSPITAL PLATFORM\n              INVOICE SUMMARY\n================================================\nInvoice Number: ${invId}\nDate:           ${new Date().toLocaleDateString()}\nPayment Status: PAID IN FULL\n------------------------------------------------\nPatient Name:   ${portalPatientName}\nPatient ID:     ${portalPatientId}\nDoctor Name:    ${docName}\nDepartment:     ${dept}\nTime:           ${timeVal}\n------------------------------------------------\nDescription               Qty          Amount\n------------------------------------------------\nOPD Consultation           1           ₹500.00\n------------------------------------------------\nTotal:                                 ₹500.00\nPaid Amount:                           ₹500.00\nBalance Due:                           ₹0.00\n------------------------------------------------\nPayment Method: Online (Paid at confirmation)\nThank you for visiting us!\n================================================`;

    const blob = new Blob([invoiceContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Invoice_${invId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const getPatientsAhead = () => {
    if (!triageQueue || !encDetails?.arrival) return 0;
    const currentArrival = new Date(encDetails.arrival).getTime();
    return triageQueue.filter((e: any) => 
      e.encounter_id !== showEncounterId && 
      new Date(e.arrival).getTime() < currentArrival
    ).length;
  };

  const hasSelection = !!(showEncounterId || showAppointmentId);
  const selectedApp = appointments.find((a: any) => a.appointment_id === showAppointmentId);
  const encounterAppointment = encDetails?.appointment || appointments.find((a: any) =>
    a.encounter_id === showEncounterId || a.appointment_id === encDetails?.appointment_id
  );

  return (
    <div className="patient-page grid gap-4 sm:gap-6 lg:grid-cols-[300px_1fr] animate-in fade-in duration-300">
      {/* Sidebar - Visits List */}
      <div className={`space-y-4 ${hasSelection && !showMobileVisitList ? "hidden lg:block" : "block"}`}>
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-white/5">
              {(p360?.patient?.profile_photo || portalSession.profile_photo)
                ? <img className="h-full w-full object-cover" src={p360?.patient?.profile_photo || portalSession.profile_photo} alt={`${portalPatientName} profile`} />
                : <UserRound size={30} className="text-[var(--dim)]" />}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Patient profile</div>
              <div className="truncate font-extrabold text-base text-slate-100">{portalPatientName}</div>
              <Tag tone="green">ABHA Verified</Tag>
            </div>
          </div>
          <div>
            <input
              id="patient-profile-photo"
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={photoUploading}
              onChange={(event) => {
                void handlePhotoUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <label htmlFor="patient-profile-photo" className="btn ghost w-full cursor-pointer text-xs !py-1.5">
              <Camera size={14} /> {photoUploading ? "Uploading..." : "Upload profile photo"}
            </label>
            {photoError && <div className="mt-2 text-xs text-rose-300">{photoError}</div>}
            <div className="mt-2 text-[10px] text-[var(--dim)]">JPEG, PNG or WebP · Maximum 2 MB</div>
          </div>
          <button
            onClick={handleSignOut}
            className="btn ghost w-full text-xs !py-1 px-3 flex items-center justify-center gap-1.5"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </Card>

        {/* Appointments and today's active encounters */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--dim)]">Appointments</h4>
            <button 
              className="btn ghost sm shrink-0 text-[10px] !py-0.5 !px-2 font-extrabold" 
              onClick={() => nav("/patient/appointments/book?redirect=/patient")}
            >
              Book appointment
            </button>
          </div>
          {!appointments.length && !todayEncounters.length && (
            <div className="holo text-xs text-[var(--muted)]">No current or upcoming appointments.</div>
          )}
          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {appointments.map((appointment: any) => {
              const isActive = appointment.appointment_id === showAppointmentId;
              return (
                <button
                  key={appointment.appointment_id}
                  onClick={() => {
                    setSelectedAppointmentId(appointment.appointment_id);
                    setSelectedEncounterId(null);
                    setShowMobileVisitList(false);
                  }}
                  className="w-full text-left p-2.5 rounded-xl border text-xs transition block hover:bg-white/5"
                  style={{
                    borderColor: isActive ? "var(--line2)" : "var(--glass-border)",
                    background: isActive ? "rgba(52,225,232,0.05)" : "rgba(255,255,255,0.01)"
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">
                      {appointment.scheduled_start?.slice(0, 10) === today ? "Today" : "Upcoming Visit"}
                    </span>
                    <Tag tone="amber">Booked</Tag>
                  </div>
                  <div className="truncate font-bold text-white">{appointment.doctor?.name ?? "Assigned doctor"}</div>
                  <div className="mt-1 text-[var(--muted)]">
                    {appointment.specialty} · {appointment.scheduled_start?.slice(0, 10) === today ? "Today" : new Date(appointment.scheduled_start).toLocaleDateString()} · {timeLabel(appointment.scheduled_start)}
                  </div>
                  <div className="mt-1 text-[var(--muted)]">Reason: {appointment.reason || "Not provided"}</div>
                </button>
              );
            })}
            {todayEncounters.map((e: any) => {
              const isActive = e.encounter_id === showEncounterId;
              return (
                <button
                  key={e.encounter_id}
                  onClick={() => {
                    setSelectedEncounterId(e.encounter_id);
                    setSelectedAppointmentId(null);
                    setShowMobileVisitList(false);
                  }}
                  className="w-full text-left p-2.5 rounded-xl border text-xs transition block hover:bg-white/5"
                  style={{
                    borderColor: isActive ? "var(--line2)" : "var(--glass-border)",
                    background: isActive ? "rgba(52,225,232,0.05)" : "rgba(255,255,255,0.01)"
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white">{e.date}</span>
                    <Tag tone={e.status === "DISCHARGED" ? "green" : "blue"}>{e.status}</Tag>
                  </div>
                  <div className="text-[var(--muted)]">{e.department} department</div>
                  <div className="mt-1 text-[var(--muted)]">Reason: {e.reason || "Not provided"}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Past Visits */}
        <Card className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--dim)]">Past visits</h4>
          {!pastEncounters.length && (
            <div className="holo text-xs text-[var(--muted)]">No past visits available.</div>
          )}
          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {pastEncounters.map((e: any) => {
              const isActive = e.encounter_id === showEncounterId;
              return (
                <button
                  key={e.encounter_id}
                  onClick={() => {
                    setSelectedEncounterId(e.encounter_id);
                    setSelectedAppointmentId(null);
                    setShowMobileVisitList(false);
                  }}
                  className="block w-full rounded-xl border p-2.5 text-left text-xs transition hover:bg-white/5"
                  style={{ 
                    borderColor: isActive ? "var(--line2)" : "var(--glass-border)", 
                    background: isActive ? "rgba(52,225,232,0.05)" : "rgba(255,255,255,0.01)" 
                  }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-bold text-white">{e.date}</span>
                    <Tag tone="green">{e.status}</Tag>
                  </div>
                  <div className="text-[var(--muted)]">{e.department} department</div>
                  <div className="mt-1 text-[var(--muted)]">Reason: {e.reason || "Not provided"}</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Main Panel */}
      <div className={`space-y-4 ${hasSelection && !showMobileVisitList ? "block" : "hidden lg:block"}`}>
        {hasSelection && (
          <button 
            onClick={() => setShowMobileVisitList(true)}
            className="btn ghost lg:hidden mb-2 text-xs flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Back to Visits List
          </button>
        )}

        {showEncounterId && encDetails && encDetails.status !== "DISCHARGED" && (
          <StageTracker stage={stage} token={token} />
        )}

        {/* State 1: Booked appointment selected but check-in is not done */}
        {showAppointmentId && selectedApp && (
          <Card className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Appointment Overview</span>
                <h3 className="text-lg font-extrabold text-white">
                  {selectedApp.scheduled_start?.slice(0, 10) === today ? "Today" : "Upcoming Visit"}
                </h3>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleDownloadInvoice(selectedApp, false)}
                  className="btn ghost sm text-xs flex items-center gap-1.5"
                >
                  <Download size={14} /> Invoice
                </button>
                <Tag tone="amber">Booked</Tag>
              </div>
            </div>

            {checkInError && (
              <div className="alertbox p-3 text-xs bg-rose-500/10 border-rose-500/20 text-rose-300 rounded-xl border">
                {checkInError}
              </div>
            )}

            {/* Alarm Banner / Alert */}
            <div className="p-3 bg-amber-500/5 border border-amber-500/20 text-amber-300 rounded-xl text-xs flex gap-2.5 items-start">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Please check in 15-20 minutes before</span>
                To ensure a smooth workflow and avoid wait times, please complete your check-in 15-20 minutes before your scheduled start of <span className="font-semibold text-white">{timeLabel(selectedApp.scheduled_start)}</span>.
              </div>
            </div>

            {/* Appointment Details Grid */}
            <div className="grid gap-4 md:grid-cols-2 text-xs">
              <div className="space-y-3 p-3 rounded-xl border bg-white/5" style={{ borderColor: "var(--glass-border)" }}>
                <div className="font-semibold text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-1 mb-2">
                  <UserRound size={14} className="text-[var(--cyan)]" /> Doctor & Specialty
                </div>
                <div className="kv"><span>Doctor</span><b>{selectedApp.doctor?.name ?? "Assigned doctor"}</b></div>
                <div className="kv"><span>Speciality</span><b>{selectedApp.specialty}</b></div>
                <div className="kv"><span>Room / Floor</span><b>{[selectedApp.doctor?.room, selectedApp.doctor?.floor].filter(Boolean).join(" / ") || "Not assigned"}</b></div>
              </div>

              <div className="space-y-3 p-3 rounded-xl border bg-white/5" style={{ borderColor: "var(--glass-border)" }}>
                <div className="font-semibold text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-1 mb-2">
                  <Clock size={14} className="text-[var(--cyan)]" /> Schedule & Payment
                </div>
                <div className="kv"><span>Date</span><b>{selectedApp.scheduled_start?.slice(0, 10)}</b></div>
                <div className="kv"><span>Time Slot</span><b>{timeLabel(selectedApp.scheduled_start)}</b></div>
                <div className="kv"><span>Consultation Fee</span><b>{selectedApp.opd_fee != null ? `₹${Number(selectedApp.opd_fee).toFixed(2)}` : "Not recorded"}</b></div>
              </div>
            </div>

            <div className="p-3 rounded-xl border bg-white/5" style={{ borderColor: "var(--glass-border)" }}>
              <div className="text-xs text-[var(--muted)]">Reason for Appointment:</div>
              <div className="text-xs font-semibold text-slate-200 mt-1">{selectedApp.reason || "General OPD checkup"}</div>
            </div>

            <div className="flex justify-end pt-2">
              <button 
                disabled={checkingIn}
                onClick={() => handleDirectCheckin(selectedApp)}
                className="btn g w-full md:w-auto px-6 py-2 flex items-center justify-center gap-2"
              >
                {checkingIn ? (
                  <>Checking in...</>
                ) : (
                  <>
                    Complete Check-In <CheckCircle2 size={16} />
                  </>
                )}
              </button>
            </div>
          </Card>
        )}

        {/* State 2: Checked in but not triaged (stage === 0) */}
        {showEncounterId && stage === 0 && encDetails && (
          <Card className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Encounter Overview</span>
                <h3 className="text-lg font-extrabold text-white">Active Visit</h3>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleDownloadInvoice(encDetails, true)}
                  className="btn ghost sm text-xs flex items-center gap-1.5"
                >
                  <Download size={14} /> Invoice
                </button>
                <Tag tone="green">Checked In</Tag>
              </div>
            </div>

            {/* Check-in Complete Alert */}
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex gap-2.5 items-start">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <span className="font-bold block mb-0.5">Check-in Complete!</span>
                Your check-in is complete. You have been placed in the triage queue.
              </div>
            </div>

            {/* Triage Directions Banner */}
            <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 text-cyan-300 rounded-xl text-xs flex gap-2.5 items-start">
              <MapPin size={16} className="shrink-0 mt-0.5 text-cyan-300" />
              <div>
                <span className="font-bold block mb-0.5">Please proceed to Triage</span>
                Please walk to the triage area for vitals monitoring and nurse checkup.
                {(() => {
                  const triageStaff = triageStaffList?.find((s: any) => s.role === "NURSE" && s.department === "Triage" && s.available);
                  const triageRoom = triageStaff?.room || "Triage Room 1";
                  const triageFloor = triageStaff?.floor || "Ground Floor";
                  return (
                    <div className="mt-1 font-semibold text-white">
                      Location: {triageRoom} ({triageFloor})
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Brief Appointment Details */}
            <div className="p-3 rounded-xl border bg-white/5 space-y-2 text-xs" style={{ borderColor: "var(--glass-border)" }}>
              <div className="font-semibold text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-1 mb-1">
                <Clipboard size={14} className="text-[var(--cyan)]" /> Visit Summary
              </div>
              <div className="kv"><span>Doctor</span><b>{encounterAppointment?.doctor?.name || encDetails.triage?.recommended_doctor?.name || "Not assigned"}</b></div>
              <div className="kv"><span>Specialty</span><b>{encounterAppointment?.specialty || encDetails.triage?.specialty || encDetails.department || "Not recorded"}</b></div>
              <div className="kv">
                <span>Room / Floor</span>
                <b>{[
                  encounterAppointment?.doctor?.room || encDetails.triage?.recommended_doctor?.room,
                  encounterAppointment?.doctor?.floor || encDetails.triage?.recommended_doctor?.floor,
                ].filter(Boolean).join(" / ") || "Not assigned"}</b>
              </div>
              <div className="kv"><span>Time Slot</span><b>{encounterAppointment?.scheduled_start ? timeLabel(encounterAppointment.scheduled_start) : timeLabel(encDetails.arrival)}</b></div>
              <div className="kv"><span>Chief Complaint / Reason for Visit</span><b>{encDetails.triage?.chief_complaint || encounterAppointment?.reason || encDetails.reason || "Not provided"}</b></div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-sky-500/20 bg-sky-500/5 px-2.5 py-2 text-[11px]">
                <span className="font-semibold text-sky-300">Active Triage Queue Position:</span>
                <b className="text-white">{getPatientsAhead()} Patient(s)</b>
                <span className="text-[var(--dim)]">ahead of you. Please wait near the triage room.</span>
              </div>
            </div>
          </Card>
        )}

        {/* State 3: Triaged (stage === 1) */}
        {showEncounterId && stage === 1 && encDetails && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--glass-border)] pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Encounter Overview</span>
                  <h3 className="text-lg font-extrabold text-white">Active Visit</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleDownloadInvoice(encDetails, true)}
                    className="btn ghost sm text-xs flex items-center gap-1.5"
                  >
                    <Download size={14} /> Invoice
                  </button>
                  <Tag tone="blue">Triaged</Tag>
                </div>
              </div>

              {/* Triage Complete status */}
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex gap-2.5 items-start">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <span className="font-bold block mb-0.5">Triage Complete!</span>
                  Vitals and symptoms recorded. Your queue token has been generated.
                </div>
              </div>

              {/* Token Card */}
              {encDetails.token ? (
                <div 
                  className="token-highlight relative flex flex-col items-center justify-center space-y-3 overflow-hidden rounded-2xl border-2 p-5 text-center shadow-lg sm:p-7"
                  style={{ 
                    background: "linear-gradient(135deg, rgba(52,225,232,0.1), rgba(139,92,246,0.1))",
                    borderColor: "rgba(52,225,232,0.3)" 
                  }}
                >
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Ticket size={120} />
                  </div>
                  
                  <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--cyan)]">Your Queue Token</div>
                  <div className="text-5xl font-black tracking-wider text-white drop-shadow-[0_0_16px_rgba(52,225,232,0.8)] sm:text-6xl">
                    {encDetails.token.number}
                  </div>
                  
                  <div className="text-xs space-y-1.5">
                    <div className="text-slate-200 font-bold flex items-center justify-center gap-1">
                      <MapPin size={13} className="text-[var(--cyan)]" /> {[encDetails.token.room, encDetails.token.floor].filter(Boolean).join(" · ") || "Location not assigned"}
                    </div>
                    <div className="text-[11px] text-[var(--dim)]">
                      Estimated wait time: <span className="font-semibold text-white">{encDetails.token.eta_minutes != null ? `${encDetails.token.eta_minutes} mins` : "Not available"}</span>
                    </div>
                  </div>
                  
                  <div className="text-[10px] font-semibold text-cyan-300/80 bg-cyan-900/30 px-2.5 py-0.5 rounded-full border border-cyan-500/20 mt-1 animate-pulse">
                    Waiting for doctor call...
                  </div>
                </div>
              ) : (
                <div className="holo text-center text-xs">Waiting for token generation...</div>
              )}

              {/* Brief Appointment Details */}
              <div className="p-3 rounded-xl border bg-white/5 space-y-2 text-xs" style={{ borderColor: "var(--glass-border)" }}>
                <div className="font-semibold text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-1 mb-1">
                  <Clipboard size={14} className="text-[var(--cyan)]" /> Visit Summary
                </div>
                <div className="kv"><span>Assigned Doctor</span><b>{encDetails.triage?.recommended_doctor?.name || encDetails.appointment?.doctor?.name || "Not assigned"}</b></div>
                <div className="kv"><span>Specialty</span><b>{encDetails.triage?.specialty || encDetails.appointment?.specialty || encDetails.department || "Not recorded"}</b></div>
                <div className="kv"><span>Room / Floor</span><b>{[
                  encDetails.token?.room || encDetails.triage?.recommended_doctor?.room || encDetails.appointment?.doctor?.room,
                  encDetails.token?.floor || encDetails.triage?.recommended_doctor?.floor || encDetails.appointment?.doctor?.floor,
                ].filter(Boolean).join(" / ") || "Not assigned"}</b></div>
                <div className="kv"><span>Time Slot</span><b>{encDetails.appointment?.scheduled_start ? timeLabel(encDetails.appointment.scheduled_start) : "Not recorded"}</b></div>
                <div className="kv"><span>Acuity Level</span><b>{encDetails.triage?.acuity || "Not recorded"}</b></div>
                <div className="kv"><span>Chief Complaint / Reason for Visit</span><b>{encDetails.triage?.chief_complaint || encDetails.appointment?.reason || "Not recorded"}</b></div>
              </div>
            </Card>

            {/* Vitals and Lab Results */}
            <VitalsAndLabs 
              latestVitals={encDetails.vitals} 
              orders={encDetails.labs || []} 
            />
          </div>
        )}

        {/* Stage >= 2: Standard workflow */}
        {showEncounterId && stage >= 2 && encDetails && (
          <>
            <Card className="space-y-2 text-xs">
              <div className="font-semibold text-slate-100 flex items-center gap-1.5 border-b border-white/5 pb-2 mb-1">
                <Clipboard size={14} className="text-[var(--cyan)]" /> Visit Summary
              </div>
              <div className="kv"><span>Doctor</span><b>{encDetails.triage?.recommended_doctor?.name || encDetails.appointment?.doctor?.name || "Not assigned"}</b></div>
              <div className="kv"><span>Specialty</span><b>{encDetails.triage?.specialty || encDetails.appointment?.specialty || encDetails.department || "Not recorded"}</b></div>
              <div className="kv"><span>Room / Floor</span><b>{[
                encDetails.token?.room || encDetails.triage?.recommended_doctor?.room || encDetails.appointment?.doctor?.room,
                encDetails.token?.floor || encDetails.triage?.recommended_doctor?.floor || encDetails.appointment?.doctor?.floor,
              ].filter(Boolean).join(" / ") || "Not assigned"}</b></div>
              <div className="kv"><span>Time Slot</span><b>{encDetails.appointment?.scheduled_start ? timeLabel(encDetails.appointment.scheduled_start) : "Not recorded"}</b></div>
              <div className="kv"><span>Chief Complaint / Reason for Visit</span><b>{encDetails.triage?.chief_complaint || encDetails.appointment?.reason || "Not recorded"}</b></div>
            </Card>

            <LabOrdersAlert 
              orders={encDetails.labs || labDetails?.orders || []} 
              refetchLab={refetchLab} 
              refetchEnc={refetchEnc} 
              refetchP360={refetchP360} 
            />

            <div className="grid gap-4 md:grid-cols-2">
              <ConsultationSummary 
                encounterId={showEncounterId!}
                triage={encDetails.triage} 
                appointment={encDetails.appointment}
                note={encDetails.note}
              />

              <VitalsAndLabs 
                latestVitals={encDetails.vitals} 
                orders={encDetails.labs || labDetails?.orders || []} 
              />
            </div>

            <PrescriptionSlip 
              encounterId={showEncounterId!} 
              prescription={encDetails.prescription} 
            />
          </>
        )}

        {/* Default empty state if no selection */}
        {!showAppointmentId && !showEncounterId && (
          <Card className="text-center py-12">
            <Clipboard size={48} className="mx-auto opacity-30 text-[var(--dim)] mb-3" />
            <h3 className="font-bold text-base text-slate-200">Select a Visit Record</h3>
            <p className="text-xs max-w-sm mx-auto mt-1 text-[var(--muted)]">
              Choose one of your consultation visits or appointments from the list on the left to review details, triage status, queue position, vitals, and notes.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
