import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardPlus, Plus } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { getPortalPatient } from "../../lib/patientAuth";
import { useJourney } from "../../lib/store";
import { SectionTitle } from "../../components/ui";

type Step = "appointments" | "details";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong";
}

function timeLabel(value: string) {
  const [hours, minutes] = value.slice(11, 16).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function CheckIn() {
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const session = getPortalPatient()!;
  const setJourney = useJourney((state) => state.set);
  const [step, setStep] = useState<Step>("appointments");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [appointment, setAppointment] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.todayAppointments(session.patient_id)
      .then((result) => {
        const items = result.appointments ?? [];
        setAppointments(items);
        const requested = searchParams.get("appointment");
        const selected = items.find((item: any) => item.appointment_id === requested);
        if (selected) {
          setAppointment(selected);
          setStep("details");
        }
      })
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(false));
  }, [searchParams, session.patient_id]);

  async function completeCheckIn() {
    if (!appointment?.appointment_id) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.checkin({
        patient_id: session.patient_id,
        appointment_id: appointment.appointment_id,
        mobile: session.mobile,
        channel: "PORTAL",
        reason: appointment.reason,
      });
      setJourney({ patientId: result.patient.patient_id, patientName: result.patient.name, encounterId: result.encounter_id });
      nav("/patient", { replace: true });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function openBooking() {
    const redirect = `${location.pathname}${location.search}`;
    nav(`/patient/appointments/book?redirect=${encodeURIComponent(redirect)}`);
  }

  return <div className="checkin-page space-y-5">
    <SectionTitle sub={`Logged in as ${session.name}`}>Patient check-in</SectionTitle>
    <div className="bar-tk" aria-hidden="true"><i style={{ width: step === "appointments" ? "50%" : "100%" }} /></div>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="card h-fit">
        {error && <div className="alertbox mb-4">{error}</div>}

        {step === "appointments" && <div className="space-y-4">
          <StepHeader icon={<ClipboardPlus size={20} />} title="Today's booked appointments" />
          {busy && <div className="holo">Loading today's appointments...</div>}
          {!busy && !appointments.length && <div className="holo">No booked appointment was found for today.</div>}
          {appointments.map((item) => <div className="holo" key={item.appointment_id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><b className="block">{item.doctor?.name ?? "Assigned doctor"}</b><span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>{item.specialty} · {timeLabel(item.scheduled_start)} · {item.reason || "OPD visit"}</span></div>
              <button className="btn g" onClick={() => { setAppointment(item); setStep("details"); }}>Check in</button>
            </div>
          </div>)}
          <div className="actions-row between">
            <button className="btn-link" onClick={() => nav("/patient")}><ArrowLeft size={14} /> Patient dashboard</button>
            <button className="btn ghost" onClick={openBooking}><Plus size={16} /> Book new appointment</button>
          </div>
        </div>}

        {step === "details" && appointment && <div className="space-y-4">
          <StepHeader icon={<CheckCircle2 size={20} />} title="Appointment details" />
          <div className="grid gap-x-6 md:grid-cols-2">
            <Detail label="Doctor" value={appointment.doctor?.name} /><Detail label="Speciality" value={appointment.specialty} /><Detail label="Reason for visit" value={appointment.reason} /><Detail label="Date" value={appointment.scheduled_start?.slice(0, 10)} /><Detail label="Time" value={timeLabel(appointment.scheduled_start)} /><Detail label="Room / floor" value={[appointment.doctor?.room, appointment.doctor?.floor].filter(Boolean).join(" / ")} /><Detail label="Payment" value="Paid" />
          </div>
          <div className="actions-row between"><button className="btn-link" onClick={() => setStep("appointments")}><ArrowLeft size={14} /> Back</button><button className="btn g" disabled={busy} onClick={completeCheckIn}>Complete check-in <CheckCircle2 size={16} /></button></div>
        </div>}
      </section>
      <aside className="card h-fit space-y-3"><Stage number={1} title="Today's appointment" active={step === "appointments"} done={step !== "appointments"} /><Stage number={2} title="Complete check-in" active={step !== "appointments"} done={false} /></aside>
    </div>
  </div>;
}

function StepHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--panel2)", border: "1px solid var(--line2)", color: "var(--cyan)" }}>{icon}</span><h3 className="text-lg font-extrabold">{title}</h3></div>;
}

function Stage({ number, title, active, done }: { number: number; title: string; active: boolean; done: boolean }) {
  return <div className={`stage-item ${active ? "is-active" : ""}`}><span className={`stage-num ${active ? "is-active" : ""} ${done ? "is-done" : ""}`}>{done ? <CheckCircle2 size={14} /> : number}</span><div className="font-bold">{title}</div></div>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="kv"><span>{label}</span><b>{value || "Not available"}</b></div>;
}
