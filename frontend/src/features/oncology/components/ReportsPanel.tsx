import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine, Microscope, Plus } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty, SectionTitle } from "../../../components/ui";
import AddRadiologyReportModal from "./AddRadiologyReportModal";
import AddPathologyReportModal from "./AddPathologyReportModal";

function recistTone(recist: string | null): string {
  if (recist === "CR" || recist === "PR") return "green";
  if (recist === "PD") return "red";
  if (recist === "SD") return "amber";
  return "blue";
}

export default function ReportsPanel({ patientId, diagnosisId, readOnly = false }: { patientId: string; diagnosisId?: string | null; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [showAddRadiology, setShowAddRadiology] = useState(false);
  const [showAddPathology, setShowAddPathology] = useState(false);

  const { data: radiology, isLoading: loadingRad } = useQuery({
    queryKey: ["oncology-radiology", patientId],
    queryFn: () => api.oncologyRadiologyReports(patientId),
    enabled: !!patientId,
  });
  const { data: pathology, isLoading: loadingPath } = useQuery({
    queryKey: ["oncology-pathology", patientId],
    queryFn: () => api.oncologyPathologyReports(patientId),
    enabled: !!patientId,
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionTitle sub="CT / MRI / PET-CT staging & response-assessment reports">
            <span className="inline-flex items-center gap-2"><ScanLine size={17} /> Radiology</span>
          </SectionTitle>
          {!readOnly && (
            <button
              onClick={() => setShowAddRadiology(true)}
              className="btn sm inline-flex items-center gap-1.5"
              style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
            >
              <Plus size={14} /> Add report
            </button>
          )}
        </div>
        {loadingRad ? (
          <div className="py-4 text-center text-[13px]" style={{ color: "var(--muted)" }}>Loading...</div>
        ) : radiology?.length ? (
          <div className="space-y-2">
            {radiology.map((r: any) => (
              <div key={r.report_id} className="rounded-xl p-3" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{r.modality} · {r.body_region}</span>
                  {r.recist_response && <Tag tone={recistTone(r.recist_response)}>RECIST {r.recist_response}</Tag>}
                </div>
                {r.impression && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--dim)" }}><b>Impression:</b> {r.impression}</p>}
                {r.findings && <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>{r.findings}</p>}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No radiology reports on file.</Empty>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionTitle sub="Histopathology / cytopathology biopsy and resection reports">
            <span className="inline-flex items-center gap-2"><Microscope size={17} /> Pathology</span>
          </SectionTitle>
          {!readOnly && (
            <button
              onClick={() => setShowAddPathology(true)}
              className="btn sm inline-flex items-center gap-1.5"
              style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
            >
              <Plus size={14} /> Add report
            </button>
          )}
        </div>
        {loadingPath ? (
          <div className="py-4 text-center text-[13px]" style={{ color: "var(--muted)" }}>Loading...</div>
        ) : pathology?.length ? (
          <div className="space-y-2">
            {pathology.map((r: any) => (
              <div key={r.report_id} className="rounded-xl p-3" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{r.specimen_type} · {r.specimen_site}</span>
                  {r.margins_status && <Tag tone={r.margins_status === "CLEAR" ? "green" : "amber"}>Margins {r.margins_status}</Tag>}
                </div>
                {r.diagnosis_text && <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--dim)" }}>{r.diagnosis_text}</p>}
                {(r.lymph_nodes_examined ?? null) !== null && (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
                    Lymph nodes: {r.lymph_nodes_positive ?? 0} positive / {r.lymph_nodes_examined ?? 0} examined
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>No pathology reports on file.</Empty>
        )}
      </Card>

      {showAddRadiology && (
        <AddRadiologyReportModal
          patientId={patientId}
          diagnosisId={diagnosisId}
          onClose={() => setShowAddRadiology(false)}
          onCreated={() => {
            setShowAddRadiology(false);
            qc.invalidateQueries({ queryKey: ["oncology-radiology", patientId] });
          }}
        />
      )}
      {showAddPathology && (
        <AddPathologyReportModal
          patientId={patientId}
          diagnosisId={diagnosisId}
          onClose={() => setShowAddPathology(false)}
          onCreated={() => {
            setShowAddPathology(false);
            qc.invalidateQueries({ queryKey: ["oncology-pathology", patientId] });
          }}
        />
      )}
    </div>
  );
}
