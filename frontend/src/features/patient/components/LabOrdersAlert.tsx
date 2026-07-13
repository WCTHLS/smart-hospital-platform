import { useState } from "react";
import { Clock } from "lucide-react";
import { api } from "../../../lib/api";
import { Card } from "../../../components/ui";

interface LabOrdersAlertProps {
  orders: any[];
  refetchLab: () => void;
  refetchEnc: () => void;
  refetchP360: () => void;
}

export default function LabOrdersAlert({ 
  orders, 
  refetchLab, 
  refetchEnc, 
  refetchP360 
}: LabOrdersAlertProps) {
  const [bookingBusy, setBookingBusy] = useState(false);
  const pendingOrders = orders?.filter((o: any) => o.status === "CREATED") || [];

  if (pendingOrders.length === 0) return null;

  const totalCharges = pendingOrders.reduce(
    (sum: number, l: any) => sum + (l.price || 250), 
    0
  );

  const handleSimulateBooking = async () => {
    setBookingBusy(true);
    try {
      for (const o of pendingOrders) {
        await api.confirmLabOrder(o.lab_order_id);
      }
      await refetchLab();
      await refetchEnc();
      await refetchP360();
    } catch (err) {
      alert("Failed to confirm booking.");
    } finally {
      setBookingBusy(false);
    }
  };

  return (
    <Card 
      className="border border-dashed border-amber-500/30 relative overflow-hidden animate-in fade-in duration-200" 
      style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(245,158,11,0.06), transparent)" }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <h4 className="font-extrabold text-sm text-amber-400 flex items-center gap-1.5">
            ⚠️ Action Required: Lab Tests Ordered
          </h4>
          <p className="text-xs text-slate-300 leading-relaxed font-semibold">
            Your doctor has ordered the following tests: <span className="text-[var(--cyan)]">{pendingOrders.map((l: any) => l.test).join(", ")}</span>.
            Please select a slot and complete the payment to confirm your lab booking.
          </p>
        </div>
        <div className="flex flex-col items-stretch md:items-end gap-1 text-right shrink-0">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">PAYMENT &amp; SLOT STATUS</div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 w-fit">
            <Clock size={12} className="animate-pulse" /> PENDING BOOKING
          </span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2 items-center justify-between">
        <div className="text-xs text-[var(--dim)] font-bold">
          Estimated Charges: <span className="text-white text-sm">₹{totalCharges}</span>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleSimulateBooking}
            className="btn text-xs !py-1 px-3 font-extrabold"
            style={{ background: "linear-gradient(135deg, var(--cyan), #2563eb)", color: "white", border: "none" }}
            disabled={bookingBusy}
          >
            {bookingBusy ? "Booking..." : "Book Slot & Pay (Simulate)"}
          </button>
        </div>
      </div>
    </Card>
  );
}
