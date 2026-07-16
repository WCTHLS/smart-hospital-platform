import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, CheckCircle2, Clock, CreditCard, PackageCheck, AlertCircle } from "lucide-react";
import { Card, Tag } from "../../../components/ui";
import { api } from "../../../lib/api";

interface PrescriptionSlipProps {
  encounterId: string;
  prescription?: any;
  title?: string;
}

export default function PrescriptionSlip({ 
  encounterId, 
  prescription,
  title,
}: PrescriptionSlipProps) {
  const qc = useQueryClient();
  const [showPayModal, setShowPayModal] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  const payMutation = useMutation({
    mutationFn: (rxId: string) => api.payPrescription(rxId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal-encounter"] });
      qc.invalidateQueries({ queryKey: ["p360"] });
      setPaymentDone(true);
      setTimeout(() => {
        setPaymentDone(false);
        setShowPayModal(false);
      }, 1500);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to make payment");
    }
  });

  if (!prescription || !prescription.items || prescription.items.length === 0) {
    return (
      <Card className="space-y-3 animate-in fade-in duration-300">
        <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
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

  const handlePay = () => {
    payMutation.mutate(prescription.rx_id);
  };

  const getStatusTone = (status: string) => {
    switch (status) {
      case "DISPENSED": return "green";
      case "PREPAID": return "blue";
      case "EXPIRED": return "red";
      default: return "amber";
    }
  };

  const pickupToken = prescription.pickup_token;

  return (
    <Card className="space-y-4 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
          <Stethoscope size={16} className="text-[var(--cyan)]" /> {title || "E-Prescription Slip"}
        </h4>
        <Tag tone={getStatusTone(prescription.status)}>{prescription.status}</Tag>
      </div>

      <div 
        className="border border-dashed p-4 rounded-2xl space-y-3 relative overflow-hidden"
        style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}
      >
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-mint/5 rounded-full blur-2xl" />

        <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--glass-border)" }}>
          <div>
            <div className="text-[11px] text-[var(--dim)] uppercase font-semibold">PRESCRIPTION ID</div>
            <div className="text-xs font-bold text-white">{prescription.rx_id}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-xs text-left">
            <thead>
              <tr style={{ color: "var(--dim)" }} className="border-b border-[var(--glass-border)]">
                <th className="pb-1.5">Medicine Name</th>
                <th className="pb-1.5">Dosage</th>
                <th className="pb-1.5">Frequency</th>
                <th className="pb-1.5">Duration</th>
                <th className="pb-1.5 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => {
                return (
                  <tr key={i} className="border-b last:border-0 border-[var(--glass-border)] text-slate-300">
                    <td className="py-2.5 font-bold text-white">{item.drug_name}</td>
                    <td className="py-2.5" style={{ color: "var(--ink)" }}>{item.dose || "Not recorded"}</td>
                    <td className="py-2.5" style={{ color: "var(--muted)" }}>{item.frequency || "Not recorded"}</td>
                    <td className="py-2.5 font-medium" style={{ color: "var(--ink)" }}>{item.duration_days != null ? `${item.duration_days} days` : "Not recorded"}</td>
                    <td className="py-2.5 text-right font-medium text-[var(--cyan)]">{item.quantity || 1}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action and Tracking banners */}
      {prescription.status === "APPROVED" && (
        <div className="pt-2 flex justify-end">
          <button
            onClick={() => setShowPayModal(true)}
            className="btn font-bold text-xs px-6 py-2.5 flex items-center gap-1.5"
            style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
          >
            <CreditCard size={14} /> ⚡ Pay &amp; Collect Online
          </button>
        </div>
      )}

      {prescription.status === "PREPAID" && pickupToken && (
        <div className="mt-3 p-3.5 rounded-xl border space-y-3" style={{
          background: pickupToken.status === "READY" ? "rgba(16,185,129,0.06)" : "rgba(52,225,232,0.06)",
          borderColor: pickupToken.status === "READY" ? "rgba(16,185,129,0.2)" : "rgba(52,225,232,0.2)"
        }}>
          {pickupToken.status === "WAITING" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-cyan-300">
                <Clock size={16} className="shrink-0 mt-0.5 animate-pulse text-[var(--cyan)]" />
                <div>
                  <strong className="text-white block mb-0.5">⏳ Packaging in Progress</strong>
                  The pharmacy is currently packing your medicines. Please wait at the pickup point.
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2.5 rounded-xl text-[11px] font-medium border border-cyan-500/10">
                <div>
                  <span className="text-[var(--dim)] block text-[9px] uppercase tracking-wider">Pickup Counter</span>
                  <span className="text-slate-100 font-bold">{pickupToken.room || "Pharmacy Counter 3"}</span>
                </div>
                <div>
                  <span className="text-[var(--dim)] block text-[9px] uppercase tracking-wider">Floor Location</span>
                  <span className="text-slate-100 font-bold">{pickupToken.floor || "Ground Floor"}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[var(--dim)] text-[9px] uppercase tracking-wider">Your Pickup Token</span>
                  <span className="text-white font-black text-sm font-mono tracking-wider">{pickupToken.number}</span>
                </div>
              </div>
            </div>
          )}

          {pickupToken.status === "READY" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-emerald-300">
                <PackageCheck size={18} className="shrink-0 text-emerald-400" />
                <div>
                  <strong className="text-white block mb-0.5">🎉 Medicines Packed &amp; Ready!</strong>
                  Please walk to the pharmacy pickup point to collect your packed bag.
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 bg-slate-950/40 p-2.5 rounded-xl text-[11px] font-medium border border-emerald-500/10">
                <div>
                  <span className="text-[var(--dim)] block text-[9px] uppercase tracking-wider">Pickup Counter</span>
                  <span className="text-slate-100 font-bold">{pickupToken.room || "Pharmacy Counter 3"}</span>
                </div>
                <div>
                  <span className="text-[var(--dim)] block text-[9px] uppercase tracking-wider">Floor Location</span>
                  <span className="text-slate-100 font-bold">{pickupToken.floor || "Ground Floor"}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[var(--dim)] text-[9px] uppercase tracking-wider">Show Token at Counter</span>
                  <span className="text-white font-black text-sm font-mono tracking-wider">{pickupToken.number}</span>
                </div>
              </div>
            </div>
          )}

          {pickupToken.status === "COMPLETED" && (
            <div className="flex items-center gap-2 text-xs text-[var(--mint)]">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Prescription medicines successfully collected by patient.</span>
            </div>
          )}
        </div>
      )}

      {/* Online Payment Modal */}
      {showPayModal && createPortal(
        <div className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card 
            className="w-full max-w-md space-y-4 relative overflow-hidden animate-in zoom-in-95 duration-200 text-xs"
            style={{ 
              background: "#0c1524", 
              border: "1px solid rgba(52, 225, 232, 0.2)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)"
            }}
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                💳 Online Medication Payment
              </h3>
              <button 
                onClick={() => setShowPayModal(false)}
                className="text-[var(--dim)] hover:text-white transition text-sm font-semibold"
                disabled={payMutation.isPending}
              >
                ✕
              </button>
            </div>

            {paymentDone ? (
              <div className="py-8 text-center space-y-2 animate-in zoom-in-95">
                <CheckCircle2 size={40} className="mx-auto text-emerald-400" />
                <h4 className="font-bold text-white text-sm">Payment Successful!</h4>
                <p className="text-[var(--dim)]">Generating pickup token and counter routing info...</p>
              </div>
            ) : (
              <>
                {/* Cost Breakdown */}
                <div className="space-y-2 bg-white/[0.01] p-3 border border-white/5 rounded-xl">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] pb-1 border-b border-white/5">
                    Order Summary
                  </div>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {items.map((item: any, idx: number) => {
                      const qty = item.quantity || 1;
                      const price = item.unit_price || 10.0;
                      return (
                        <div key={idx} className="flex justify-between items-center text-slate-300">
                          <div>
                            <span className="font-bold text-white">{item.drug_name}</span>
                            <span className="text-[10px] text-[var(--dim)] ml-1.5">Qty: {qty}</span>
                          </div>
                          <span>₹{(qty * price).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-white/5 pt-2 mt-2 space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST (18%)</span>
                      <span>₹{gst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-white border-t border-dashed border-white/5 pt-1.5 mt-1 text-xs">
                      <span>Total Amount</span>
                      <span className="text-[var(--cyan)]">₹{total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl flex gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <strong>Skip the Queue:</strong> Paying online pre-orders your packaging so the pharmacy will have it packaged and waiting at the counter.
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                  <button
                    onClick={() => setShowPayModal(false)}
                    disabled={payMutation.isPending}
                    className="btn ghost font-bold text-xs px-4"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={payMutation.isPending}
                    className="btn font-bold text-xs px-6 flex items-center gap-1.5"
                    style={{ background: "linear-gradient(135deg, var(--mint), #059669)", color: "#011c10", border: "none" }}
                  >
                    {payMutation.isPending ? "Processing..." : `Pay ₹${total.toFixed(2)} & Pre-Order`}
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
