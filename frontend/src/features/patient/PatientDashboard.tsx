import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut, Clipboard, Camera, UserRound } from "lucide-react";
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const portalSession = getPortalPatient()!;
  const portalPatientId = portalSession.patient_id;
  const portalPatientName = portalSession.name;

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

  const { data: todayAppointmentData } = useQuery({
    queryKey: ["portal-today-appointments", portalPatientId],
    queryFn: () => api.todayAppointments(portalPatientId),
    enabled: !!portalPatientId,
  });

  const handleSignOut = () => {
    clearPortalPatient();
    journey.reset();
    nav("/patient/login?redirect=/patient", { replace: true });
  };

  const activeEnc = p360?.encounters?.find((e: any) => e.status !== "DISCHARGED");
  const showEncounterId = selectedEncounterId || activeEnc?.encounter_id;

  const { data: encDetails, refetch: refetchEnc } = useQuery({
    queryKey: ["portal-encounter", showEncounterId],
    queryFn: () => api.encounter(showEncounterId!),
    enabled: !!showEncounterId,
  });

  const { data: labDetails, refetch: refetchLab } = useQuery({
    queryKey: ["portal-lab", showEncounterId],
    queryFn: () => api.encounterLab(showEncounterId!),
    enabled: !!showEncounterId,
  });

  const mine = events.filter((e) => e.payload?.encounter_id === showEncounterId);
  let stage = STATUS_STAGE[encDetails?.status ?? "CHECKED_IN"] ?? 0;
  for (const e of mine) stage = Math.max(stage, TOPIC_STAGE[e.topic] ?? -1);

  const token = encDetails?.token;

  const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const todayEncounters = p360?.encounters?.filter((encounter: any) => encounter.date === today) ?? [];
  const pastEncounters = p360?.encounters?.filter((encounter: any) => encounter.date !== today) ?? [];
  const todayAppointments = todayAppointmentData?.appointments ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] animate-in fade-in duration-300">
      {/* Sidebar - Visits List */}
      <div className="space-y-4">
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

        {/* Today's Visits & Booking */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--dim)]">Today's visits</h4>
            <button 
              className="btn ghost sm shrink-0 text-[10px] !py-0.5 !px-2 font-extrabold" 
              onClick={() => nav("/patient/appointments/book?redirect=/patient")}
            >
              Book appointment
            </button>
          </div>
          {!todayAppointments.length && !todayEncounters.length && (
            <div className="holo text-xs text-[var(--muted)]">No visits scheduled for today.</div>
          )}
          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {todayAppointments.map((appointment: any) => (
              <div className="rounded-xl border p-2.5 text-xs" style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }} key={appointment.appointment_id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-white">{appointment.doctor?.name ?? "Assigned doctor"}</div>
                    <div className="mt-1 text-[var(--muted)]">{appointment.specialty} · {appointment.scheduled_start.slice(11, 16)}</div>
                    <div className="mt-1 text-[var(--muted)]">Reason: {appointment.reason || "Not provided"}</div>
                  </div>
                  <button 
                    className="btn g shrink-0 text-[11px] !py-1 !px-2 font-bold" 
                    onClick={() => nav(`/patient/checkin?appointment=${appointment.appointment_id}`)}
                  >
                    Check in
                  </button>
                </div>
              </div>
            ))}
            {todayEncounters.map((e: any) => {
              const isActive = e.encounter_id === showEncounterId;
              return (
                <button
                  key={e.encounter_id}
                  onClick={() => setSelectedEncounterId(e.encounter_id)}
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
                  onClick={() => setSelectedEncounterId(e.encounter_id)}
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
      <div className="space-y-4">
        {encDetails ? (
          <>
            {encDetails.status !== "DISCHARGED" && (
              <StageTracker stage={stage} token={token} />
            )}

            <LabOrdersAlert 
              orders={labDetails?.orders || []} 
              refetchLab={refetchLab} 
              refetchEnc={refetchEnc} 
              refetchP360={refetchP360} 
            />

            <div className="grid gap-4 md:grid-cols-2">
              <ConsultationSummary 
                encounterId={showEncounterId!}
                encounterDate={p360?.encounters?.find((e: any) => e.encounter_id === showEncounterId)?.date}
                triage={encDetails.triage} 
                p360={p360} 
              />

              <VitalsAndLabs 
                latestVitals={p360?.latest_vitals} 
                orders={labDetails?.orders || []} 
              />
            </div>

            <PrescriptionSlip 
              encounterId={showEncounterId!} 
              activeMedications={p360?.active_medications || []} 
            />
          </>
        ) : (
          <Card className="text-center py-12">
            <Clipboard size={48} className="mx-auto opacity-30 text-[var(--dim)] mb-3" />
            <h3 className="font-bold text-base text-slate-200">Select a Visit Record</h3>
            <p className="text-xs max-w-sm mx-auto mt-1 text-[var(--muted)]">
              Choose one of your consultation visits from the list on the left to review documentation, vitals, and lab orders.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
