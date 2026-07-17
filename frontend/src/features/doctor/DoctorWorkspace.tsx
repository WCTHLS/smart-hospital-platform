import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Mic, FlaskConical, Pill, Receipt } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useJourney } from "../../lib/store";
import { Tag } from "../../components/ui";

import DoctorQueue from "./components/DoctorQueue";
import Patient360 from "./components/Patient360";
import AmbientSoap from "./components/AmbientSoap";
import OrdersAndLabs from "./components/OrdersAndLabs";
import Prescription from "./components/Prescription";
import BillingDischarge from "./components/BillingDischarge";
import CopilotSidepane from "./components/CopilotSidepane";

const TABS = [
  { id: "p360", label: "Patient 360", icon: FileText },
  { id: "soap", label: "Ambient SOAP", icon: Mic },
  { id: "labs", label: "Orders & Labs", icon: FlaskConical },
  { id: "rx", label: "Prescription", icon: Pill },
  { id: "bill", label: "Billing & Discharge", icon: Receipt },
] as const;

export default function DoctorWorkspace() {
  const journey = useJourney();
  const qc = useQueryClient();
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
      const r = await api.approveRx(rxId, { approved_by: "Dr. Mehta", accept_substitutions: rxAccept, override_warnings: rxOverride });
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
      const r = await api.approveRx(draft.rx_id, { approved_by: "Dr. Mehta", accept_substitutions: false, override_warnings: false });
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
    });
  };

  const handleResetJourney = () => {
    setSel([]);
    setSuggestions([]);
    journey.reset();
  };

  if (!journey.encounterId || !journey.patientId) {
    return <DoctorQueue onSelectPatient={handleSelectPatient} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="grad-text text-2xl font-extrabold">{journey.patientName}</h1>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--muted)" }}>
            <Tag tone="green">ABHA verified</Tag>
            {journey.department && <Tag tone="blue">{journey.department}</Tag>}
            {journey.token && <Tag tone="violet">Token {journey.token}</Tag>}
            {journey.chiefComplaint && (
              <span className="text-slate-300 ml-2">
                Reason for Visit: <b className="text-[var(--cyan)]">{journey.chiefComplaint}</b>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            className="btn ghost text-[12.5px] !py-1.5 !px-3 font-bold" 
            onClick={handleResetJourney}
          >
            ← Back to Patient Queue
          </button>
          <span className="ai-badge"><Mic size={13} /> Copilot session</span>
        </div>
      </div>

      {/* Outer Grid Layout (Workflow + Copilot Pane) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button 
                key={t.id} 
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition"
                style={{
                  color: tab === t.id ? "#eafcff" : "var(--muted)",
                  background: tab === t.id ? "linear-gradient(90deg, rgba(52,225,232,.18), rgba(167,139,250,.18))" : "var(--panel)",
                  border: `1px solid ${tab === t.id ? "var(--line2)" : "var(--glass-border)"}`,
                }}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          <div className={tab === "p360" ? "" : "hidden"} key={`360-${journey.patientId}`}>
            <Patient360 patientId={journey.patientId} encounterId={journey.encounterId} />
          </div>

          <div className={tab === "soap" ? "" : "hidden"} key={`soap-${journey.encounterId}`}>
            <AmbientSoap encounterId={journey.encounterId} />
          </div>

          <div className={tab === "labs" ? "" : "hidden"} key={`labs-${journey.encounterId}`}>
            <OrdersAndLabs encounterId={journey.encounterId} sel={sel} setSel={setSel} />
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
            />
          </div>
          
          <div className={tab === "bill" ? "" : "hidden"} key={`bill-${journey.encounterId}`}>
            <BillingDischarge 
              encounterId={journey.encounterId} 
              onDischarged={() => {
                qc.invalidateQueries({ queryKey: ["doctor-queue"] });
              }}
              onBack={handleResetJourney} 
            />
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
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
