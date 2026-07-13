import { useState } from "react";
import { Mic, CheckCircle2, BadgeCheck } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Wave, Empty, AgentBadge, Tag } from "../../../components/ui";

interface AmbientSoapProps {
  encounterId: string;
}

export default function AmbientSoap({ encounterId }: AmbientSoapProps) {
  const [transcript, setTranscript] = useState(
    "Patient has fever and productive cough for three days with mild breathlessness. On examination temperature 101.2°F, chest with scattered crepitations, no chest pain."
  );
  const [draft, setDraft] = useState<any>(null);
  const [finalText, setFinalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  async function generate() {
    setBusy(true); 
    setApproved(false);
    try {
      const r = await api.ambient(encounterId, transcript);
      setDraft(r); 
      setFinalText(r.result.draft_text);
    } finally { 
      setBusy(false); 
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await api.approveNote(draft.note_id, { final_text: finalText, icd10_codes: draft.result.icd10, approved_by: "Dr. Mehta" });
      setApproved(true);
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 animate-in fade-in duration-300">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>Consultation transcript</h4>
          <span className="flex items-center gap-2"><Wave /> <span className="live">REC</span></span>
        </div>
        <textarea className="input" rows={7} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        <button className="btn mt-3 w-full" disabled={busy} onClick={generate}>
          <Mic size={15} /> {busy ? "Transcribing…" : "Generate SOAP draft"}
        </button>
      </Card>
      <Card>
        {!draft ? <Empty>The Ambient Docs agent will draft a SOAP note here — you approve before it's committed.</Empty> : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold text-slate-100" style={{ color: "#d7e5ff" }}>SOAP draft</h4>
              <AgentBadge label="AI draft — needs approval" />
            </div>
            <div className="holo whitespace-pre-wrap text-[13px] text-slate-200">
              <div><b>S:</b> {draft.result.soap.S}</div>
              <div><b>O:</b> {draft.result.soap.O}</div>
              <div><b>A:</b> {draft.result.soap.A}</div>
              <div><b>P:</b> {draft.result.soap.P}</div>
            </div>
            <div className="my-2 flex flex-wrap gap-1">
              {draft.result.icd10.map((c: any) => <Tag key={c.code} tone="blue">{c.code} · {c.label}</Tag>)}
            </div>
            <textarea className="input" rows={4} value={finalText} onChange={(e) => setFinalText(e.target.value)} />
            {approved ? (
              <div className="mt-2 flex items-center gap-2" style={{ color: "var(--mint)" }}><CheckCircle2 size={16} /> Note approved &amp; committed.</div>
            ) : (
              <button className="btn g mt-3 w-full" disabled={busy} onClick={approve}><BadgeCheck size={16} /> Approve note</button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
