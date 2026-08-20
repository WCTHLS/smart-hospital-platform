import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Stethoscope, User, ShieldAlert, Users, MapPin, ArrowRight, Search, FileClock, X } from "lucide-react";
import { api, ApiError } from "../../../lib/api";
import { Card, Tag, Empty } from "../../../components/ui";

interface DoctorQueueProps {
  onSelectPatient: (enc: any) => void;
}

export default function DoctorQueue({ onSelectPatient }: DoctorQueueProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => {
    return localStorage.getItem("selected_doctor_id") || "";
  });
  const [queueTab, setQueueTab] = useState<"first" | "reconsult" | "completed">("first");
  const [searchQuery, setSearchQuery] = useState("");
  const [doctorSearchQuery, setDoctorSearchQuery] = useState("");
  const [docAvailable, setDocAvailable] = useState<boolean>(true);

  const { data: doctors } = useQuery({
    queryKey: ["doctors"],
    queryFn: api.doctors,
  });

  const { data: queue, error: queueError } = useQuery({
    queryKey: ["doctor-queue", selectedDoctorId],
    queryFn: () => api.doctorEncounters(selectedDoctorId),
    enabled: !!selectedDoctorId,
    refetchInterval: 5000,
    retry: false,
  });

  const reportReviewCount = queue?.filter((enc: any) => enc.is_reconsult).length || 0;
  const [showReportReviewNotice, setShowReportReviewNotice] = useState(false);
  const notifiedDoctorRef = useRef("");

  useEffect(() => {
    if (!selectedDoctorId || reportReviewCount === 0) return;
    if (notifiedDoctorRef.current === selectedDoctorId) return;

    notifiedDoctorRef.current = selectedDoctorId;
    setShowReportReviewNotice(true);
    const timer = window.setTimeout(() => setShowReportReviewNotice(false), 7000);
    return () => window.clearTimeout(timer);
  }, [reportReviewCount, selectedDoctorId]);

  useEffect(() => {
    if (!selectedDoctorId) {
      navigate("/login", { replace: true });
    }
  }, [selectedDoctorId, navigate]);

  const activeDoc = doctors?.find((d: any) => d.doctor_id === selectedDoctorId);
  const isUnlocked = Boolean(selectedDoctorId);

  // Initialize doctor availability local state
  useQuery({
    queryKey: ["active-doc-status", selectedDoctorId],
    queryFn: async () => {
      if (!selectedDoctorId) return null;
      const doc = doctors?.find((d: any) => d.doctor_id === selectedDoctorId);
      if (doc) {
        setDocAvailable(doc.available);
      }
      return doc;
    },
    enabled: !!doctors && !!selectedDoctorId,
  });

  const handleToggleAvailability = async () => {
    if (!selectedDoctorId) return;
    const nextVal = !docAvailable;
    setDocAvailable(nextVal);
    try {
      await api.updateDoctorAvailability(selectedDoctorId, nextVal);
      qc.invalidateQueries({ queryKey: ["doctors"] });
    } catch (err) {
      console.error(err);
      setDocAvailable(!nextVal); // Revert on failure
    }
  };

  const handleSelectDoctor = (id: string) => {
    setSelectedDoctorId(id);
    localStorage.setItem("selected_doctor_id", id);
  };

  const handleLogoutDoctor = () => {
    setSelectedDoctorId("");
    localStorage.removeItem("selected_doctor_id");
  };

  const renderQueueRow = (title: string, encounters: any[], emptyMessage: string) => (
    <section className="glass space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-extrabold text-slate-100">{title}</h4>
        <Tag tone={encounters.length ? "blue" : "gray"}>{encounters.length}</Tag>
      </div>

      {encounters.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:pb-0 xl:grid-cols-3 2xl:grid-cols-4">
          {encounters.map((enc: any) => {
            const isRedFlag = enc.triage?.red_flag;

            return (
              <Card
                key={enc.encounter_id}
                className={`hover-border relative flex w-[82vw] max-w-[320px] shrink-0 snap-start flex-col justify-between overflow-hidden transition sm:w-auto sm:max-w-none sm:min-w-0 sm:snap-none ${
                  isRedFlag ? "border-red-500/30" : ""
                }`}
                style={{ border: isRedFlag ? "1px solid rgba(239, 68, 68, 0.4)" : "" }}
              >
                {isRedFlag && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />}

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--dim)]">
                      Token: <b className="text-white text-base">{enc.token?.number || "—"}</b>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {enc.triage?.acuity ? (
                        <Tag tone={["1", "2"].includes(String(enc.triage.acuity)) ? "red" : ["3"].includes(String(enc.triage.acuity)) ? "amber" : "green"}>
                          ESI-{enc.triage.acuity}
                        </Tag>
                      ) : (
                        <Tag tone="amber">Awaiting Triage</Tag>
                      )}
                      {isRedFlag && <Tag tone="red">RED FLAG</Tag>}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-slate-100">{enc.patient?.name}</h4>
                    <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                      {enc.patient?.age} yrs · {enc.patient?.gender} · {enc.patient?.mobile}
                    </p>
                  </div>

                  <div className="holo p-2 text-[12px] whitespace-pre-line text-slate-300">
                    <b>Chief Complaint:</b><br />
                    {enc.triage?.chief_complaint || "Routine consultation."}
                  </div>

                  {enc.token?.room && (
                    <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--dim)]">
                      <MapPin size={12} className="text-[var(--cyan)]" />
                      <span>{enc.token.room} ({enc.token.floor})</span>
                      {enc.token.eta_minutes != null && <span className="ml-auto">Est: ~{enc.token.eta_minutes}m</span>}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onSelectPatient({ ...enc, _doctorName: activeDoc?.name || null })}
                  className={`btn mt-4 w-full flex items-center justify-center gap-1.5 ${isRedFlag ? "r" : ""}`}
                >
                  Consult Patient <ArrowRight size={14} />
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );

  const renderSessionToolbar = () => {
    if (!activeDoc || !isUnlocked) return null;
    return (
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-3 !py-2.5 !px-4 relative overflow-hidden animate-in fade-in duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(37,100,207,0.04), transparent)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 flex items-center justify-center text-[var(--cyan)] font-extrabold text-[12px]">
            {activeDoc.name.split(" ").slice(-1)[0][0]}
          </div>
          <div>
            <span className="text-[13px] font-extrabold text-slate-100">{activeDoc.name}</span>
            <span className="text-[11px] text-[var(--muted)] ml-2">{activeDoc.specialty} · {activeDoc.room} ({activeDoc.floor})</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleAvailability}
            className={`btn text-[11px] !py-1 !px-2.5 font-bold inline-flex items-center gap-1.5 transition ${
              docAvailable
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${docAvailable ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {docAvailable ? "ONLINE / ACTIVE" : "OFF DUTY / AWAY"}
          </button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {queueError && (queueError as any).status === 404 ? (
        <Card className="text-center py-10 space-y-4 max-w-md mx-auto">
          <ShieldAlert size={48} className="mx-auto text-amber-500 mb-3" />
          <h3 className="font-bold text-base text-amber-400">Doctor Profile Not Found</h3>
          <p className="text-xs max-w-sm mx-auto mt-1 text-[var(--muted)]">
            Your session has expired or the database was recently re-seeded/reset.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("selected_doctor_id");
              setSelectedDoctorId("");
            }}
            className="btn mx-auto font-bold"
            style={{ background: "linear-gradient(135deg, var(--cyan), #14213d)", color: "white", border: "none" }}
          >
            Reset Session &amp; Login
          </button>
        </Card>
      ) : !isUnlocked ? (
        <div className="text-center py-12 flex flex-col items-center justify-center space-y-3">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-350 border-t-[#0078d4]" />
          <p className="text-xs text-slate-400 font-bold">Redirecting to login portal...</p>
        </div>
      ) : (
        renderSessionToolbar()
      )}

      {/* Patient Queue */}
      {selectedDoctorId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="grad-text-page text-lg font-extrabold flex items-center gap-2">
              <Users size={18} /> Active Patient Queue
            </h3>
            <span className="live">LIVE REFRESH</span>
          </div>

          {/* Search & Filter Bar */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-2.5 text-[var(--muted)]" />
                <input
                  type="text"
                  placeholder="Search by patient name, token, or chief complaint…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input !pl-9 w-full"
                  style={{ background: "var(--panel)", borderColor: "var(--glass-border)" }}
                />
              </div>
              <div className="relative flex gap-2">
                <button
                  onClick={() => setQueueTab("first")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    queueTab === "first" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white border border-transparent hover:border-white/10"
                  }`}
                >
                  First Consult ({queue?.filter((e: any) => !e.is_reconsult && e.status !== "COMPLETED" && e.status !== "DISCHARGED").length || 0})
                </button>
                <button
                  onClick={() => setQueueTab("reconsult")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    queueTab === "reconsult" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white border border-transparent hover:border-white/10"
                  }`}
                >
                  Report Review ({queue?.filter((e: any) => e.is_reconsult && e.status !== "COMPLETED" && e.status !== "DISCHARGED").length || 0})
                  {queue?.some((e: any) => e.is_reconsult && e.status !== "COMPLETED" && e.status !== "DISCHARGED") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
                  )}
                </button>
                <button
                  onClick={() => setQueueTab("completed")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    queueTab === "completed" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white border border-transparent hover:border-white/10"
                  }`}
                >
                  Completed ({queue?.filter((e: any) => e.status === "COMPLETED" || e.status === "DISCHARGED").length || 0})
                </button>
                {showReportReviewNotice && reportReviewCount > 0 && (
                  <div
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-xl border border-sky-500/25 bg-white p-3 text-left shadow-xl"
                    role="status"
                    aria-live="polite"
                  >
                    <button
                      type="button"
                      onClick={() => setShowReportReviewNotice(false)}
                      className="absolute right-2 top-2 text-[var(--dim)] transition hover:text-[var(--ink)]"
                      aria-label="Dismiss report review notice"
                    >
                      <X size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQueueTab("reconsult");
                        setShowReportReviewNotice(false);
                      }}
                      className="flex w-full items-start gap-2 pr-5"
                    >
                      <FileClock size={17} className="mt-0.5 shrink-0 text-[var(--cyan)]" />
                      <span>
                        <span className="block text-xs font-extrabold text-[var(--ink)]">Reports awaiting review</span>
                        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                          {reportReviewCount} {reportReviewCount === 1 ? "patient is" : "patients are"} waiting.
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(() => {
              const tabFiltered = queue?.filter((enc: any) => {
                const isFinished = enc.status === "COMPLETED" || enc.status === "DISCHARGED";
                if (queueTab === "completed") {
                  return isFinished;
                } else if (queueTab === "reconsult") {
                  return enc.is_reconsult && !isFinished;
                } else {
                  return !enc.is_reconsult && !isFinished;
                }
              }) || [];
              
              const searchLower = searchQuery.toLowerCase();
              const filteredQueue = tabFiltered.filter((enc: any) => {
                const matchName = enc.patient?.name?.toLowerCase().includes(searchLower);
                const matchToken = enc.token?.number?.toLowerCase().includes(searchLower);
                const matchChief = enc.triage?.chief_complaint?.toLowerCase().includes(searchLower);
                const matchMobile = enc.patient?.mobile?.includes(searchQuery);
                return matchName || matchToken || matchChief || matchMobile;
              });

              if (filteredQueue.length === 0) {
                return (
                  <Empty>
                    {searchQuery 
                      ? `No patients match "${searchQuery}"`
                      : queueTab === "reconsult"
                      ? "No patients waiting for report review."
                      : queueTab === "completed"
                      ? "No completed consultations found."
                      : "No patients waiting in your queue."}
                  </Empty>
                );
              }

              return (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {filteredQueue.map((enc: any) => {
                    const acuity = enc.triage?.acuity || "4";
                    const isRedFlag = enc.triage?.red_flag;

                    return (
                      <Card
                        key={enc.encounter_id}
                        className={`hover-border relative overflow-hidden flex flex-col justify-between h-full transition ${
                          isRedFlag ? "border-red-500/30" : ""
                        }`}
                        style={{ border: isRedFlag ? "1px solid rgba(239, 68, 68, 0.4)" : "" }}
                      >
                        {isRedFlag && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl" />}

                        <div className="space-y-2">
                          <div className="flex justify-between items-start">
                            <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--dim)]">
                              Token: <b className="text-white text-base">{enc.token?.number || "—"}</b>
                            </span>
                            <div className="flex gap-1">
                              {enc.triage?.acuity && (
                                <Tag tone={["1", "2"].includes(String(enc.triage.acuity)) ? "red" : ["3"].includes(String(enc.triage.acuity)) ? "amber" : "green"}>
                                  ESI-{enc.triage.acuity}
                                </Tag>
                              )}
                              {isRedFlag && (
                                <Tag tone="red">RED FLAG</Tag>
                              )}
                            </div>
                          </div>

                          <div>
                            <h4 className="text-base font-extrabold text-slate-100">{enc.patient?.name}</h4>
                            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
                              {enc.patient?.age} yrs · {enc.patient?.gender} · {enc.patient?.mobile}
                            </p>
                          </div>

                          <div className="holo p-2 text-[12px] whitespace-pre-line text-slate-300">
                            <b>Chief Complaint:</b><br />
                            {enc.triage?.chief_complaint || "Routine consultation."}
                          </div>

                          {enc.token?.room && (
                            <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--dim)]">
                              <MapPin size={12} className="text-[var(--cyan)]" />
                              <span>{enc.token.room} ({enc.token.floor})</span>
                              {enc.token.eta_minutes != null && <span className="ml-auto">Est: ~{enc.token.eta_minutes}m</span>}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => onSelectPatient({ ...enc, _doctorName: activeDoc?.name || null })}
                          className={`btn mt-4 w-full flex items-center justify-center gap-1.5 ${isRedFlag ? "r" : ""}`}
                        >
                          {enc.status === "COMPLETED" || enc.status === "DISCHARGED" ? (
                            <>Review Consult <ArrowRight size={14} /></>
                          ) : (
                            <>Consult Patient <ArrowRight size={14} /></>
                          )}
                        </button>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
