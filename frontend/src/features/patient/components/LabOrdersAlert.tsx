import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Clock, 
  Calendar, 
  CheckCircle2, 
  ChevronRight, 
  AlertCircle, 
  ArrowLeft, 
  Upload, 
  FileText, 
  Check, 
  XCircle,
  FlaskConical,
  ScanLine
} from "lucide-react";
import { api } from "../../../lib/api";
import { loadRazorpayScript, type RazorpaySuccess } from "../../../lib/razorpay";

interface LabOrdersAlertProps {
  orders: any[];
  refetchLab?: () => void;
  refetchEnc?: () => void;
  refetchP360: () => void;
  patientId?: string;
  onNavigateToTab?: (tabName: string) => void;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const isSlotBooked = (timeStr: string) => {
  return ["01:00 PM", "03:00 PM"].includes(timeStr);
};

export default function LabOrdersAlert({ 
  orders = [], 
  refetchLab, 
  refetchEnc, 
  refetchP360,
  patientId: propPatientId,
  onNavigateToTab
}: LabOrdersAlertProps) {
  const [step, setStep] = useState<"alert" | "date" | "slots" | "payment" | "success">("alert");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);

  // Upload modal states
  const [uploadingOrder, setUploadingOrder] = useState<any | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadingBusy, setUploadingBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Filter pending orders (created or pending payment/sample)
  const pendingOrders = useMemo(() => {
    return (orders || []).filter((o: any) => {
      const st = (o.status || o.raw_status || "").toUpperCase();
      return st === "CREATED" || st === "PENDING" || st === "ACTION REQUIRED" || st === "ORDERED";
    });
  }, [orders]);

  const confirmedOrders = useMemo(() => {
    return (orders || []).filter((o: any) => {
      const st = (o.status || o.raw_status || "").toUpperCase();
      return st === "CONFIRMED" || st === "PREPAID" || st === "SAMPLE_COLLECTED";
    });
  }, [orders]);

  // Selected order IDs for booking/payment (default: all pending orders checked)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>(() => 
    pendingOrders.map((o: any) => o.lab_order_id || o.order_id || o.id).filter(Boolean)
  );

  // Keep selectedOrderIds in sync if pendingOrders change
  useMemo(() => {
    setSelectedOrderIds((prev) => {
      const validIds = pendingOrders.map((o: any) => o.lab_order_id || o.order_id || o.id).filter(Boolean);
      if (prev.length === 0 && validIds.length > 0) return validIds;
      return prev.filter(id => validIds.includes(id));
    });
  }, [pendingOrders]);

  const isPaid = confirmedOrders.length > 0;
  const currentStep = (pendingOrders.length === 0 && isPaid) ? "success" : step;

  if (pendingOrders.length === 0 && confirmedOrders.length === 0 && currentStep !== "success") return null;

  const selectedOrders = pendingOrders.filter((o: any) => 
    selectedOrderIds.includes(o.lab_order_id || o.order_id || o.id)
  );

  const totalCharges = selectedOrders.reduce(
    (sum: number, l: any) => sum + (Number(l.price) || (l.is_imaging ? 1200 : 350)), 
    0
  );

  const patientId = propPatientId || orders?.[0]?.patient_id || pendingOrders?.[0]?.patient_id;

  const { data: labSchedules } = useQuery({
    queryKey: ["patient-lab-schedules"],
    queryFn: () => api.listLabSchedules("ALL"),
  });

  const generateLabSlots = (dateVal: string) => {
    if (!dateVal) return [];
    const dObj = new Date(`${dateVal}T00:00:00`);
    const dayOfWeek = (dObj.getDay() + 6) % 7;
    const daySched = labSchedules?.find((s: any) => s.day_of_week === dayOfWeek);
    
    let startHour = 8;
    let startMin = 0;
    let endHour = 20;
    let endMin = 0;
    let intervalMins = 30;

    if (daySched) {
      if (!daySched.active) return [];
      if (daySched.start_time) {
        const [sh, sm] = daySched.start_time.split(":").map(Number);
        startHour = sh;
        startMin = sm || 0;
      }
      if (daySched.end_time) {
        const [eh, em] = daySched.end_time.split(":").map(Number);
        endHour = eh;
        endMin = em || 0;
      }
      if (daySched.slot_duration_minutes) {
        intervalMins = daySched.slot_duration_minutes;
      }
    }
    
    const slots: string[] = [];
    const now = new Date();
    const today = todayIso();
    const isToday = dateVal === today;

    let currentTotalMins = startHour * 60 + startMin;
    const endTotalMins = endHour * 60 + endMin;

    while (currentTotalMins < endTotalMins) {
      const h = Math.floor(currentTotalMins / 60);
      const m = currentTotalMins % 60;
      const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const slotDateTime = new Date(`${dateVal}T${timeStr}:00`);

      if (!isToday || slotDateTime > now) {
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        const displayStr = `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
        slots.push(displayStr);
      }
      currentTotalMins += intervalMins;
    }
    return slots;
  };

  const handleToggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => 
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  const handleConfirmBooking = async () => {
    if (!patientId) {
      alert("Error: patient context not loaded");
      return;
    }
    if (selectedOrderIds.length === 0) {
      alert("Please select at least one test to book and pay.");
      return;
    }

    // Ensure all IDs are strings
    const validStringIds = selectedOrderIds
      .map(id => String(id).trim())
      .filter(id => id.length > 0);

    if (validStringIds.length === 0) {
      alert("Invalid order IDs. Please try again.");
      return;
    }

    setBookingBusy(true);
    try {
      const order = await api.createRazorpayLabOrder({
        patient_id: patientId,
        amount: totalCharges,
        lab_order_ids: validStringIds,
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
            name: "ClinIQ Diagnostic Centre",
            description: `Diagnostic Tests: ${selectedOrders.map((o: any) => o.test || o.name).join(", ")}`,
            order_id: order.order_id,
            prefill: order.prefill,
            retry: { enabled: true },
            theme: { color: "#0078d4" },
            modal: {
              confirm_close: true,
              ondismiss: () => {
                if (!settled) reject(new Error("Payment was cancelled. Booking not confirmed."));
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

      await api.verifyRazorpayLabPayment({
        ...payment,
        lab_order_ids: validStringIds,
        booking_date: selectedDate || todayIso(),
        booking_slot: selectedSlot || "09:00 AM",
      });

      setStep("success");
      if (refetchLab) await refetchLab();
      if (refetchEnc) await refetchEnc();
      await refetchP360();
    } catch (err: any) {
      alert(err.message || "Failed to confirm booking.");
    } finally {
      setBookingBusy(false);
    }
  };

  const handleUploadReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingOrder || !uploadFile) {
      setUploadError("Please choose a file to upload.");
      return;
    }
    const orderId = uploadingOrder.lab_order_id || uploadingOrder.order_id || uploadingOrder.id;
    if (!orderId) {
      setUploadError("Missing order reference.");
      return;
    }

    setUploadingBusy(true);
    setUploadError("");
    try {
      await api.uploadLabOrderReport(orderId, uploadFile, uploadNotes || "External report uploaded by patient");
      setUploadSuccess(true);
      setTimeout(async () => {
        setUploadingOrder(null);
        setUploadFile(null);
        setUploadNotes("");
        setUploadSuccess(false);
        if (refetchLab) await refetchLab();
        if (refetchEnc) await refetchEnc();
        await refetchP360();
      }, 1200);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload report. Please try again.");
    } finally {
      setUploadingBusy(false);
    }
  };

  const availableSlots = selectedDate ? generateLabSlots(selectedDate) : [];

  return (
    <>
      <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm relative overflow-hidden transition">
        {/* STEP 1: Alert View with Checkboxes & Action Bar */}
        {currentStep === "alert" && (
          <div className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500 text-white font-bold text-xs">
                  ⚠️
                </span>
                <div>
                  <h4 className="font-extrabold text-[14px] text-amber-950">
                    Action Required: Diagnostic &amp; Lab Tests Ordered
                  </h4>
                  <p className="text-[11.5px] text-amber-800">
                    Your doctor has ordered the following tests. Select tests to book a hospital slot or upload external reports if already completed.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                <Clock size={12} className="animate-pulse text-amber-600" /> Pending Booking / Payment
              </span>
            </div>

            {/* List of Pending Orders with Checkbox, Category & Price */}
            <div className="space-y-2">
              {pendingOrders.map((o: any) => {
                const orderId = o.lab_order_id || o.order_id || o.id;
                const isChecked = selectedOrderIds.includes(orderId);
                const isScan = o.is_imaging || (o.panel && ["RADIOLOGY", "IMAGING", "SCANS"].includes(o.panel.toUpperCase()));
                const price = Number(o.price) || (isScan ? 1200 : 350);

                return (
                  <div
                    key={orderId}
                    className={`flex items-center justify-between gap-2.5 p-3 rounded-xl border transition ${
                      isChecked 
                        ? "bg-white border-[#0078d4]/40 shadow-xs" 
                        : "bg-white/60 border-slate-200 opacity-80"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleOrder(orderId)}
                        className="h-4 w-4 rounded border-slate-300 text-[#0078d4] focus:ring-[#0078d4] cursor-pointer"
                      />
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-[#0078d4] shrink-0">
                        {isScan ? <ScanLine size={16} /> : <FlaskConical size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[13px] text-slate-800 truncate">{o.test || o.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isScan ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {isScan ? "Imaging / Scan" : "Lab Test"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {o.panel || "Laboratory Investigation"} · Ordered on: {o.date || "Today"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-3">
                      <span className="text-[10px] text-slate-400 block font-semibold">TEST CHARGE</span>
                      <span className="font-extrabold text-[13.5px] text-slate-800">₹{price}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Total, Already Completed Upload Link & Book Slot Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-amber-200">
              <div className="text-[12.5px] text-amber-950 font-medium">
                Selected <b className="text-slate-900">{selectedOrderIds.length} of {pendingOrders.length}</b> tests · Estimated Total: <b className="text-[16px] text-slate-900 font-extrabold">₹{totalCharges}</b>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setUploadingOrder(pendingOrders[0] || null);
                    setUploadFile(null);
                    setUploadNotes("");
                    setUploadError("");
                  }}
                  className="text-[12px] font-bold text-[#0078d4] hover:underline flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg hover:bg-blue-50/70 border border-dashed border-[#0078d4]/30"
                >
                  <Upload size={13} /> Already completed tests? Upload reports
                </button>

                <button
                  type="button"
                  disabled={selectedOrderIds.length === 0}
                  onClick={() => setStep("date")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12.5px] px-5 py-2 shadow-sm transition disabled:opacity-50"
                >
                  Book Slot &amp; Pay <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Date Selection */}
        {currentStep === "date" && (
          <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-[14px] text-slate-800 flex items-center gap-2">
                <Calendar size={16} className="text-[#0078d4]" /> Select Visit Date
              </h4>
              <button 
                type="button"
                onClick={() => setStep("alert")}
                className="text-[11.5px] font-bold text-slate-500 hover:text-slate-700"
              >
                ‹ Cancel
              </button>
            </div>
            <p className="text-[12px] text-slate-500">
              Choose a date for your diagnostic sample collection / imaging scan.
            </p>
            <input 
              type="date" 
              min={todayIso()} 
              value={selectedDate} 
              onChange={(e) => { setSelectedDate(e.target.value); setSelectedSlot(""); }} 
              className="w-full max-w-xs rounded-xl border border-slate-300 bg-white p-2.5 text-[12.5px] text-slate-800 outline-none focus:border-[#0078d4] shadow-sm" 
            />
            <div className="flex gap-2 justify-end pt-2">
              <button 
                className="py-1.5 px-3 rounded-lg border border-slate-200 text-slate-600 font-bold text-[12px] hover:bg-slate-50" 
                onClick={() => setStep("alert")}
              >
                Cancel
              </button>
              <button 
                className="py-1.5 px-4 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] shadow-sm disabled:opacity-50"
                disabled={!selectedDate} 
                onClick={() => setStep("slots")}
              >
                Next: Select Time Slot ›
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Slot Selection */}
        {currentStep === "slots" && (
          <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-[14px] text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-[#0078d4]" /> Select Time Slot
              </h4>
              <span className="text-[11.5px] text-slate-500 font-bold">{selectedDate}</span>
            </div>
            
            {/* Horizontal Left-to-Right Scrolling Slots */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {availableSlots.length === 0 ? (
                <div className="text-[12px] text-red-500 py-2 flex items-center gap-1.5">
                  <AlertCircle size={14} /> No open slots available for this date. Please select another date.
                </div>
              ) : (
                availableSlots.map((timeStr) => {
                  const booked = isSlotBooked(timeStr);
                  const active = selectedSlot === timeStr;
                  return (
                    <button
                      key={timeStr}
                      disabled={booked}
                      onClick={() => setSelectedSlot(timeStr)}
                      className={`shrink-0 py-1.5 px-3 rounded-lg text-[11.5px] font-bold border transition whitespace-nowrap ${
                        active 
                          ? "bg-[#0078d4] border-[#0078d4] text-white shadow-sm"
                          : booked
                            ? "border-slate-200 text-slate-300 line-through cursor-not-allowed bg-slate-50"
                            : "border-slate-200 text-slate-700 bg-slate-50 hover:bg-white hover:border-[#0078d4]"
                      }`}
                    >
                      {timeStr} {booked && <span className="text-[9px] opacity-70 ml-1">(Full)</span>}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button 
                type="button"
                className="text-[11.5px] font-bold text-slate-600 hover:text-slate-800 flex items-center gap-1" 
                onClick={() => setStep("date")}
              >
                <ArrowLeft size={13} /> Change Date
              </button>
              <button 
                type="button"
                className="py-1.5 px-4 rounded-lg bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[12px] shadow-sm disabled:opacity-50"
                disabled={!selectedSlot} 
                onClick={() => setStep("payment")}
              >
                Continue to Payment ›
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Review & Payment */}
        {currentStep === "payment" && (
          <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
            <h4 className="font-extrabold text-[14px] text-slate-800">Booking &amp; Payment Summary</h4>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[12px] space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Selected Tests:</span>
                <span className="font-bold text-slate-800 text-right">{selectedOrders.map((o) => o.test || o.name).join(", ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Appointment Date &amp; Time:</span>
                <span className="font-bold text-slate-800">{selectedDate} at {selectedSlot}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-[13px]">
                <span className="text-slate-700 font-bold">Total Payable Amount:</span>
                <span className="font-black text-[#0078d4] text-[15px]">₹{totalCharges}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button 
                type="button"
                className="text-[11.5px] font-bold text-slate-600 hover:text-slate-800" 
                onClick={() => setStep("slots")}
              >
                ‹ Back
              </button>
              <button 
                type="button"
                disabled={bookingBusy}
                onClick={handleConfirmBooking}
                className="py-2 px-5 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white font-bold text-[13px] shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {bookingBusy ? "Processing Payment..." : `Pay ₹${totalCharges} & Confirm Booking`}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Success Confirmation */}
        {currentStep === "success" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h4 className="font-extrabold text-[13.5px] text-slate-800">
                  Lab &amp; Diagnostic Order Confirmed!
                </h4>
                <p className="text-[11.5px] text-slate-500">
                  Your tests are booked. Proceed to the diagnostic counter at your scheduled time.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onNavigateToTab) onNavigateToTab("My Lab Reports");
                setStep("alert");
              }}
              className="py-1.5 px-3.5 rounded-lg bg-emerald-600 text-white font-bold text-[11.5px] hover:bg-emerald-700 shrink-0"
            >
              View Lab Reports ›
            </button>
          </div>
        )}
      </div>

      {/* EXTERNAL REPORT UPLOAD MODAL (Dropdown to select respective test) */}
      {uploadingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-[#0078d4]">
                  <Upload size={16} />
                </div>
                <div>
                  <h3 className="text-[14px] font-extrabold text-slate-800">Upload External Test Report</h3>
                  <p className="text-[11px] text-slate-500">Upload reports completed at external diagnostics labs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadingOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={18} />
              </button>
            </div>

            {uploadError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-[11.5px] font-semibold flex items-center gap-2">
                <AlertCircle size={15} /> {uploadError}
              </div>
            )}

            {uploadSuccess ? (
              <div className="py-6 text-center space-y-2">
                <div className="grid h-12 w-12 mx-auto place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check size={24} />
                </div>
                <h4 className="font-bold text-[14px] text-slate-800">Report Uploaded Successfully!</h4>
                <p className="text-[11.5px] text-slate-500">
                  Test <b>{uploadingOrder.test || uploadingOrder.name}</b> marked as Completed.
                </p>
              </div>
            ) : (
              <form onSubmit={handleUploadReportSubmit} className="space-y-3.5">
                {/* Select Respective Test */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase">Select Test to Upload For</label>
                  <select
                    value={uploadingOrder?.lab_order_id || uploadingOrder?.order_id || uploadingOrder?.id || ""}
                    onChange={(e) => {
                      const match = pendingOrders.find(
                        (o: any) => (o.lab_order_id || o.order_id || o.id) === e.target.value
                      );
                      if (match) setUploadingOrder(match);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-[12.5px] text-slate-800 outline-none focus:border-[#0078d4] shadow-sm font-semibold"
                  >
                    {pendingOrders.map((o: any) => {
                      const id = o.lab_order_id || o.order_id || o.id;
                      const isScan = o.is_imaging || (o.panel && ["RADIOLOGY", "IMAGING", "SCANS"].includes(o.panel.toUpperCase()));
                      return (
                        <option key={id} value={id}>
                          {o.test || o.name} ({isScan ? "Imaging / Scan" : (o.panel || "Lab Test")})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase">Attach Report File (PDF, Image, DICOM)</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.dcm,.dicom"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-[12px] text-slate-700 outline-none focus:border-[#0078d4] shadow-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#0078d4] file:text-white"
                  />
                  {uploadFile && (
                    <div className="mt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                      <FileText size={12} /> {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase">Laboratory / Hospital Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="e.g. Conducted at XYZ Diagnostics, values within normal reference limits..."
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-[12px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#0078d4] shadow-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setUploadingOrder(null)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-[12px] font-bold text-slate-600 hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!uploadFile || uploadingBusy}
                    className="flex-1 py-2 rounded-xl bg-[#0078d4] hover:bg-[#0a6ec2] text-white text-[12px] font-bold shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {uploadingBusy ? "Uploading Report..." : "Submit & Complete Test"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
