import { useState, KeyboardEvent } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Field, Tag } from "../../../components/ui";

interface AddSurvivorshipPlanModalProps {
  patientId: string;
  diagnosisId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddSurvivorshipPlanModal({ patientId, diagnosisId, onClose, onCreated }: AddSurvivorshipPlanModalProps) {
  const [treatmentSummary, setTreatmentSummary] = useState("");
  const [surveillance, setSurveillance] = useState<{ test: string; interval_months: string }[]>([{ test: "", interval_months: "" }]);
  const [riskInput, setRiskInput] = useState("");
  const [risks, setRisks] = useState<string[]>([]);
  const [nextFollowup, setNextFollowup] = useState("");
  const [lifestyle, setLifestyle] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateSurveillance(i: number, field: "test" | "interval_months", val: string) {
    setSurveillance((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }
  function addSurveillanceRow() {
    setSurveillance((prev) => [...prev, { test: "", interval_months: "" }]);
  }
  function removeSurveillanceRow(i: number) {
    setSurveillance((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRisk() {
    const r = riskInput.trim();
    if (r && !risks.includes(r)) setRisks((prev) => [...prev, r]);
    setRiskInput("");
  }
  function handleRiskKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addRisk();
    }
  }
  function removeRisk(r: string) {
    setRisks((prev) => prev.filter((x) => x !== r));
  }

  async function handleSubmit() {
    try {
      setError("");
      setBusy(true);
      await api.createSurvivorshipPlan(diagnosisId, {
        patient_id: patientId,
        treatment_summary: treatmentSummary.trim() || null,
        surveillance_schedule: surveillance
          .filter((s) => s.test.trim())
          .map((s) => ({ test: s.test.trim(), interval_months: s.interval_months ? parseInt(s.interval_months, 10) : null })),
        late_effects_risks: risks,
        next_followup_date: nextFollowup || null,
        lifestyle_recommendations: lifestyle.trim() || null,
        created_by: createdBy.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create survivorship plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="card flex w-full max-w-2xl flex-col overflow-hidden shadow-2xl"
        style={{ border: "1px solid var(--glass-border)", background: "var(--panel)", maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h3 className="grad-text text-md font-extrabold">Create Survivorship Care Plan</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <Field label="Treatment summary">
            <textarea value={treatmentSummary} onChange={(e) => setTreatmentSummary(e.target.value)} rows={2} placeholder="Summary of completed treatment..." className="input" autoFocus />
          </Field>

          <div>
            <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "var(--muted)" }}>Surveillance schedule</div>
            <div className="space-y-1.5">
              {surveillance.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <input value={s.test} onChange={(e) => updateSurveillance(i, "test", e.target.value)} placeholder="e.g. Mammogram" className="input" />
                  <input type="number" min={1} value={s.interval_months} onChange={(e) => updateSurveillance(i, "interval_months", e.target.value)} placeholder="Every N mo" className="input" />
                  <button onClick={() => removeSurveillanceRow(i)} className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addSurveillanceRow} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--cyan)" }}>
              <Plus size={13} /> Add surveillance test
            </button>
          </div>

          <Field label="Late-effects risks">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 input">
              <input
                value={riskInput}
                onChange={(e) => setRiskInput(e.target.value)}
                onKeyDown={handleRiskKeyDown}
                placeholder="Type a risk and press Enter, e.g. Cardiotoxicity"
                className="w-full bg-transparent text-[13px] outline-none"
              />
            </div>
            {risks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {risks.map((r) => (
                  <button key={r} onClick={() => removeRisk(r)} title="Remove">
                    <Tag tone="amber">{r} ✕</Tag>
                  </button>
                ))}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Next follow-up date">
              <input type="date" value={nextFollowup} onChange={(e) => setNextFollowup(e.target.value)} className="input" />
            </Field>
            <Field label="Created by">
              <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="Doctor name" className="input" />
            </Field>
          </div>

          <Field label="Lifestyle recommendations">
            <textarea value={lifestyle} onChange={(e) => setLifestyle(e.target.value)} rows={2} className="input" />
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
            {busy ? "Saving..." : "Create plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
