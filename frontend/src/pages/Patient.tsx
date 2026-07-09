import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, Clock, Bell, FileText, LogOut, Phone, ShieldCheck, Stethoscope, Clipboard, Receipt, Activity } from "lucide-react";
import { api } from "../lib/api";
import { useJourney } from "../lib/store";
import { useRealtime } from "../lib/realtime";
import { Card, DeviceBar, Tag, AgentBadge } from "../components/ui";
import { useState } from "react";

const STAGES = [
  { label: "Checked in", msg: "You're checked in. Please stay nearby — no need to queue." },
  { label: "Triaged · token issued", msg: "Triage complete. We'll guide you to your room when it's time." },
  { label: "With the doctor", msg: "You're with the doctor. Your visit is being documented securely." },
  { label: "Diagnostics", msg: "Tests ordered — walk straight to the lab, reports attach automatically." },
  { label: "Prescription ready", msg: "Your prescription is approved and sent to the pharmacy." },
  { label: "Billing", msg: "Your bill is ready. Pay securely from your phone." },
  { label: "Discharged", msg: "Visit complete. Your discharge summary is in your ABHA health record." },
];

const TOPIC_STAGE: Record<string, number> = {
  "patient.checkedin": 0, "triage.completed": 1, "token.issued": 1, "note.approved": 2,
  "laborder.created": 3, "labresult.published": 3, "result.abnormal": 3,
  "prescription.approved": 4, "invoice.generated": 5, "payment.completed": 5, "visit.discharged": 6,
};
const STATUS_STAGE: Record<string, number> = {
  CHECKED_IN: 0, TRIAGED: 1, EMERGENCY: 1, IN_CONSULT: 2, DISCHARGED: 6,
};
const FRIENDLY: Record<string, string> = {
  "patient.checkedin": "Checked in", "triage.completed": "Triage completed — priority assigned",
  "token.issued": "Smart token issued", "note.approved": "Doctor completed your consultation note",
  "laborder.created": "Lab test ordered", "labresult.published": "Lab report ready",
  "result.abnormal": "A result is being reviewed by your doctor", "prescription.approved": "Prescription approved",
  "invoice.generated": "Bill generated", "payment.completed": "Payment received",
  "visit.discharged": "Discharge summary sent to your health record",
};

export default function Patient() {
  const nav = useNavigate();
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

  if (!journey.encounterId) {
    return (
      <div className="max-w-md mx-auto my-12">
        <Card className="space-y-6">
          <div className="text-center space-y-2">
            <div className="grid h-12 w-12 place-items-center rounded-2xl mx-auto"
              style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))", boxShadow: "0 0 20px rgba(52,225,232,.3)" }}>
              <ShieldCheck size={24} color="#04121a" />
            </div>
            <h2 className="grad-text text-2xl font-extrabold">Patient Portal</h2>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>
              Enter your mobile number to view active prescriptions, check-in status, and medical history.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-semibold mb-1.5" style={{ color: "#dce9ff" }}>
                Registered Mobile Number
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-3" color="var(--dim)" />
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

  const activeEnc = p360?.encounters?.find((e: any) => e.status !== "DISCHARGED");
  const showEncounterId = selectedEncounterId || activeEnc?.encounter_id;

  const { data: encDetails } = useQuery({
    queryKey: ["portal-encounter", showEncounterId],
    queryFn: () => api.encounter(showEncounterId!),
    enabled: !!showEncounterId,
  });

  const { data: labDetails } = useQuery({
    queryKey: ["portal-lab", showEncounterId],
    queryFn: () => api.encounterLab(showEncounterId!),
    enabled: !!showEncounterId,
  });

  const mine = events.filter((e) => e.payload?.encounter_id === showEncounterId);
  let stage = STATUS_STAGE[encDetails?.status ?? "CHECKED_IN"] ?? 0;
  for (const e of mine) stage = Math.max(stage, TOPIC_STAGE[e.topic] ?? -1);

  const token = encDetails?.token;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--dim)" }}>Logged In Patient</div>
            <div className="font-extrabold text-base" style={{ color: "#dce9ff" }}>{portalPatientName}</div>
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
          <h4 className="font-bold text-xs uppercase tracking-wider" style={{ color: "var(--dim)" }}>Your Visits</h4>
          
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
                  <div style={{ color: "var(--muted)" }}>{e.department} department</div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {encDetails ? (
          <>
            {encDetails.status !== "DISCHARGED" && (
              <Card>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="grad-text text-base font-extrabold flex items-center gap-1.5">
                    <Activity size={16} /> Live Visit Tracker
                  </h3>
                  {token && (
                    <div className="text-right">
                      <span className="text-[10px]" style={{ color: "var(--dim)" }}>QUEUE TOKEN:</span> <b>{token.number}</b>
                      {token.room && <span className="text-[11px] text-[var(--cyan)] block">{token.room}</span>}
                    </div>
                  )}
                </div>

                <div className="grid md:grid-cols-7 gap-3 text-center">
                  {STAGES.map((s, i) => {
                    const done = i < stage;
                    const current = i === stage;
                    return (
                      <div 
                        key={i} 
                        className={`p-2.5 rounded-xl border text-[11px] flex flex-col justify-between items-center transition ${
                          current ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-transparent"
                        }`}
                        style={{ background: current ? "rgba(52,225,232,0.05)" : "var(--panel)" }}
                      >
                        <span className="font-bold mb-1" style={{ color: current ? "white" : done ? "#bcd2ff" : "var(--dim)" }}>
                          {s.label}
                        </span>
                        <div className="h-5 w-5 grid place-items-center rounded-full" 
                          style={{ background: done || current ? "linear-gradient(150deg,var(--cyan),var(--violet))" : "var(--line)" }}>
                          {done ? <CheckCircle2 size={12} color="#04121a" /> : (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: current ? "white" : "var(--dim)" }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
                  <FileText size={16} className="text-[var(--cyan)]" /> Doctor Consultation Summary
                </h4>
                {encDetails.triage && (
                  <div className="holo p-2 text-xs">
                    <b>Reason for Visit:</b> {encDetails.triage.chief_complaint}
                  </div>
                )}
                {p360?.recent_notes?.find((n: any) => p360.encounters.find((e: any) => e.encounter_id === showEncounterId)?.date === n.date) ? (
                  <div className="space-y-2 text-[12.5px]">
                    <div className="p-3 rounded-xl border bg-white/5" style={{ borderColor: "var(--glass-border)" }}>
                      <div className="font-semibold text-white mb-1">Diagnosis & Assessment:</div>
                      <p style={{ color: "var(--ink)" }}>
                        {p360.recent_notes.find((n: any) => p360.encounters.find((e: any) => e.encounter_id === showEncounterId)?.date === n.date).text}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs italic text-[var(--dim)]">Consultation note is being finalized by your doctor.</div>
                )}
              </Card>

              <Card className="space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
                  <Clipboard size={16} className="text-[var(--cyan)]" /> Vitals & Labs
                </h4>
                {p360?.latest_vitals && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="holo text-center"><small style={{ color: "var(--dim)" }}>BP</small><br /><b>{p360.latest_vitals.bp}</b></div>
                    <div className="holo text-center"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b>{p360.latest_vitals.spo2}%</b></div>
                    <div className="holo text-center"><small style={{ color: "var(--dim)" }}>HR</small><br /><b>{p360.latest_vitals.heart_rate}</b></div>
                    <div className="holo text-center"><small style={{ color: "var(--dim)" }}>Temp</small><br /><b>{p360.latest_vitals.temperature}°F</b></div>
                  </div>
                )}

                {labDetails?.orders?.length > 0 && (
                  <div className="mt-3">
                    <div className="font-bold text-xs text-[var(--dim)] mb-1 uppercase">Laboratory Results:</div>
                    {labDetails.orders.map((o: any) => (
                      <div key={o.lab_order_id} className="p-2 border rounded-xl mb-1 text-xs" style={{ borderColor: "var(--glass-border)" }}>
                        <div className="font-semibold">{o.test} — {o.status}</div>
                        {o.results?.map((r: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] mt-1">
                            <span style={{ color: "var(--muted)" }}>• {r.analyte}</span>
                            <b>{r.value} {r.unit} {r.flag !== "N" && `(${r.flag})`}</b>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <Card className="space-y-3">
              <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
                <Stethoscope size={16} className="text-[var(--cyan)]" /> E-Prescription Slip
              </h4>
              
              {p360?.active_medications?.length > 0 ? (
                <div className="space-y-3">
                  <div className="border border-dashed p-4 rounded-2xl space-y-3 relative overflow-hidden" 
                    style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}>
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-mint/5 rounded-full blur-2xl" />
                    
                    <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--glass-border)" }}>
                      <div>
                        <div className="text-[11px] text-[var(--dim)] uppercase font-semibold">PRESCRIPTION ID</div>
                        <div className="text-xs font-bold text-white">RX-{showEncounterId?.substring(0, 8).toUpperCase()}</div>
                      </div>
                      <div className="text-right">
                        <Tag tone="green">Digital Signature Approved</Tag>
                      </div>
                    </div>

                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr style={{ color: "var(--dim)" }} className="border-b border-[var(--glass-border)]">
                          <th className="pb-1.5">Medicine Name</th>
                          <th className="pb-1.5">Dosage</th>
                          <th className="pb-1.5">Frequency</th>
                          <th className="pb-1.5 text-right">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p360.active_medications.map((med: string, i: number) => {
                          const parts = med.split(" ");
                          const name = parts.slice(0, -1).join(" ") || med;
                          const dose = parts[parts.length - 1] || "";
                          return (
                            <tr key={i} className="border-b last:border-0 border-[var(--glass-border)]">
                              <td className="py-2.5 font-bold text-white">{name}</td>
                              <td className="py-2.5" style={{ color: "var(--ink)" }}>{dose}</td>
                              <td className="py-2.5" style={{ color: "var(--muted)" }}>As directed</td>
                              <td className="py-2.5 text-right font-medium" style={{ color: "var(--ink)" }}>Refilled</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-xs italic text-[var(--dim)]">No active prescriptions recorded for this visit.</div>
              )}
            </Card>
          </>
        ) : (
          <Card className="text-center py-12">
            <Clipboard size={48} className="mx-auto opacity-30 text-[var(--dim)] mb-3" />
            <h3 className="font-bold text-base" style={{ color: "#dce9ff" }}>Select a Visit Record</h3>
            <p className="text-xs max-w-sm mx-auto mt-1" style={{ color: "var(--muted)" }}>
              Choose any date from your visit history directory on the left to display prescriptions, diagnosis notes, and lab details.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
