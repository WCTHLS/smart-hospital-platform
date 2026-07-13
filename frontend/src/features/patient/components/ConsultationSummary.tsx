import { FileText } from "lucide-react";
import { Card } from "../../../components/ui";

interface ConsultationSummaryProps {
  encounterId: string;
  encounterDate?: string;
  triage?: any;
  p360?: any;
}

export default function ConsultationSummary({ 
  encounterId, 
  encounterDate,
  triage, 
  p360 
}: ConsultationSummaryProps) {
  const matchingNote = p360?.recent_notes?.find(
    (n: any) => encounterDate === n.date
  );

  return (
    <Card className="space-y-3 animate-in fade-in duration-300">
      <h4 className="font-bold text-sm flex items-center gap-2" style={{ color: "#d7e5ff" }}>
        <FileText size={16} className="text-[var(--cyan)]" /> Doctor Consultation Summary
      </h4>
      {triage && (
        <div className="holo p-2 text-xs text-slate-300">
          <b>Reason for Visit:</b> {triage.chief_complaint}
        </div>
      )}
      {matchingNote ? (
        <div className="space-y-2 text-[12.5px]">
          <div className="p-3 rounded-xl border bg-white/5" style={{ borderColor: "var(--glass-border)" }}>
            <div className="font-semibold text-white mb-1">Diagnosis &amp; Assessment:</div>
            <p className="text-slate-200 whitespace-pre-line">
              {matchingNote.text}
            </p>
          </div>
        </div>
      ) : (
        <div className="text-xs italic text-[var(--dim)]">Consultation note is being finalized by your doctor.</div>
      )}
    </Card>
  );
}
