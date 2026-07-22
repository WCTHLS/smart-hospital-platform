import { Clipboard, Clock, FileCheck2, TestTube2 } from "lucide-react";
import { Card, Tag, Empty } from "../../../components/ui";

interface LabOrdersQueueProps {
  pending: any[];
  collected: any[];
  completed: any[];
  selectedOrderId?: string;
  onSelectOrder: (o: any) => void;
}

function formatSlotTime(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

export default function LabOrdersQueue({
  pending,
  collected,
  completed,
  selectedOrderId,
  onSelectOrder,
}: LabOrdersQueueProps) {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Card>
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "var(--ink)" }}>
          <Clipboard size={16} /> Awaiting Sample Collection ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <Empty>No pending lab orders at this time.</Empty>
        ) : (
          <div className="space-y-2">
            {pending.map((o: any) => {
              const slotTime = formatSlotTime(o.slot_time);
              return (
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
                    <div className="text-[11px] flex items-center gap-3 text-[var(--muted)]">
                      {slotTime && <span>🕒 Slot: {slotTime}</span>}
                      {o.ordered_by && <span>Dr. Ordered by: {o.ordered_by}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={12} className="text-amber-400" />
                    <Tag tone="amber">PENDING</Tag>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "var(--ink)" }}>
          <TestTube2 size={16} /> Sample Collected — Awaiting Results ({collected.length})
        </h3>
        {collected.length === 0 ? (
          <Empty>No samples currently being processed.</Empty>
        ) : (
          <div className="space-y-2">
            {collected.map((o: any) => (
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
                <Tag tone="blue">IN TESTING</Tag>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-md font-bold mb-3 flex items-center gap-2 text-slate-100" style={{ color: "var(--ink)" }}>
          <FileCheck2 size={16} /> Completed Tests ({completed.length})
        </h3>
        {completed.length === 0 ? (
          <Empty>No completed lab results today.</Empty>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {completed.map((o: any) => (
              <div
                key={o.lab_order_id}
                onClick={() => onSelectOrder(o)}
                className={`p-3 border rounded-xl cursor-pointer transition flex justify-between items-center text-[13px] ${
                  selectedOrderId === o.lab_order_id
                    ? "border-[var(--cyan)] bg-[var(--cyan)]/5"
                    : "border-white/5 hover:bg-white/5 bg-white/[0.01]"
                }`}
              >
                <div>
                  <div className="font-semibold text-slate-200">{o.patient_name}</div>
                  <div className="text-[11px] text-[var(--muted)]">
                    {o.test_name} · {o.qr_code}
                  </div>
                  <div className="text-[10.5px] text-emerald-400/80 mt-0.5">
                    ✅ Patient & doctor notified
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone="green">COMPLETED</Tag>
                  <span className="text-[11px] font-bold text-sky-500 bg-sky-600/10 px-2 py-0.5 rounded-lg border border-sky-600/20 hover:bg-sky-600/20 transition">
                    ✏️ Edit
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

