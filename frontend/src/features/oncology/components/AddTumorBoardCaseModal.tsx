import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

interface AddTumorBoardCaseModalProps {
  patientId: string;
  diagnosisId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function AddTumorBoardCaseModal({ patientId, diagnosisId, onClose, onCreated }: AddTumorBoardCaseModalProps) {
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [presentingDoctor, setPresentingDoctor] = useState("");
  const [attendees, setAttendees] = useState<{ name: string; specialty: string }[]>([{ name: "", specialty: "" }]);
  const [caseSummary, setCaseSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateAttendee(i: number, field: "name" | "specialty", val: string) {
    setAttendees((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: val } : a)));
  }
  function addAttendeeRow() {
    setAttendees((prev) => [...prev, { name: "", specialty: "" }]);
  }
  function removeAttendeeRow(i: number) {
    setAttendees((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    try {
      setError("");
      setBusy(true);
      await api.createTumorBoardCase(diagnosisId, {
        patient_id: patientId,
        scheduled_date: scheduledDate || null,
        presenting_doctor_id: presentingDoctor.trim() || null,
        attendees: attendees.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), specialty: a.specialty.trim() || null })),
        case_summary: caseSummary.trim() || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to schedule tumor board case");
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
          <h3 className="grad-text text-md font-extrabold">Schedule Tumor Board (MDT) Case</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Scheduled date">
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input" autoFocus />
            </Field>
            <Field label="Presenting doctor">
              <input value={presentingDoctor} onChange={(e) => setPresentingDoctor(e.target.value)} placeholder="Doctor name" className="input" />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "var(--muted)" }}>Attendees</div>
            <div className="space-y-1.5">
              {attendees.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input value={a.name} onChange={(e) => updateAttendee(i, "name", e.target.value)} placeholder="Name" className="input" />
                  <input value={a.specialty} onChange={(e) => updateAttendee(i, "specialty", e.target.value)} placeholder="Specialty" className="input" />
                  <button onClick={() => removeAttendeeRow(i)} className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-white/5 hover:text-rose-400">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addAttendeeRow} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--cyan)" }}>
              <Plus size={13} /> Add attendee
            </button>
          </div>

          <Field label="Case summary">
            <textarea value={caseSummary} onChange={(e) => setCaseSummary(e.target.value)} rows={3} placeholder="Reason for MDT discussion, clinical question, options being considered..." className="input" />
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
            {busy ? "Saving..." : "Schedule case"}
          </button>
        </div>
      </div>
    </div>
  );
}
