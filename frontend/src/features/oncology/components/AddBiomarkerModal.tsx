import { useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

const RESULT_OPTIONS = ["POSITIVE", "NEGATIVE", "MUTATED", "WILD-TYPE", "EQUIVOCAL"];

interface AddBiomarkerModalProps {
  diagnosisId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddBiomarkerModal({ diagnosisId, onClose, onCreated }: AddBiomarkerModalProps) {
  const [markerName, setMarkerName] = useState("");
  const [result, setResult] = useState("");
  const [value, setValue] = useState("");
  const [method, setMethod] = useState("");
  const [labName, setLabName] = useState("");
  const [testedDate, setTestedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!markerName.trim()) {
      setError("Marker name is required");
      return;
    }
    try {
      setError("");
      setBusy(true);
      await api.addBiomarker(diagnosisId, {
        marker_name: markerName.trim(),
        result: result || null,
        value: value.trim() || null,
        method: method.trim() || null,
        lab_name: labName.trim() || null,
        tested_date: testedDate || null,
        notes: notes.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to record biomarker");
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
          <h3 className="grad-text text-md font-extrabold">Add Biomarker Result</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <Field label="Marker name *">
            <input value={markerName} onChange={(e) => setMarkerName(e.target.value)} placeholder="e.g. HER2, EGFR, PD-L1" className="input" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Result">
              <select value={result} onChange={(e) => setResult(e.target.value)} className="input">
                <option value="">—</option>
                {RESULT_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Value">
              <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 3+, 45%" className="input" />
            </Field>
            <Field label="Method">
              <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e.g. IHC, NGS, FISH" className="input" />
            </Field>
            <Field label="Lab name">
              <input value={labName} onChange={(e) => setLabName(e.target.value)} className="input" />
            </Field>
            <Field label="Tested date">
              <input type="date" value={testedDate} onChange={(e) => setTestedDate(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
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
            {busy ? "Saving..." : "Add biomarker"}
          </button>
        </div>
      </div>
    </div>
  );
}
