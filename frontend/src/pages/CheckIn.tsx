import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Send, QrCode } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useJourney } from "../lib/store";
import { DeviceBar, AgentBadge, SectionTitle } from "../components/ui";

type Msg = { who: "bot" | "me"; text: string };

export default function CheckIn() {
  const nav = useNavigate();
  const setJourney = useJourney((s) => s.set);
  const [abha, setAbha] = useState("91-2345-6789-0123");
  const [reason, setReason] = useState("Fever and cough for 3 days");
  const [step, setStep] = useState<"abha" | "reason" | "consent" | "done">("abha");
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState<any>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: "bot", text: "Welcome to Aarogya 👋 Scan your ABHA QR or share your ABHA number to check in." },
  ]);

  const push = (m: Msg) => setMsgs((prev) => [...prev, m]);

  async function doCheckin() {
    setBusy(true);
    push({ who: "me", text: `ABHA: ${abha}` });
    try {
      const res = await api.checkin({ abha_number: abha, channel: "WHATSAPP", reason });
      setPatient(res.patient);
      setJourney({ patientId: res.patient.patient_id, patientName: res.patient.name, encounterId: res.encounter_id });
      push({ who: "bot", text: `✔️ Identity confirmed — ${res.patient.name} (${res.patient.gender}, ${res.patient.age}). What brings you in today?` });
      setStep("reason");
    } catch (e) {
      const msg = e instanceof ApiError ? String(e.message) : "Something went wrong";
      push({ who: "bot", text: `⚠️ ${msg}. Please register at the front desk.` });
    } finally {
      setBusy(false);
    }
  }

  async function doIntake() {
    setBusy(true);
    push({ who: "me", text: reason });
    try {
      const res = await api.intakePreview(reason);
      const r = res.result;
      push({ who: "bot", text: `🧠 ${r.symptom_summary}` });
      if (r.red_flags?.length) {
        push({ who: "bot", text: `🚨 Red flag noted: ${r.red_flags.join(" ")} You'll be prioritised.` });
      }
      setStep("consent");
    } finally {
      setBusy(false);
    }
  }

  async function doConsent() {
    if (!patient) return;
    setBusy(true);
    try {
      await api.consent(patient.patient_id);
      push({ who: "bot", text: "🔐 Consent granted — your records are available to your care team for this visit only (time-bound, revocable)." });
      setStep("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Phone */}
      <div>
        <div className="device mx-auto max-w-[360px]" style={{ borderRadius: 30 }}>
          <DeviceBar right={<span className="ml-auto text-[11px]" style={{ color: "var(--mint)" }}>● secure chat</span>} />
          <div className="p-4">
            <div className="flex flex-col">
              {msgs.map((m, i) => (
                <div key={i} className={`bubble ${m.who === "me" ? "me" : ""}`}>{m.text}</div>
              ))}
            </div>

            {step === "abha" && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 rounded-xl px-2 py-1"
                  style={{ background: "rgba(0,0,0,.35)", border: "1px solid var(--line2)" }}>
                  <QrCode size={18} color="var(--cyan)" />
                  <input className="input !border-0 !bg-transparent" value={abha} onChange={(e) => setAbha(e.target.value)} />
                </div>
                <button className="btn g w-full" disabled={busy} onClick={doCheckin}>Check in</button>
              </div>
            )}

            {step === "reason" && (
              <div className="mt-3 space-y-2">
                <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe your symptoms" />
                <button className="btn w-full" disabled={busy} onClick={doIntake}>
                  Send <Send size={15} />
                </button>
              </div>
            )}

            {step === "consent" && (
              <div className="mt-3">
                <div className="holo mb-2 flex items-center gap-2">
                  <ShieldCheck size={16} color="var(--cyan)" />
                  <span>Grant access to your health records for this visit.</span>
                </div>
                <button className="btn g w-full" disabled={busy} onClick={doConsent}>Grant consent</button>
              </div>
            )}

            {step === "done" && (
              <div className="mt-3 space-y-2">
                <div className="kv"><span>Status</span><b style={{ color: "var(--mint)" }}>● Ready — no queue</b></div>
                <button className="btn w-full" onClick={() => nav("/triage", { state: { symptom: reason } })}>
                  Proceed to triage
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Explainer */}
      <div>
        <SectionTitle sub="Multi-channel access with zero-struggle onboarding.">Digital check-in</SectionTitle>
        <div className="space-y-3">
          {[
            ["1 · Identity", "ABHA / mobile / MRN verified against the EMPI. No forms, no queues."],
            ["2 · AI intake", "The Intake agent captures symptoms and screens for red flags in plain language."],
            ["3 · Consent", "A time-bound, revocable ABDM consent artifact is created before any record is read."],
            ["4 · Patient 360", "The full longitudinal record is assembled and ready for the clinician."],
          ].map(([t, d]) => (
            <div key={t} className="card flex items-center gap-3">
              <AgentBadge label="AI" />
              <div>
                <div className="font-bold" style={{ color: "#d7e5ff" }}>{t}</div>
                <div className="text-[13px]" style={{ color: "var(--muted)" }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
