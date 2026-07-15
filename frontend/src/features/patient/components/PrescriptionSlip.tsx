import { Stethoscope } from "lucide-react";
import { Card, Tag } from "../../../components/ui";

interface PrescriptionSlipProps {
  encounterId: string;
  items?: { drug_name: string; dose: string; frequency: string; duration_days?: number }[];
}

export default function PrescriptionSlip({ 
  encounterId, 
  items 
}: PrescriptionSlipProps) {
  return (
    <Card className="space-y-3 animate-in fade-in duration-300">
      <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
        <Stethoscope size={16} className="text-[var(--cyan)]" /> E-Prescription Slip
      </h4>

      {items && items.length > 0 ? (
        <div className="space-y-3">
          <div 
            className="border border-dashed p-4 rounded-2xl space-y-3 relative overflow-hidden"
            style={{ borderColor: "var(--glass-border)", background: "rgba(255,255,255,0.01)" }}
          >
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-mint/5 rounded-full blur-2xl" />

            <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: "var(--glass-border)" }}>
              <div>
                <div className="text-[11px] text-[var(--dim)] uppercase font-semibold">PRESCRIPTION ID</div>
                <div className="text-xs font-bold text-white">RX-{encounterId?.substring(0, 8).toUpperCase()}</div>
              </div>
              <div className="text-right">
                <Tag tone="green">Digital Signature Approved</Tag>
              </div>
            </div>

            <table className="w-full text-xs text-left">
              <thead>
                <tr style={{ color: "var(--dim)" }} className="border-b border-[var(--glass-border)]">
                  <th className="pb-1.5">Medicine Name</th>
                  <th className="pb-1.5">Dosage</th>
                  <th className="pb-1.5">Frequency</th>
                  <th className="pb-1.5 text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, i: number) => {
                  return (
                    <tr key={i} className="border-b last:border-0 border-[var(--glass-border)] text-slate-300">
                      <td className="py-2.5 font-bold text-white">{item.drug_name}</td>
                      <td className="py-2.5" style={{ color: "var(--ink)" }}>{item.dose || "—"}</td>
                      <td className="py-2.5" style={{ color: "var(--muted)" }}>{item.frequency || "As directed"}</td>
                      <td className="py-2.5 text-right font-medium" style={{ color: "var(--ink)" }}>
                        {item.duration_days ? `${item.duration_days} days` : "Refilled"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-xs italic text-[var(--dim)]">No active prescriptions recorded for this visit.</div>
      )}
    </Card>
  );
}
