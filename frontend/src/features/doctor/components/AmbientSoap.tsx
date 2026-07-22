import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, CheckCircle2, BadgeCheck, Sparkles } from "lucide-react";
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

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export default function AmbientSoap({ encounterId, doctorName }: AmbientSoapProps) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [finalText, setFinalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);

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
      const { text, speaker } = await api.ambientTranscribeAudio(encounterId, blob, `chunk-${index}.${ext}`);
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
