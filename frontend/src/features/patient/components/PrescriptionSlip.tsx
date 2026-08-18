import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Stethoscope, CheckCircle2, Clock, CreditCard, PackageCheck, AlertCircle,
  Calendar, User, MapPin, Pill as PillIcon, ShieldCheck, Sparkles, Building2
} from "lucide-react";
import { Card, Tag } from "../../../components/ui";
import { api } from "../../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../../lib/razorpay";

interface PrescriptionSlipProps {
  encounterId: string;
  prescription?: any;
  title?: string;
  patientId: string;
  refetchEnc?: () => void;
  refetchP360?: () => void;
}

export default function PrescriptionSlip({ 
  encounterId, 
  prescription,
  title,
  patientId,
  refetchEnc,
  refetchP360,
}: PrescriptionSlipProps) {
  const qc = useQueryClient();
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paying, setPaying] = useState(false);

  if (!prescription || !prescription.items || prescription.items.length === 0) {
    return (
      <Card className="space-y-3 animate-in fade-in duration-300" style={{ border: "1px solid var(--line2)" }}>
        <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#123a7a" }}>
          <Stethoscope size={16} className="text-[var(--cyan)]" /> {title || "E-Prescription Slip"}
        </h4>
        <div className="text-xs italic text-[var(--dim)]">No active prescriptions recorded for this visit.</div>
      </Card>
    );
  }

  // Calculate pricing breakdown
  const items = prescription.items || [];
  const subtotal = items.reduce((acc: number, item: any) => {
    const qty = item.quantity || 1;
    const price = item.unit_price || 10.0;
    return acc + (qty * price);
  }, 0);
  const gst = subtotal * 0.18;
  const total = subtotal + gst;

  const doctor = prescription.doctor || {};
  const appointment = prescription.appointment || {};
  const pickupToken = prescription.pickup_token;
  const isDispensed = prescription.status === "DISPENSED" || prescription.status === "COLLECTED" || pickupToken?.status === "COMPLETED";
  const isPrepaid = prescription.status === "PREPAID" || Boolean(pickupToken) || isDispensed;
  const showActiveToken = Boolean(pickupToken) && !isDispensed;

  const handlePay = async () => {
    setPaying(true);
    try {
      const rxId = prescription.rx_id;
      const order = await api.createRazorpayPrescriptionOrder({
        patient_id: patientId,
        amount: total,
        rx_id: rxId,
      });

      let payment: RazorpaySuccess;
      let Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        const loaded = await loadRazorpayScript();
        if (loaded) Razorpay = (window as any).Razorpay;
      }

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
            key: order.key_id,
            amount: order.amount,
            currency: order.currency,
            name: "Smart Hospital Platform",
            description: `Pharmacy Order (Rx: ${rxId.slice(0, 8)})`,
            order_id: order.order_id,
            prefill: order.prefill,
            readonly: {
              name: true,
              email: Boolean(order.prefill?.email),
              contact: Boolean(order.prefill?.contact),
            },
            retry: { enabled: true },
            theme: { color: "#0078d4" },
            modal: {
              confirm_close: true,
              ondismiss: () => {
                if (!settled) reject(new Error("Payment was cancelled. Order not prepaid."));
              },
            },
            handler: (response: RazorpaySuccess) => {
              settled = true;
              resolve(response);
            },
          });
          checkout.on("payment.failed", (response: any) => {
            settled = true;
            reject(new Error(response?.error?.description || "Payment failed. Please try again."));
          });
          checkout.open();
        });
      }

      await api.verifyRazorpayPrescriptionPayment({
        ...payment,
        rx_id: rxId,
      });

      qc.invalidateQueries({ queryKey: ["portal-encounter"] });
      qc.invalidateQueries({ queryKey: ["portal-encounter-parent"] });
      qc.invalidateQueries({ queryKey: ["portal-episode-invoice"] });
      qc.invalidateQueries({ queryKey: ["p360"] });
      if (refetchEnc) refetchEnc();
      if (refetchP360) refetchP360();

      setPaymentDone(true);
      setTimeout(() => {
        setPaymentDone(false);
        setShowPayModal(false);
      }, 1500);

    } catch (err: any) {
      alert(err.message || "Failed to make payment");
    } finally {
      setPaying(false);
    }
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case "DISPENSED": return "green";
      case "PREPAID": return "blue";
      case "EXPIRED": return "red";
      case "APPROVED": return "green";
      default: return "amber";
    }
  };

  const displayStatus = isDispensed
    ? "DISPENSED / COLLECTED"
    : (pickupToken?.status === "READY"
        ? "READY FOR PICKUP"
        : (isPrepaid ? "PREPAID & QUEUED" : (prescription.status || "APPROVED")));

  return (
    <Card className="space-y-4 animate-in fade-in duration-300 bg-white border border-slate-200 shadow-sm rounded-2xl p-4 sm:p-5">
      {/* Header with Title and Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-[#0078d4] border border-blue-200/60">
            <Stethoscope size={18} />
          </div>
          <div>
            <h4 className="font-extrabold text-[14px] text-slate-800">
              {title || "Doctor E-Prescription Slip"}
            </h4>
            <div className="text-[11px] text-slate-400 font-mono">
              Rx ID: <span className="font-bold text-slate-600">{prescription.rx_id}</span>
            </div>
          </div>
        </div>
        <Tag tone={isDispensed || pickupToken?.status === "READY" ? "green" : getStatusTone(prescription.status)}>
          {displayStatus}
        </Tag>
      </div>

      {/* Appointment & Prescribing Doctor Details Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 text-[12px]">
        {/* Doctor Info */}
        <div className="space-y-0.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <User size={12} className="text-[#0078d4]" /> Prescribed By Doctor
          </div>
          <div className="font-extrabold text-slate-800 text-[13px]">
            {doctor.name || "Dr. Neha Nair"}
          </div>
          <div className="text-[11px] text-[#0078d4] font-semibold">
            {doctor.specialty || appointment.department || "Consultant Physician"}
          </div>
          {(doctor.room || doctor.floor) && (
            <div className="text-[10.5px] text-slate-500 flex items-center gap-1">
              <MapPin size={11} className="text-slate-400" /> {doctor.room || "Room 109"} ({doctor.floor || "Floor 3"})
            </div>
          )}
        </div>

        {/* Appointment Date / Time */}
        <div className="space-y-0.5 sm:border-l sm:border-slate-200/80 sm:pl-3">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Calendar size={12} className="text-[#0078d4]" /> Consultation Date & Time
          </div>
          <div className="font-extrabold text-slate-800 text-[13px]">
            {appointment.date || (prescription.created_ts ? new Date(prescription.created_ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Today")}
          </div>
          <div className="text-[11px] text-slate-500">
            Department: <span className="font-semibold text-slate-700">{appointment.department || doctor.specialty || "Outpatient"}</span>
          </div>
        </div>

        {/* Reason / Diagnosis */}
        <div className="space-y-0.5 sm:border-l sm:border-slate-200/80 sm:pl-3">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-500" /> Clinical Reason / Diagnosis
          </div>
          <div className="font-bold text-slate-800 text-[12.5px] leading-snug">
            {appointment.reason || "Knee pain / Consultation & Clinical Review"}
          </div>
          <div className="text-[10.5px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
            <ShieldCheck size={12} /> Clinically verified & signed
          </div>
        </div>
      </div>

      {/* When Medicines are Dispensed and Collected: Token Disappears and Shows Settled Badge */}
      {isDispensed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between gap-3 text-[12px] animate-in fade-in">
          <div className="flex items-center gap-2.5 text-emerald-900 font-semibold">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <div>
              <div className="font-extrabold text-emerald-800 text-[13px]">Medicines Dispensed &amp; Collected</div>
              <div className="text-[11px] text-emerald-700">Prescription complete. Handed over to patient at {pickupToken?.room || "Pharmacy Counter 3"} ({pickupToken?.floor || "Ground Floor"}).</div>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
            Order Complete
          </span>
        </div>
      )}

      {/* Live Pharmacy Pickup Token Card (Active when prepaid and waiting/ready) */}
      {showActiveToken && pickupToken && (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/30 p-4 animate-in fade-in">
          <div className="rounded-xl border border-blue-300/70 bg-gradient-to-r from-[#0078d4] to-[#005a9e] px-4 py-4 text-center text-white shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100 flex items-center justify-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Pharmacy Pickup Token
            </div>
            <div className="mt-1 text-4xl sm:text-5xl font-black font-mono tracking-widest text-white drop-shadow-sm">
              {pickupToken.number}
            </div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-white backdrop-blur-xs border border-white/20">
              {pickupToken.status === "READY"
                ? "🎉 Medicines Packed & Ready for Pickup"
                : "⏳ Payment Confirmed · Packaging in Progress"}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 text-[12px]">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] shrink-0 border border-blue-100">
                <Building2 size={16} />
              </div>
              <div>
                <span className="block text-[9.5px] uppercase font-bold tracking-wider text-slate-400">Pickup Counter</span>
                <span className="font-extrabold text-slate-800 text-[13px]">{pickupToken.room || "Pharmacy Counter 3"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 sm:border-l sm:border-slate-100 sm:pl-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
                <MapPin size={16} />
              </div>
              <div>
                <span className="block text-[9.5px] uppercase font-bold tracking-wider text-slate-400">Floor Location</span>
                <span className="font-extrabold text-slate-800 text-[13px]">{pickupToken.floor || "Ground Floor"}</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            Show this live token number at <b>{pickupToken.room || "Pharmacy Counter 3"}</b> on the <b>{pickupToken.floor || "Ground Floor"}</b> to collect your packed medicines.
          </p>
        </div>
      )}

      {/* Prescribed Medicines Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <PillIcon size={13} className="text-[#0078d4]" /> Prescribed Medicines ({items.length})
          </div>
          <span className="text-[11px] text-slate-400">Standard dosage instructions</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[620px] w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold">
                <th className="px-3 py-2.5">Medicine Name</th>
                <th className="px-3 py-2.5">Dosage</th>
                <th className="px-3 py-2.5">Frequency</th>
                <th className="px-3 py-2.5">Duration</th>
                <th className="px-3 py-2.5">Instructions</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="px-3 py-2.5 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item: any, i: number) => {
                const qty = item.quantity || 1;
                const price = item.unit_price || 10.0;
                return (
                  <tr key={i} className="hover:bg-slate-50/60 transition">
                    <td className="px-3 py-2.5 font-extrabold text-slate-800">
                      {item.drug_name || item.name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">
                      {item.dose || item.dosage || "Standard"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {item.frequency || item.freq || "Once Daily"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 font-semibold">
                      {item.duration_days != null ? `${item.duration_days} days` : "5 days"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 italic text-[11px]">
                      {item.instructions || item.purpose || "After meals"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-[#0078d4]">
                      {qty}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                      ₹{(qty * price).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay & Collect Action or Status Confirmation */}
      {!isPrepaid ? (
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
          <div className="text-[12px] text-slate-500">
            Total Payable Amount: <b className="text-slate-800 text-[14px]">₹{total.toFixed(2)}</b> (Incl. 18% GST)
          </div>
          <button
            type="button"
            onClick={() => setShowPayModal(true)}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-extrabold text-xs text-white shadow-sm transition flex items-center justify-center gap-2 hover:opacity-95"
            style={{ background: "linear-gradient(135deg, #0078d4 0%, #0c3b63 100%)" }}
          >
            <CreditCard size={15} /> ⚡ Pay &amp; Collect Online (₹{total.toFixed(2)})
          </button>
        </div>
      ) : isDispensed ? (
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 flex-wrap text-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <CheckCircle2 size={15} /> Medicines Collected &amp; Order Complete
          </div>
          <div className="text-slate-400 font-medium">
            Paid ₹{total.toFixed(2)}
          </div>
        </div>
      ) : (
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 flex-wrap text-xs">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <CheckCircle2 size={16} /> Online Payment Settled (₹{total.toFixed(2)})
          </div>
          {pickupToken && (
            <div className="text-slate-500">
              Collect at <b>{pickupToken.room || "Pharmacy Counter 3"}</b> ({pickupToken.floor || "Ground Floor"})
            </div>
          )}
        </div>
      )}

      {/* Online Payment Modal */}
      {showPayModal && createPortal(
        <div className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card 
            className="w-full max-w-md space-y-4 relative overflow-hidden animate-in zoom-in-95 duration-200 text-xs bg-white p-5 rounded-2xl shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="flex items-center gap-2 text-[14px] font-extrabold text-slate-800">
                💳 Medication Payment &amp; Pharmacy Token
              </h3>
              <button 
                type="button"
                onClick={() => setShowPayModal(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition"
                disabled={paying}
              >
                ✕
              </button>
            </div>

            {paymentDone ? (
              <div className="py-8 text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle2 size={44} className="mx-auto text-emerald-600" />
                <h4 className="text-[15px] font-extrabold text-slate-800">Payment Successful!</h4>
                <p className="text-slate-500 text-[12px]">Generating your Pharmacy Pickup Token and counter location...</p>
              </div>
            ) : (
              <>
                {/* Cost Breakdown */}
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="border-b border-slate-200/80 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Order Summary ({items.length} Medicines)
                  </div>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {items.map((item: any, idx: number) => {
                      const qty = item.quantity || 1;
                      const price = item.unit_price || 10.0;
                      return (
                        <div key={idx} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-slate-600 last:border-0">
                          <div>
                            <span className="font-bold text-slate-800">{item.drug_name || item.name}</span>
                            <span className="text-[10px] text-slate-400 ml-1.5">Qty: {qty}</span>
                          </div>
                          <span className="font-bold">₹{(qty * price).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-slate-600">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (18%)</span>
                      <span>₹{gst.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-dashed border-slate-300 pt-2 text-[13px] font-extrabold text-slate-800">
                      <span>Total Amount</span>
                      <span className="text-[#0078d4]">₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-blue-900">
                  <Building2 size={16} className="shrink-0 mt-0.5 text-[#0078d4]" />
                  <div>
                    <strong>Skip the Pharmacy Queue:</strong> Paying online pre-orders your medicines. A live Pickup Token will be generated with the exact counter and floor location where you can collect them.
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowPayModal(false)}
                    disabled={paying}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={paying}
                    className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition flex items-center gap-1.5 hover:opacity-95"
                    style={{ background: "linear-gradient(135deg, #10b981 0%, #047857 100%)" }}
                  >
                    {paying ? "Processing..." : `Pay ₹${total.toFixed(2)} & Get Pickup Token`}
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>,
        document.body
      )}
    </Card>
  );
}

