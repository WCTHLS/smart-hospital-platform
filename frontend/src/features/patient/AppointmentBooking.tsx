import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { getPortalPatient } from "../../lib/patientAuth";
import { Field, SectionTitle } from "../../components/ui";

type Slot = {
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  department?: string;
  location?: string;
  room?: string;
  scheduled_start: string;
  scheduled_end: string;
};

type Step = "reason" | "date" | "slots" | "payment" | "details";

function safeRedirect(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/patient";
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  const [hours, minutes] = value.slice(11, 16).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong";
}

export default function AppointmentBooking() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const session = getPortalPatient()!;
  const redirect = safeRedirect(params.get("redirect"));
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const [specialty, setSpecialty] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [appointment, setAppointment] = useState<any>(null);
  const [showPaymentDone, setShowPaymentDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const doctors = useMemo(() => {
    const grouped = new Map<string, { doctor: Slot; slots: Slot[] }>();
    for (const slot of slots) {
      const current = grouped.get(slot.doctor_id);
      if (current) current.slots.push(slot);
      else grouped.set(slot.doctor_id, { doctor: slot, slots: [slot] });
    }
    return [...grouped.values()];
  }, [slots]);

  async function findAvailability() {
    setBusy(true);
    setError("");
    try {
      const result = await api.appointmentSlots({ patient_id: session.patient_id, appointment_date: date, reason });
      setSpecialty(result.specialty);
      setSlots(result.slots ?? []);
      setStep("slots");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function payAndBook() {
    if (!selectedSlot) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.bookAppointment({
        patient_id: session.patient_id,
        doctor_id: selectedSlot.doctor_id,
        scheduled_start: selectedSlot.scheduled_start,
        scheduled_end: selectedSlot.scheduled_end,
        reason,
        specialty: selectedSlot.specialty,
        appointment_type: "OPD",
        channel: "PORTAL",
      });
      setAppointment(result.appointment);
      setShowPaymentDone(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAndReturn() {
    if (!appointment?.appointment_id) return nav(redirect, { replace: true });
    setBusy(true);
    setError("");
    try {
      await api.cancelAppointment(appointment.appointment_id);
      nav(redirect, { replace: true });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return <div className="space-y-5">
    <SectionTitle sub={`Logged in as ${session.name}`}>Book appointment</SectionTitle>
    <section className="card mx-auto max-w-3xl space-y-5">
      {error && <div className="alertbox">{error}</div>}

      {step === "reason" && <>
        <h3 className="text-lg font-extrabold">Reason for visit</h3>
        <textarea className="input min-h-[130px]" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe symptoms or reason for the appointment" />
        <div className="actions-row between">
          <button className="btn-link" onClick={() => nav(redirect)}><ArrowLeft size={14} /> Cancel</button>
          <button className="btn g" disabled={!reason.trim()} onClick={() => setStep("date")}>Next</button>
        </div>
      </>}

      {step === "date" && <>
        <h3 className="text-lg font-extrabold">Select appointment date</h3>
        <Field label="Date"><input className="input" type="date" min={todayIso()} value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <div className="actions-row between">
          <button className="btn-link" onClick={() => setStep("reason")}><ArrowLeft size={14} /> Back</button>
          <button className="btn g" disabled={busy || !date} onClick={findAvailability}>Show availability</button>
        </div>
      </>}

      {step === "slots" && <>
        <div><h3 className="text-lg font-extrabold">Available doctors and slots</h3><p className="text-sm" style={{ color: "var(--muted)" }}>Speciality: {specialty}</p></div>
        {!doctors.length && <div className="holo">No doctors or slots are available on this date.</div>}
        {doctors.map(({ doctor, slots: doctorSlots }) => <div className="holo" key={doctor.doctor_id}>
          <div className="flex items-start justify-between gap-3"><div><b>{doctor.doctor_name}</b><div className="text-xs" style={{ color: "var(--muted)" }}>{doctor.specialty}</div></div><UserRound size={18} /></div>
          <div className="mt-3 flex flex-wrap gap-2">{doctorSlots.map((slot) => {
            const selected = selectedSlot?.doctor_id === slot.doctor_id && selectedSlot?.scheduled_start === slot.scheduled_start;
            return <button className="appointment-time-slot" style={selected ? { borderColor: "var(--cyan)", background: "rgba(52,225,232,.14)" } : undefined} key={slot.scheduled_start} onClick={() => setSelectedSlot(slot)}>{timeLabel(slot.scheduled_start)}</button>;
          })}</div>
        </div>)}
        <div className="actions-row between">
          <button className="btn-link" onClick={() => setStep("date")}><ArrowLeft size={14} /> Change date</button>
          <button className="btn g" disabled={!selectedSlot} onClick={() => setStep("payment")}>Continue to payment</button>
        </div>
      </>}

      {step === "payment" && selectedSlot && <>
        <h3 className="text-lg font-extrabold">Payment</h3>
        <div className="holo space-y-2"><Detail label="Doctor" value={selectedSlot.doctor_name} /><Detail label="Speciality" value={selectedSlot.specialty} /><Detail label="Date" value={selectedSlot.scheduled_start.slice(0, 10)} /><Detail label="Time" value={timeLabel(selectedSlot.scheduled_start)} /></div>
        <div className="actions-row between"><button className="btn-link" disabled={busy} onClick={() => setStep("slots")}><ArrowLeft size={14} /> Back</button><button className="btn g" disabled={busy} onClick={payAndBook}><CreditCard size={16} /> {busy ? "Processing..." : "Pay"}</button></div>
      </>}

      {step === "details" && appointment && <>
        <h3 className="text-lg font-extrabold">Appointment details</h3>
        <div className="holo grid gap-x-6 md:grid-cols-2"><Detail label="Doctor" value={appointment.doctor?.name} /><Detail label="Speciality" value={appointment.specialty} /><Detail label="Reason for visit" value={appointment.reason} /><Detail label="Date" value={appointment.scheduled_start.slice(0, 10)} /><Detail label="Time" value={timeLabel(appointment.scheduled_start)} /><Detail label="Room / floor" value={[appointment.doctor?.room, appointment.doctor?.floor].filter(Boolean).join(" / ")} /><Detail label="Payment" value="Paid" /><Detail label="Status" value={appointment.status} /></div>
        <div className="actions-row between"><button className="btn ghost" disabled={busy} onClick={cancelAndReturn}>Cancel appointment</button><button className="btn g" onClick={() => nav(redirect, { replace: true })}>OK</button></div>
      </>}
    </section>

    {showPaymentDone && <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true"><div className="card w-full max-w-sm text-center"><CheckCircle2 className="mx-auto mb-3" size={44} color="var(--mint)" /><h3 className="text-lg font-extrabold">Payment done</h3><p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Your appointment has been booked successfully.</p><button className="btn g mt-4" onClick={() => { setShowPaymentDone(false); setStep("details"); }}>View appointment</button></div></div>}
  </div>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div className="kv"><span>{label}</span><b>{value || "Not available"}</b></div>;
}
