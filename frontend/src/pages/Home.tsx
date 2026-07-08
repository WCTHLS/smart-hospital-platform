import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  MessageSquareHeart, HeartPulse, FileText, FlaskConical, Pill, ShieldCheck, MonitorDot, ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, Metric, AgentBadge } from "../components/ui";

const AGENTS = [
  { icon: MessageSquareHeart, name: "Intake", desc: "Conversational symptom capture + red-flag detection" },
  { icon: HeartPulse, name: "Triage", desc: "ESI acuity, specialty & doctor match, queueing" },
  { icon: FileText, name: "Ambient Docs", desc: "Transcribe consult → draft SOAP + ICD-10" },
  { icon: FlaskConical, name: "Lab Intelligence", desc: "Duplicate check, structure results, flag abnormal" },
  { icon: Pill, name: "Rx CDS", desc: "Allergy / interaction / dose / formulary / stock" },
  { icon: ShieldCheck, name: "Compliance", desc: "Documentation completeness & gap detection" },
  { icon: MonitorDot, name: "Command-Center", desc: "Live ops analytics & anomaly alerts" },
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
            Next-Gen Clinical OS · Open Source
          </div>
          <h1 className="grad-text mt-3 max-w-2xl text-4xl font-extrabold leading-tight">
            A queue-free, AI-assisted hospital journey — where patients never struggle.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px]" style={{ color: "var(--muted)" }}>
            From WhatsApp check-in to digital discharge, an agentic-AI mesh drafts and advises while a
            clinician approves every note, order and prescription. ABDM-ready. Consent-first. Auditable.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn" onClick={() => nav("/checkin")}>
              Start a patient journey <ArrowRight size={16} />
            </button>
            <button className="btn ghost" onClick={() => nav("/command")}>Open Command Center</button>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {["ABDM / ABHA", "FHIR R4", "Clinician-in-the-loop", "DPDP-aligned", "Self-hosted AI"].map((t) => (
              <span key={t} className="rounded-full px-3 py-1 text-[12px]"
                style={{ background: "var(--panel)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}>{t}</span>
            ))}
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
          <h2 className="grad-text text-lg font-extrabold">The agent mesh</h2>
          <AgentBadge label="7 agents · guardrailed" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a, i) => (
            <motion.div key={a.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}>
              <Card className="h-full">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: "linear-gradient(150deg, rgba(52,225,232,.25), rgba(167,139,250,.3))", border: "1px solid var(--lit)" }}>
                    <a.icon size={18} color="#eafcff" />
                  </div>
                  <div>
                    <div className="font-bold" style={{ color: "#d7e5ff" }}>{a.name}</div>
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
