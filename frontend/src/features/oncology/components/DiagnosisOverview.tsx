import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Card, Tag, Empty, SectionTitle } from "../../../components/ui";
import AddBiomarkerModal from "./AddBiomarkerModal";

function tnmString(tnm: any): string {
  if (!tnm) return "—";
  const parts = [tnm.t, tnm.n, tnm.m].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function statusTone(status: string): string {
  if (status === "ACTIVE") return "blue";
  if (status === "REMISSION") return "green";
  if (status === "RECURRENT") return "red";
  return "violet";
}

function resultTone(result: string | null): string {
  if (result === "POSITIVE" || result === "MUTATED") return "amber";
  if (result === "NEGATIVE") return "green";
  return "blue";
}

export default function DiagnosisOverview({ diagnosis, readOnly = false }: { diagnosis: any; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [showAddBiomarker, setShowAddBiomarker] = useState(false);

  if (!diagnosis) return <Empty>No diagnosis on file for this patient.</Empty>;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold" style={{ color: "var(--ink)" }}>
              {diagnosis.cancer_type} Cancer
            </h3>
            <p className="text-[13px]" style={{ color: "var(--muted)" }}>
              {diagnosis.primary_site || "Site not specified"} · {diagnosis.histology || "Histology pending"}
            </p>
          </div>
          <Tag tone={statusTone(diagnosis.status)}>{diagnosis.status}</Tag>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="metric"><div className="v">{diagnosis.stage_group || "—"}</div><div className="l">Stage group</div></div>
          <div className="metric"><div className="v">{tnmString(diagnosis.tnm)}</div><div className="l">TNM</div></div>
          <div className="metric"><div className="v">{diagnosis.grade || "—"}</div><div className="l">Grade</div></div>
          <div className="metric"><div className="v">{diagnosis.metastatic ? "Yes" : "No"}</div><div className="l">Metastatic</div></div>
        </div>

        {diagnosis.metastatic && diagnosis.metastatic_sites?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {diagnosis.metastatic_sites.map((s: string) => (
              <Tag key={s} tone="red">{s}</Tag>
            ))}
          </div>
        )}

        {diagnosis.notes && (
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: "var(--dim)" }}>{diagnosis.notes}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-3 text-[11.5px]" style={{ color: "var(--muted)" }}>
          {diagnosis.icd10_code && <span>ICD-10: <b>{diagnosis.icd10_code}</b></span>}
          {diagnosis.icdo_morphology_code && <span>ICD-O-3: <b>{diagnosis.icdo_morphology_code}</b></span>}
          {diagnosis.diagnosed_date && <span>Diagnosed: <b>{diagnosis.diagnosed_date}</b></span>}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <SectionTitle sub="Molecular and genetic markers guiding therapy selection">Biomarkers</SectionTitle>
          {!readOnly && (
            <button
              onClick={() => setShowAddBiomarker(true)}
              className="btn sm inline-flex items-center gap-1.5"
              style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
            >
              <Plus size={14} /> Add biomarker
            </button>
          )}
        </div>
        {diagnosis.biomarkers?.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {diagnosis.biomarkers.map((b: any) => (
              <div key={b.biomarker_id} className="rounded-xl p-3" style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[13px]" style={{ color: "var(--ink)" }}>{b.marker_name}</span>
                  <Tag tone={resultTone(b.result)}>{b.result || "—"}</Tag>
                </div>
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--muted)" }}>
                  {b.value && <span>{b.value} · </span>}
                  {b.method}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No biomarker results recorded yet.</Empty>
        )}
      </Card>

      {showAddBiomarker && (
        <AddBiomarkerModal
          diagnosisId={diagnosis.diagnosis_id}
          onClose={() => setShowAddBiomarker(false)}
          onCreated={() => {
            setShowAddBiomarker(false);
            qc.invalidateQueries({ queryKey: ["oncology-diagnosis", diagnosis.diagnosis_id] });
          }}
        />
      )}
    </div>
  );
}
