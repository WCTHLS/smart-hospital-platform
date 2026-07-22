import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty, SectionTitle } from "../../../components/ui";
import AddChemoRegimenModal from "./AddChemoRegimenModal";

function regimenStatusTone(status: string): string {
  if (status === "ACTIVE") return "blue";
  if (status === "COMPLETED") return "green";
  if (status === "DISCONTINUED") return "red";
  return "violet";
}

function cycleStatusTone(status: string): string {
  if (status === "ADMINISTERED") return "green";
  if (status === "DELAYED") return "amber";
  if (status === "SKIPPED") return "red";
  return "blue";
}

function CycleRow({ cycle, diagnosisId, readOnly }: { cycle: any; diagnosisId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function markAdministered() {
    setBusy(true);
    try {
      await api.updateChemoCycle(cycle.cycle_id, {
        status: "ADMINISTERED",
        administered_date: new Date().toISOString().slice(0, 10),
      });
      qc.invalidateQueries({ queryKey: ["oncology-diagnosis", diagnosisId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}>
      <div className="flex items-center gap-3">
        <span className="font-bold text-[12.5px]" style={{ color: "var(--ink)" }}>Cycle {cycle.cycle_number}</span>
        <Tag tone={cycleStatusTone(cycle.status)}>{cycle.status}</Tag>
        <span className="text-[11.5px]" style={{ color: "var(--muted)" }}>
          {cycle.administered_date ? `Given ${cycle.administered_date}` : cycle.scheduled_date ? `Scheduled ${cycle.scheduled_date}` : ""}
        </span>
      </div>
      {!readOnly && cycle.status === "SCHEDULED" && (
        <button
          onClick={markAdministered}
          disabled={busy}
          className="btn text-[11.5px] !py-1 !px-2.5 font-bold flex items-center gap-1"
          style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", border: "none" }}
        >
          <CheckCircle2 size={13} /> {busy ? "Saving..." : "Mark administered"}
        </button>
      )}
    </div>
  );
}

export default function ChemoTracker({ diagnosis, readOnly = false }: { diagnosis: any; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [showAddRegimen, setShowAddRegimen] = useState(false);

  if (!diagnosis) return <Empty>No diagnosis on file for this patient.</Empty>;
  const regimens = diagnosis.chemo_regimens || [];

  const addRegimenModal = showAddRegimen && (
    <AddChemoRegimenModal
      patientId={diagnosis.patient_id}
      diagnosisId={diagnosis.diagnosis_id}
      onClose={() => setShowAddRegimen(false)}
      onCreated={() => {
        setShowAddRegimen(false);
        qc.invalidateQueries({ queryKey: ["oncology-diagnosis", diagnosis.diagnosis_id] });
      }}
    />
  );

  const addRegimenButton = !readOnly && (
    <button
      onClick={() => setShowAddRegimen(true)}
      className="btn sm inline-flex items-center gap-1.5"
      style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
    >
      <Plus size={14} /> New regimen
    </button>
  );

  if (regimens.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{addRegimenButton}</div>
        <Empty>No chemotherapy regimens prescribed for this diagnosis yet.</Empty>
        {addRegimenModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addRegimenButton}</div>
      {regimens.map((r: any) => (
        <Card key={r.regimen_id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-extrabold" style={{ color: "var(--ink)" }}>{r.protocol_name}</h3>
              <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                {r.intent} · Line {r.line_of_therapy ?? "—"} · {r.cycle_length_days ? `${r.cycle_length_days}-day cycles` : ""}
              </p>
            </div>
            <Tag tone={regimenStatusTone(r.status)}>{r.status}</Tag>
          </div>

          {r.drugs?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.drugs.map((d: any, i: number) => (
                <Tag key={i} tone="violet">{d.name} {d.dose ? `· ${d.dose}` : ""}</Tag>
              ))}
            </div>
          )}

          <div className="mt-3">
            <SectionTitle>Cycles ({r.cycles?.length || 0}/{r.planned_cycles ?? "?"})</SectionTitle>
            <div className="space-y-1.5">
              {(r.cycles || []).map((c: any) => (
                <CycleRow key={c.cycle_id} cycle={c} diagnosisId={diagnosis.diagnosis_id} readOnly={readOnly} />
              ))}
            </div>
          </div>

          {r.discontinued_reason && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--muted)" }}>Discontinued: {r.discontinued_reason}</p>
          )}
        </Card>
      ))}
      {addRegimenModal}
    </div>
  );
}
