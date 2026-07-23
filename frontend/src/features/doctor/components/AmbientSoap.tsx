import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, CheckCircle2, BadgeCheck, Sparkles, Languages, AlertTriangle, ShieldAlert } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Wave, Empty, AgentBadge, Tag } from "../../../components/ui";

interface AmbientSoapProps {
  encounterId: string;
  doctorName?: string | null;
}

// Ambient listening records short, complete audio clips (stop+restart the recorder every
// CHUNK_MS) and sends each clip to the backend, which transcribes it locally with Whisper
// ("small" model + tuned voice-activity detection, offline — audio never leaves the server)
// and tags it with a best-effort "Speaker N" label (offline speaker-embedding diarization).
// This is more reliable than the browser's built-in Web Speech API, which streams raw audio
// to Google's servers and silently stops working if that endpoint is unreachable (common on
// hospital/corporate networks). CHUNK_MS is short to keep the delay between speaking and
// seeing text on screen as low as practical for a batch (not truly streaming) ASR pipeline.
const CHUNK_MS = 3000;

// Whisper is inherently multi-lingual — this lets the doctor tell it which language the
// consultation is happening in (big accuracy win over guessing) or fall back to auto-detect
// for mixed/code-switched conversations, which are common in Indian outpatient settings.
const AMBIENT_LANGUAGES: { code: string; label: string }[] = [
  { code: "auto", label: "Auto-detect" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "or", label: "Odia" },
  { code: "as", label: "Assamese" },
  { code: "ne", label: "Nepali" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "zh", label: "Chinese (Mandarin)" },
];

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

// Languages the doctor can request a translated *view* of the SOAP draft in — no "auto" here
// since a translation always needs one concrete target language.
const VIEW_LANGUAGES = AMBIENT_LANGUAGES.filter((l) => l.code !== "auto");

export default function AmbientSoap({ encounterId, doctorName }: AmbientSoapProps) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [finalText, setFinalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [language, setLanguage] = useState("en");
  const languageRef = useRef(language);
  languageRef.current = language;

  // Doctor-side translated *view* of the SOAP draft — e.g. an English SOAP note the doctor
  // wants to read back in Hindi/Tamil for the patient. Reference only: never touches finalText,
  // so the approved clinical record always stays exactly what the doctor reviewed and approved.
  const [viewLanguage, setViewLanguage] = useState("en");
  const [translatedSoap, setTranslatedSoap] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const listeningRef = useRef(false);
  const chunkSeqRef = useRef(0);
  const nextToAppendRef = useRef(0);
  const pendingResultsRef = useRef<Map<number, { text: string; speaker: string | null }>>(new Map());
  const inFlightRef = useRef(0);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    return () => {
      listeningRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function appendInOrder(index: number, text: string, speaker: string | null) {
    pendingResultsRef.current.set(index, { text, speaker });
    while (pendingResultsRef.current.has(nextToAppendRef.current)) {
      const chunk = pendingResultsRef.current.get(nextToAppendRef.current)!;
      pendingResultsRef.current.delete(nextToAppendRef.current);
      nextToAppendRef.current += 1;
      if (chunk.text.trim()) {
        setTranscript((prev) => {
          const cleanText = chunk.text.trim();
          const line = chunk.speaker ? `${chunk.speaker}: ${cleanText}` : cleanText;
          // Start a new line per speaker turn instead of running everything together, so the
          // doctor/patient turns stay visually distinguishable in the plain-text transcript.
          if (!prev) return line;
          const lastLine = prev.split("\n").pop() || "";
          const sameSpeaker = chunk.speaker && lastLine.startsWith(`${chunk.speaker}: `);
          return sameSpeaker ? `${prev} ${cleanText}` : `${prev}\n${line}`;
        });
      }
    }
  }

  async function uploadChunk(index: number, blob: Blob, mimeType: string) {
    inFlightRef.current += 1;
    setTranscribing(true);
    try {
      const ext = mimeType.includes("ogg") ? "ogg" : "webm";
      const { text, speaker } = await api.ambientTranscribeAudio(encounterId, blob, `chunk-${index}.${ext}`, languageRef.current);
      appendInOrder(index, text || "", speaker ?? null);
    } catch {
      appendInOrder(index, "", null); // drop a failed chunk rather than stall ordering
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current === 0) setTranscribing(false);
    }
  }

  async function recordNextChunk(stream: MediaStream, mimeType: string, retry = 0) {
    if (!listeningRef.current) return;
    const parts: BlobPart[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();
      await new Promise((r) => setTimeout(r, CHUNK_MS));
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
    } catch {
      // Some browsers occasionally fail to (re)start a MediaRecorder on a live stream —
      // back off briefly and retry a few times before giving up on this listening session.
      if (listeningRef.current && retry < 5) {
        await new Promise((r) => setTimeout(r, 300));
        return recordNextChunk(stream, mimeType, retry + 1);
      }
      if (listeningRef.current) {
        setMicError("Ambient listening was interrupted — please click \"Start listening\" again.");
        stopListening();
      }
      return;
    }

    if (listeningRef.current) {
      // Kick off the next recording immediately so there's minimal gap in the "ambient" capture.
      recordNextChunk(stream, mimeType);
    }
    if (parts.length) {
      const blob = new Blob(parts, { type: recorder.mimeType || mimeType });
      if (blob.size > 800) {
        const index = chunkSeqRef.current++;
        uploadChunk(index, blob, recorder.mimeType || mimeType);
      }
    }
  }

  async function startListening() {
    if (!supported) {
      setMicError("Live listening needs a modern browser (Chrome, Edge, Firefox) with microphone support.");
      return;
    }
    setMicError(null);
    try {
      // Ask the browser to do its own noise suppression / echo cancellation / gain control on
      // the raw mic signal before it ever reaches Whisper — a free, real accuracy improvement
      // with no extra server-side cost.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      chunkSeqRef.current = 0;
      nextToAppendRef.current = 0;
      pendingResultsRef.current.clear();
      api.ambientResetSpeakers(encounterId).catch(() => {}); // fresh voice clustering for this session
      listeningRef.current = true;
      setListening(true);
      recordNextChunk(stream, mimeType);
    } catch {
      setMicError("Microphone access denied — allow mic permission to use ambient listening.");
    }
  }

  function stopListening() {
    listeningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setListening(false);
  }

  async function generate() {
    setBusy(true); 
    setApproved(false);
    setViewLanguage("en");
    setTranslatedSoap(null);
    setTranslateError(false);
    try {
      const r = await api.ambient(encounterId, transcript);
      setDraft(r); 
      setFinalText(r.result.draft_text);
    } finally { 
      setBusy(false); 
    }
  }

  async function viewInLanguage(lang: string, soap: any) {
    setViewLanguage(lang);
    setTranslateError(false);
    if (lang === "en" || !soap) {
      setTranslatedSoap(null);
      return;
    }
    const label = VIEW_LANGUAGES.find((l) => l.code === lang)?.label || lang;
    setTranslating(true);
    try {
      const combined = `S: ${soap.S}\nO: ${soap.O}\nA: ${soap.A}\nP: ${soap.P}`;
      const r = await api.translateText(combined, label);
      if (r.translated) setTranslatedSoap(r.translated_text);
      else { setTranslatedSoap(null); setTranslateError(true); }
    } catch {
      setTranslatedSoap(null);
      setTranslateError(true);
    } finally {
      setTranslating(false);
    }
  }

  async function approve() {
    setBusy(true);
    try {
      await api.approveNote(draft.note_id, { final_text: finalText, icd10_codes: draft.result.icd10, approved_by: doctorName || "Attending Doctor" });
      setApproved(true);
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 animate-in fade-in duration-300">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-bold text-slate-100" style={{ color: "#123a7a" }}>Consultation transcript</h4>
          <span className="flex items-center gap-2">
            <Wave recording={listening} />
            <span className="live" style={{ opacity: listening ? 1 : 0.45 }}>{listening ? "LISTENING" : "IDLE"}</span>
          </span>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <Languages size={14} style={{ color: "var(--dim)" }} />
          <label className="text-[12px] font-semibold" style={{ color: "var(--muted)" }}>Consultation language</label>
          <select
            className="input text-xs select"
            style={{ width: "auto", flex: "none" }}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {AMBIENT_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <textarea
          className="input"
          rows={7}
          placeholder="Type, paste, or click “Start listening” to dictate the consultation live…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
        {listening && (
          <div className="mt-1 text-[12.5px] italic" style={{ color: "var(--dim)" }}>
            {transcribing ? "Transcribing the last few seconds…" : "Listening — speak naturally, text appears every few seconds."}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={listening ? "btn danger" : "btn"}
            onClick={listening ? stopListening : startListening}
          >
            {listening ? (<><MicOff size={15} /> Stop listening</>) : (<><Mic size={15} /> Start listening</>)}
          </button>
          <button className="btn ghost" style={{ flex: 1 }} disabled={busy || !transcript.trim()} onClick={generate}>
            <Sparkles size={15} /> {busy ? "Transcribing…" : "Generate SOAP draft"}
          </button>
        </div>
        {micError && (
          <div className="mt-2 text-[12px]" style={{ color: "var(--red)" }}>{micError}</div>
        )}
        {!supported && !micError && (
          <div className="mt-2 text-[12px]" style={{ color: "var(--dim)" }}>
            Live speech-to-text needs microphone support in this browser — you can still type or paste the transcript.
          </div>
        )}
      </Card>
      <Card>
        {!draft ? <Empty>A SOAP note draft will appear here — you approve before it's committed.</Empty> : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-bold text-slate-100" style={{ color: "#123a7a" }}>SOAP draft</h4>
              <AgentBadge label="Draft — needs approval" />
            </div>
            {(draft.result.red_flags?.length > 0 || draft.result.abnormal_vitals?.length > 0) && (
              <div className="mb-2 rounded-lg border border-rose-500/40 bg-rose-950/20 p-2 text-[12px] text-rose-300">
                <div className="mb-1 flex items-center gap-1.5 font-bold"><ShieldAlert size={13} /> Safety signals detected — review before approving</div>
                {draft.result.red_flags?.length > 0 && (
                  <div>⚠ Red-flag keyword(s) in transcript: {draft.result.red_flags.join("; ")}</div>
                )}
                {draft.result.abnormal_vitals?.length > 0 && (
                  <div>⚠ Abnormal vitals: {draft.result.abnormal_vitals.join("; ")}</div>
                )}
              </div>
            )}
            <div className="holo whitespace-pre-wrap text-[13px] text-slate-200">
              <div><b>S:</b> {draft.result.soap.S}</div>
              <div><b>O:</b> {draft.result.soap.O}</div>
              <div><b>A:</b> {draft.result.soap.A}</div>
              <div><b>P:</b> {draft.result.soap.P}</div>
            </div>
            {draft.result.allergies_considered?.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px]" style={{ color: "var(--dim)" }}>
                <AlertTriangle size={11} /> Grounded with known allergies: {draft.result.allergies_considered.join(", ")}
              </div>
            )}
            <div className="mb-2 flex items-center gap-2">
              <Languages size={14} style={{ color: "var(--dim)" }} />
              <label className="text-[12px] font-semibold" style={{ color: "var(--muted)" }}>View in</label>
              <select
                className="input text-xs select"
                style={{ width: "auto", flex: "none" }}
                value={viewLanguage}
                onChange={(e) => viewInLanguage(e.target.value, draft.result.soap)}
              >
                {VIEW_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            {viewLanguage !== "en" && (
              <div className="mb-2 rounded-lg border p-2 text-[12.5px] whitespace-pre-wrap" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--dim)" }}>
                  Translated view · reference only — not part of the approved record
                </div>
                {translating
                  ? "Translating…"
                  : translateError
                  ? "Translation is unavailable right now (AI service offline) — showing the original English note above."
                  : translatedSoap}
              </div>
            )}
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
