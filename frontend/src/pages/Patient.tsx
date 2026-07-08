import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2, MapPin, Clock, Bell } from "lucide-react";
import { api } from "../lib/api";
import { useJourney } from "../lib/store";
import { useRealtime } from "../lib/realtime";
import { Card, DeviceBar, Tag, AgentBadge } from "../components/ui";

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

  const { data: enc } = useQuery({
    queryKey: ["encounter", journey.encounterId],
    queryFn: () => api.encounter(journey.encounterId!),
    enabled: !!journey.encounterId,
    refetchInterval: 5000,
  });

  if (!journey.encounterId) {
    return (
      <Card>
        <h2 className="grad-text mb-2 text-xl font-extrabold">My Status</h2>
        <p style={{ color: "var(--muted)" }}>
          No active visit yet. <button className="btn ghost" onClick={() => nav("/checkin")}>Check in</button> to start.
        </p>
      </Card>
    );
  }

  const mine = events.filter((e) => e.payload?.encounter_id === journey.encounterId);
  let stage = STATUS_STAGE[enc?.status ?? "CHECKED_IN"] ?? 0;
  for (const e of mine) stage = Math.max(stage, TOPIC_STAGE[e.topic] ?? -1);

  const token = enc?.token || (journey.token ? { number: journey.token } : null);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Live phone */}
      <div>
        <div className="device mx-auto max-w-[360px]" style={{ borderRadius: 30 }}>
          <DeviceBar right={<span className="ml-auto text-[11px]" style={{ color: "var(--mint)" }}>● live status</span>} />
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold" style={{ color: "#dce9ff" }}>{journey.patientName}</div>
                <Tag tone="green">ABHA verified</Tag>
              </div>
              {token && (
                <div className="text-right">
                  <div className="text-[10px]" style={{ color: "var(--dim)" }}>TOKEN</div>
                  <div className="grad-text text-2xl font-extrabold">{token.number}</div>
                </div>
              )}
            </div>

            {token?.room && (
              <div className="holo mb-3 flex items-center gap-3 text-[12.5px]">
                <MapPin size={15} color="var(--cyan)" />
                <span>{token.room} · {token.floor}</span>
                {token.eta_minutes != null && <span className="ml-auto flex items-center gap-1"><Clock size={13} /> ~{token.eta_minutes} min</span>}
              </div>
            )}

            {/* Timeline */}
            <div className="relative pl-6">
              <div className="absolute bottom-2 left-[9px] top-2 w-[2px]" style={{ background: "var(--line2)" }} />
              {STAGES.map((s, i) => {
                const done = i < stage;
                const current = i === stage;
                return (
                  <div key={i} className="relative mb-3">
                    <span className="absolute -left-6 top-0.5 grid h-[19px] w-[19px] place-items-center rounded-full"
                      style={{
                        background: done || current ? "linear-gradient(150deg,var(--cyan),var(--violet))" : "#0a1120",
                        border: `1px solid ${current ? "var(--lit)" : "var(--line2)"}`,
                        boxShadow: current ? "0 0 12px rgba(52,225,232,.6)" : "none",
                      }}>
                      {done ? <CheckCircle2 size={13} color="#04121a" /> : current ? (
                        <motion.span className="h-2 w-2 rounded-full" style={{ background: "#04121a" }}
                          animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
                      ) : <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--dim)" }} />}
                    </span>
                    <div className="text-[13px] font-semibold" style={{ color: current ? "#eafcff" : done ? "#bcd2ff" : "var(--dim)" }}>
                      {s.label}
                    </div>
                    {current && <div className="mt-0.5 text-[12px]" style={{ color: "var(--muted)" }}>{s.msg}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Live updates */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="grad-text text-xl font-extrabold">Your live updates</h2>
          <AgentBadge label="real-time" />
        </div>
        <Card>
          {mine.length ? (
            <div className="space-y-2">
              {mine.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2 text-[13px]">
                  <Bell size={14} color="var(--cyan)" />
                  <span style={{ color: "#dce9ff" }}>{FRIENDLY[e.topic] || e.topic}</span>
                  <span className="ml-auto" style={{ color: "var(--dim)" }}>{new Date(e.ts).toLocaleTimeString()}</span>
                </motion.div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--dim)" }}>
              Updates will appear here in real time as you move through your visit. Try running triage,
              labs and prescription in the Doctor Copilot — this screen updates instantly.
            </p>
          )}
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card className="text-center">
            <div className="text-[11px]" style={{ color: "var(--dim)" }}>CURRENT STEP</div>
            <div className="grad-text text-lg font-extrabold">{STAGES[Math.min(stage, 6)].label}</div>
          </Card>
          <Card className="text-center">
            <div className="text-[11px]" style={{ color: "var(--dim)" }}>VISIT STATUS</div>
            <div className="mt-1"><Tag tone={enc?.status === "DISCHARGED" ? "green" : "blue"}>{enc?.status || "…"}</Tag></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
