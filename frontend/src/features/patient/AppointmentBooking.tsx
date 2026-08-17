import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CreditCard, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../lib/razorpay";
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
  opd_fee?: number;
};



type RazorpayCheckout = {
  open: () => void;
  on: (event: "payment.failed", callback: (response: any) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, any>) => RazorpayCheckout;
  }
}

type Step = "reason" | "date" | "slots" | "payment" | "details";

function safeRedirect(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/patient";
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const [checkoutEmail, setCheckoutEmail] = useState(session.email || "");
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
    setSelectedSlot(null);
    try {
      const result = await api.appointmentSlots({
        patient_id: session.patient_id,
        appointment_date: date,
        reason,
      });
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
      const amount = Math.round(Number(selectedSlot.opd_fee) * 100);
      if (!Number.isFinite(amount) || amount < 100) {
        throw new Error("A valid consultation fee is not configured for this doctor.");
      }
      let Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        const loaded = await loadRazorpayScript();
        if (loaded) Razorpay = (window as any).Razorpay;
      }

      const order = await api.createRazorpayOrder({
        patient_id: session.patient_id,
        doctor_id: selectedSlot.doctor_id,
        scheduled_start: selectedSlot.scheduled_start,
        scheduled_end: selectedSlot.scheduled_end,
        reason,
        specialty: selectedSlot.specialty,
        appointment_type: "OPD",
        channel: "PORTAL",
        checkout_email: checkoutEmail.trim(),
      });
      let payment: RazorpaySuccess;
      if (order.key_id === "mock_sandbox_key" || !Razorpay) {
        payment = {
          razorpay_payment_id: `pay_mock_${Math.random().toString(36).substring(2, 11)}`,
          razorpay_order_id: order.order_id,
          razorpay_signature: "mock_signature_sandbox",
        };
      } else {
        payment = await new Promise<RazorpaySuccess>((resolve, reject) => {
          let settled = false;
          const checkout = new Razorpay({
            // Returned by the same server that created the order, preventing key/order mismatch.
            key: order.key_id,
            amount: order.amount,
            currency: order.currency,
            name: "ClinIQ",
            description: `${selectedSlot.specialty} consultation with ${selectedSlot.doctor_name}`,
            order_id: order.order_id,
            prefill: order.prefill,
            readonly: {
              name: true,
              email: Boolean(order.prefill?.email),
              contact: Boolean(order.prefill?.contact),
            },
            retry: { enabled: true },
            theme: { color: "#2564cf" },
            modal: {
              confirm_close: true,
              ondismiss: () => {
                if (!settled) reject(new Error("Payment was cancelled. Your appointment has not been booked."));
              },
            },
            handler: (response: RazorpaySuccess) => {
              settled = true;
              resolve(response);
            },
          });
          checkout.on("payment.failed", (response: any) => {
            settled = true;
            const failure = response?.error;
            const context = [failure?.code, failure?.reason, failure?.step].filter(Boolean).join(" · ");
            reject(new Error(
              `${failure?.description || "Payment failed. Please try again."}${context ? ` (${context})` : ""}`
            ));
          });
          checkout.open();
        });
      }

      const result = await api.verifyRazorpayPayment(payment);
      setAppointment(result.appointment);
      setShowPaymentDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : errorText(e));
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
  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5 p-4 sm:p-6 font-sans text-slate-700">
      <div className="rounded-2xl border border-black/[0.06] bg-gradient-to-r from-white via-blue-50/20 to-white px-5 py-4 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-extrabold text-slate-800">Book Doctor Consultation</h1>
          <p className="text-[12px] text-slate-400 mt-0.5">Logged in as {session.name} ({session.patient_id})</p>
        </div>
        <button
          type="button"
          onClick={() => nav(redirect)}
          className="flex items-center gap-1 text-[12px] font-bold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 bg-white"
        >
          <ArrowLeft size={14} /> Back to Dashboard
        </button>
      </div>

      <section className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6 shadow-sm space-y-5">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-[12.5px] font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Stepper indicator */}
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 flex-wrap">
          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${step === "reason" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
            1. Reason for Visit
          </span>
          <span className="text-slate-300">›</span>
          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${step === "date" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
            2. Select Date
          </span>
          <span className="text-slate-300">›</span>
          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${step === "slots" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
            3. Choose Doctor & Slot
          </span>
          <span className="text-slate-300">›</span>
          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${step === "payment" ? "bg-[#0078d4] text-white" : "bg-slate-100 text-slate-600"}`}>
            4. Review & Payment
          </span>
        </div>

        {step === "reason" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-800">Reason for Consultation</h3>
              <p className="text-[12px] text-slate-400 mt-0.5">Describe your current symptoms or purpose of check-up so we can route you to the best specialist.</p>
            </div>
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-[13px] text-slate-700 outline-none focus:border-[#0078d4] focus:bg-white min-h-[130px]"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Follow-up after heart stent procedure, routine cardiac checkup, general weakness..."
            />
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-500 hover:text-slate-800"
                onClick={() => nav(redirect)}
              >
                <ArrowLeft size={14} /> Cancel
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] px-6 py-2.5 shadow-sm disabled:opacity-50 transition"
                disabled={!reason.trim()}
                onClick={() => setStep("date")}
              >
                Next Step ›
              </button>
            </div>
          </div>
        )}

        {step === "date" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-800">Select Appointment Date</h3>
              <p className="text-[12px] text-slate-400 mt-0.5">Choose your preferred consultation date to check active doctor schedules.</p>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Consultation Date</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[13px] text-slate-700 outline-none focus:border-[#0078d4] focus:bg-white"
                type="date"
                min={todayIso()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="flex items-center gap-1.5 text-[12.5px] font-bold text-slate-500 hover:text-slate-800"
                onClick={() => setStep("reason")}
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] px-6 py-2.5 shadow-sm disabled:opacity-50 transition"
                disabled={busy || !date}
                onClick={() => void findAvailability()}
              >
                {busy ? "Finding Doctors..." : "Show Available Doctors ›"}
              </button>
            </div>
          </div>
        )}

        {step === "slots" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-800">Available Doctors and Time Slots</h3>
                <p className="text-[12px] text-slate-500 mt-0.5">Mapped Specialty: <b className="text-[#0078d4]">{specialty}</b> on <b>{date}</b></p>
              </div>
              <button
                type="button"
                onClick={() => setStep("date")}
                className="text-[11.5px] font-bold text-[#0078d4] hover:underline"
              >
                ‹ Change Date
              </button>
            </div>

            {busy && <div className="py-8 text-center text-slate-400 text-[12.5px]">Loading {specialty} doctors and schedules from chart...</div>}
            {!busy && !doctors.length && (
              <div className="py-8 text-center text-slate-400 text-[12.5px] bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No {specialty} doctors or open slots are available on {date}. Please pick another date.
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {doctors.map(({ doctor, slots: doctorSlots }) => (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" key={doctor.doctor_id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0078d4]/10 text-[12px] font-bold text-[#0078d4]">
                        <UserRound size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-[13.5px] text-slate-800">{doctor.doctor_name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {doctor.specialty} · Room: {doctor.room || "OPD-04"} · Fee: ₹{doctor.opd_fee || 500}
                        </div>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10.5px] font-bold">
                      Available
                    </span>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                    {doctorSlots.map((slot, slotIndex) => {
                      const selected = selectedSlot?.doctor_id === slot.doctor_id && selectedSlot?.scheduled_start === slot.scheduled_start;
                      return (
                        <button
                          type="button"
                          className={`py-2 px-3 rounded-xl text-[12px] font-bold border transition ${
                            selected
                              ? "bg-[#0078d4] border-[#0078d4] text-white shadow-sm"
                              : "border-slate-200 hover:border-[#0078d4] text-slate-700 bg-slate-50/60"
                          }`}
                          key={`${slot.doctor_id}-${slot.scheduled_start}-${slot.scheduled_end}-${slotIndex}`}
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {timeLabel(slot.scheduled_start)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button className="flex items-center gap-1 text-[12.5px] font-bold text-slate-500 hover:text-slate-800" onClick={() => setStep("date")}>
                <ArrowLeft size={14} /> Change Date
              </button>
              <button
                className="rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] px-6 py-2.5 shadow-sm disabled:opacity-50 transition"
                disabled={!selectedSlot}
                onClick={() => setStep("payment")}
              >
                Continue to Payment ›
              </button>
            </div>
          </div>
        )}

        {step === "payment" && selectedSlot && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-800">Review & Payment</h3>
              <p className="text-[12px] text-slate-400 mt-0.5">Confirm your consultation booking details and complete payment.</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 text-[12px]">
              <Detail label="Doctor" value={selectedSlot.doctor_name} />
              <Detail label="Specialty" value={selectedSlot.specialty} />
              <Detail label="Date" value={selectedSlot.scheduled_start.slice(0, 10)} />
              <Detail label="Time Slot" value={timeLabel(selectedSlot.scheduled_start)} />
              <Detail label="Location" value={selectedSlot.room || "OPD Consultation Room 4"} />
              <Detail label="Consultation Fee" value={selectedSlot.opd_fee != null ? `₹${Number(selectedSlot.opd_fee).toFixed(2)}` : "₹500.00"} />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Billing Email (Optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[13px] text-slate-700 outline-none focus:border-[#0078d4] focus:bg-white"
                type="email"
                autoComplete="email"
                value={checkoutEmail}
                onChange={(event) => setCheckoutEmail(event.target.value)}
                placeholder="patient@example.com"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button className="flex items-center gap-1 text-[12.5px] font-bold text-slate-500 hover:text-slate-800" disabled={busy} onClick={() => setStep("slots")}>
                <ArrowLeft size={14} /> Back
              </button>
              <button
                className="flex items-center gap-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] px-6 py-2.5 shadow-sm disabled:opacity-50 transition"
                disabled={busy || selectedSlot.opd_fee == null || (checkoutEmail.trim() !== "" && !/^\S+@\S+\.\S+$/.test(checkoutEmail.trim()))}
                onClick={payAndBook}
              >
                <CreditCard size={16} /> {busy ? "Opening Checkout..." : `Pay ₹${Number(selectedSlot.opd_fee || 500).toFixed(2)} & Confirm`}
              </button>
            </div>
          </div>
        )}

        {step === "details" && appointment && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="mx-auto text-emerald-600" size={36} />
              <h3 className="text-[16px] font-extrabold text-emerald-900">Appointment Confirmed!</h3>
              <p className="text-[12.5px] text-emerald-800">Your consultation is scheduled and stored in your medical chart.</p>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 grid gap-3 sm:grid-cols-2 text-[12px]">
              <Detail label="Doctor" value={appointment.doctor?.name || selectedSlot?.doctor_name} />
              <Detail label="Specialty" value={appointment.specialty || selectedSlot?.specialty} />
              <Detail label="Reason for visit" value={appointment.reason || reason} />
              <Detail label="Date" value={appointment.scheduled_start?.slice(0, 10)} />
              <Detail label="Time" value={timeLabel(appointment.scheduled_start)} />
              <Detail label="Room / Floor" value={[appointment.doctor?.room, appointment.doctor?.floor].filter(Boolean).join(" / ") || "Room 4, Floor 2"} />
              <Detail label="Payment" value="Paid (Confirmed)" />
              <Detail label="Status" value={appointment.status || "CONFIRMED"} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button className="py-2 px-4 rounded-lg border border-red-200 text-red-600 font-bold text-[12px] hover:bg-red-50" disabled={busy} onClick={cancelAndReturn}>
                Cancel Appointment
              </button>
              <button className="py-2.5 px-6 rounded-xl bg-[#0078d4] text-white font-bold text-[13px] shadow-sm hover:bg-[#0a6ec2]" onClick={() => nav(redirect, { replace: true })}>
                Go to Patient Dashboard
              </button>
            </div>
          </div>
        )}
      </section>

      {showPaymentDone && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl border border-slate-200 space-y-3">
            <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
            <h3 className="text-[17px] font-extrabold text-slate-800">Payment Successful</h3>
            <p className="text-[12.5px] text-slate-500">Your appointment has been booked successfully.</p>
            <button
              className="w-full py-2.5 rounded-xl bg-[#0078d4] text-white font-bold text-[13px] shadow-sm hover:bg-[#0a6ec2]"
              onClick={() => {
                setShowPaymentDone(false);
                setStep("details");
              }}
            >
              View Appointment Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="p-2.5 rounded-lg bg-white border border-slate-100 flex flex-col">
      <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
      <b className="text-slate-800 text-[12.5px] mt-0.5">{value || "Not available"}</b>
    </div>
  );
}
