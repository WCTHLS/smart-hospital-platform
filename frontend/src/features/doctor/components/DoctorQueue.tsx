import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, User, ShieldAlert, Users, MapPin, ArrowRight } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty } from "../../../components/ui";

interface DoctorQueueProps {
  onSelectPatient: (enc: any) => void;
}

export default function DoctorQueue({ onSelectPatient }: DoctorQueueProps) {
  const qc = useQueryClient();
  
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => {
    return localStorage.getItem("selected_doctor_id") || "";
  });
  const [unlockedDoctorId, setUnlockedDoctorId] = useState<string>(() => {
    return sessionStorage.getItem("unlocked_doctor_id") || "";
  });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [queueTab, setQueueTab] = useState<"first" | "reconsult">("first");
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

  const activeDoc = doctors?.find((d: any) => d.doctor_id === selectedDoctorId);
  const isUnlocked = selectedDoctorId && selectedDoctorId === unlockedDoctorId;

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
    setPin("");
    setPinError("");
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !pin) return;
    setVerifyingPin(true);
    setPinError("");
    try {
      await api.verifyDoctorPin(selectedDoctorId, pin);
      setUnlockedDoctorId(selectedDoctorId);
      sessionStorage.setItem("unlocked_doctor_id", selectedDoctorId);
    } catch (err: any) {
      setPinError(err.message || "Incorrect PIN code. Access denied.");
    } finally {
      setVerifyingPin(false);
    }
  };

  const handleLogoutDoctor = () => {
    setUnlockedDoctorId("");
    sessionStorage.removeItem("unlocked_doctor_id");
    setPin("");
    setPinError("");
  };

  const renderQueueRow = (title: string, encounters: any[], emptyMessage: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-extrabold text-slate-100">{title}</h4>
        <Tag tone={encounters.length ? "blue" : "gray"}>{encounters.length}</Tag>
      </div>

      {encounters.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
          {encounters.map((enc: any) => {
            const isRedFlag = enc.triage?.red_flag;

            return (
              <Card
                key={enc.encounter_id}
                className={`hover-border relative w-[300px] shrink-0 snap-start overflow-hidden flex flex-col justify-between transition sm:w-[340px] ${
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
                    {isRedFlag && <Tag tone="red">RED FLAG</Tag>}
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
                  onClick={() => onSelectPatient(enc)}
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
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-3 !py-2.5 !px-4 relative overflow-hidden animate-in fade-in duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.04), transparent)" }}>
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
          <button
            onClick={handleLogoutDoctor}
            className="btn ghost text-[11px] !py-1 !px-2.5 font-bold text-red-400 hover:text-red-300 inline-flex items-center gap-1"
          >
            🔒 Lock Session
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
              sessionStorage.removeItem("unlocked_doctor_id");
              localStorage.removeItem("selected_doctor_id");
              setSelectedDoctorId("");
              setUnlockedDoctorId("");
            }}
            className="btn mx-auto font-bold"
            style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
          >
            Reset Session &amp; Login
          </button>
        </Card>
      ) : !isUnlocked ? (
        <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
              <Stethoscope size={22} className="text-[var(--cyan)]" /> Doctor Portal Login
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--muted)" }}>
              Select your clinical profile to view your active patient queue and consultation schedules.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <User size={15} color="var(--dim)" />
              <select
                value={selectedDoctorId}
                onChange={(e) => handleSelectDoctor(e.target.value)}
                className="input !py-1.5 !px-3 !w-auto text-[13.5px] font-bold"
                style={{ background: "var(--panel)", borderColor: "var(--glass-border)", color: "#dce9ff" }}
              >
                <option value="">-- Choose Doctor Profile --</option>
                {doctors?.map((doc: any) => (
                  <option key={doc.doctor_id} value={doc.doctor_id}>
                    {doc.name} ({doc.specialty})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      ) : (
        renderSessionToolbar()
      )}

      {/* PIN Login Form if locked */}
      {selectedDoctorId && selectedDoctorId !== unlockedDoctorId && (
        <div className="max-w-[440px] mx-auto py-8">
          <Card className="space-y-4 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(52,225,232,0.06), transparent)" }}>
            <div className="flex flex-col items-center text-center space-y-2 pb-2">
              <div className="w-12 h-12 rounded-full bg-[var(--cyan)]/10 border border-[var(--cyan)]/25 flex items-center justify-center text-[var(--cyan)]">
                <User size={24} />
              </div>
              <h3 className="font-extrabold text-[15px] text-slate-100">{activeDoc?.name}</h3>
              <p className="text-[12px] text-[var(--muted)]">{activeDoc?.specialty} · Room {activeDoc?.room} ({activeDoc?.floor})</p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block font-bold text-slate-300 text-center">Enter Access PIN Code</label>
                <input
                  type="password"
                  placeholder="••••"
                  className="input text-center text-lg font-bold tracking-widest font-mono py-2"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {pinError && (
                <div className="p-2.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 flex items-center gap-1.5 justify-center">
                  <ShieldAlert size={14} />
                  <span>{pinError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={verifyingPin}
                className="btn w-full font-bold py-2"
                style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
              >
                {verifyingPin ? "Verifying..." : "Unlock Workspace"}
              </button>
            </form>
          </Card>
        </div>
      )}

      {/* Patient Queue */}
      {selectedDoctorId && selectedDoctorId === unlockedDoctorId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="grad-text text-lg font-extrabold flex items-center gap-2">
              <Users size={18} /> Active Patient Queue
            </h3>
            <span className="live">LIVE REFRESH</span>
          </div>

          {false && <>
          <div className="flex gap-2 p-1 bg-white/[0.02] border border-white/5 rounded-xl w-fit">
            <button
              onClick={() => setQueueTab("first")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                queueTab === "first" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
              }`}
            >
              First Consultation ({queue?.filter((e: any) => !e.is_reconsult).length || 0})
            </button>
            <button
              onClick={() => setQueueTab("reconsult")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                queueTab === "reconsult" ? "bg-white/10 text-white" : "text-[var(--muted)] hover:text-white"
              }`}
            >
              Report Review ({queue?.filter((e: any) => e.is_reconsult).length || 0})
              {queue?.some((e: any) => e.is_reconsult) && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
              )}
            </button>
          </div>

          {(() => {
            const filteredQueue = queue?.filter((enc: any) =>
              queueTab === "reconsult" ? enc.is_reconsult : !enc.is_reconsult
            ) || [];

            if (filteredQueue.length === 0) {
              return (
                <Empty>
                  {queueTab === "reconsult"
                    ? "No patients waiting for report review."
                    : "No patients waiting in your queue."}
                </Empty>
              );
            }

            return (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredQueue.map((enc: any) => {
                  const acuity = enc.triage?.acuity || "4";
                  const isRedFlag = enc.triage?.red_flag;
                  const tagTone = acuity === "1" ? "red" : acuity === "2" ? "red" : acuity === "3" ? "amber" : "blue";

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
                          {isRedFlag && (
                            <Tag tone="red">
                              RED FLAG
                            </Tag>
                          )}
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
                        onClick={() => onSelectPatient(enc)}
                        className={`btn mt-4 w-full flex items-center justify-center gap-1.5 ${isRedFlag ? "r" : ""}`}
                      >
                        Consult Patient <ArrowRight size={14} />
                      </button>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
          </>}

          {renderQueueRow(
            "First Consultations",
            queue?.filter((enc: any) => !enc.is_reconsult) || [],
            "No patients waiting for their first consultation.",
          )}

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {renderQueueRow(
            "Report Reviews",
            queue?.filter((enc: any) => enc.is_reconsult) || [],
            "No patients waiting for report review.",
          )}
        </div>
      )}
    </div>
  );
}
