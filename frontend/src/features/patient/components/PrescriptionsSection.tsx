import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Pill as PillIcon,
  Stethoscope,
  Calendar,
  User,
  MapPin,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  CreditCard,
  Search,
  ChevronDown,
  ChevronUp,
  Download
} from "lucide-react";
import { Card, Tag } from "../../../components/ui";
import { api } from "../../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../../lib/razorpay";

export interface PrescriptionItem {
  rx_item_id?: string;
  drug_name?: string;
  name?: string;
  dose?: string;
  dosage?: string;
  frequency?: string;
  freq?: string;
  route?: string;
  duration_days?: number;
  instructions?: string;
  purpose?: string;
  quantity?: number;
  unit_price?: number;
}

export interface PrescriptionRecord {
  rx_id: string;
  encounter_id?: string;
  status?: string;
  created_ts?: string;
  approved_ts?: string;
  doctor?: {
    name?: string;
    specialty?: string;
    room?: string;
    floor?: string;
  } | null;
  appointment?: {
    appointment_id?: string;
    date?: string;
    reason?: string;
    department?: string;
  } | null;
  pickup_token?: {
    number?: string;
    status?: string;
    room?: string;
    floor?: string;
  } | null;
  items?: PrescriptionItem[];
}

interface PrescriptionsSectionProps {
  prescriptions?: PrescriptionRecord[];
  patientId: string;
  refetchP360?: () => void;
  refetchEnc?: () => void;
}

export default function PrescriptionsSection({
  prescriptions = [],
  patientId,
  refetchP360,
  refetchEnc,
}: PrescriptionsSectionProps) {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPastIds, setExpandedPastIds] = useState<Set<string>>(new Set());

  // Payment Modal States
  const [activePayRx, setActivePayRx] = useState<PrescriptionRecord | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  // Format date helper without time (Date only: e.g. Aug 18, 2026)
  const formatDateDisplay = (dateStr?: string, ts?: string) => {
    const raw = dateStr || ts;
    if (!raw) return "Recent Consultation";
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      // ignore
    }
    return dateStr || ts || "Recent Consultation";
  };

  // Sort prescriptions descending by date (latest first)
  const sortedPrescriptions: PrescriptionRecord[] = useMemo(() => {
    if (!Array.isArray(prescriptions)) return [];
    return [...prescriptions].sort((a, b) => {
      const tA = a.created_ts ? new Date(a.created_ts).getTime() : 0;
      const tB = b.created_ts ? new Date(b.created_ts).getTime() : 0;
      return tB - tA;
    });
  }, [prescriptions]);

  // Filter prescriptions by search query
  const filteredPrescriptions = useMemo(() => {
    if (!searchQuery.trim()) return sortedPrescriptions;
    const q = searchQuery.toLowerCase();
    return sortedPrescriptions.filter((rx) => {
      const docName = (rx.doctor?.name || "").toLowerCase();
      const docSpec = (rx.doctor?.specialty || "").toLowerCase();
      const reason = (rx.appointment?.reason || "").toLowerCase();
      const rxId = (rx.rx_id || "").toLowerCase();
      const dateStr = formatDateDisplay(rx.appointment?.date, rx.created_ts).toLowerCase();
      const drugMatches = (rx.items || []).some(
        (i) =>
          (i.drug_name || i.name || "").toLowerCase().includes(q) ||
          (i.instructions || i.purpose || "").toLowerCase().includes(q)
      );

      return (
        docName.includes(q) ||
        docSpec.includes(q) ||
        reason.includes(q) ||
        rxId.includes(q) ||
        dateStr.includes(q) ||
        drugMatches
      );
    });
  }, [sortedPrescriptions, searchQuery]);

  // Toggle expand/collapse for past prescriptions
  const togglePastExpand = (rxId: string) => {
    setExpandedPastIds((prev) => {
      const next = new Set(prev);
      if (next.has(rxId)) {
        next.delete(rxId);
      } else {
        next.add(rxId);
      }
      return next;
    });
  };

  // Handle Online Payment via Razorpay
  const handlePay = async (rx: PrescriptionRecord) => {
    const items = rx.items || [];
    const subtotal = items.reduce((acc, itm) => {
      const qty = itm.quantity || 1;
      const price = itm.unit_price || 10.0;
      return acc + qty * price;
    }, 0);
    const gst = subtotal * 0.18;
    const total = subtotal + gst;

    setPaying(true);
    try {
      const order = await api.createRazorpayPrescriptionOrder({
        patient_id: patientId,
        amount: total,
        rx_id: rx.rx_id,
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
            description: `Pharmacy Order (Rx: ${rx.rx_id.slice(0, 8)})`,
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
        rx_id: rx.rx_id,
      });

      qc.invalidateQueries({ queryKey: ["portal-encounter"] });
      qc.invalidateQueries({ queryKey: ["portal-p360"] });
      if (refetchEnc) refetchEnc();
      if (refetchP360) refetchP360();

      setPaymentDone(true);
      setTimeout(() => {
        setPaymentDone(false);
        setActivePayRx(null);
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Failed to make payment");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
        <div>
          <h3 className="text-[16px] font-extrabold text-slate-800 flex items-center gap-2">
            <PillIcon size={18} className="text-[#0078d4]" /> Prescriptions &amp; Medication Slips
          </h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Complete history of prescriptions issued by attending doctors, active pharmacy pickup tokens, and orders
          </p>
        </div>

        {/* Search input & Print Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search medicine, doctor, date..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-[12px] font-medium text-slate-800 placeholder:text-slate-400 focus:border-[#0078d4] focus:outline-none focus:ring-2 focus:ring-[#0078d4]/10 transition"
            />
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 text-[11.5px] font-bold text-[#0078d4] bg-blue-50 border border-blue-200/60 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition shrink-0"
          >
            <Download size={13} /> Print
          </button>
        </div>
      </div>

      {/* Prescriptions List */}
      {filteredPrescriptions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
          <PillIcon size={32} className="mx-auto text-slate-300 mb-2" />
          <h4 className="text-[13px] font-bold text-slate-700">No Prescriptions Found</h4>
          <p className="text-[11.5px] text-slate-400 mt-0.5">
            {searchQuery
              ? "No prescription records matching your search query."
              : "No doctor prescriptions recorded in your medical chart."}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredPrescriptions.map((rx, index) => {
            const isLatest = index === 0;
            const isExpanded = isLatest || expandedPastIds.has(rx.rx_id);
            const items = rx.items || [];
            const doc = rx.doctor;
            const appt = rx.appointment;
            const pickupToken = rx.pickup_token;
            const isDispensed =
              rx.status === "DISPENSED" ||
              rx.status === "COLLECTED" ||
              pickupToken?.status === "COMPLETED";
            const isPrepaid =
              rx.status === "PREPAID" || Boolean(pickupToken) || isDispensed;
            const showActiveToken = Boolean(pickupToken) && !isDispensed;

            const subtotal = items.reduce((acc, itm) => {
              const qty = itm.quantity || 1;
              const price = itm.unit_price || 10.0;
              return acc + qty * price;
            }, 0);
            const gst = subtotal * 0.18;
            const total = subtotal + gst;

            const dateStr = formatDateDisplay(appt?.date, rx.created_ts || rx.approved_ts);
            const healthConcern = appt?.reason || "Doctor Consultation & Clinical Assessment";
            const drugSummary = items.map((i) => i.drug_name || i.name).filter(Boolean).slice(0, 3).join(", ");

            return (
              <div
                key={rx.rx_id}
                className={`rounded-2xl border bg-white shadow-sm transition overflow-hidden ${
                  isLatest
                    ? "border-blue-300 ring-1 ring-blue-500/10"
                    : "border-slate-200/80 hover:border-slate-300"
                }`}
              >
                {/* 1. TOP CONTEXT HEADER BAR */}
                <div
                  onClick={() => !isLatest && togglePastExpand(rx.rx_id)}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                    !isLatest ? "cursor-pointer select-none hover:bg-slate-50/70" : ""
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                    {/* Icon & Date (Date only, no time) */}
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] border border-blue-200/60 shrink-0">
                        <PillIcon size={16} />
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-slate-900 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                        <Calendar size={13} className="text-[#0078d4]" />
                        {dateStr}
                      </span>
                    </div>

                    {isLatest && (
                      <span className="rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                        ● Latest Prescription
                      </span>
                    )}

                    {/* Attending Doctor */}
                    {doc?.name && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-800 bg-blue-50/60 border border-blue-100 px-2.5 py-0.5 rounded-lg">
                        <Stethoscope size={13} className="text-[#0078d4]" />
                        {doc.name}
                        {doc.specialty && (
                          <span className="font-normal text-slate-500">({doc.specialty})</span>
                        )}
                      </span>
                    )}

                    {/* Health Concern in Top Bar */}
                    {healthConcern && (
                      <span className="text-[12px] text-slate-700 bg-amber-50/80 border border-amber-200/70 px-2.5 py-0.5 rounded-lg font-medium">
                        <b className="text-amber-900 font-bold">Concern:</b> {healthConcern}
                      </span>
                    )}

                    {/* Rx ID */}
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      Rx: <span className="font-bold text-slate-600">{rx.rx_id.slice(0, 10)}</span>
                    </span>
                  </div>

                  {/* Right Header Status / Expand Actions */}
                  <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
                    {/* Collapsed Drug Summary Preview */}
                    {!isExpanded && drugSummary && (
                      <span className="text-[11px] text-slate-500 truncate max-w-xs hidden md:inline">
                        <b className="text-slate-700">Meds:</b> {drugSummary}
                        {items.length > 3 && ` +${items.length - 3} more`}
                      </span>
                    )}

                    {/* Status Badge */}
                    {isDispensed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                        <CheckCircle2 size={12} /> Dispensed
                      </span>
                    ) : pickupToken?.status === "READY" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 border border-green-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                        🎉 Ready for Pickup
                      </span>
                    ) : isPrepaid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-[#0078d4] border border-blue-200 px-2.5 py-0.5 text-[10.5px] font-extrabold">
                        ● Prepaid &amp; Queued
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[10.5px] font-bold">
                        <ShieldCheck size={12} /> {rx.status || "Approved"}
                      </span>
                    )}

                    {/* Expand/Collapse Toggle Button for Past Prescriptions */}
                    {!isLatest && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePastExpand(rx.rx_id);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition ml-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={13} /> Collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown size={13} /> View Details
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. EXPANDED CONTENT BODY */}
                {isExpanded && (
                  <div className="p-4 pt-0 border-t border-slate-100/80 space-y-3.5 animate-in fade-in duration-150">
                    {/* Dispensed Order Complete Banner */}
                    {isDispensed && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between gap-3 text-[12px] mt-3">
                        <div className="flex items-center gap-2.5 text-emerald-900 font-semibold">
                          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                          <div>
                            <div className="font-extrabold text-emerald-800 text-[13px]">
                              Medicines Dispensed &amp; Collected
                            </div>
                            <div className="text-[11px] text-emerald-700">
                              Handed over at {pickupToken?.room || "Pharmacy Counter 3"} (
                              {pickupToken?.floor || "Ground Floor"}).
                            </div>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                          Order Complete
                        </span>
                      </div>
                    )}

                    {/* Active Live Pharmacy Pickup Token */}
                    {showActiveToken && pickupToken && (
                      <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/30 p-4 mt-3">
                        <div className="rounded-xl border border-blue-300/70 bg-gradient-to-r from-[#0078d4] to-[#005a9e] px-4 py-3 text-center text-white shadow-sm">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100 flex items-center justify-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live Pharmacy Pickup Token
                          </div>
                          <div className="mt-0.5 text-3xl sm:text-4xl font-black font-mono tracking-widest text-white drop-shadow-sm">
                            {pickupToken.number}
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-white backdrop-blur-xs border border-white/20">
                            {pickupToken.status === "READY"
                              ? "🎉 Medicines Packed & Ready for Pickup"
                              : "⏳ Payment Confirmed · Packaging in Progress"}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-[12px]">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] shrink-0 border border-blue-100">
                              <Building2 size={16} />
                            </div>
                            <div>
                              <span className="block text-[9.5px] uppercase font-bold tracking-wider text-slate-400">
                                Pickup Counter
                              </span>
                              <span className="font-extrabold text-slate-800 text-[13px]">
                                {pickupToken.room || "Pharmacy Counter 3"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5 sm:border-l sm:border-slate-100 sm:pl-3">
                            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100">
                              <MapPin size={16} />
                            </div>
                            <div>
                              <span className="block text-[9.5px] uppercase font-bold tracking-wider text-slate-400">
                                Floor Location
                              </span>
                              <span className="font-extrabold text-slate-800 text-[13px]">
                                {pickupToken.floor || "Ground Floor"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Prescribed Medicines Table */}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <PillIcon size={13} className="text-[#0078d4]" /> Prescribed Medicines ({items.length})
                        </div>
                        <span className="text-[11px] text-slate-400">Standard clinical dosage instructions</span>
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
                            {items.map((item, i) => {
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
                                    {item.duration_days != null
                                      ? `${item.duration_days} days`
                                      : "5 days"}
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
                          Total Payable Amount:{" "}
                          <b className="text-slate-800 text-[14px]">₹{total.toFixed(2)}</b> (Incl. 18% GST)
                        </div>
                        <button
                          type="button"
                          onClick={() => setActivePayRx(rx)}
                          className="w-full sm:w-auto px-6 py-2 rounded-xl font-extrabold text-xs text-white shadow-sm transition flex items-center justify-center gap-2 hover:opacity-95"
                          style={{
                            background: "linear-gradient(135deg, #0078d4 0%, #0c3b63 100%)",
                          }}
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
                            Collect at <b>{pickupToken.room || "Pharmacy Counter 3"}</b> (
                            {pickupToken.floor || "Ground Floor"})
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Online Payment Modal */}
      {activePayRx &&
        createPortal(
          <div className="modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-md space-y-4 relative overflow-hidden animate-in zoom-in-95 duration-200 text-xs bg-white p-5 rounded-2xl shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] border border-blue-200/60">
                    <CreditCard size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[14px] text-slate-900">
                      Prescription Payment Gateway
                    </h3>
                    <div className="text-[10.5px] text-slate-400 font-mono">
                      Rx: {activePayRx.rx_id}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !paying && setActivePayRx(null)}
                  className="h-7 w-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {paymentDone ? (
                <div className="py-8 text-center space-y-2 animate-in zoom-in-90">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="font-black text-[16px] text-slate-900">Payment Successful!</h4>
                  <p className="text-slate-500 text-[11.5px]">
                    Your pharmacy pickup token is now active.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 p-3.5 space-y-2 border border-slate-100 text-[12px]">
                    <div className="flex justify-between text-slate-600">
                      <span>Doctor Consultation:</span>
                      <span className="font-bold text-slate-800">
                        {activePayRx.doctor?.name || "Consultant Clinician"}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Prescribed Medicines:</span>
                      <span className="font-bold text-slate-800">
                        {activePayRx.items?.length || 0} Items
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 flex justify-between text-[13px] font-extrabold text-slate-900">
                      <span>Total Payable:</span>
                      <span className="text-[#0078d4]">
                        ₹
                        {(
                          (activePayRx.items || []).reduce((acc, itm) => {
                            const qty = itm.quantity || 1;
                            const price = itm.unit_price || 10.0;
                            return acc + qty * price;
                          }, 0) * 1.18
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActivePayRx(null)}
                      disabled={paying}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePay(activePayRx)}
                      disabled={paying}
                      className="flex-1 py-2.5 rounded-xl font-extrabold text-white transition flex items-center justify-center gap-2 hover:opacity-95 shadow-sm"
                      style={{
                        background: "linear-gradient(135deg, #0078d4 0%, #0c3b63 100%)",
                      }}
                    >
                      {paying ? (
                        <>
                          <span className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing...
                        </>
                      ) : (
                        "Confirm & Pay"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>,
          document.body
        )}
    </div>
  );
}
