import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, DollarSign, RefreshCw, CheckCircle2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Empty } from "../../../components/ui";

export default function LabPaymentCounter() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, "CASH" | "UPI" | "CARD">>({});

  // Query pending lab orders
  const { data: orders, refetch, isFetching } = useQuery({
    queryKey: ["reception-lab-orders"],
    queryFn: api.labOrders,
    refetchInterval: 5000,
  });

  // Filter for created orders (pending payment)
  const pendingOrders = orders?.filter((o: any) => o.status === "CREATED") || [];

  const handleConfirmPayment = async (orderId: string) => {
    try {
      setBusyId(orderId);
      await api.confirmLabOrder(orderId);
      refetch();
      // Invalidate queries so that lab portal updates as well
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
    } catch (err: any) {
      alert(err.message || "Failed to confirm lab order payment");
    } finally {
      setBusyId(null);
    }
  };

  const getPaymentMethod = (orderId: string) => {
    return paymentMethods[orderId] || "CASH";
  };

  const setPaymentMethod = (orderId: string, method: "CASH" | "UPI" | "CARD") => {
    setPaymentMethods((prev) => ({ ...prev, [orderId]: method }));
  };

  return (
    <Card className="h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-[var(--ink)]">🧪 Lab Payments Counter</h3>
          <p className="text-[11px] text-[var(--muted)]">Collect cash/UPI for pending doctor-ordered tests.</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 rounded-lg hover:bg-white/5 transition text-[var(--muted)] hover:text-white disabled:opacity-50"
          title="Refresh pending lab list"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[500px] space-y-3 pr-1">
        {pendingOrders.length === 0 ? (
          <Empty>No pending lab order payments today.</Empty>
        ) : (
          pendingOrders.map((o: any) => {
            const isProcessing = busyId === o.lab_order_id;
            const price = o.price ?? 450.00; // default mock price if not set
            const currentMethod = getPaymentMethod(o.lab_order_id);
            const patientReference = typeof o.patient_id === "string" && o.patient_id
              ? `${o.patient_id.substring(0, 8)}...`
              : "Unavailable";

            return (
              <div
                key={o.lab_order_id}
                className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-3 hover:border-white/10 transition animate-in fade-in duration-150"
              >
                {/* Patient / Test Name */}
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--cyan)]">
                      Patient ID: {patientReference}
                    </span>
                    <h4 className="text-xs font-bold text-white mt-0.5">
                      {o.test_name || "Diagnostic Panel"}
                    </h4>
                    {o.priority && (
                      <span className={`inline-block mt-1 px-1.5 py-0.5 text-[9px] font-bold rounded ${
                        o.priority === "STAT" 
                          ? "bg-red-500/20 text-red-300" 
                          : "bg-white/10 text-[var(--muted)]"
                      }`}>
                        {o.priority} Priority
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-white">₹{price}</span>
                  </div>
                </div>

                {/* Payment Selector */}
                <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                  <div className="flex gap-1.5 bg-black/20 p-0.5 rounded-lg border border-white/5">
                    {(["CASH", "UPI", "CARD"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(o.lab_order_id, m)}
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition ${
                          currentMethod === m
                            ? "bg-white/10 text-white"
                            : "text-[var(--muted)] hover:text-white"
                        }`}
                      >
                        {m === "CASH" ? "💵 Cash" : m === "UPI" ? "📱 UPI" : "💳 Card"}
                      </button>
                    ))}
                  </div>

                  <button
                    disabled={isProcessing}
                    onClick={() => handleConfirmPayment(o.lab_order_id)}
                    className="btn text-[10.5px] py-1 px-2.5 flex items-center gap-1 shrink-0 font-bold"
                    style={{ background: "linear-gradient(to right, var(--cyan), var(--violet))" }}
                  >
                    {isProcessing ? (
                      "Confirming..."
                    ) : (
                      <>
                        Collect <CheckCircle2 size={12} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
