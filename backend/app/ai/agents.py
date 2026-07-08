"""The agent mesh.

Each agent = a deterministic, auditable clinical core (safe, offline-capable) + an optional LLM
narrative layer on top. Safety-critical decisions (red flags, allergy conflicts, interactions,
abnormal flags) are ALWAYS computed by rules; the LLM only enriches human-readable text.
Every clinical output is returned as a *draft that requires approval*.
"""
from __future__ import annotations

from typing import Any, Callable

from app.ai import knowledge as kb
from app.ai.gateway import gateway
from app.ai.guardrails import envelope, redact_pii
from app.core.config import settings


def _source() -> str:
    return f"llm:{settings.ollama_model}" if gateway.available() else "deterministic-engine"


# ------------------------------------------------------------------------------------ Intake Agent
def intake_agent(symptom_text: str, *, duration: str | None = None) -> dict[str, Any]:
    red_flags = kb.detect_red_flags(symptom_text)
    chief = (symptom_text or "").strip().split(".")[0][:120]

    summary = None
    prompt = (
        "You are a clinical intake assistant. In 1-2 sentences, neutrally summarise the patient's "
        "presenting complaint for a triage nurse. Do not diagnose.\n\n"
        f"Patient says: {redact_pii(symptom_text)}\n"
        f"Duration: {duration or 'unspecified'}"
    )
    llm = gateway.generate(prompt, temperature=0.1)
    if llm:
        summary = llm.strip()
    if not summary:
        dur = f" for {duration}" if duration else ""
        summary = f"Patient reports {chief.lower()}{dur}."

    return envelope(
        {
            "chief_complaint": chief,
            "symptom_summary": summary,
            "red_flags": red_flags,
            "duration": duration,
        },
        agent="Intake",
        needs_approval=True,
        source=_source(),
        citations=["ESI triage red-flag list"],
    )


# ------------------------------------------------------------------------------------ Triage Agent
def triage_agent(
    chief_complaint: str,
    symptom_summary: str,
    vitals: dict[str, Any] | None,
    age: int | None,
) -> dict[str, Any]:
    vitals = vitals or {}
    combined = f"{chief_complaint} {symptom_summary}"
    red_flags = kb.detect_red_flags(combined)

    # Vitals-driven acuity escalation
    critical_vital = False
    reasons: list[str] = list(red_flags)
    spo2 = vitals.get("spo2")
    sbp = vitals.get("bp_systolic")
    hr = vitals.get("heart_rate")
    temp = vitals.get("temperature")
    if spo2 is not None and spo2 < kb.VITAL_THRESHOLDS["spo2_critical"]:
        critical_vital = True
        reasons.append(f"SpO₂ {spo2}% below {kb.VITAL_THRESHOLDS['spo2_critical']}%.")
    if sbp is not None and sbp < kb.VITAL_THRESHOLDS["sbp_low"]:
        critical_vital = True
        reasons.append(f"Systolic BP {sbp} mmHg (hypotension).")
    if hr is not None and hr > kb.VITAL_THRESHOLDS["hr_high"]:
        reasons.append(f"Heart rate {hr} bpm (tachycardia).")
    if temp is not None and temp >= kb.VITAL_THRESHOLDS["temp_high"]:
        reasons.append(f"Temperature {temp}°F (high-grade fever).")

    if critical_vital:
        acuity = "1"
    elif red_flags:
        acuity = "2"
    elif hr and hr > kb.VITAL_THRESHOLDS["hr_high"] or (temp and temp >= kb.VITAL_THRESHOLDS["temp_high"]):
        acuity = "3"
    else:
        acuity = "3" if (age and (age < 2 or age > 70)) else "4"

    specialty = kb.route_specialty(combined)
    reason = " ".join(reasons) if reasons else "Stable vitals; routine outpatient assessment."

    return envelope(
        {
            "acuity_level": acuity,
            "specialty": specialty,
            "red_flag": bool(red_flags or critical_vital),
            "red_flag_reason": reason if (red_flags or critical_vital) else None,
            "rationale": reason,
        },
        agent="Triage",
        needs_approval=True,
        source=_source(),
        citations=["Emergency Severity Index (ESI) v4", "Vital-sign escalation thresholds"],
    )


# ------------------------------------------------------------------------------- Ambient Docs Agent
def ambient_docs_agent(transcript: str, patient_context: dict[str, Any]) -> dict[str, Any]:
    icd10 = kb.suggest_icd10(transcript)

    soap: dict[str, str] | None = None
    system = (
        "You are an ambient clinical scribe. Convert the consultation transcript into a concise SOAP "
        "note. Return STRICT JSON with keys S, O, A, P (strings). Be factual; never invent findings."
    )
    prompt = (
        f"Patient: {patient_context.get('age', '?')}{patient_context.get('gender', '')}. "
        f"Active problems: {patient_context.get('problems', 'none recorded')}.\n\n"
        f"Transcript:\n{redact_pii(transcript)}"
    )
    llm = gateway.generate_json(prompt, system=system)
    if isinstance(llm, dict) and {"S", "O", "A", "P"} <= set(llm):
        soap = {k: str(llm[k]) for k in ("S", "O", "A", "P")}

    if not soap:
        # Deterministic fallback SOAP
        chief = patient_context.get("chief_complaint", "the presenting complaint")
        vit = patient_context.get("vitals_line", "")
        dx = icd10[0]["label"] if icd10 else "clinical impression pending"
        code = f" (ICD-10 {icd10[0]['code']})" if icd10 else ""
        soap = {
            "S": f"{patient_context.get('age', '')}{patient_context.get('gender', '')} presenting with {chief}. {transcript[:200]}".strip(),
            "O": vit or "Examination findings to be documented.",
            "A": f"{dx}{code}.",
            "P": "Investigations as ordered; symptomatic treatment; review in 48 hours or earlier if worsening.",
        }

    draft_text = f"S: {soap['S']}\nO: {soap['O']}\nA: {soap['A']}\nP: {soap['P']}"
    return envelope(
        {"soap": soap, "icd10": icd10, "draft_text": draft_text},
        agent="Ambient Docs",
        needs_approval=True,
        source=_source(),
        citations=["ICD-10", "SOAP documentation standard"],
    )


# -------------------------------------------------------------------------- Lab Intelligence Agent
def _flag_for(value: float | None, low: float | None, high: float | None) -> str:
    if value is None:
        return "N"
    if high is not None and value > high:
        return "HH" if value > high * 1.5 else "H"
    if low is not None and value < low:
        return "LL" if value < low * 0.5 else "L"
    return "N"


def lab_intelligence_agent(results: list[dict[str, Any]]) -> dict[str, Any]:
    structured: list[dict[str, Any]] = []
    abnormal: list[dict[str, Any]] = []
    for r in results:
        flag = r.get("abnormal_flag") or _flag_for(
            r.get("value"), r.get("reference_low"), r.get("reference_high")
        )
        item = {**r, "abnormal_flag": flag}
        structured.append(item)
        if flag != "N":
            abnormal.append(item)

    if abnormal:
        names = ", ".join(f"{a.get('analyte', a.get('test_code'))} {a.get('value')}{a.get('unit', '')}" for a in abnormal)
        summary = f"{len(abnormal)} abnormal result(s): {names}. Correlate clinically."
    else:
        summary = "All results within reference ranges."

    return envelope(
        {"structured": structured, "abnormal": abnormal, "summary": summary},
        agent="Lab Intelligence",
        needs_approval=True,
        source="deterministic-engine",
        citations=["Reference interval ranges"],
    )


# --------------------------------------------------------------------------------- Rx CDS Agent
def rx_cds_agent(
    allergies: list[dict[str, Any]],
    current_meds: list[str],
    proposed_items: list[dict[str, Any]],
    stock_index: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    stock_index = stock_index or {}
    alerts: list[dict[str, Any]] = []
    suggestions: list[dict[str, Any]] = []
    block = False

    allergy_classes = {(a.get("drug_class") or "").lower() for a in allergies if a.get("drug_class")}
    allergy_substances = {(a.get("substance") or "").lower() for a in allergies}

    all_meds_lower = [m.lower() for m in current_meds]

    for item in proposed_items:
        name = item.get("drug_name", "")
        name_l = name.lower()
        cls = kb.drug_class_of(name)

        # 1) Allergy conflict → BLOCK
        if (cls and cls in allergy_classes) or any(s and s in name_l for s in allergy_substances):
            block = True
            alerts.append(
                {
                    "severity": "BLOCK",
                    "type": "ALLERGY",
                    "drug": name,
                    "message": f"Allergy conflict: patient allergic to {cls or 'this substance'}. Choose an alternative.",
                }
            )
            matched_alts = []
            for eq_key, eq_alts in kb.THERAPEUTIC_EQUIVALENTS.items():
                if eq_key in name_l:
                    matched_alts = eq_alts
                    break
            for alt in matched_alts:
                suggestions.append({"for": name, "suggestion": alt, "reason": "Non-cross-reactive alternative"})

        # 2) Drug–drug interactions
        for a, b, sev, msg in kb.DRUG_INTERACTIONS:
            partners = all_meds_lower + [i.get("drug_name", "").lower() for i in proposed_items if i is not item]
            if a.strip() in name_l and any(b.strip() in p for p in partners):
                alerts.append({"severity": sev, "type": "INTERACTION", "drug": name, "message": msg})

        # 3) Stock + formulary
        rec = stock_index.get(name_l)
        if rec is None:
            alerts.append(
                {"severity": "INFO", "type": "STOCK", "drug": name, "message": "Not found in pharmacy stock."}
            )
        elif rec.get("available", 0) <= 0:
            alerts.append({"severity": "WARN", "type": "STOCK", "drug": name, "message": "Out of stock."})
            salt = (rec.get("salt") or "").lower()
            for cand_name, cand in stock_index.items():
                if cand.get("available", 0) > 0 and salt and (cand.get("salt") or "").lower() == salt and cand_name != name_l:
                    suggestions.append(
                        {"for": name, "suggestion": cand.get("display", cand_name.title()), "reason": "Same salt, in stock"}
                    )
                    break
        elif rec.get("formulary") is False:
            alerts.append({"severity": "INFO", "type": "FORMULARY", "drug": name, "message": "Non-formulary item."})

    return envelope(
        {"alerts": alerts, "suggestions": suggestions, "block": block},
        agent="Rx CDS",
        needs_approval=True,
        source="deterministic-engine",
        citations=["Allergy cross-reactivity table", "Drug-interaction knowledge base", "Live formulary"],
    )


# ------------------------------------------------------------------------------- Compliance Agent
def compliance_agent(bundle: dict[str, Any]) -> dict[str, Any]:
    gaps: list[dict[str, str]] = []
    if not bundle.get("has_consent"):
        gaps.append({"area": "Consent", "detail": "No active consent artifact on record."})
    if not bundle.get("has_vitals"):
        gaps.append({"area": "Vitals", "detail": "Vitals not captured for this encounter."})
    if not bundle.get("note_approved"):
        gaps.append({"area": "Documentation", "detail": "Clinical note not approved by clinician."})
    if not bundle.get("has_diagnosis"):
        gaps.append({"area": "Coding", "detail": "No ICD-10 diagnosis code recorded."})
    if bundle.get("has_prescription") and not bundle.get("rx_approved"):
        gaps.append({"area": "Prescription", "detail": "Prescription drafted but not e-signed."})

    return envelope(
        {"gaps": gaps, "complete": not gaps},
        agent="Compliance",
        needs_approval=False,
        source="deterministic-engine",
        citations=["OPD documentation completeness checklist"],
    )


# ---------------------------------------------------------------------------- Command-Center Agent
def command_center_agent(metrics: dict[str, Any]) -> dict[str, Any]:
    alerts: list[dict[str, str]] = []
    if metrics.get("lab_tat_minutes", 0) > 45:
        alerts.append({"level": "SLA", "message": f"Lab TAT {metrics['lab_tat_minutes']}m exceeds 45m target."})
    for drug, qty in (metrics.get("low_stock") or {}).items():
        alerts.append({"level": "STOCK", "message": f"{drug} low ({qty} left)."})
    if metrics.get("queue_depth", 0) > 25:
        alerts.append({"level": "FLOW", "message": f"Queue depth {metrics['queue_depth']} — consider adding a provider."})
    if metrics.get("compliance_gaps", 0) > 0:
        alerts.append({"level": "COMPLIANCE", "message": f"{metrics['compliance_gaps']} open documentation gap(s)."})

    return envelope(
        {"alerts": alerts},
        agent="Command-Center",
        needs_approval=False,
        source="deterministic-engine",
    )


# ------------------------------------------------------------------------- Patient Summary Agent
def patient_summary_agent(
    patient_brief: dict[str, Any],
    allergies: list[dict[str, Any]],
    active_meds: list[str],
    recent_notes: list[dict[str, Any]],
    latest_vitals: dict[str, Any] | None,
) -> dict[str, Any]:
    """Generates an AI-drafted summary of the patient's medical history."""
    allergies_str = ", ".join(a.get("substance", "") for a in allergies) or "No known allergies"
    meds_str = ", ".join(active_meds) or "No active medications"
    vitals_str = ""
    if latest_vitals:
        vitals_str = f"BP {latest_vitals.get('bp')}, SpO₂ {latest_vitals.get('spo2')}%"
    
    past_diagnoses = []
    for n in recent_notes[:3]:
        past_diagnoses.append(f"On {n.get('date')}: {n.get('text', '')[:80]}...")
    diagnoses_str = "; ".join(past_diagnoses) or "No past visit notes"

    summary = None
    prompt = (
        "You are an expert clinical summarizer. Summarize the following patient history in 2-3 concise bullet points "
        "for the consulting doctor.\n\n"
        f"Patient: {patient_brief.get('name')}, {patient_brief.get('age')} years, {patient_brief.get('gender')}.\n"
        f"Allergies: {allergies_str}\n"
        f"Active Meds: {meds_str}\n"
        f"Latest Vitals: {vitals_str}\n"
        f"Past History: {diagnoses_str}\n"
        "Be factual, clinical, and highlight critical concerns (especially allergies)."
    )
    llm = gateway.generate(prompt, temperature=0.1)
    if llm:
        summary = llm.strip()
    if not summary:
        summary = (
            f"Patient is a {patient_brief.get('age')}yo {patient_brief.get('gender')}. "
            f"Allergies: {allergies_str}. "
            f"Current active medications: {meds_str}. "
            f"History: {len(recent_notes)} past visit note(s) recorded."
        )

    return envelope(
        {"summary": summary},
        agent="Patient History Summary",
        needs_approval=False,
        source=_source(),
        citations=["Patient medical record timeline"],
    )

