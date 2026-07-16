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
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="grad-text text-base font-extrabold flex items-center gap-1.5">
          <Activity size={16} /> Live Visit Tracker
        </h3>
        {token && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-left text-xs sm:text-right">
            <span className="text-[10px]" style={{ color: "var(--dim)" }}>QUEUE TOKEN:</span> <b>{token.number}</b>
            {token.room && <span className="text-[11px] text-[var(--cyan)] block">{token.room} ({token.floor})</span>}
          </div>
        )}
      </div>

      <div className="space-y-0 md:hidden">
        {STAGES.map((item, index) => {
          const done = index < stage;
          const current = index === stage;
          return (
            <div className="relative flex gap-3 pb-3 last:pb-0" key={item.label}>
              {index < STAGES.length - 1 && (
                <span className="absolute left-[15px] top-8 h-[calc(100%-1.25rem)] w-px" style={{ background: done ? "var(--cyan)" : "var(--line2)" }} />
              )}
              <div
                className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border"
                style={{
                  borderColor: done || current ? "var(--cyan)" : "var(--line2)",
                  background: done || current ? "linear-gradient(150deg,var(--cyan),var(--violet))" : "var(--panel2)",
                  boxShadow: current ? "0 0 16px rgba(52,225,232,.55)" : "none",
                }}
              >
                {done ? <CheckCircle2 size={15} className="text-slate-950" /> : <span className="text-[11px] font-black" style={{ color: current ? "#04121a" : "var(--dim)" }}>{index + 1}</span>}
              </div>
              <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${current ? "border border-cyan-400/30 bg-cyan-400/10" : ""}`}>
                <div className="text-xs font-extrabold" style={{ color: current ? "white" : done ? "#bcd2ff" : "var(--dim)" }}>
                  {item.label} {current && <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--cyan)]">Current</span>}
                </div>
                {current && <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{item.msg}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden text-center md:grid md:grid-cols-7 md:gap-3">
        {STAGES.map((s, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <div
              key={i}
              className={`flex flex-col items-center justify-between rounded-xl border p-2.5 text-[11px] transition ${
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
