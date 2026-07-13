import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty } from "../../../components/ui";

/* ------------------------------------------------------------------ Historical Visit Dropdown */
function HistoricalVisitDropdown({ encounter }: { encounter: any }) {
  const [open, setOpen] = useState(false);

  // Fetch full details of selected encounter dynamically
  const { data: details, isLoading } = useQuery({
    queryKey: ["encounter-details", encounter.encounter_id],
    queryFn: () => api.encounter(encounter.encounter_id),
    enabled: open,
  });

  return (
    <div className="border rounded-xl transition" style={{ borderColor: "var(--glass-border)", background: open ? "rgba(255,255,255,0.015)" : "transparent" }}>
      <button 
        onClick={() => setOpen(!open)}
        className="w-full text-left p-2 flex items-center justify-between text-xs font-semibold hover:bg-white/5 rounded-xl transition"
      >
        <div className="truncate">
          <span className="text-white font-bold">{encounter.date}</span>
          <span className="text-[var(--dim)] ml-1.5">· {encounter.department}</span>
        </div>
        <span className="text-[var(--cyan)] font-bold text-[13px] ml-2">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="p-3 border-t border-[var(--glass-border)] space-y-3 text-[11px] leading-relaxed">
          {isLoading ? (
            <div className="text-center py-2 text-[var(--dim)]">Retrieving raw EMR records...</div>
          ) : details ? (
            <>
              {/* Vitals */}
              {details.vitals ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Vitals:</div>
                  <div className="grid grid-cols-3 gap-1 text-[10.5px]">
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>BP</small><br /><b>{details.vitals.bp}</b></div>
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b>{details.vitals.spo2}%</b></div>
                    <div className="bg-white/5 p-1 rounded text-center"><small style={{ color: "var(--dim)" }}>Temp</small><br /><b>{details.vitals.temperature}°F</b></div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Vitals:</div>
                  <span className="text-[var(--muted)]">No vitals captured.</span>
                </div>
              )}

              {/* SOAP Note Text */}
              {details.note ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Clinical Note (SOAP):</div>
                  <div className="p-2 rounded bg-white/5 border border-white/5 text-[10.5px] whitespace-pre-line text-slate-300">
                    {details.note.final_text}
                  </div>
                  {details.note.icd10_codes?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {details.note.icd10_codes.map((icd: any) => (
                        <span key={icd.code} className="text-[9.5px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                          {icd.code}: {icd.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Clinical Note (SOAP):</div>
                  <span className="text-[var(--muted)]">Not documented or pending.</span>
                </div>
              )}

              {/* Prescription Items */}
              {details.prescription && details.prescription.items?.length > 0 ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Prescribed Medications:</div>
                  <ul className="list-disc list-inside text-[var(--muted)] space-y-0.5 text-[10.5px]">
                    {details.prescription.items.map((item: any, idx: number) => (
                      <li key={idx}>
                        <span className="text-slate-300 font-medium">{item.drug_name}</span> ({item.dose}) — <span className="italic">{item.frequency}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-0.5">Prescribed Medications:</div>
                  <span className="text-[var(--muted)]">No medications prescribed.</span>
                </div>
              )}

              {/* Lab Results */}
              {details.labs?.length > 0 ? (
                <div>
                  <div className="font-bold text-white text-[10px] uppercase tracking-wide text-[var(--dim)] mb-1">Lab Results:</div>
                  <div className="space-y-1">
                    {details.labs.map((o: any) => (
                      <div key={o.lab_order_id} className="p-1.5 border border-white/5 rounded bg-white/5">
                        <div className="font-semibold text-slate-300 text-[10.5px]">{o.test}</div>
                        {o.results?.map((r: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-[10px] mt-0.5 text-[var(--muted)]">
                            <span>• {r.analyte}</span>
                            <span className={r.flag !== "N" ? "text-amber-400 font-bold" : ""}>
                              {r.value} {r.unit} {r.flag !== "N" ? `(${r.flag})` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : <div className="text-center py-2 text-[var(--dim)]">Failed to load details.</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Patient 360 Core Component */
interface Patient360Props {
  patientId: string;
  encounterId: string | null;
}

export default function Patient360({ patientId, encounterId }: Patient360Props) {
  const qc = useQueryClient();
  const [adviceNotes, setAdviceNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSuccess, setNotesSuccess] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ["p360", patientId],
    queryFn: () => api.patient360(patientId),
    retry: false,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  useQuery({
    queryKey: ["active-encounter", encounterId],
    queryFn: async () => {
      if (!encounterId) return null;
      const res = await api.encounter(encounterId);
      if (res && res.notes) {
        setAdviceNotes(res.notes);
      }
      return res;
    },
    enabled: !!encounterId,
  });

  const handleSaveNotes = async () => {
    if (!encounterId) return;
    setSavingNotes(true);
    setNotesSuccess(false);
    try {
      await api.updateEncounterNotes(encounterId, adviceNotes);
      setNotesSuccess(true);
    } catch (err) {
      console.error(err);
      alert("Failed to save consultation notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  if (isLoading) return <Card>Loading record…</Card>;
  if (error) {
    return (
      <Card className="space-y-3">
        <div className="alertbox">Consent required to read this record.</div>
        <button className="btn" onClick={async () => { await api.consent(patientId); qc.invalidateQueries({ queryKey: ["p360", patientId] }); }}>
          Capture consent &amp; assemble Patient 360
        </button>
      </Card>
    );
  }

  const flag = (f: string) => (f === "N" ? "green" : f === "H" || f === "L" ? "amber" : "red");

  return (
    <div className="space-y-4">
      {/* Today's Consultation Notes & Advice */}
      {encounterId && (
        <Card className="space-y-3 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ background: "radial-gradient(150px 50px at 0% 0%, rgba(139,92,246,0.06), transparent)" }}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold flex items-center gap-1.5" style={{ color: "#dce9ff" }}>
              <FileText size={16} className="text-violet-400" /> Active Consultation Notes &amp; Advice
            </h4>
            {notesSuccess && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 size={12} /> Saved successfully
              </span>
            )}
          </div>
          <div className="space-y-2 text-xs">
            {/* Quick Macro Chips */}
            <div className="flex flex-wrap gap-1.5 pb-1.5 border-b border-white/5">
              <span className="text-[10px] text-[var(--muted)] font-bold self-center mr-1">QUICK TEMPLATES:</span>
              {[
                { label: "🌡 Fever Care", text: "Fever Care:\n- Take Tab Paracetamol 650mg if temperature > 100°F (max 4 times/day).\n- Drink plenty of water and warm fluids.\n- Rest well; consume light, easy-to-digest meals." },
                { label: "🤢 Acidity / GERD", text: "Acidity & GERD Care:\n- Take Antacid / Pantoprazole 40mg 30 minutes before breakfast.\n- Avoid spicy, oily, fatty, and caffeinated items.\n- Avoid lying down for 2 hours post-meals." },
                { label: "🤕 Pain Relief", text: "Pain Management:\n- Rest the affected area; avoid strain.\n- Apply warm compress or cold pack as needed.\n- Take pain relievers strictly post-meals." },
                { label: "🩺 Hypertension", text: "Hypertension / BP Advice:\n- Restrict daily dietary sodium/salt intake.\n- Avoid processed foods, pickles, and salty snacks.\n- Monitor Blood Pressure twice daily and record logs." }
              ].map((macro, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setAdviceNotes((prev) => {
                      const prefix = prev ? prev.trim() + "\n\n" : "";
                      return prefix + macro.text;
                    });
                    setNotesSuccess(false);
                  }}
                  className="btn ghost !py-0.5 !px-2 text-[10px] border border-white/5 bg-white/[0.02] hover:bg-white/10 text-slate-300 hover:text-white"
                >
                  {macro.label}
                </button>
              ))}
            </div>

            <textarea
              className="input w-full"
              rows={3}
              value={adviceNotes}
              onChange={(e) => {
                setAdviceNotes(e.target.value);
                setNotesSuccess(false);
              }}
              placeholder="Enter active clinical findings, general advice, lifestyle instructions, or diagnosis summary for today's encounter..."
              style={{ background: "var(--panel)", borderColor: "var(--glass-border)", color: "#dce9ff" }}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes}
                className="btn !py-1 !px-4 text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #6d28d9)", color: "white", border: "none" }}
              >
                {savingNotes ? "Saving..." : "Save Consultation Notes"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Latest Vitals Card at the Top */}
      <Card>
        <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Latest vitals</h4>
        {data.latest_vitals ? (
          <div className="grid grid-cols-4 gap-3 text-[13px]">
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Blood Pressure</small><br /><b className="text-[15px]">{data.latest_vitals.bp}</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>SpO₂</small><br /><b className="text-[15px]">{data.latest_vitals.spo2}%</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Heart Rate</small><br /><b className="text-[15px]">{data.latest_vitals.heart_rate} bpm</b></div>
            <div className="holo text-center py-3"><small style={{ color: "var(--dim)" }}>Temperature</small><br /><b className="text-[15px]">{data.latest_vitals.temperature}°F</b></div>
          </div>
        ) : <Empty>No vitals captured yet for this patient.</Empty>}
      </Card>

      {/* Side-by-Side balanced layout for wider displays */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Column 1: Recent Results */}
        <Card className="flex flex-col h-full">
          <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Recent results</h4>
          <div className="flex-1 overflow-auto">
            {data.recent_results.length ? (
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ color: "var(--dim)" }} className="border-b border-[var(--glass-border)]">
                    <th className="text-left pb-2">Analyte</th>
                    <th className="text-left pb-2">Value</th>
                    <th className="text-left pb-2">Flag</th>
                    <th className="text-left pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.recent_results.map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 font-medium text-slate-300">{r.analyte}</td>
                      <td className="py-2.5">{r.value} {r.unit}</td>
                      <td className="py-2.5"><Tag tone={flag(r.flag)}>{r.flag}</Tag></td>
                      <td className="py-2.5" style={{ color: "var(--dim)" }}>{r.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No results</Empty>}
          </div>
        </Card>

        {/* Column 2: Previous visit records (Raw history) */}
        <Card className="flex flex-col h-full">
          <h4 className="mb-3 font-bold" style={{ color: "#d7e5ff" }}>Previous visit records (Raw history)</h4>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {data.encounters?.map((e: any) => (
              <HistoricalVisitDropdown key={e.encounter_id} encounter={e} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
