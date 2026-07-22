import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

const MODALITY_OPTIONS = ["CT", "MRI", "PET-CT", "X-RAY", "USG"];
const RECIST_OPTIONS = ["CR", "PR", "SD", "PD"];

interface AddRadiologyReportModalProps {
  patientId: string;
  diagnosisId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddRadiologyReportModal({ patientId, diagnosisId, onClose, onCreated }: AddRadiologyReportModalProps) {
  const [modality, setModality] = useState("CT");
  const [bodyRegion, setBodyRegion] = useState("");
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [recistResponse, setRecistResponse] = useState("");
  const [reportedBy, setReportedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!bodyRegion.trim()) {
      setError("Body region is required");
      return;
    }
    try {
      setError("");
      setBusy(true);
      await api.createRadiologyReport({
        patient_id: patientId,
        diagnosis_id: diagnosisId || null,
        modality: modality || null,
        body_region: bodyRegion.trim(),
        findings: findings.trim() || null,
        impression: impression.trim() || null,
        recist_response: recistResponse || null,
        reported_by: reportedBy.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to add radiology report");
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
          <h3 className="grad-text text-md font-extrabold">Add Radiology Report</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Modality">
              <select value={modality} onChange={(e) => setModality(e.target.value)} className="input">
                {MODALITY_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Body region *">
              <input value={bodyRegion} onChange={(e) => setBodyRegion(e.target.value)} placeholder="e.g. Chest, Brain, Abdomen" className="input" autoFocus />
            </Field>
            <Field label="RECIST response">
              <select value={recistResponse} onChange={(e) => setRecistResponse(e.target.value)} className="input">
                <option value="">—</option>
                {RECIST_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Reported by">
              <input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Radiologist name" className="input" />
            </Field>
          </div>
          <Field label="Findings">
            <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} className="input" />
          </Field>
          <Field label="Impression">
            <textarea value={impression} onChange={(e) => setImpression(e.target.value)} rows={2} className="input" />
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
