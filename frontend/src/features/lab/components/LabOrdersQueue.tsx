import { Clipboard, Clock, FileCheck2 } from "lucide-react";
import { Card, Tag, Empty } from "../../../components/ui";

interface LabOrdersQueueProps {
  pending: any[];
  completed: any[];
  selectedOrderId?: string;
  onSelectOrder: (o: any) => void;
}

export default function LabOrdersQueue({
  pending,
  completed,
  selectedOrderId,
  onSelectOrder,
}: LabOrdersQueueProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Card>
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "#dce9ff" }}>
          <Clipboard size={16} /> Pending Lab Tests ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <Empty>No pending lab orders at this time.</Empty>
        ) : (
          <div className="space-y-2">
            {pending.map((o: any) => (
              <div
                key={o.lab_order_id}
                onClick={() => onSelectOrder(o)}
                className={`p-3 border rounded-xl cursor-pointer transition flex justify-between items-center ${
                  selectedOrderId === o.lab_order_id
                    ? "border-[var(--cyan)] bg-[var(--cyan)]/5"
                    : "border-[var(--glass-border)] hover:bg-white/5 bg-white/[0.01]"
                }`}
              >
                <div className="space-y-1">
                  <div className="font-bold text-slate-200 flex items-center gap-2">
                    {o.patient_name}
                    {o.token_number && <Tag tone="violet">{o.token_number}</Tag>}
                  </div>
                  <div className="text-[12px] flex items-center gap-3 text-[var(--dim)]" style={{ color: "var(--dim)" }}>
                    <span>Test: <b className="text-[var(--cyan)]">{o.test_name}</b></span>
                    <span>Code: {o.qr_code}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} className="text-amber-400" />
                  <Tag tone="amber">PENDING</Tag>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "#dce9ff" }}>
          <FileCheck2 size={16} /> Completed Tests ({completed.length})
        </h3>
        {completed.length === 0 ? (
          <Empty>No completed lab results today.</Empty>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {completed.map((o: any) => (
              <div
                key={o.lab_order_id}
                className="p-3 border border-white/5 rounded-xl bg-white/[0.01] flex justify-between items-center text-[13px]"
              >
                <div>
                  <div className="font-semibold text-slate-300">{o.patient_name}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {o.test_name} · {o.qr_code}
                  </div>
                </div>
                <Tag tone="green">COMPLETED</Tag>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
