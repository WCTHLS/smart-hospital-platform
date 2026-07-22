import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

const MARGINS_OPTIONS = ["CLEAR", "INVOLVED", "CLOSE"];

interface AddPathologyReportModalProps {
  patientId: string;
  diagnosisId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddPathologyReportModal({ patientId, diagnosisId, onClose, onCreated }: AddPathologyReportModalProps) {
  const [specimenType, setSpecimenType] = useState("");
  const [specimenSite, setSpecimenSite] = useState("");
  const [grossDescription, setGrossDescription] = useState("");
  const [microscopicDescription, setMicroscopicDescription] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [marginsStatus, setMarginsStatus] = useState("");
  const [lymphNodesExamined, setLymphNodesExamined] = useState("");
  const [lymphNodesPositive, setLymphNodesPositive] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!specimenType.trim()) {
      setError("Specimen type is required");
      return;
    }
    try {
      setError("");
      setBusy(true);
      await api.createPathologyReport({
        patient_id: patientId,
        diagnosis_id: diagnosisId || null,
        specimen_type: specimenType.trim(),
        specimen_site: specimenSite.trim() || null,
        gross_description: grossDescription.trim() || null,
        microscopic_description: microscopicDescription.trim() || null,
        diagnosis_text: diagnosisText.trim() || null,
        margins_status: marginsStatus || null,
        lymph_nodes_examined: lymphNodesExamined ? parseInt(lymphNodesExamined, 10) : null,
        lymph_nodes_positive: lymphNodesPositive ? parseInt(lymphNodesPositive, 10) : null,
        reported_by: reportedBy.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to add pathology report");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="card flex w-full max-w-lg flex-col overflow-hidden shadow-2xl"
        style={{ border: "1px solid var(--glass-border)", background: "var(--panel)", maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h3 className="grad-text text-md font-extrabold">Add Pathology Report</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Specimen type *">
              <input value={specimenType} onChange={(e) => setSpecimenType(e.target.value)} placeholder="e.g. Core biopsy, Resection" className="input" autoFocus />
            </Field>
            <Field label="Specimen site">
              <input value={specimenSite} onChange={(e) => setSpecimenSite(e.target.value)} placeholder="e.g. Left breast" className="input" />
            </Field>
            <Field label="Margins status">
              <select value={marginsStatus} onChange={(e) => setMarginsStatus(e.target.value)} className="input">
                <option value="">—</option>
                {MARGINS_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Reported by">
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Pathologist name" className="input" />
            </Field>
            <Field label="Lymph nodes examined">
              <input type="number" min={0} value={lymphNodesExamined} onChange={(e) => setLymphNodesExamined(e.target.value)} className="input" />
            </Field>
            <Field label="Lymph nodes positive">
              <input type="number" min={0} value={lymphNodesPositive} onChange={(e) => setLymphNodesPositive(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Gross description">
            <textarea value={grossDescription} onChange={(e) => setGrossDescription(e.target.value)} rows={2} className="input" />
          </Field>
          <Field label="Microscopic description">
            <textarea value={microscopicDescription} onChange={(e) => setMicroscopicDescription(e.target.value)} rows={2} className="input" />
          </Field>
          <Field label="Diagnosis">
            <textarea value={diagnosisText} onChange={(e) => setDiagnosisText(e.target.value)} rows={2} className="input" />
          </Field>

          {error && (
            <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(239,68,68,.1)", color: "#b91c1c", border: "1px solid rgba(239,68,68,.3)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn ghost sm">Cancel</button>
          <button onClick={handleSubmit} disabled={busy} className="btn g sm">
            {busy ? "Saving..." : "Add report"}
          </button>
        </div>
      </div>
    </div>
  );
}
