import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

const INTENT_OPTIONS = ["CURATIVE", "PALLIATIVE", "NEOADJUVANT", "ADJUVANT"];

interface AddChemoRegimenModalProps {
  patientId: string;
  diagnosisId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddChemoRegimenModal({ patientId, diagnosisId, onClose, onCreated }: AddChemoRegimenModalProps) {
  const [protocolName, setProtocolName] = useState("");
  const [intent, setIntent] = useState("CURATIVE");
  const [lineOfTherapy, setLineOfTherapy] = useState("1");
  const [drugs, setDrugs] = useState<{ name: string; dose: string }[]>([{ name: "", dose: "" }]);
  const [cycleLengthDays, setCycleLengthDays] = useState("21");
  const [plannedCycles, setPlannedCycles] = useState("6");
  const [prescribedBy, setPrescribedBy] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleFirstCycle, setScheduleFirstCycle] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateDrug(i: number, field: "name" | "dose", val: string) {
    setDrugs((prev) => prev.map((d, idx) => (idx === i ? { ...d, [field]: val } : d)));
  }
  function addDrugRow() {
    setDrugs((prev) => [...prev, { name: "", dose: "" }]);
  }
  function removeDrugRow(i: number) {
    setDrugs((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (!protocolName.trim()) {
      setError("Protocol name is required");
      return;
    }
    try {
      setError("");
      setBusy(true);
      const regimen = await api.createChemoRegimen(diagnosisId, {
        patient_id: patientId,
        protocol_name: protocolName.trim(),
        intent: intent || null,
        line_of_therapy: lineOfTherapy ? parseInt(lineOfTherapy, 10) : null,
        drugs: drugs.filter((d) => d.name.trim()).map((d) => ({ name: d.name.trim(), dose: d.dose.trim() || null })),
        cycle_length_days: cycleLengthDays ? parseInt(cycleLengthDays, 10) : null,
        planned_cycles: plannedCycles ? parseInt(plannedCycles, 10) : null,
        prescribed_by: prescribedBy.trim() || null,
        start_date: startDate || null,
      });
      if (scheduleFirstCycle) {
        await api.addChemoCycle(regimen.regimen_id, { cycle_number: 1, scheduled_date: startDate || null });
      }
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create chemo regimen");
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
          <h3 className="grad-text text-md font-extrabold">New Chemotherapy Regimen</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <Field label="Protocol name *">
            <input value={protocolName} onChange={(e) => setProtocolName(e.target.value)} placeholder="e.g. AC-T, FOLFOX, R-CHOP" className="input" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Intent">
              <select value={intent} onChange={(e) => setIntent(e.target.value)} className="input">
                {INTENT_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
            <Field label="Line of therapy">
              <input type="number" min={1} value={lineOfTherapy} onChange={(e) => setLineOfTherapy(e.target.value)} className="input" />
            </Field>
            <Field label="Cycle length (days)">
              <input type="number" min={1} value={cycleLengthDays} onChange={(e) => setCycleLengthDays(e.target.value)} className="input" />
            </Field>
            <Field label="Planned cycles">
              <input type="number" min={1} value={plannedCycles} onChange={(e) => setPlannedCycles(e.target.value)} className="input" />
            </Field>
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
            </Field>
            <Field label="Prescribed by">
              <input value={prescribedBy} onChange={(e) => setPrescribedBy(e.target.value)} placeholder="Doctor name" className="input" />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "var(--muted)" }}>Drugs</div>
            <div className="space-y-1.5">
              {drugs.map((d, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input value={d.name} onChange={(e) => updateDrug(i, "name", e.target.value)} placeholder="Drug name" className="input" />
                  <input value={d.dose} onChange={(e) => updateDrug(i, "dose", e.target.value)} placeholder="Dose e.g. 60mg/m2" className="input" />
                  <button onClick={() => removeDrugRow(i)} className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addDrugRow} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--cyan)" }}>
              <Plus size={13} /> Add drug
            </button>
          </div>

          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink)" }}>
            <input type="checkbox" checked={scheduleFirstCycle} onChange={(e) => setScheduleFirstCycle(e.target.checked)} />
            Schedule Cycle 1 immediately
          </label>

          {error && (
            <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(239,68,68,.1)", color: "#b91c1c", border: "1px solid rgba(239,68,68,.3)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn ghost sm">Cancel</button>
          <button onClick={handleSubmit} disabled={busy} className="btn g sm">
            {busy ? "Saving..." : "Create regimen"}
          </button>
        </div>
      </div>
    </div>
  );
}
