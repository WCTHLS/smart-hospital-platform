import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Plus } from "lucide-react";
import { api } from "../../../lib/api";
import { Card, Tag, Empty, SectionTitle } from "../../../components/ui";
import AddSurvivorshipPlanModal from "./AddSurvivorshipPlanModal";

export default function SurvivorshipPanel({
  patientId,
  diagnosisId,
  readOnly = false,
}: {
  patientId: string;
  diagnosisId?: string | null;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [showAddPlan, setShowAddPlan] = useState(false);

  const { data: plans, isLoading } = useQuery({
    queryKey: ["oncology-survivorship", patientId],
    queryFn: () => api.oncologySurvivorshipPlans(patientId),
    enabled: !!patientId,
  });

  const addPlanButton = !readOnly && diagnosisId && (
    <button
      onClick={() => setShowAddPlan(true)}
      className="btn sm inline-flex items-center gap-1.5"
      style={{ background: "var(--panel2)", border: "1px solid var(--glass-border)", color: "var(--ink)" }}
    >
      <Plus size={14} /> Create plan
    </button>
  );

  const addPlanModal = showAddPlan && diagnosisId && (
    <AddSurvivorshipPlanModal
      patientId={patientId}
      diagnosisId={diagnosisId}
      onClose={() => setShowAddPlan(false)}
      onCreated={() => {
        setShowAddPlan(false);
        qc.invalidateQueries({ queryKey: ["oncology-survivorship", patientId] });
      }}
    />
  );

  if (isLoading) {
    return <div className="py-4 text-center text-[13px]" style={{ color: "var(--muted)" }}>Loading...</div>;
  }
  if (!plans?.length) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{addPlanButton}</div>
        <Empty>No survivorship care plan on file yet — typically created after active treatment completes.</Empty>
        {addPlanModal}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{addPlanButton}</div>
      {plans.map((p: any) => (
        <Card key={p.plan_id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle sub="Post-treatment surveillance & late-effects monitoring">
              <span className="inline-flex items-center gap-2"><HeartPulse size={17} /> Survivorship Plan</span>
            </SectionTitle>
            <Tag tone={p.status === "ACTIVE" ? "green" : "blue"}>{p.status}</Tag>
          </div>

          {p.treatment_summary && (
            <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--dim)" }}>{p.treatment_summary}</p>
          )}

          {p.surveillance_schedule?.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Surveillance schedule</div>
              <div className="flex flex-wrap gap-1.5">
                {p.surveillance_schedule.map((s: any, i: number) => (
                  <Tag key={i} tone="blue">{s.test} · every {s.interval_months}mo</Tag>
                ))}
              </div>
            </div>
          )}

          {p.late_effects_risks?.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Late-effects risks</div>
              <div className="flex flex-wrap gap-1.5">
                {p.late_effects_risks.map((r: string) => (
                  <Tag key={r} tone="amber">{r}</Tag>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-[11.5px]" style={{ color: "var(--muted)" }}>
            {p.next_followup_date && <span>Next follow-up: <b style={{ color: "var(--ink)" }}>{p.next_followup_date}</b></span>}
          </div>

          {p.lifestyle_recommendations && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--muted)" }}>{p.lifestyle_recommendations}</p>
          )}
        </Card>
      ))}
      {addPlanModal}
    </div>
  );
}
