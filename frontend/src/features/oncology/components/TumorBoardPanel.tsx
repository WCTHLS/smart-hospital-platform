import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty } from "../../../components/ui";
import AddTumorBoardCaseModal from "./AddTumorBoardCaseModal";

function statusTone(status: string): string {
  if (status === "DISCUSSED") return "green";
  if (status === "DEFERRED") return "amber";
  return "blue";
}

function TumorBoardCard({ tbCase, diagnosisId, readOnly }: { tbCase: any; diagnosisId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [recommendation, setRecommendation] = useState(tbCase.recommendation || "");
  const [busy, setBusy] = useState(false);

  async function saveRecommendation() {
    setBusy(true);
    try {
      await api.updateTumorBoardCase(tbCase.case_id, { recommendation, status: "DISCUSSED" });
      qc.invalidateQueries({ queryKey: ["oncology-diagnosis", diagnosisId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-extrabold" style={{ color: "var(--ink)" }}>
            Tumor Board · {tbCase.scheduled_date || "Date TBD"}
          </h3>
          {tbCase.attendees?.length > 0 && (
            <p className="text-[12px]" style={{ color: "var(--muted)" }}>
              {tbCase.attendees.map((a: any) => `${a.name} (${a.specialty})`).join(", ")}
            </p>
          )}
        </div>
        <Tag tone={statusTone(tbCase.status)}>{tbCase.status}</Tag>
      </div>

      {tbCase.case_summary && (
        <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--dim)" }}>{tbCase.case_summary}</p>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-[12px]" style={{ color: "var(--muted)" }}>MDT recommendation</label>
        {readOnly || tbCase.status === "DISCUSSED" ? (
          <p className="text-[12.5px] rounded-lg p-2.5" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}>
            {tbCase.recommendation || "Pending discussion."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
              rows={2}
              placeholder="Record the multidisciplinary team's recommendation..."
              className="w-full rounded-lg p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
            />
            <button
              onClick={saveRecommendation}
              disabled={busy || !recommendation.trim()}
              className="btn text-[12px] !py-1.5 !px-3 font-bold self-start"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", border: "none" }}
            >
              {busy ? "Saving..." : "Mark discussed & save"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function TumorBoardPanel({ diagnosis, readOnly = false }: { diagnosis: any; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [showAddCase, setShowAddCase] = useState(false);

  if (!diagnosis) return <Empty>No diagnosis on file for this patient.</Empty>;
  const cases = diagnosis.tumor_board_cases || [];

  const addCaseModal = showAddCase && (
    <AddTumorBoardCaseModal
      patientId={diagnosis.patient_id}
      diagnosisId={diagnosis.diagnosis_id}
      onClose={() => setShowAddCase(false)}
      onCreated={() => {
        setShowAddCase(false);
        qc.invalidateQueries({ queryKey: ["oncology-diagnosis", diagnosis.diagnosis_id] });
      }}
    />
  );

  const addCaseButton = !readOnly && (
    <button
      onClick={() => setShowAddCase(true)}
      className="btn sm inline-flex items-center gap-1.5"
      style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
    >
      <Plus size={14} /> Schedule case
    </button>
  );

  if (cases.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{addCaseButton}</div>
        <Empty>No tumor board (MDT) cases scheduled for this diagnosis.</Empty>
        {addCaseModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addCaseButton}</div>
      {cases.map((c: any) => (
        <TumorBoardCard key={c.case_id} tbCase={c} diagnosisId={diagnosis.diagnosis_id} readOnly={readOnly} />
      ))}
      {addCaseModal}
    </div>
  );
}
