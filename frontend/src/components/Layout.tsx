import { NavLink, useLocation } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, HeartPulse, Stethoscope, ClipboardList, MonitorDot, MessageSquareHeart, Cpu,
  Smartphone, BellRing,
} from "lucide-react";
import { api } from "../lib/api";
import { useJourney } from "../lib/store";
import { useRealtime, useRealtimeConnection, LiveEvent } from "../lib/realtime";

const NAV = [
  { to: "/", label: "Home", icon: Activity, end: true },
  { to: "/checkin", label: "Check-in", icon: MessageSquareHeart },
  { to: "/triage", label: "Triage", icon: HeartPulse },
  { to: "/copilot", label: "Doctor Copilot", icon: Stethoscope },
  { to: "/patient", label: "My Status", icon: Smartphone },
  { to: "/command", label: "Command Center", icon: MonitorDot },
];

function AiPill() {
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: api.aiStatus, refetchInterval: 15000 });
  const live = data?.llm_available;
  return (
    <div className="ai-badge" title={data?.message}>
      <Cpu size={13} />
      {data ? (live ? `LLM · ${data.model}` : "Deterministic AI") : "…"}
    </div>
  );
}

function criticalText(e: LiveEvent): string {
  if (e.topic === "result.abnormal") return `Abnormal result · ${e.payload?.test ?? "lab"}`;
  if (e.topic === "triage.completed") return `Red-flag triage · ${e.payload?.specialty ?? ""}`;
  if (e.topic === "compliance.flagged") return "Compliance gap flagged";
  return e.topic;
}

function CriticalToast() {
  const lastCritical = useRealtime((s) => s.lastCritical);
  const [shown, setShown] = useState<LiveEvent | null>(null);
  useEffect(() => {
    if (!lastCritical) return;
    setShown(lastCritical);
    const t = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(t);
  }, [lastCritical?.ts]);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div initial={{ opacity: 0, y: 20, x: 20 }} animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 20 }} className="alertbox fixed bottom-6 right-6 z-50 flex items-center gap-2"
          style={{ minWidth: 260 }}>
          <BellRing size={16} /> <b>Live alert:</b> {criticalText(shown)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  useRealtimeConnection();
  const journey = useJourney();
  const loc = useLocation();
  const connected = useRealtime((s) => s.connected);
  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[236px] flex-col gap-1 p-4"
        style={{ borderRight: "1px solid var(--line)", background: "rgba(6,9,18,.7)", backdropFilter: "blur(14px)" }}>
        <div className="mb-4 flex items-center gap-2.5 px-1">
          <div className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))", boxShadow: "0 0 18px rgba(52,225,232,.5)" }}>
            <HeartPulse size={18} color="#04121a" />
          </div>
          <div>
            <div className="grad-text text-[15px] font-extrabold leading-tight">Aarogya AI</div>
            <div className="text-[10px]" style={{ color: "var(--dim)" }}>Smart Hospital OS</div>
          </div>
        </div>

        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition ${
                isActive ? "text-white" : ""
              }`}
            style={({ isActive }: any) => ({
              color: isActive ? "#eafcff" : "var(--muted)",
              background: isActive ? "linear-gradient(90deg, rgba(52,225,232,.16), rgba(167,139,250,.16))" : "transparent",
              border: isActive ? "1px solid var(--line2)" : "1px solid transparent",
              boxShadow: isActive ? "0 0 14px rgba(52,225,232,.15)" : "none",
            })}>
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}

        <div className="mt-auto">
          <div className="card p-3 text-[12px]">
            <div className="mb-1 flex items-center gap-1.5 font-bold" style={{ color: "#bcd2ff" }}>
              <ClipboardList size={13} /> Active journey
            </div>
            {journey.patientName ? (
              <>
                <div style={{ color: "var(--ink)" }}>{journey.patientName}</div>
                <div style={{ color: "var(--dim)" }}>{journey.department || "—"}</div>
                {journey.token && <div className="mt-1"><span className="tag violet">Token {journey.token}</span></div>}
              </>
            ) : (
              <div style={{ color: "var(--dim)" }}>No patient selected</div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="ml-[236px]">
        <header className="sticky top-0 z-10 flex items-center justify-between px-7 py-3"
          style={{ borderBottom: "1px solid var(--line)", background: "rgba(6,9,18,.55)", backdropFilter: "blur(14px)" }}>
          <div className="text-[12px] uppercase tracking-[0.2em]" style={{ color: "var(--dim)" }}>
            {NAV.find((n) => n.to === loc.pathname)?.label || "Patient Journey Platform"}
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold"
              style={{ color: connected ? "#a7f3c4" : "#ffe0a3" }}>
              <span className="inline-block h-2 w-2 rounded-full"
                style={{ background: connected ? "var(--mint)" : "var(--amber)", boxShadow: `0 0 8px ${connected ? "var(--mint)" : "var(--amber)"}` }} />
              {connected ? "LIVE" : "RECONNECTING"}
            </span>
            <AiPill />
          </div>
        </header>
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }} className="mx-auto max-w-[1120px] px-7 py-6">
          {children}
        </motion.main>
      </div>

      <CriticalToast />
    </div>
  );
}
