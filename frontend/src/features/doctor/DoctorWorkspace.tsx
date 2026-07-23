import { useState } from "react";
import { FileText, Mic, FlaskConical, Pill, ArrowLeft, Sparkles } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { Tag, LiveDot } from "../../components/ui";

import DoctorQueue from "./components/DoctorQueue";
import Patient360 from "./components/Patient360";
import AmbientSoap from "./components/AmbientSoap";
import OrdersAndLabs from "./components/OrdersAndLabs";
import Prescription from "./components/Prescription";
import CopilotSidepane from "./components/CopilotSidepane";

const TABS = [
  { id: "p360", label: "Patient 360", icon: FileText },
  { id: "soap", label: "Ambient SOAP", icon: Mic },
  { id: "labs", label: "Orders & Labs", icon: FlaskConical },
  { id: "rx", label: "Prescription", icon: Pill },
] as const;

export default function DoctorWorkspace() {
  const journey = useJourney();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("p360");
  
  const [sel, setSel] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Hoisted prescription state
  const [rxItems, setRxItems] = useState<any[]>([]);
  const [cds, setCds] = useState<any>(null);
  const [rxId, setRxId] = useState<string | null>(null);
  const [rxBusy, setRxBusy] = useState(false);
  const [rxAccept, setRxAccept] = useState(false);
  const [rxOverride, setRxOverride] = useState(false);
  const [rxDone, setRxDone] = useState<any>(null);
  const [rxErr, setRxErr] = useState<string | null>(null);

  const toggleTest = (t: string) => setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  async function runCds(items: any[]) {
    setRxBusy(true); 
    setRxDone(null); 
    setRxErr(null);
    try {
      const payloadItems = items.map((it) => ({
        drug_name: it.drug_name,
        dose: it.dose,
        frequency: it.frequency,
        duration_days: it.duration_days ? parseInt(String(it.duration_days), 10) : null,
        instructions: it.instructions || null,
      }));
      const r = await api.createRx({ encounter_id: journey.encounterId!, items: payloadItems });
      setCds(r.result); 
      setRxId(r.rx_id);
    } finally { 
      setRxBusy(false); 
    }
  }

  async function approve() {
    if (!rxId) return;
    setRxBusy(true); 
    setRxErr(null);
    try {
      const r = await api.approveRx(rxId, { approved_by: journey.doctorName || "Attending Doctor", accept_substitutions: rxAccept, override_warnings: rxOverride });
      setRxDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setRxErr("Blocked by CDS — resolve the allergy conflict, accept a substitution, or override warning.");
        setCds((e.detail as any)?.cds?.result || cds);
      }
    } finally { 
      setRxBusy(false); 
    }
  }

  async function approveNoMeds() {
    setRxBusy(true);
    setRxErr(null);
    setRxDone(null);
    try {
      const draft = await api.createRx({ encounter_id: journey.encounterId!, items: [] });
      const r = await api.approveRx(draft.rx_id, { approved_by: journey.doctorName || "Attending Doctor", accept_substitutions: false, override_warnings: false });
      setRxDone(r);
    } catch (e: any) {
      setRxErr(e.message || "Failed to e-sign empty prescription");
    } finally {
      setRxBusy(false);
    }
  }

  async function getSuggestions(encounterId: string) {
    setLoadingSuggestions(true);
    try {
      const r = await api.suggestLabOrders(encounterId);
      setSuggestions(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  const handleSelectPatient = (enc: any) => {
    setSel([]);
    setSuggestions([]);
    setRxItems([]);
    setCds(null);
    setRxId(null);
    setRxBusy(false);
    setRxAccept(false);
    setRxOverride(false);
    setRxDone(null);
    setRxErr(null);
    journey.set({
      patientId: enc.patient.patient_id,
      encounterId: enc.encounter_id,
      patientName: enc.patient.name,
      token: enc.token?.number || null,
      department: enc.visit_type || null,
      chiefComplaint: enc.triage?.chief_complaint || null,
      doctorName: enc._doctorName || null,
    });
  };

  const handleResetJourney = () => {
    setSel([]);
    setSuggestions([]);
    journey.reset();
  };

  const handleBackToQueue = () => {
    if (rxDone) {
      handleResetJourney();
      return;
    }
    if (window.confirm("This patient hasn't been discharged yet. Go back to the queue anyway?")) {
      handleResetJourney();
    }
  };

  if (!journey.encounterId || !journey.patientId) {
    return <DoctorQueue onSelectPatient={handleSelectPatient} />;
  }

  const initials = (journey.patientName || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-4 sm:p-5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(360px 140px at 0% 0%, rgba(37,100,207,0.08), transparent)" }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="avatar-disc h-14 w-14 text-lg">{initials}</div>
            <div className="min-w-0">
              <h1 className="grad-text-page truncate text-2xl font-extrabold leading-tight">{journey.patientName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
                <Tag tone="green">ABHA verified</Tag>
                {journey.department && <Tag tone="blue">{journey.department}</Tag>}
                {journey.token && <Tag tone="violet">Token {journey.token}</Tag>}
              </div>
              {journey.chiefComplaint && (
                <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--dim)" }}>
                  Reason for visit — <b style={{ color: "var(--cyan)" }}>{journey.chiefComplaint}</b>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              className="btn ghost text-[12.5px] !py-1.5 !px-3 font-bold"
              onClick={handleBackToQueue}
            >
              <ArrowLeft size={14} /> Back to Queue
            </button>
            <LiveDot label="Session active" tone="mint" />
          </div>
        </div>
      </div>

      {/* Outer Grid Layout (Workflow + Clinical Decision Support Pane) */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_clamp(320px,26vw,440px)] 2xl:gap-6">
        <div className="space-y-4">
          {/* Tabs */}
          <div className="tab-pills">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`tab-pill ${tab === t.id ? "is-active" : ""}`}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          <div className={tab === "p360" ? "" : "hidden"} key={`360-${journey.patientId}`}>
            <Patient360 patientId={journey.patientId} encounterId={journey.encounterId} />
          </div>

          <div className={tab === "soap" ? "" : "hidden"} key={`soap-${journey.encounterId}`}>
            <AmbientSoap encounterId={journey.encounterId} doctorName={journey.doctorName} />
          </div>

          <div className={tab === "labs" ? "" : "hidden"} key={`labs-${journey.encounterId}`}>
            <OrdersAndLabs encounterId={journey.encounterId} sel={sel} setSel={setSel} doctorName={journey.doctorName} />
          </div>
          
          <div className={tab === "rx" ? "" : "hidden"} key={`rx-${journey.encounterId}`}>
            <Prescription 
              encounterId={journey.encounterId}
              items={rxItems}
              setItems={setRxItems}
              cds={cds}
              setCds={setCds}
              rxId={rxId}
              setRxId={setRxId}
              busy={rxBusy}
              done={rxDone}
              setDone={setRxDone}
              err={rxErr}
              setErr={setRxErr}
              runCds={runCds}
              approveNoMeds={approveNoMeds}
              onDischarged={handleResetJourney}
            />
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--dim)" }}>
            <Sparkles size={12} style={{ color: "var(--cyan)" }} /> AI Copilot
          </div>
          <CopilotSidepane 
            patientId={journey.patientId} 
            tab={tab}
            encounterId={journey.encounterId}
            chiefComplaint={journey.chiefComplaint}
            sel={sel}
            toggle={toggleTest}
            suggestions={suggestions}
            loadingSuggestions={loadingSuggestions}
            onGetSuggestions={() => getSuggestions(journey.encounterId!)}
            
            rxItems={rxItems}
            setRxItems={setRxItems}
            cds={cds}
            setCds={setCds}
            rxId={rxId}
            rxBusy={rxBusy}
            rxAccept={rxAccept}
            setRxAccept={setRxAccept}
            rxOverride={rxOverride}
            setRxOverride={setRxOverride}
            rxDone={rxDone}
            rxErr={rxErr}
            approveRx={approve}
            runCds={runCds}
          />
        </div>
      </div>
    </div>
  );
}
