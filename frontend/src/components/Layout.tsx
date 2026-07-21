import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, HeartPulse, Stethoscope, ClipboardList, MonitorDot, MessageSquareHeart, Cpu,
  Smartphone, BellRing, User, ShieldAlert, FlaskConical, Pill, LogOut, Menu, PanelLeftClose,
} from "lucide-react";
import { api } from "../lib/api";
import { useJourney, Role } from "../lib/store";
import { useRealtime, useRealtimeConnection, LiveEvent } from "../lib/realtime";
import { clearPortalPatient } from "../lib/patientAuth";

const NAV = [
  { to: "/", label: "Home", icon: Activity, end: true },
  { to: "/patient/checkin", label: "Check-in", icon: MessageSquareHeart, roles: ["patient"] },
  { to: "/triage", label: "Triage Desk", icon: HeartPulse, roles: ["nurse"] },
  { to: "/copilot", label: "Doctor Workspace", icon: Stethoscope, roles: ["doctor"] },
  { to: "/lab", label: "Lab Workspace", icon: FlaskConical, roles: ["lab"] },
  { to: "/patient", label: "My Status", icon: Smartphone, roles: ["patient"] },
  {to: "/reception", label: "Reception Desk", icon: ClipboardList, roles: ["receptionist"] },
  { to: "/pharmacy", label: "Pharmacy Desk", icon: Pill, roles: ["pharmacist"] },
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
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

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
    } else if (path === "/reception" && activeRole !== "receptionist") {
      journey.setRole("receptionist");
    } else if (path === "/pharmacy" && activeRole !== "pharmacist") {
      journey.setRole("pharmacist");
    } else if ((path === "/command" || path === "/admin") && activeRole !== "admin") {
      journey.setRole("admin");
    } else if (path.startsWith("/patient") && activeRole !== "patient") {
      journey.setRole("patient");
    }
  }, [loc.pathname, activeRole, journey]);

  const handleRoleChange = (newRole: Role) => {
    journey.reset();
    journey.setRole(newRole);
    if (newRole === "patient") nav("/patient");
    else if (newRole === "nurse") nav("/triage");
    else if (newRole === "doctor") nav("/copilot");
    else if (newRole === "admin") nav("/command");
    else if (newRole === "lab") nav("/lab");
    else if (newRole === "receptionist") nav("/reception");
    else if (newRole === "pharmacist") nav("/pharmacy");
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const openPatientProfile = () => {
    sessionStorage.setItem("open-patient-profile", "true");
    nav("/patient", { state: { openPatientProfile: true } });
  };

  const logoutPatient = () => {
    clearPortalPatient();
    journey.reset();
    nav("/patient/login", { replace: true });
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b px-3 sm:gap-3 sm:px-5 lg:px-6"
        style={{ borderColor: "var(--line)", background: "rgba(6,9,18,.82)", backdropFilter: "blur(16px)" }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[var(--muted)] transition hover:border-[var(--line2)] hover:bg-white/5 hover:text-white"
            style={{ borderColor: "var(--glass-border)" }}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={19} />}
          </button>
          <button type="button" className="flex min-w-0 items-center gap-2.5 text-left" onClick={() => nav("/")} aria-label="Go to home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ background: "linear-gradient(150deg,var(--cyan),var(--violet))", boxShadow: "0 0 18px rgba(52,225,232,.5)" }}>
              <HeartPulse size={18} color="#04121a" />
            </span>
            <span className="hidden min-[470px]:block">
              <span className="grad-text block text-[15px] font-extrabold leading-tight">Aarogya AI</span>
              <span className="block text-[10px] text-[var(--dim)]">Smart Hospital OS</span>
            </span>
          </button>
          <div className="ml-1 hidden min-w-0 truncate border-l border-[var(--line)] pl-3 text-[11px] uppercase tracking-[0.16em] text-[var(--dim)] xl:block">
            {NAV.find((n) => n.to === loc.pathname)?.label || "Patient Journey Platform"}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold sm:text-[11px]"
            style={{ color: connected ? "#a7f3c4" : "#ffe0a3" }}>
            <span className="inline-block h-2 w-2 rounded-full"
              style={{ background: connected ? "var(--mint)" : "var(--amber)", boxShadow: `0 0 8px ${connected ? "var(--mint)" : "var(--amber)"}` }} />
            <span className="hidden sm:inline">{connected ? "CONNECTED" : "CONNECTING"}</span>
          </span>
          <div className="hidden md:block"><AiPill /></div>
          <div className="flex min-w-0 items-center gap-1 rounded-xl border px-1.5 py-1 sm:gap-1.5 sm:px-2.5"
            style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}>
            <User className="hidden shrink-0 sm:block" size={13} color="var(--dim)" />
            <select
              value={activeRole}
              onChange={(e) => handleRoleChange(e.target.value as Role)}
              className="min-w-0 max-w-[112px] cursor-pointer border-0 bg-transparent pr-0 text-[11px] font-bold text-white outline-none sm:max-w-none sm:pr-1 sm:text-[12.5px]"
              aria-label="Select workspace"
              style={{ color: "#dce9ff" }}
            >
              <option value="patient" style={{ background: "#0a1120" }}>👤 Patient Portal</option>
              <option value="nurse" style={{ background: "#0a1120" }}>🏥 Triage Nurse</option>
              <option value="doctor" style={{ background: "#0a1120" }}>🩺 Doctor Workspace</option>
              <option value="lab" style={{ background: "#0a1120" }}>🧪 Lab Portal</option>
              <option value="receptionist" style={{ background: "#0a1120" }}>🛎️ Reception Desk</option>
              <option value="pharmacist" style={{ background: "#0a1120" }}>💊 Pharmacy Desk</option>
              <option value="admin" style={{ background: "#0a1120" }}>📊 Command Center</option>
            </select>
          </div>
        </div>
      </header>

      {sidebarOpen && <button type="button" className="fixed inset-x-0 bottom-0 top-16 z-10 bg-black/55 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      {/* Sidebar */}
      <aside className={`fixed bottom-0 left-0 top-16 z-20 flex w-[236px] flex-col gap-1 p-4 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ borderRight: "1px solid var(--line)", background: "rgba(6,9,18,.7)", backdropFilter: "blur(14px)" }}>
        {(activeRole === "patient" ? visibleNav.filter((n) => n.to === "/") : visibleNav).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={closeSidebarOnMobile}
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

        {activeRole === "patient" && (
          <>
            <button type="button" onClick={() => { openPatientProfile(); closeSidebarOnMobile(); }}
              className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-[13.5px] font-semibold text-[var(--muted)] transition hover:border-[var(--line2)] hover:bg-white/5 hover:text-white">
              <User size={17} /> Profile
            </button>
            {visibleNav.filter((n) => n.to !== "/").map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={closeSidebarOnMobile}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition ${isActive ? "text-white" : ""}`}
                style={({ isActive }: any) => ({
                  color: isActive ? "#eafcff" : "var(--muted)",
                  background: isActive ? "linear-gradient(90deg, rgba(52,225,232,.16), rgba(167,139,250,.16))" : "transparent",
                  border: isActive ? "1px solid var(--line2)" : "1px solid transparent",
                  boxShadow: isActive ? "0 0 14px rgba(52,225,232,.15)" : "none",
                })}>
                <n.icon size={17} /> {n.label}
              </NavLink>
            ))}
            <button type="button" onClick={logoutPatient}
              className="flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2 text-left text-[13.5px] font-semibold text-rose-400 transition hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-300">
              <LogOut size={17} /> Logout
            </button>
          </>
        )}

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
      <div className={`min-w-0 pt-16 transition-[margin] duration-200 ${sidebarOpen ? "lg:ml-[236px]" : "ml-0"}`}>
        {false && <header className="hidden sticky top-0 z-10 items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-7"
          style={{ borderBottom: "1px solid var(--line)", background: "rgba(6,9,18,.55)", backdropFilter: "blur(14px)" }}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 truncate text-[11px] uppercase tracking-[0.12em] min-[430px]:block sm:text-[12px] sm:tracking-[0.2em]" style={{ color: "var(--dim)" }}>
              {NAV.find((n) => n.to === loc.pathname)?.label || "Patient Journey Platform"}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Live Connection Status */}
            <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold sm:text-[11px]"
              style={{ color: connected ? "#a7f3c4" : "#ffe0a3" }}>
              <span className="inline-block h-2 w-2 rounded-full"
                style={{ background: connected ? "var(--mint)" : "var(--amber)", boxShadow: `0 0 8px ${connected ? "var(--mint)" : "var(--amber)"}` }} />
              <span className="hidden min-[380px]:inline">{connected ? "CONNECTED" : "CONNECTING"}</span>
            </span>

            {/* AI Status */}
            <div className="hidden md:block"><AiPill /></div>

            {/* Custom Role Selector Dropdown */}
            <div className="flex min-w-0 items-center gap-1 rounded-xl border px-1.5 py-1 sm:gap-1.5 sm:px-2.5"
              style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}>
              <User className="hidden shrink-0 sm:block" size={13} color="var(--dim)" />
              <select
                value={activeRole}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="min-w-0 max-w-[132px] cursor-pointer border-0 bg-transparent pr-0 text-[11px] font-bold text-white outline-none sm:max-w-none sm:pr-1 sm:text-[12.5px]"
                aria-label="Select workspace"
                style={{ color: "#dce9ff" }}
              >
                <option value="patient" style={{ background: "#0a1120" }}>👤 Patient Portal</option>
                <option value="nurse" style={{ background: "#0a1120" }}>🏥 Triage Nurse</option>
                <option value="doctor" style={{ background: "#0a1120" }}>🩺 Doctor Workspace</option>
                <option value="lab" style={{ background: "#0a1120" }}>🧪 Lab Portal</option>
                <option value="receptionist" style={{ background: "#0a1120" }}>🛎️ Reception Desk</option>
                <option value="pharmacist" style={{ background: "#0a1120" }}>💊 Pharmacy Desk</option>
                <option value="admin" style={{ background: "#0a1120" }}>📊 Command Center</option>
              </select>
            </div>
          </div>
        </header>}
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }} className="mx-auto w-full min-w-0 max-w-[2560px] px-3 py-4 pb-6 sm:px-5 sm:py-5 lg:px-6 lg:py-6 2xl:px-8">
          {children}
        </motion.main>
      </div>

      <CriticalToast />
    </div>
  );
}
