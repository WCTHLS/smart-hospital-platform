import { useEffect, useState } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { api } from "../../../lib/api";
import { Field } from "../../../components/ui";

interface RegisterDiagnosisModalProps {
  onClose: () => void;
  onCreated: (patientId: string) => void;
}

// NOTE: kept bare (no "Cancer" suffix) to match the seeded convention in seed_oncology_demo.py
// (e.g. cancer_type="Breast") — DiagnosisOverview.tsx appends " Cancer" itself when rendering.
const CANCER_TYPES = [
  "Breast",
  "Lung (NSCLC)",
  "Colorectal",
  "Prostate",
  "Gastric",
  "Ovarian",
  "Cervical",
  "Lymphoma",
  "Leukemia",
  "Other",
];

export default function RegisterDiagnosisModal({ onClose, onCreated }: RegisterDiagnosisModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [patient, setPatient] = useState<any | null>(null);

  const [cancerType, setCancerType] = useState("Breast Cancer");
  const [primarySite, setPrimarySite] = useState("");
  const [histology, setHistology] = useState("");
  const [stageGroup, setStageGroup] = useState("");
  const [tnmT, setTnmT] = useState("");
  const [tnmN, setTnmN] = useState("");
  const [tnmM, setTnmM] = useState("");
  const [grade, setGrade] = useState("");
  const [metastatic, setMetastatic] = useState(false);
  const [diagnosedDate, setDiagnosedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.searchAllPatients(query.trim());
        setResults(res || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleSubmit() {
    if (!patient) {
      setError("Search for and select a patient first");
      return;
    }
    if (!cancerType.trim()) {
      setError("Cancer type is required");
      return;
    }
    try {
      setError("");
      setBusy(true);
      const diagnosis = await api.createOncologyDiagnosis({
        patient_id: patient.patient_id,
        cancer_type: cancerType.trim(),
        primary_site: primarySite.trim() || null,
        histology: histology.trim() || null,
        stage_group: stageGroup.trim() || null,
        tnm_t: tnmT.trim() || null,
        tnm_n: tnmN.trim() || null,
        tnm_m: tnmM.trim() || null,
        grade: grade.trim() || null,
        metastatic,
        diagnosed_date: diagnosedDate || null,
        notes: notes.trim() || null,
      });
      onCreated(diagnosis.patient_id);
    } catch (err: any) {
      setError(err.message || "Failed to register diagnosis");
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
          <h3 className="grad-text text-md font-extrabold">Register New Oncology Diagnosis</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--muted)] transition hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4 space-y-4">
          {!patient ? (
            <div>
              <Field label="Search patient by name, MRN or mobile">
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 input">
                  <Search size={14} style={{ color: "var(--muted)" }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Meera, MRN-300001..."
                    className="w-full bg-transparent text-[13px] outline-none"
                    autoFocus
                  />
                  {searching && <Loader2 size={14} className="animate-spin" style={{ color: "var(--muted)" }} />}
                </div>
              </Field>
              {results.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-64 overflow-auto">
                  {results.map((p) => (
                    <button
                      key={p.patient_id}
                      onClick={() => setPatient(p)}
                      className="w-full rounded-xl px-3 py-2 text-left transition"
                      style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>{p.name}</span>
                        <span className="text-[11px]" style={{ color: "var(--muted)" }}>{p.age ? `${p.age}y` : ""} {p.gender?.[0]}</span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--dim)" }}>{p.mrn}</div>
                    </button>
                  ))}
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className="mt-2 text-[12px]" style={{ color: "var(--dim)" }}>No matching patients found.</div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}>
                <div>
                  <div className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>{patient.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--dim)" }}>{patient.mrn} · {patient.age}y · {patient.gender}</div>
                </div>
                <button
                  onClick={() => { setPatient(null); setQuery(""); }}
                  className="text-[12px] font-semibold"
                  style={{ color: "var(--cyan)" }}
                >
                  Change
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Cancer type *">
                  <select value={cancerType} onChange={(e) => setCancerType(e.target.value)} className="input">
                    {CANCER_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Diagnosed date">
                  <input type="date" value={diagnosedDate} onChange={(e) => setDiagnosedDate(e.target.value)} className="input" />
                </Field>
                <Field label="Primary site">
                  <input value={primarySite} onChange={(e) => setPrimarySite(e.target.value)} placeholder="e.g. Right upper lobe" className="input" />
                </Field>
                <Field label="Histology">
                  <input value={histology} onChange={(e) => setHistology(e.target.value)} placeholder="e.g. Adenocarcinoma" className="input" />
                </Field>
                <Field label="Stage group">
                  <input value={stageGroup} onChange={(e) => setStageGroup(e.target.value)} placeholder="e.g. Stage IIB" className="input" />
                </Field>
                <Field label="Grade">
                  <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. G2" className="input" />
                </Field>
                <Field label="TNM — T">
                  <input value={tnmT} onChange={(e) => setTnmT(e.target.value)} placeholder="T2" className="input" />
                </Field>
                <Field label="TNM — N">
                  <input value={tnmN} onChange={(e) => setTnmN(e.target.value)} placeholder="N1" className="input" />
                </Field>
                <Field label="TNM — M">
                  <input value={tnmM} onChange={(e) => setTnmM(e.target.value)} placeholder="M0" className="input" />
                </Field>
                <Field label="Metastatic">
                  <label className="flex h-[38px] items-center gap-2 text-[13px]" style={{ color: "var(--ink)" }}>
                    <input type="checkbox" checked={metastatic} onChange={(e) => setMetastatic(e.target.checked)} />
                    Metastatic disease present
                  </label>
                </Field>
              </div>

              <Field label="Clinical notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Presenting history, biopsy findings, etc."
                  className="input"
                />
              </Field>
            </>
          )}

          {error && (
            <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(239,68,68,.1)", color: "#b91c1c", border: "1px solid rgba(239,68,68,.3)" }}>
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4">
          <button onClick={onClose} className="btn ghost sm">Cancel</button>
          <button onClick={handleSubmit} disabled={!patient || busy} className="btn g sm">
            {busy ? "Saving..." : "Register diagnosis"}
          </button>
        </div>
      </div>
    </div>
  );
}
