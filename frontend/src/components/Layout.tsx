import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, HeartPulse, Stethoscope, ClipboardList, MonitorDot, MessageSquareHeart, Cpu,
  Smartphone, BellRing, User, ShieldAlert, FlaskConical,
} from "lucide-react";
import { api } from "../lib/api";
import { useJourney, Role } from "../lib/store";
import { useRealtime, useRealtimeConnection, LiveEvent } from "../lib/realtime";

const NAV = [
  { to: "/", label: "Home", icon: Activity, end: true },
  { to: "/checkin", label: "Check-in", icon: MessageSquareHeart, roles: ["patient"] },
  { to: "/triage", label: "Triage Desk", icon: HeartPulse, roles: ["nurse"] },
  { to: "/copilot", label: "Doctor Workspace", icon: Stethoscope, roles: ["doctor"] },
  { to: "/lab", label: "Lab Workspace", icon: FlaskConical, roles: ["lab"] },
  { to: "/patient", label: "My Status", icon: Smartphone, roles: ["patient"] },
  { to: "/command", label: "Command Center", icon: MonitorDot, roles: ["admin"] },
  { to: "/admin", label: "Admin Workspace", icon: ShieldAlert, roles: ["admin"] },
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
  const nav = useNavigate();
  const connected = useRealtime((s) => s.connected);

  const activeRole = journey.activeRole;

  // Filter navigation links dynamically by role
  const visibleNav = NAV.filter(n => !n.roles || n.roles.includes(activeRole));

  // Sync store activeRole with browser URL path (useful on refresh or direct navigation)
  useEffect(() => {
    const path = loc.pathname;
    if (path === "/copilot" && activeRole !== "doctor") {
      journey.setRole("doctor");
    } else if (path === "/lab" && activeRole !== "lab") {
      journey.setRole("lab");
    } else if (path === "/triage" && activeRole !== "nurse") {
      journey.setRole("nurse");
    } else if ((path === "/command" || path === "/admin") && activeRole !== "admin") {
      journey.setRole("admin");
    } else if ((path === "/checkin" || path === "/patient") && activeRole !== "patient") {
      journey.setRole("patient");
    }
  }, [loc.pathname, activeRole, journey]);

  const handleRoleChange = (newRole: Role) => {
    journey.reset();
    journey.setRole(newRole);
    if (newRole === "patient") nav("/checkin");
    else if (newRole === "nurse") nav("/triage");
    else if (newRole === "doctor") nav("/copilot");
    else if (newRole === "admin") nav("/command");
    else if (newRole === "lab") nav("/lab");
  };

  return (
    <div className="min-h-screen">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 flex w-[236px] flex-col gap-1 p-4"
        style={{ borderRight: "1px solid var(--line)", background: "rgba(6,9,18,.7)", backdropFilter: "blur(14px)" }}>
        <div className="mb-4 flex items-center gap-2.5 px-1" onClick={() => nav("/")} style={{ cursor: "pointer" }}>
          <div className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))", boxShadow: "0 0 18px rgba(52,225,232,.5)" }}>
            <HeartPulse size={18} color="#04121a" />
          </div>
          <div>
            <div className="grad-text text-[15px] font-extrabold leading-tight">Aarogya AI</div>
            <div className="text-[10px]" style={{ color: "var(--dim)" }}>Smart Hospital OS</div>
          </div>
        </div>

        {visibleNav.map((n) => (
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

        <div className="mt-auto space-y-2">
          {journey.patientName && (
            <div className="card p-3 text-[12px] relative group">
              <div className="mb-1 flex items-center justify-between font-bold" style={{ color: "#bcd2ff" }}>
                <span className="flex items-center gap-1"><ClipboardList size={13} /> Active Session</span>
                <button
                  onClick={() => journey.reset()}
                  className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase transition opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title="Clear patient session"
                >
                  Reset
                </button>
              </div>
              <div style={{ color: "var(--ink)" }} className="font-semibold">{journey.patientName}</div>
              <div style={{ color: "var(--dim)" }}>{journey.department || "—"}</div>
              {journey.token && <div className="mt-1"><span className="tag violet">Token {journey.token}</span></div>}
            </div>
          )}
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
            {/* Live Connection Status */}
            <span className="flex items-center gap-1.5 text-[11px] font-bold"
              style={{ color: connected ? "#a7f3c4" : "#ffe0a3" }}>
              <span className="inline-block h-2 w-2 rounded-full"
                style={{ background: connected ? "var(--mint)" : "var(--amber)", boxShadow: `0 0 8px ${connected ? "var(--mint)" : "var(--amber)"}` }} />
              {connected ? "CONNECTED" : "CONNECTING"}
            </span>

            {/* AI Status */}
            <AiPill />

            {/* Custom Role Selector Dropdown */}
            <div className="flex items-center gap-1.5 rounded-xl border px-2.5 py-1"
              style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}>
              <User size={13} color="var(--dim)" />
              <select
                value={activeRole}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="bg-transparent text-[12.5px] font-bold text-white border-0 outline-none cursor-pointer pr-1"
                style={{ color: "#dce9ff" }}
              >
                <option value="patient" style={{ background: "#0a1120" }}>👤 Patient Portal</option>
                <option value="nurse" style={{ background: "#0a1120" }}>🏥 Triage Nurse</option>
                <option value="doctor" style={{ background: "#0a1120" }}>🩺 Doctor Workspace</option>
                <option value="lab" style={{ background: "#0a1120" }}>🧪 Lab Portal</option>
                <option value="admin" style={{ background: "#0a1120" }}>📊 Command Center</option>
              </select>
            </div>
          </div>
        </header>
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }} className="mx-auto max-w-[1520px] px-7 py-6">
          {children}
        </motion.main>
      </div>

      <CriticalToast />
    </div>
  );
}