import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  MessageSquareHeart, HeartPulse, FileText, FlaskConical, Pill, ShieldCheck, MonitorDot, ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, Metric, AgentBadge } from "../components/ui";

const AGENTS = [
  { icon: MessageSquareHeart, name: "Patient Intake", desc: "Patient details, appointments and symptom capture" },
  { icon: HeartPulse, name: "Clinical Triage", desc: "Vitals, urgency assessment and doctor assignment" },
  { icon: FileText, name: "Clinical Notes", desc: "Consultation transcription with draft SOAP notes and ICD 10 coding" },
  { icon: FlaskConical, name: "Laboratory", desc: "Lab orders, duplicate checks, results and abnormal value flags" },
  { icon: Pill, name: "Prescription Safety", desc: "Allergy, interaction, dosage, formulary and stock checks" },
  { icon: ShieldCheck, name: "Documentation Review", desc: "Checks for missing clinical records before discharge" },
  { icon: MonitorDot, name: "Hospital Operations", desc: "Live queues, hospital activity and operational alerts" },
];

export default function Home() {
  const nav = useNavigate();
  const { data: m } = useQuery({ queryKey: ["metrics"], queryFn: api.metrics, refetchInterval: 5000 });

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="overflow-hidden !p-0">
        <div className="relative px-8 py-10"
          style={{ background: "radial-gradient(760px 320px at 20% -30%, rgba(52,225,232,.22), transparent 62%), radial-gradient(700px 320px at 100% 120%, rgba(167,139,250,.20), transparent 60%)" }}>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.34em]" style={{ color: "var(--cyan)" }}>
            Modern Clinical Operating System
          </div>
          <h1 className="grad-text mt-3 max-w-2xl text-4xl font-extrabold leading-tight">
            One connected platform for patients, clinicians, and hospital operations.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px]" style={{ color: "var(--muted)" }}>
            Manage the complete care journey—from appointments and digital check-in to consultations,
            clinical documentation, prescriptions, billing, and discharge. AI assists with routine work
            while clinicians stay in control of every decision.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn" onClick={() => nav("/patient/checkin")}>
              Start a patient journey <ArrowRight size={16} />
            </button>
            <button className="btn ghost" onClick={() => nav("/command")}>Open Command Center</button>
          </div>
        </div>
      </Card>

      {/* Live snapshot */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="grad-text text-lg font-extrabold">Live hospital snapshot</h2>
          <span className="live">LIVE</span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric value={m?.headline?.patients_today ?? "—"} label="Patients today" />
          <Metric value={m ? `${m.headline.door_to_doctor_min}m` : "—"} label="Door-to-doctor" />
          <Metric value={m?.headline?.in_queue ?? "—"} label="In queue" />
          <Metric value={m?.headline?.compliance_gaps ?? "—"} label="Compliance gaps" />
        </div>
      </div>

      {/* Agent mesh */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="grad-text text-lg font-extrabold">Connected clinical workflows</h2>
          <AgentBadge label="7 integrated workflows" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <motion.div key={a.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Card className="h-full">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: "rgba(207,239,239,.72)", border: "1px solid rgba(55,181,177,.24)" }}>
                    <a.icon size={18} color="#0b787a" />
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: "var(--ink)" }}>{a.name}</div>
                    <div className="text-[12.5px]" style={{ color: "var(--muted)" }}>{a.desc}</div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
