import React, { useState } from "react";
import {
  Receipt,
  User,
  Calendar,
  Sparkles,
  Download,
  CreditCard,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  Pill as PillIcon,
  FlaskConical,
  Stethoscope,
  FileText,
  RefreshCw,
  X,
  Eye,
  FileCheck,
} from "lucide-react";
import { createPortal } from "react-dom";
import { api } from "../../../lib/api";

export interface BillItem {
  line_id?: string;
  category: string;
  description: string;
  amount: number;
  quantity: number;
  total: number;
  status?: string;
  is_paid?: boolean;
}

export interface BillData {
  bill_id: string;
  invoice_id: string;
  bill_no: string;
  encounter_id: string;
  status: "Paid" | "Unpaid" | string;
  is_paid?: boolean;
  date: string;
  billing_date: string;
  doctor: {
    name: string;
    specialty: string;
    room?: string;
    floor?: string;
  };
  appointment: {
    appointment_id?: string;
    date: string;
    reason: string;
    department: string;
    visit_type?: string;
    status?: string;
    location?: string;
  };
  subtotal: number;
  tax: number;
  total: number;
  consultation_amt?: number;
  lab_amt?: number;
  pharmacy_amt?: number;
  due_amount: number;
  paid_amount: number;
  balance: number;
  lines: BillItem[];
  created_ts?: string;
}

interface BillingSectionProps {
  bills: BillData[];
  onPaymentSuccess?: () => void;
}

export const BillingSection: React.FC<BillingSectionProps> = ({
  bills,
  onPaymentSuccess,
}) => {
  const [isLatestExpanded, setIsLatestExpanded] = useState<boolean>(true);
  const [selectedBillForModal, setSelectedBillForModal] = useState<BillData | null>(null);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [paySuccessBillId, setPaySuccessBillId] = useState<string | null>(null);

  const latestBill = bills && bills.length > 0 ? bills[0] : null;

  const handlePayBill = async (invoiceId: string) => {
    setPayingBillId(invoiceId);
    try {
      await api.pay(invoiceId, "UPI");
      setPaySuccessBillId(invoiceId);
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
      setTimeout(() => {
        setPaySuccessBillId(null);
      }, 2000);
    } catch (err: any) {
      alert(err.message || "Failed to settle payment");
    } finally {
      setPayingBillId(null);
    }
  };

  const downloadInvoice = (bill: BillData) => {
    // Print/Download invoice
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }

    const linesHtml = (bill.lines || [])
      .map(
        (l) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${l.description}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${l.category}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹${l.amount.toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${l.quantity || 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">₹${(l.total || l.amount * (l.quantity || 1)).toFixed(2)}</td>
        </tr>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${bill.bill_no}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0078d4; padding-bottom: 20px; margin-bottom: 25px; }
            .hospital { font-size: 22px; font-weight: 800; color: #0078d4; }
            .title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .meta-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
            th { background: #f1f5f9; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #cbd5e1; }
            .totals { margin-left: auto; width: 300px; font-size: 14px; }
            .total-row { display: flex; justify-content: space-between; padding: 6px 0; }
            .grand-total { font-size: 16px; font-weight: 800; color: #0078d4; border-top: 2px solid #0078d4; padding-top: 10px; margin-top: 5px; }
            .status-badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; }
            .paid { background: #dcfce7; color: #166534; }
            .unpaid { background: #fee2e2; color: #991b1b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="hospital">Smart Hospital Platform</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 3px;">Official Tax Invoice & Receipt</div>
            </div>
            <div style="text-align: right;">
              <div class="title">INVOICE: ${bill.bill_no}</div>
              <div style="font-size: 12px; color: #64748b;">Date: ${bill.billing_date || bill.date}</div>
              <div style="margin-top: 6px;">
                <span class="status-badge ${bill.status === "Paid" ? "paid" : "unpaid"}">${bill.status.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div class="meta">
            <div class="meta-box">
              <strong style="color: #0078d4;">Appointment & Doctor</strong><br>
              <strong>Doctor:</strong> ${bill.doctor.name} (${bill.doctor.specialty})<br>
              <strong>Date:</strong> ${bill.appointment.date}<br>
              <strong>Reason:</strong> ${bill.appointment.reason}<br>
              <strong>Location:</strong> ${bill.appointment.location || "OPD Clinic"}
            </div>
            <div class="meta-box">
              <strong style="color: #0078d4;">Billing Summary</strong><br>
              <strong>Bill Number:</strong> ${bill.bill_no}<br>
              <strong>Encounter Ref:</strong> ${bill.encounter_id.slice(0, 13)}<br>
              <strong>Status:</strong> ${bill.status}<br>
              <strong>Amount Due:</strong> ₹${bill.due_amount.toFixed(2)}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Service Description</th>
                <th style="text-align: center;">Category</th>
                <th style="text-align: right;">Unit Rate</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${linesHtml}
            </tbody>
          </table>

          <div class="totals">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>₹${bill.subtotal.toFixed(2)}</span>
            </div>
            ${bill.tax > 0 ? `<div class="total-row"><span>GST (18%):</span><span>₹${bill.tax.toFixed(2)}</span></div>` : ""}
            <div class="total-row grand-total">
              <span>Total Amount:</span>
              <span>₹${bill.total.toFixed(2)}</span>
            </div>
            <div class="total-row" style="font-weight: bold; color: ${bill.status === "Paid" ? "#166534" : "#b91c1c"};">
              <span>Payment Status:</span>
              <span>${bill.status === "Paid" ? "PAID IN FULL" : `DUE: ₹${bill.due_amount.toFixed(2)}`}</span>
            </div>
          </div>

          <div style="margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 15px;">
            This is a computer-generated tax invoice. No physical signature required.
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* 1. LATEST APPOINTMENT BILLING (Expanded Hero Card) */}
      {latestBill && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition">
          {/* Top Bar Header */}
          <div className="p-4 sm:p-5 flex items-center justify-between gap-3 border-b border-slate-100/90">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#0078d4] border border-blue-200/60">
                <Receipt size={20} />
              </div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-extrabold text-[16px] text-slate-800 tracking-tight">
                  Latest Appointment Billing
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wide ${
                    latestBill.status === "Paid"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {latestBill.status}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="font-extrabold text-[20px] text-slate-800 font-mono tracking-tight">
                ₹{latestBill.total.toFixed(2)}
              </div>
              <button
                type="button"
                onClick={() => setIsLatestExpanded(!isLatestExpanded)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition"
                aria-label="Toggle bill details"
              >
                {isLatestExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>
          </div>

          {/* 3-Column Content Body */}
          {isLatestExpanded && (
            <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
              {/* Column 1: Appointment Details */}
              <div className="space-y-4 lg:pr-4">
                <h4 className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
                  Appointment Details
                </h4>

                <div className="space-y-3 text-[13px]">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-[#0078d4] shrink-0 mt-0.5">
                      <User size={15} />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Attending Doctor</span>
                      <span className="font-bold text-slate-800 text-[13.5px]">{latestBill.doctor.name}</span>
                      <span className="block text-[11.5px] text-[#0078d4] font-semibold">{latestBill.doctor.specialty}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-[#0078d4] shrink-0 mt-0.5">
                      <Calendar size={15} />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Appointment Date</span>
                      <span className="font-semibold text-slate-700">{latestBill.appointment.date || latestBill.date}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-[#0078d4] shrink-0 mt-0.5">
                      <MapPin size={15} />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Location</span>
                      <span className="font-semibold text-slate-700">{latestBill.appointment.location || `${latestBill.doctor.room || "Room 109"} (${latestBill.doctor.floor || "Floor 3"})`}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-blue-50 text-[#0078d4] shrink-0 mt-0.5">
                      <FileText size={15} />
                    </div>
                    <div>
                      <span className="block text-[11px] text-slate-400 font-medium">Visit Type / Reason</span>
                      <span className="font-medium text-slate-700">{latestBill.appointment.reason || latestBill.appointment.visit_type || "Consultation"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Bill Summary */}
              <div className="space-y-3 pt-4 lg:pt-0 lg:px-4">
                <h4 className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
                  Bill Summary
                </h4>

                <div className="space-y-2 text-[12.5px]">
                  {latestBill.lines && latestBill.lines.length > 0 ? (
                    latestBill.lines.map((line, idx) => (
                      <div key={line.line_id || idx} className="flex items-center justify-between text-slate-600">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="truncate max-w-[170px]">{line.description}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              line.status === "Paid" || line.is_paid
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {line.status || (line.is_paid ? "Paid" : "Unpaid")}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-800 shrink-0">
                          ₹{(line.total || line.amount * (line.quantity || 1)).toFixed(2)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Consultation Fee</span>
                      <span className="font-mono font-semibold text-slate-800">₹{latestBill.total.toFixed(2)}</span>
                    </div>
                  )}

                  {latestBill.paid_amount > 0 && latestBill.due_amount > 0 && (
                    <div className="flex items-center justify-between text-emerald-600 text-[11.5px] pt-1 border-t border-slate-100">
                      <span>Paid Online (Consultation/Meds)</span>
                      <span className="font-mono font-bold">-₹{latestBill.paid_amount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between font-extrabold text-[13.5px] text-slate-800">
                    <span>Total Amount</span>
                    <span className="font-mono text-[#0078d4] text-[15px]">₹{latestBill.total.toFixed(2)}</span>
                  </div>

                  {latestBill.due_amount > 0 && (
                    <div className="flex items-center justify-between font-extrabold text-[12.5px] text-red-600">
                      <span>Amount Due:</span>
                      <span className="font-mono text-[14px]">₹{latestBill.due_amount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Bill Information & Actions */}
              <div className="space-y-3 pt-4 lg:pt-0 lg:pl-4 flex flex-col justify-between">
                <div className="space-y-2.5 text-[12.5px]">
                  <h4 className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
                    Bill Information
                  </h4>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11.5px]">Bill No.</span>
                    <span className="font-mono font-bold text-slate-700 text-[12px]">{latestBill.bill_no}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11.5px]">Billing Date</span>
                    <span className="font-medium text-slate-700">{latestBill.billing_date || latestBill.date}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11.5px]">Payment Status</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10.5px] font-extrabold uppercase ${
                        latestBill.status === "Paid"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {latestBill.status}
                    </span>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  {latestBill.status !== "Paid" && latestBill.due_amount > 0 ? (
                    <button
                      type="button"
                      disabled={payingBillId === latestBill.invoice_id}
                      onClick={() => handlePayBill(latestBill.invoice_id)}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-extrabold text-[12.5px] shadow-sm transition flex items-center justify-center gap-2"
                    >
                      {payingBillId === latestBill.invoice_id ? (
                        <RefreshCw className="animate-spin" size={15} />
                      ) : (
                        <CreditCard size={15} />
                      )}
                      {payingBillId === latestBill.invoice_id
                        ? "Processing Payment..."
                        : paySuccessBillId === latestBill.invoice_id
                        ? "Payment Complete!"
                        : `Pay Now (₹${latestBill.due_amount.toFixed(2)})`}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => downloadInvoice(latestBill)}
                    className="w-full py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[12px] transition flex items-center justify-center gap-1.5"
                  >
                    <Download size={13} className="text-[#0078d4]" /> Download Invoice
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. ALL BILLS TABLE (Clean list matching reference UI) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100">
          <h3 className="font-extrabold text-[15px] text-slate-800 tracking-tight">
            All Bills
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <th className="px-4 py-3">Bill No.</th>
                <th className="px-4 py-3">Appointment Details</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Attending Doctor</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills && bills.length > 0 ? (
                bills.map((bill) => (
                  <tr key={bill.invoice_id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-700 text-[11.5px]">
                      {bill.bill_no}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800 text-[12.5px]">
                        {bill.appointment.date || bill.date}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                        {bill.appointment.reason || "General Consultation"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 font-medium">
                      {bill.billing_date || bill.date}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-800 text-[12.5px]">
                        {bill.doctor.name}
                      </div>
                      <div className="text-[11px] text-[#0078d4] font-semibold">
                        {bill.doctor.specialty}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-extrabold font-mono text-slate-800 text-[13px]">
                      ₹{bill.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[10.5px] font-extrabold uppercase ${
                          bill.status === "Paid"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {bill.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedBillForModal(bill)}
                          className="px-3 py-1 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadInvoice(bill)}
                          title="Download Invoice PDF"
                          className="p-1 rounded-lg hover:bg-blue-50 text-[#0078d4] transition"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    No bills recorded in your account.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ITEM DETAILS VIEW MODAL (When clicking "View" button) */}
      {selectedBillForModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-5 animate-in zoom-in-95 duration-200 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-[#0078d4]">
                    <Receipt size={16} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[14px] text-slate-800">
                      Invoice Details: {selectedBillForModal.bill_no}
                    </h3>
                    <div className="text-[11px] text-slate-400">
                      Billing Date: {selectedBillForModal.billing_date || selectedBillForModal.date}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBillForModal(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11.5px]">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Doctor</span>
                  <span className="font-bold text-slate-800">{selectedBillForModal.doctor.name}</span>
                  <span className="block text-[#0078d4]">{selectedBillForModal.doctor.specialty}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Appointment</span>
                  <span className="font-bold text-slate-800">{selectedBillForModal.appointment.date || selectedBillForModal.date}</span>
                  <span className="block text-slate-500 truncate">{selectedBillForModal.appointment.reason}</span>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Itemized Charges
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10.5px]">
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedBillForModal.lines || []).map((l, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">{l.description}</td>
                          <td className="px-3 py-2 text-right font-mono text-slate-600">₹{l.amount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-bold text-[#0078d4]">{l.quantity || 1}</td>
                          <td className="px-3 py-2 text-right font-bold font-mono text-slate-800">
                            ₹{(l.total || l.amount * (l.quantity || 1)).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                l.status === "Paid" || l.is_paid
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {l.status || (l.is_paid ? "Paid" : "Unpaid")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total & Due Breakdown */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1 text-[12px]">
                <div className="flex items-center justify-between font-bold text-slate-700">
                  <span>Total Amount:</span>
                  <span className="font-mono text-[#0078d4] text-[14px]">₹{selectedBillForModal.total.toFixed(2)}</span>
                </div>
                {selectedBillForModal.paid_amount > 0 && selectedBillForModal.due_amount > 0 && (
                  <div className="flex items-center justify-between text-emerald-600 text-[11px]">
                    <span>Paid Online:</span>
                    <span className="font-mono font-bold">-₹{selectedBillForModal.paid_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-extrabold text-[13px] pt-1 border-t border-slate-200">
                  <span>Amount Due:</span>
                  <span
                    className={`font-mono text-[14px] ${
                      selectedBillForModal.due_amount <= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {selectedBillForModal.due_amount <= 0
                      ? "₹0.00 (Settled)"
                      : `₹${selectedBillForModal.due_amount.toFixed(2)}`}
                  </span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => downloadInvoice(selectedBillForModal)}
                  className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11.5px] transition flex items-center gap-1.5"
                >
                  <Download size={13} /> Download PDF
                </button>

                {selectedBillForModal.status !== "Paid" && selectedBillForModal.due_amount > 0 ? (
                  <button
                    type="button"
                    disabled={payingBillId === selectedBillForModal.invoice_id}
                    onClick={() => {
                      handlePayBill(selectedBillForModal.invoice_id);
                      setSelectedBillForModal(null);
                    }}
                    className="py-2 px-4 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-extrabold text-[12px] shadow-sm transition flex items-center gap-1.5"
                  >
                    <CreditCard size={14} /> Pay Now (₹{selectedBillForModal.due_amount.toFixed(2)})
                  </button>
                ) : (
                  <span className="text-[11.5px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    Paid &amp; Settled
                  </span>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
