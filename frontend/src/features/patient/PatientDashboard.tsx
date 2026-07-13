import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, ShieldCheck, Phone, Clipboard } from "lucide-react";
import { api } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { useRealtime } from "../../lib/realtime";
import { Card, Tag, Empty } from "../../components/ui";

import StageTracker from "./components/StageTracker";
import ConsultationSummary from "./components/ConsultationSummary";
import VitalsAndLabs from "./components/VitalsAndLabs";
import PrescriptionSlip from "./components/PrescriptionSlip";
import LabOrdersAlert from "./components/LabOrdersAlert";

const STATUS_STAGE: Record<string, number> = {
  CHECKED_IN: 0,
  TRIAGED: 1,
  IN_CONSULT: 2,
  DIAGNOSTICS: 3,
  UNDER_REVIEW: 4,
  RX_COMPLETED: 5,
  DISCHARGED: 6,
};

const TOPIC_STAGE: Record<string, number> = {
  "visit.checked_in": 0,
  "visit.triaged": 1,
  "visit.in_consult": 2,
  "lab.order_created": 3,
  "lab.result_published": 4,
  "visit.rx_completed": 5,
  "visit.discharged": 6,
};

export default function PatientDashboard() {
  const journey = useJourney();
  const events = useRealtime((s) => s.events);

  const [mobile, setMobile] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);

  // Read patient login status from local storage
  const [portalPatientId, setPortalPatientId] = useState<string | null>(() => {
    return localStorage.getItem("portal_patient_id") || journey.patientId;
  });
  const [portalPatientName, setPortalPatientName] = useState<string | null>(() => {
    return localStorage.getItem("portal_patient_name") || journey.patientName;
  });

  // Query patient records if logged in
  const { data: p360, refetch: refetchP360 } = useQuery({
    queryKey: ["portal-p360", portalPatientId],
    queryFn: () => api.patient360(portalPatientId!),
    enabled: !!portalPatientId,
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await api.verifyIdentity("OTP", mobile.trim());
      if (res.verified && res.patient) {
        const pId = res.patient.patient_id;
        const pName = res.patient.name;

        await api.consent(pId);

        localStorage.setItem("portal_patient_id", pId);
        localStorage.setItem("portal_patient_name", pName);
        setPortalPatientId(pId);
        setPortalPatientName(pName);
      }
    } catch (err: any) {
      setLoginError("No patient record found for this mobile number. Please check-in at the desk first.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("portal_patient_id");
    localStorage.removeItem("portal_patient_name");
    setPortalPatientId(null);
    setPortalPatientName(null);
    setSelectedEncounterId(null);
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

  if (!portalPatientId) {
    return (
      <div className="max-w-md mx-auto my-12 animate-in fade-in duration-300">
        <Card className="space-y-6">
          <div className="text-center space-y-2">
            <div 
              className="grid h-12 w-12 place-items-center rounded-2xl mx-auto"
              style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))", boxShadow: "0 0 20px rgba(52,225,232,.3)" }}
            >
              <ShieldCheck size={24} className="text-slate-900" />
            </div>
            <h2 className="grad-text text-2xl font-extrabold">Patient Portal</h2>
            <p className="text-[13px] text-[var(--muted)]">
              Enter your mobile number to view active prescriptions, check-in status, and medical history.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-semibold mb-1.5" style={{ color: "#dce9ff" }}>
                Registered Mobile Number
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-3 text-[var(--dim)]" />
                <input
                  type="tel"
                  className="input pl-9"
                  placeholder="e.g. 9876500011"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  required
                />
              </div>
            </div>

            {loginError && (
              <div className="alertbox text-xs py-2 text-rose-300 border-rose-500/20 bg-rose-950/20">
                {loginError}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn w-full">
              {loading ? "Authenticating..." : "Sign In & View Records"}
            </button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] animate-in fade-in duration-300">
      {/* Sidebar - Visits List */}
      <div className="space-y-4">
        <Card className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Logged In Patient</div>
            <div className="font-extrabold text-base text-slate-100">{portalPatientName}</div>
            <Tag tone="green">ABHA Verified</Tag>
          </div>
          <button
            onClick={handleSignOut}
            className="btn ghost w-full text-xs !py-1 px-3 flex items-center justify-center gap-1.5"
          >
            <LogOut size={13} /> Sign Out
          </button>
        </Card>

        <Card className="space-y-3">
          <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--dim)]">Your Visits</h4>
          <div className="space-y-2">
            {p360?.encounters?.map((e: any) => {
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
