import { Clipboard } from "lucide-react";
import { Card, Tag } from "../../../components/ui";

interface VitalsAndLabsProps {
  latestVitals?: any;
  orders?: any[];
}

export default function VitalsAndLabs({ latestVitals, orders }: VitalsAndLabsProps) {
  return (
    <Card className="space-y-3 animate-in fade-in duration-300">
      <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
        <Clipboard size={16} className="text-[var(--cyan)]" /> Vitals &amp; Labs
      </h4>
      {latestVitals && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="holo text-center"><small style={{ color: "var(--dim)" }}>BP</small><br /><b>{latestVitals.bp}</b></div>
          <div className="holo text-center"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b>{latestVitals.spo2}%</b></div>
          <div className="holo text-center"><small style={{ color: "var(--dim)" }}>HR</small><br /><b>{latestVitals.heart_rate}</b></div>
          <div className="holo text-center"><small style={{ color: "var(--dim)" }}>Temp</small><br /><b>{latestVitals.temperature}°F</b></div>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="mt-3">
          <div className="font-bold text-xs text-[var(--dim)] mb-1 uppercase">Laboratory Results:</div>
          {orders.map((o: any) => (
            <div key={o.lab_order_id} className="p-2 border rounded-xl mb-1 text-xs" style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}>
              <div className="font-semibold text-slate-200">
                {o.test} — <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{o.status}</span>
              </div>
              {o.results?.map((r: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-[11px] mt-1 text-slate-300">
                  <span style={{ color: "var(--muted)" }}>• {r.analyte}</span>
                  <b>{r.value} {r.unit} {r.flag !== "N" && `(${r.flag})`}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
