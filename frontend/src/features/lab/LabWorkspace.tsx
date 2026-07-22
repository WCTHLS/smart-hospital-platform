import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../../components/ui";

import LabOrdersQueue from "./components/LabOrdersQueue";
import LabResultForm from "./components/LabResultForm";

export default function LabWorkspace() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [deptFilter, setDeptFilter] = useState<"ALL" | "PATHOLOGY" | "RADIOLOGY" | "CARDIOLOGY">("ALL");

  const { data: orders, refetch } = useQuery({
    queryKey: ["lab-orders"],
    queryFn: api.labOrders,
    refetchInterval: 5000,
  });

  const pending = orders?.filter((o: any) => {
    const isPending = o.status === "CONFIRMED";
    const category = o.category || "PATHOLOGY";
    return isPending && (deptFilter === "ALL" || category === deptFilter);
  }) || [];

  const collected = orders?.filter((o: any) => {
    const isCollected = o.status === "SAMPLE_COLLECTED";
    const category = o.category || "PATHOLOGY";
    return isCollected && (deptFilter === "ALL" || category === deptFilter);
  }) || [];

  const completed = orders?.filter((o: any) => {
    const isCompleted = o.status === "RESULTED";
    const category = o.category || "PATHOLOGY";
    return isCompleted && (deptFilter === "ALL" || category === deptFilter);
  }) || [];

  // Keep the selected order in sync with the latest polled/refetched data
  // (e.g. after marking a sample collected) instead of a stale snapshot.
  const liveSelectedOrder = selectedOrder
    ? orders?.find((o: any) => o.lab_order_id === selectedOrder.lab_order_id) || selectedOrder
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title Card */}
      <Card className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="grad-text text-xl font-extrabold flex items-center gap-2">
            <FlaskConical size={22} className="text-[var(--cyan)]" /> Lab Diagnostics Portal
          </h2>
          <p className="text-[13px] mt-1 text-[var(--muted)]">
            Enter and submit clinical values for ordered patient tests. Result flags are processed automatically.
          </p>
        </div>
        <span className="live">LIVE REFRESH</span>
      </Card>

      {/* Department Filter Bar */}
      <div className="flex flex-wrap gap-2 p-1 bg-white/[0.02] border border-white/5 rounded-xl w-fit">
        {[
          { id: "ALL", label: "🏢 All Departments" },
          { id: "PATHOLOGY", label: "🧪 Pathology (Blood/Urine)" },
          { id: "RADIOLOGY", label: "🩻 Radiology (X-Ray/Imaging)" },
          { id: "CARDIOLOGY", label: "❤️ Cardiology (ECG)" },
        ].map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setDeptFilter(d.id as any);
              setSelectedOrder(null); // Clear selected if switching departments
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              deptFilter === d.id
                ? "bg-white/10 text-white"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(340px,28vw,480px)] 2xl:gap-6">
        <LabOrdersQueue
          pending={pending}
          collected={collected}
          completed={completed}
          selectedOrderId={selectedOrder?.lab_order_id}
          onSelectOrder={setSelectedOrder}
        />
        
        <LabResultForm
          selectedOrder={liveSelectedOrder}
          onClearSelection={() => setSelectedOrder(null)}
          onSubmitSuccess={() => {
            refetch();
            qc.invalidateQueries({ queryKey: ["lab"] });
          }}
        />
      </div>
    </div>
  );
}
