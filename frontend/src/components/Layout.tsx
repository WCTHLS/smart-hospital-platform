import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HeartPulse, MonitorDot, ShieldAlert, BellRing, Menu, PanelLeftClose,
  ChevronDown, LogOut, User, Home, Calendar, FlaskConical, Pill, Receipt, FolderOpen,
} from "lucide-react";
import { useJourney } from "../lib/store";
import { useRealtime, useRealtimeConnection, LiveEvent } from "../lib/realtime";
import { getOsSession, clearOsSession, osInitials } from "../features/os/osSession";
import { getPortalPatient, clearPortalPatient } from "../lib/patientAuth";

const ADMIN_NAV = [
  { to: "/admin", label: "Admin Workspace", icon: ShieldAlert },
  { to: "/command", label: "Command Center", icon: MonitorDot },
];

const PATIENT_NAV = [
  { to: "/patient?tab=My Health Overview", tab: "My Health Overview", label: "Overview", icon: Home, section: "MAIN" },
  { to: "/patient?tab=Appointments", tab: "Appointments", label: "Appointments", icon: Calendar, section: "MAIN" },
  { to: "/patient?tab=My Vitals", tab: "My Vitals", label: "Vitals", icon: HeartPulse, section: "MAIN" },
  { to: "/patient?tab=My Lab Reports", tab: "My Lab Reports", label: "Labs & Scans", icon: FlaskConical, section: "MAIN" },
  { to: "/patient?tab=My Prescriptions", tab: "My Prescriptions", label: "Prescriptions", icon: Pill, section: "MAIN" },
  { to: "/patient?tab=Billing", tab: "Billing", label: "Billing", icon: Receipt, section: "MAIN" },
  { to: "/patient?tab=My Documents", tab: "My Documents", label: "Documents", icon: FolderOpen, section: "MAIN" },
  { to: "/patient?tab=My Profile", tab: "My Profile", label: "My Profile", icon: User, section: "ACCOUNT" },
];

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
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const activeRole = journey.activeRole;
  const osSession = getOsSession();
  const portalPatient = getPortalPatient();

  const isPatient = Boolean(portalPatient || loc.pathname.startsWith("/patient"));
  const isDoctor = Boolean(osSession?.role === "DOCTOR" || loc.pathname === "/copilot" || loc.pathname === "/oncology");
  const isNurse = Boolean(osSession?.role === "NURSE" || loc.pathname === "/triage");
  const isLab = Boolean(osSession?.role === "LAB" || loc.pathname === "/lab" || loc.pathname === "/radiology");
  const isPharmacy = Boolean(osSession?.role === "PHARMACIST" || loc.pathname === "/pharmacy");
  const isReception = Boolean(osSession?.role === "RECEPTIONIST" || loc.pathname === "/reception");
  const isAdmin = Boolean(osSession?.role === "ADMIN" || loc.pathname === "/admin" || loc.pathname === "/command");

  // Show sidebar for Admin and Patient Portal
  const hasSidebar = (isAdmin && (loc.pathname === "/admin" || loc.pathname === "/command")) || isPatient;

  const currentUser = osSession ? {
    name: osSession.name,
    role: osSession.roleLabel || osSession.role,
    initials: osInitials(osSession.name),
  } : portalPatient ? {
    name: portalPatient.name,
    role: "Patient",
    initials: portalPatient.name.slice(0, 2).toUpperCase(),
  } : null;

  // Sync store activeRole with browser URL path
  useEffect(() => {
    const path = loc.pathname;
    if ((path === "/copilot" || path === "/oncology") && activeRole !== "doctor") {
      journey.setRole("doctor");
    } else if ((path === "/lab" || path === "/radiology") && activeRole !== "lab") {
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

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleLogout = () => {
    clearOsSession();
    clearPortalPatient();
    localStorage.removeItem("selected_doctor_id");
    localStorage.removeItem("selected_triage_staff_id");
    journey.reset();
    setUserDropdownOpen(false);
    nav("/login", { replace: true });
  };

  const handleLogoClick = () => {
    if (isPatient) {
      nav("/patient");
    } else if (isDoctor) {
      nav("/copilot");
    } else if (isNurse) {
      nav("/triage");
    } else if (isAdmin) {
      nav("/admin");
    } else {
      nav("/login");
    }
  };

  const getHeaderTitle = () => {
    if (isPatient) return "Patient Dashboard";
    if (loc.pathname === "/copilot") return "Doctor Workspace";
    if (loc.pathname === "/oncology") return "Oncology & Cancer Care";
    if (isNurse) return "Triage Desk";
    if (loc.pathname === "/lab") return "Lab Workspace";
    if (loc.pathname === "/radiology") return "Radiology Command Center";
    if (isPharmacy) return "Pharmacy Desk";
    if (isReception) return "Reception Desk";
    if (loc.pathname === "/admin") return "Admin Workspace";
    if (loc.pathname === "/command") return "Command Center";
    return "Smart Hospital Platform";
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fafc]">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between gap-2 border-b px-3 sm:gap-3 sm:px-5 lg:px-6"
        style={{
          borderColor: "var(--line)",
          backgroundImage: "var(--glass-highlight), var(--glass-sheen), linear-gradient(rgba(255,255,255,.85), rgba(255,255,255,.85))",
          backdropFilter: "blur(28px) saturate(180%)",
          boxShadow: "inset 0 -1px 0 rgba(20,33,61,.06)",
        }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {hasSidebar && (
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-[var(--muted)] transition hover:border-[var(--line2)] hover:bg-black/5 hover:text-[var(--ink)]"
              style={{ borderColor: "var(--glass-border)" }}
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={19} />}
            </button>
          )}

          <button type="button" className="flex min-w-0 items-center gap-2.5 text-left" onClick={handleLogoClick} aria-label="Hospital logo">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ background: "linear-gradient(150deg,#3a96e0,#0078d4)", boxShadow: "0 6px 14px rgba(0,120,212,.24)" }}>
              <HeartPulse size={18} color="#ffffff" />
            </span>
            <span className="hidden min-[470px]:block">
              <span className="grad-text block text-[15px] font-extrabold leading-tight">ClinIQ</span>
              <span className="block text-[10px] text-[var(--dim)]">Smart Hospital OS</span>
            </span>
          </button>

          <div className="ml-1 hidden min-w-0 truncate border-l border-[var(--line)] pl-3 text-[11px] uppercase tracking-[0.16em] text-[var(--dim)] xl:block">
            {getHeaderTitle()}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold sm:text-[11px]"
            style={{ color: connected ? "#15803d" : "#92400e" }}>
            <span className="inline-block h-2 w-2 rounded-full"
              style={{ background: connected ? "var(--mint)" : "var(--amber)", boxShadow: `0 0 8px ${connected ? "var(--mint)" : "var(--amber)"}` }} />
            <span className="hidden sm:inline">{connected ? "CONNECTED" : "CONNECTING"}</span>
          </span>

          {currentUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white/90 px-2.5 py-1.5 text-left transition hover:bg-white shadow-sm"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0078d4] text-[11px] font-bold text-white shadow-sm">
                  {currentUser.initials}
                </span>
                <span className="hidden md:block">
                  <span className="block text-[12px] font-bold text-slate-800 leading-tight">{currentUser.name}</span>
                  <span className="block text-[10px] text-slate-400 leading-none">{currentUser.role}</span>
                </span>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-xl z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[12px] font-bold text-slate-800">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-500">{currentUser.role}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      nav("/login");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <User size={15} /> Switch Role / Login
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => nav("/login")}
              className="flex items-center gap-1.5 rounded-xl bg-[#0078d4] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition hover:bg-[#106ebe]"
            >
              <User size={14} /> Sign In
            </button>
          )}
        </div>
      </header>

      {hasSidebar && sidebarOpen && (
        <button
          type="button"
          className="fixed inset-x-0 bottom-0 top-16 z-10 bg-black/55 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* Sidebar (Admin & Patient) */}
      {hasSidebar && (
        <aside
          className={`sidebar-dark fixed bottom-0 left-0 top-16 z-20 flex w-[240px] flex-col gap-1 p-3.5 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
            } bg-[#0b1329] border-r border-slate-800/80 shadow-xl`}
        >
          {isPatient ? (
            <div className="flex flex-col gap-1 flex-1 overflow-y-auto scrollbar-none">
              {/* MAIN Section */}
              <div className="nav-section-title px-3 pt-2 pb-1.5">
                Main Menu
              </div>
              {PATIENT_NAV.filter((n) => n.section === "MAIN").map((n) => {
                const searchTab = new URLSearchParams(loc.search).get("tab") || "My Health Overview";
                const isActive =
                  loc.pathname === "/patient" &&
                  ((n.tab === "My Health Overview" &&
                    (!new URLSearchParams(loc.search).get("tab") || searchTab === "My Health Overview")) ||
                    searchTab === n.tab ||
                    (n.tab === "Appointments" &&
                      (searchTab === "Appointments" || searchTab === "Book Consultation")) ||
                    (n.tab === "My Lab Reports" &&
                      (searchTab === "My Lab Reports" || searchTab === "Scans & Imaging")));

                return (
                  <button
                    key={n.label}
                    type="button"
                    onClick={() => {
                      closeSidebarOnMobile();
                      nav(n.to);
                    }}
                    className={`nav-item flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition text-left ${isActive ? "is-active font-bold" : ""
                      }`}
                  >
                    <n.icon size={18} className="nav-icon shrink-0" />
                    <span>{n.label}</span>
                  </button>
                );
              })}

              {/* ACCOUNT Section */}
              <div className="nav-section-title px-3 pt-4 pb-1.5">
                Account &amp; Settings
              </div>
              {PATIENT_NAV.filter((n) => n.section === "ACCOUNT").map((n) => {
                const searchTab = new URLSearchParams(loc.search).get("tab") || "My Health Overview";
                const isActive = loc.pathname === "/patient" && searchTab === n.tab;

                return (
                  <button
                    key={n.label}
                    type="button"
                    onClick={() => {
                      closeSidebarOnMobile();
                      nav(n.to);
                    }}
                    className={`nav-item flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition text-left ${isActive ? "is-active font-bold" : ""
                      }`}
                  >
                    <n.icon size={18} className="nav-icon shrink-0" />
                    <span>{n.label}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  closeSidebarOnMobile();
                  handleLogout();
                }}
                className="nav-item nav-item-logout flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition text-left mt-0.5"
              >
                <LogOut size={18} className="nav-icon shrink-0" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            ADMIN_NAV.map((n) => (
              <NavLink
                to={n.to}
                key={n.to}
                onClick={closeSidebarOnMobile}
                className={({ isActive }: any) =>
                  `nav-item flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition ${isActive ? "is-active font-bold" : ""
                  }`
                }
              >
                <n.icon size={18} className="nav-icon shrink-0" />
                {n.label}
              </NavLink>
            ))
          )}
        </aside>
      )}

      {/* Main */}
      <div className={`min-w-0 pt-16 transition-[margin] duration-200 ${hasSidebar && sidebarOpen ? "lg:ml-[236px]" : "ml-0"}`}>
        <motion.main key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }} className="mx-auto w-full min-w-0 max-w-[2560px] px-3 py-4 pb-6 sm:px-5 sm:py-5 lg:px-6 lg:py-6 2xl:px-8">
          {children}
        </motion.main>
      </div>

      <CriticalToast />
    </div>
  );
}
