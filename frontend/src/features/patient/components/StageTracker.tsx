import { Activity, CheckCircle2 } from "lucide-react";
import { Card } from "../../../components/ui";

const STAGES = [
  { label: "Checked in", msg: "You're checked in. Please stay nearby — no need to queue." },
  { label: "Triaged · token issued", msg: "Triage complete. We'll guide you to your room when it's time." },
  { label: "With the doctor", msg: "You're with the doctor. Your visit is being documented securely." },
  { label: "Diagnostics", msg: "Tests ordered — walk straight to the lab, reports attach automatically." },
  { label: "Under review", msg: "Awaiting lab values to update clinical decision trees." },
  { label: "Rx e-signed", msg: "Prescription complete. Proceed to pharmacy desk." },
  { label: "Discharged", msg: "Visit complete. Your PHR record is synchronized." },
];

interface StageTrackerProps {
  stage: number;
  token?: {
    number: string;
    room?: string;
    floor?: string;
    eta_minutes?: number;
  } | null;
}

export default function StageTracker({ stage, token }: StageTrackerProps) {
  return (
    <Card className="animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="grad-text text-base font-extrabold flex items-center gap-1.5">
          <Activity size={16} /> Live Visit Tracker
        </h3>
        {token && (
          <div className="text-right text-xs">
            <span className="text-[10px]" style={{ color: "var(--dim)" }}>QUEUE TOKEN:</span> <b>{token.number}</b>
            {token.room && <span className="text-[11px] text-[var(--cyan)] block">{token.room} ({token.floor})</span>}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-7 gap-3 text-center">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <div
              key={i}
              className={`p-2.5 rounded-xl border text-[11px] flex flex-col justify-between items-center transition ${
                current ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-transparent"
              }`}
              style={{ background: current ? "rgba(52,225,232,0.05)" : "var(--panel)" }}
            >
              <span className="font-bold mb-1" style={{ color: current ? "white" : done ? "#bcd2ff" : "var(--dim)" }}>
                {s.label}
              </span>
              <div 
                className="h-5 w-5 grid place-items-center rounded-full"
                style={{ background: done || current ? "linear-gradient(150deg,var(--cyan),var(--violet))" : "var(--line)" }}
              >
                {done ? <CheckCircle2 size={12} className="text-slate-900" /> : (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: current ? "white" : "var(--dim)" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
