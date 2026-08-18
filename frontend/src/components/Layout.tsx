import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HeartPulse, MonitorDot, ShieldAlert, BellRing, Menu, PanelLeftClose,
  ChevronDown, LogOut, User, Users, UserPlus, FlaskConical, Scan, Pill, Syringe, Stethoscope,
  UserCog, Calendar, LayoutGrid, ClipboardList, Activity, AlertTriangle,
  BookOpen, HardDrive, FileText, MapPin, Building2, Bell, CheckSquare, MessageSquare,
  Settings, X
} from "lucide-react";



import { useJourney } from "../lib/store";
import { useRealtime, useRealtimeConnection, LiveEvent } from "../lib/realtime";
import { getOsSession, clearOsSession, osInitials } from "../features/os/osSession";
import { getPortalPatient, savePortalPatient, clearPortalPatient } from "../lib/patientAuth";
import { api } from "../lib/api";

const ADMIN_NAV = [
  { to: "/admin", label: "Admin Workspace", icon: ShieldAlert },
  { to: "/command", label: "Command Center", icon: MonitorDot },
];

const CARE_TEAM_NAV = [
  { to: "/care-team?tab=overview", label: "Care Team Overview", icon: UserCog, end: true },
  { to: "/care-team?tab=directory", label: "Staff Directory", icon: Users },
  { to: "/care-team?tab=timings", label: "Operating Timings", icon: Calendar },
];

const DOCTOR_WORKSPACE_NAV = [
  { to: "/copilot?view=patient360", label: "Command Center", icon: LayoutGrid },
  { to: "/copilot", label: "Patients", icon: Users, end: true },
  { to: "/copilot?view=admissions", label: "Admissions", icon: ClipboardList },
  { to: "/copilot?view=care-team", label: "Care Team", icon: UserCog },
  { to: "/copilot?view=labs", label: "Labs", icon: FlaskConical },
  { to: "/copilot?view=radiology", label: "Radiology", icon: Scan },
  { to: "/copilot?view=pharmacy", label: "Pharmacy", icon: Pill },
  { to: "/copilot?view=surgery", label: "Surgery / OT", icon: Syringe },
  { to: "/copilot?view=icu", label: "ICU", icon: HeartPulse },
  { to: "/copilot?view=emergency", label: "Emergency", icon: AlertTriangle },
  { to: "/copilot?view=billing", label: "Billing", icon: BookOpen },
  { to: "/copilot?view=inventory", label: "Inventory", icon: HardDrive },
  { to: "/copilot?view=reports", label: "Reports", icon: FileText },
];

const DOCTOR_TWIN_NAV = [
  { to: "/copilot?view=map", label: "Hospital Map", icon: MapPin },
  { to: "/copilot?view=departments", label: "Departments", icon: Building2 },
  { to: "/copilot?view=assets", label: "Assets", icon: HardDrive },
];

const DOCTOR_SYSTEM_NAV = [
  { to: "/copilot?view=alerts", label: "Alerts", icon: Bell, badge: 8 },
  { to: "/copilot?view=tasks", label: "Tasks", icon: CheckSquare, badge: 14 },
  { to: "/copilot?view=messages", label: "Messages", icon: MessageSquare, badge: 6 },
  { to: "/copilot?view=settings", label: "Settings", icon: Settings },
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
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);

  const activeRole = journey.activeRole;
  const osSession = getOsSession();
  const portalPatient = getPortalPatient();
  useEffect(() => {
    if (portalPatient?.patient_id || portalPatient?.mobile) {
      api.familyProfiles(portalPatient?.patient_id, portalPatient?.mobile).then((res) => {
        if (res?.profiles) setFamilyMembers(res.profiles);
      }).catch(() => { });
    }
  }, [portalPatient?.patient_id, portalPatient?.mobile]);

  const isPatient = Boolean(portalPatient || loc.pathname.startsWith("/patient"));
  const isDoctor = Boolean(osSession?.role === "DOCTOR" || loc.pathname === "/copilot" || loc.pathname === "/oncology");
  const isNurse = Boolean(osSession?.role === "NURSE" || loc.pathname === "/triage");
  const isLab = Boolean(osSession?.role === "LAB" || loc.pathname === "/lab" || loc.pathname === "/radiology");
  const isPharmacy = Boolean(osSession?.role === "PHARMACIST" || loc.pathname === "/pharmacy");
  const isReception = Boolean(osSession?.role === "RECEPTIONIST" || loc.pathname === "/reception");
  const isCareTeam = Boolean(osSession?.role === "CARE_TEAM" || loc.pathname === "/care-team");
  const isAdmin = Boolean(osSession?.role === "ADMIN" || loc.pathname === "/admin" || loc.pathname === "/command");

  const hasSidebar = (isAdmin && (loc.pathname === "/admin" || loc.pathname === "/command")) ||
    (isDoctor && (loc.pathname === "/copilot" || loc.pathname === "/oncology")) ||
    (isCareTeam && loc.pathname === "/care-team");

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
    } else if (path === "/care-team" && activeRole !== "care_team") {
      journey.setRole("care_team" as any);
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
    if (loc.pathname === "/care-team") return "Care Team Workspace";
    if (loc.pathname === "/copilot") return "Doctor Workspace";
    if (loc.pathname === "/oncology") return "Oncology & Cancer Care";
    if (loc.pathname === "/triage") return "Triage Desk";
    if (loc.pathname === "/lab") return "Lab Workspace";
    if (loc.pathname === "/radiology") return "Radiology Command Center";
    if (loc.pathname === "/pharmacy") return "Pharmacy Desk";
    if (loc.pathname === "/reception") return "Admissions & Reception Desk";
    if (loc.pathname === "/admin") return "Admin Workspace";
    if (loc.pathname === "/command") return "Command Center";
    if (isPatient) return "Patient Dashboard";
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
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-xl z-50 animate-in fade-in duration-150">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-[12.5px] font-bold text-slate-800 leading-tight">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-500">{currentUser.role}</p>
                  </div>

                  {/* Family Profiles List for Patient */}
                  {isPatient && portalPatient && (
                    <div className="py-1.5 border-b border-slate-100">
                      <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Users size={12} className="text-[#0078d4]" />
                          <span>Profiles ({familyMembers.length || 1})</span>
                        </span>
                        {portalPatient.mobile && (
                          <span className="font-mono text-[9.5px] text-slate-400 font-semibold">
                            +91 {portalPatient.mobile}
                          </span>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-1 px-1 py-0.5">
                        {familyMembers.length > 0 ? (
                          familyMembers.map((fm) => {
                            const isCurrent = fm.patientId === portalPatient.patient_id;
                            return (
                              <button
                                key={fm.patientId}
                                type="button"
                                onClick={() => {
                                  if (isCurrent) return;
                                  savePortalPatient({
                                    patient_id: fm.patientId,
                                    name: fm.name,
                                    first_name: fm.first_name,
                                    last_name: fm.last_name,
                                    dob: fm.dob,
                                    gender: fm.gender,
                                    blood_group: fm.blood_group,
                                    address: fm.address,
                                    mobile: fm.mobile || portalPatient.mobile,
                                  });
                                  journey.set({ patientId: fm.patientId, patientName: fm.name });
                                  setUserDropdownOpen(false);
                                  window.location.reload();
                                }}
                                className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[11.5px] transition ${isCurrent
                                    ? "bg-sky-50 text-[#0078d4] font-bold border border-sky-200/80 shadow-2xs cursor-default"
                                    : "text-slate-700 hover:bg-slate-50 font-medium border border-transparent cursor-pointer"
                                  }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-5 h-5 rounded-md text-[9px] font-bold grid place-items-center shrink-0 ${isCurrent ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"
                                    }`}>
                                    {(fm.name || "PT").slice(0, 2).toUpperCase()}
                                  </div>
                                  <span className="truncate">{fm.name}</span>
                                </div>
                                {isCurrent ? (
                                  <span className="text-[9px] text-sky-700 bg-sky-100/90 px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                                    Active
                                  </span>
                                ) : (
                                  <span className="text-[9.5px] text-slate-400 font-mono shrink-0">
                                    {fm.mrn?.slice(-5) || "Switch"}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-3 py-1 text-xs text-slate-500 font-medium">
                            {portalPatient.name} (Active)
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isPatient && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        nav("/patient/login?action=add_family");
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 transition"
                    >
                      <UserPlus size={14} /> + Add Family Member
                    </button>
                  )}



                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      nav(isPatient ? "/login?role=patient" : "/login");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <User size={14} /> Switch Role / Login
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              )}

            </div>
          ) : (
            <button
              type="button"
              onClick={() => nav(isPatient ? "/login?role=patient" : "/login")}
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

      {/* Sidebar (Clinical & Admin) */}
      {hasSidebar && (
        <aside className={`fixed bottom-0 left-0 top-16 z-20 flex w-[236px] flex-col gap-1 p-4 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{
            borderRight: "1px solid var(--line)",
            backgroundImage: "var(--glass-highlight), var(--glass-sheen), linear-gradient(rgba(255,255,255,.55), rgba(255,255,255,.55))",
            backdropFilter: "blur(28px) saturate(180%)",
          }}>
          {isDoctor ? (
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 select-none scrollbar-thin text-left">
              <div>
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</div>
                <div className="space-y-0.5">
                  {DOCTOR_WORKSPACE_NAV.map((n) => {
                    const isActive = n.end
                      ? loc.pathname === "/copilot" && !loc.search
                      : loc.pathname + loc.search === n.to || (n.to.includes("?view=") && loc.search === "?" + n.to.split("?")[1]);
                    return (
                      <NavLink
                        to={n.to}
                        key={n.to}
                        onClick={(e) => {
                          if (n.to === "/copilot") {
                            journey.reset();
                            closeSidebarOnMobile();
                            return;
                          }
                          if (n.to.includes("view=patient360")) {
                            if (!journey.encounterId || !journey.patientId) {
                              e.preventDefault();
                              e.stopPropagation();
                              alert("Please select a patient from the Live Patient Queue first to open their Command Center.");
                              return;
                            }
                          }
                          closeSidebarOnMobile();
                        }}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold transition"
                        style={{
                          color: isActive ? "#0078d4" : "var(--muted)",
                          background: isActive ? "rgba(0,120,212,.08)" : "transparent",
                          border: isActive ? "1px solid rgba(0,120,212,.15)" : "1px solid transparent",
                        }}
                      >
                        <n.icon size={15} className={isActive ? "text-[#0078d4]" : "text-slate-450"} />
                        <span className="truncate">{n.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Digital Twin</div>
                <div className="space-y-0.5">
                  {DOCTOR_TWIN_NAV.map((n) => {
                    const isActive = loc.pathname + loc.search === n.to || (n.to.includes("?view=") && loc.search === "?" + n.to.split("?")[1]);
                    return (
                      <NavLink
                        to={n.to}
                        key={n.to}
                        onClick={() => closeSidebarOnMobile()}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold transition"
                        style={{
                          color: isActive ? "#0078d4" : "var(--muted)",
                          background: isActive ? "rgba(0,120,212,.08)" : "transparent",
                          border: isActive ? "1px solid rgba(0,120,212,.15)" : "1px solid transparent",
                        }}
                      >
                        <n.icon size={15} className={isActive ? "text-[#0078d4]" : "text-slate-450"} />
                        <span className="truncate">{n.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">System</div>
                <div className="space-y-0.5">
                  {DOCTOR_SYSTEM_NAV.map((n) => {
                    const isActive = loc.pathname + loc.search === n.to || (n.to.includes("?view=") && loc.search === "?" + n.to.split("?")[1]);
                    return (
                      <NavLink
                        to={n.to}
                        key={n.to}
                        onClick={() => closeSidebarOnMobile()}
                        className="flex items-center justify-between rounded-xl px-3 py-1.5 text-[12.5px] font-bold transition"
                        style={{
                          color: isActive ? "#0078d4" : "var(--muted)",
                          background: isActive ? "rgba(0,120,212,.08)" : "transparent",
                          border: isActive ? "1px solid rgba(0,120,212,.15)" : "1px solid transparent",
                        }}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <n.icon size={15} className={isActive ? "text-[#0078d4]" : "text-slate-450 shrink-0"} />
                          <span className="truncate">{n.label}</span>
                        </span>
                        {n.badge && (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-extrabold text-[#0078d4]">{n.badge}</span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : isCareTeam ? (
            <div className="space-y-1">
              <div className="mb-2 px-3 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Care Team Portal</div>
              {CARE_TEAM_NAV.map((n) => {
                const isActive = n.end
                  ? loc.pathname === n.to && !loc.search
                  : loc.pathname + loc.search === n.to || (n.to.includes("?tab=") && loc.search === "?" + n.to.split("?")[1]);
                return (
                  <NavLink
                    to={n.to}
                    key={n.to}
                    onClick={closeSidebarOnMobile}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition"
                    style={{
                      color: isActive ? "#0078d4" : "var(--muted)",
                      background: isActive ? "rgba(0,120,212,.08)" : "transparent",
                      border: isActive ? "1px solid rgba(0,120,212,.15)" : "1px solid transparent",
                      boxShadow: isActive ? "0 0 14px rgba(0,120,212,.05)" : "none",
                    }}
                  >
                    <n.icon size={17} className={isActive ? "text-[#0078d4]" : "text-slate-400"} />
                    {n.label}
                  </NavLink>
                );
              })}
            </div>
          ) : (
            ADMIN_NAV.map((n) => (
              <NavLink to={n.to} key={n.to} onClick={closeSidebarOnMobile}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition"
                style={({ isActive }: any) => ({
                  color: isActive ? "#123a7a" : "var(--muted)",
                  background: isActive ? "linear-gradient(90deg, rgba(37,100,207,.14), rgba(26,79,180,.14))" : "transparent",
                  border: isActive ? "1px solid var(--line2)" : "1px solid transparent",
                  boxShadow: isActive ? "0 0 14px rgba(37,100,207,.12)" : "none",
                })}>
                <n.icon size={17} />
                {n.label}
              </NavLink>
            ))
          )}

          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
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
