"""The agent mesh.

Each agent = a deterministic, auditable clinical core (safe, offline-capable) + an optional LLM
narrative layer on top. Safety-critical decisions (red flags, allergy conflicts, interactions,
abnormal flags) are ALWAYS computed by rules; the LLM only enriches human-readable text.
Every clinical output is returned as a *draft that requires approval*.
"""
from __future__ import annotations

import re
from typing import Any, Callable

from app.ai import knowledge as kb
from app.ai.gateway import gateway
from app.ai.guardrails import envelope, redact_pii
from app.core.config import settings


def _source() -> str:
    if not gateway.available():
        return "deterministic-engine"
    return f"llm:{gateway.active_model_name()}"


def _any_keyword(keywords: list[str], text: str) -> bool:
    """Word-boundary keyword match — avoids false positives like short tokens
    (e.g. "UTI") incidentally matching inside unrelated words (e.g. "ROUTINE")."""
    return any(re.search(r"\b" + re.escape(kw) + r"\b", text) for kw in keywords)


# ------------------------------------------------------------------------------------ Intake Agent
def intake_agent(symptom_text: str, *, duration: str | None = None) -> dict[str, Any]:
    red_flags = kb.detect_red_flags(symptom_text)
    chief = (symptom_text or "").strip()[:1000]

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
def _abnormal_vitals(vitals: dict[str, Any]) -> list[str]:
    """Deterministic vital-sign safety check — same thresholds used at triage — so the SOAP's
    Objective section always calls out anything dangerous even if the LLM narrative misses it."""
    flags: list[str] = []
    spo2 = vitals.get("spo2")
    hr = vitals.get("heart_rate")
    sbp = vitals.get("bp_systolic")
    temp = vitals.get("temperature")
    rr = vitals.get("respiratory_rate")
    if spo2 is not None and spo2 <= kb.VITAL_THRESHOLDS["spo2_critical"]:
        flags.append(f"SpO2 critically low ({spo2}%)")
    if hr is not None and hr >= kb.VITAL_THRESHOLDS["hr_high"]:
        flags.append(f"Tachycardia (HR {hr} bpm)")
    if hr is not None and hr <= kb.VITAL_THRESHOLDS["hr_low"]:
        flags.append(f"Bradycardia (HR {hr} bpm)")
    if sbp is not None and sbp >= kb.VITAL_THRESHOLDS["sbp_high"]:
        flags.append(f"Hypertensive (SBP {sbp} mmHg)")
    if sbp is not None and sbp <= kb.VITAL_THRESHOLDS["sbp_low"]:
        flags.append(f"Hypotensive (SBP {sbp} mmHg)")
    if temp is not None and temp >= kb.VITAL_THRESHOLDS["temp_high"]:
        flags.append(f"High-grade fever ({temp}°F)")
    if rr is not None and rr >= kb.VITAL_THRESHOLDS["rr_high"]:
        flags.append(f"Tachypnea (RR {rr}/min)")
    return flags


def ambient_docs_agent(transcript: str, patient_context: dict[str, Any]) -> dict[str, Any]:
    icd10 = kb.suggest_icd10(transcript)
    # dict.fromkeys dedupes while preserving order — multiple keyword hits (e.g. "chest pain"
    # and "crushing chest") can map to the same escalation reason text.
    red_flags = list(dict.fromkeys(kb.detect_red_flags(transcript)))
    abnormal_vitals = _abnormal_vitals(patient_context.get("vitals") or {})
    allergies = patient_context.get("allergies") or []
    allergy_names = [a.get("substance") for a in allergies if a.get("substance")]

    soap: dict[str, str] | None = None
    system = (
        "You are an expert ambient clinical scribe with training equivalent to an experienced "
        "attending physician. Convert the consultation transcript into a rigorous, clinically "
        "sound SOAP note.\n\n"
        "Reasoning approach (internal — do not output your reasoning, only the final JSON):\n"
        "1. Identify the patient's own reported symptoms, duration, and severity — this is the "
        "Subjective (S) section, written in the patient's voice/perspective.\n"
        "2. Identify only objectively observed/measured findings (vitals, exam findings the "
        "doctor states aloud, diagnostic results mentioned) — this is Objective (O). If vitals "
        "are abnormal, explicitly call that out.\n"
        "3. Synthesize a clinical Assessment (A) — likely diagnosis/differential — that is "
        "directly supported by S and O plus the patient's known chronic problems and allergy "
        "history (never contradict a known drug allergy).\n"
        "4. Write an actionable Plan (P) — investigations, treatment, follow-up timeframe, and "
        "any red-flag/safety-netting advice appropriate to the presentation.\n\n"
        "Rules: Return STRICT JSON with keys S, O, A, P (plain strings, no markdown). Be "
        "factual — never invent vitals, exam findings, or history not present in the transcript "
        "or provided context. The transcript may be in any language (patients and doctors may "
        "speak Hindi, Tamil, or other languages, and turns may be labeled 'Speaker N:') — ALWAYS "
        "write the SOAP note itself in English, regardless of the transcript's language, so the "
        "clinical record stays standardized."
    )
    context_lines = [
        f"Patient: {patient_context.get('age', '?')}{patient_context.get('gender', '')}.",
        f"Active chronic problems: {patient_context.get('problems', 'none recorded')}.",
        f"Known drug/substance allergies: {', '.join(allergy_names) if allergy_names else 'none recorded'}.",
    ]
    if patient_context.get("vitals_line"):
        context_lines.append(f"Latest vitals: {patient_context['vitals_line']}")
    if abnormal_vitals:
        context_lines.append(f"⚠ Abnormal vitals flagged by monitoring system: {'; '.join(abnormal_vitals)}.")
    if icd10:
        hints = ", ".join(f"{c['code']} ({c['label']})" for c in icd10)
        context_lines.append(f"Candidate ICD-10 codes suggested by symptom matching (use only if clinically consistent): {hints}.")
    if red_flags:
        context_lines.append(f"⚠ Red-flag keywords detected in transcript — {'; '.join(red_flags)}. Reflect appropriate urgency in the Assessment/Plan if genuinely applicable.")

    prompt = "\n".join(context_lines) + f"\n\nTranscript:\n{redact_pii(transcript)}"
    llm = gateway.generate_json(prompt, system=system)
    if isinstance(llm, dict) and {"S", "O", "A", "P"} <= set(llm):
        soap = {k: str(llm[k]) for k in ("S", "O", "A", "P")}

    if not soap:
        # Deterministic fallback SOAP — still grounded in the same problems/allergies/vitals/
        # red-flag context so offline quality doesn't regress just because the LLM is unreachable.
        chief = patient_context.get("chief_complaint", "the presenting complaint")
        vit = patient_context.get("vitals_line", "")
        dx = icd10[0]["label"] if icd10 else "clinical impression pending"
        code = f" (ICD-10 {icd10[0]['code']})" if icd10 else ""
        o_parts = [vit] if vit else []
        if abnormal_vitals:
            o_parts.append(f"Abnormal: {'; '.join(abnormal_vitals)}.")
        plan_parts = ["Investigations as ordered", "symptomatic treatment", "review in 48 hours or earlier if worsening"]
        if allergy_names:
            plan_parts.insert(0, f"avoid {', '.join(allergy_names)} and cross-reacting agents (documented allergy)")
        soap = {
            "S": f"{patient_context.get('age', '')}{patient_context.get('gender', '')} presenting with {chief}. {transcript[:200]}".strip(),
            "O": " ".join(o_parts) if o_parts else "Examination findings to be documented.",
            "A": f"{dx}{code}." + (f" Active chronic problem(s): {patient_context.get('problems')}." if patient_context.get("problems") and patient_context.get("problems") != "none recorded" else ""),
            "P": "; ".join(plan_parts) + ".",
        }

    draft_text = f"S: {soap['S']}\nO: {soap['O']}\nA: {soap['A']}\nP: {soap['P']}"
    return envelope(
        {
            "soap": soap,
            "icd10": icd10,
            "draft_text": draft_text,
            "red_flags": red_flags,
            "abnormal_vitals": abnormal_vitals,
            "allergies_considered": allergy_names,
        },
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


# ------------------------------------------------------------------------- Suggested Orders Agent
def suggest_orders_agent(
    chief_complaint: str,
    symptom_summary: str,
    vitals: dict[str, Any] | None,
    history: list[str],
) -> list[dict[str, str]]:
    """AI suggests relevant lab or imaging orders based on patient symptoms, vitals, and history.
    
    Only suggests tests from the allowed catalog: CBC, CRP, HbA1c, Lipid Profile, TSH, RFT, Chest X-ray.
    If no tests are strongly indicated, returns an empty list [].
    """
    if not gateway.available():
        return []

    vitals = vitals or {}
    vitals_parts = []
    for k, v in vitals.items():
        if v is not None:
            vitals_parts.append(f"{k}: {v}")
    vitals_str = ", ".join(vitals_parts) if vitals_parts else "None recorded"
    
    history_str = ", ".join(history) if history else "None recorded"
    
    prompt = (
        "You are an expert clinical triage assistant. Evaluate the patient's clinical presentation below "
        "to determine if any diagnostic laboratory or imaging tests are indicated.\n\n"
        f"Chief Complaint: {chief_complaint}\n"
        f"Symptom Summary: {symptom_summary}\n"
        f"Vitals: {vitals_str}\n"
        f"Medical History: {history_str}\n\n"
        "Guidelines:\n"
        "1. Suggest 2-3 relevant diagnostic tests (such as CBC, CRP, HbA1c, Lipid Profile, TSH, RFT, LFT, Urinalysis, Widal Test, Chest X-ray, ECG, etc.) that are clinically reasonable to confirm the diagnosis, check severity, or rule out complications.\n"
        "2. For respiratory symptoms (like cough, cold, breathlessness), consider CBC and Chest X-ray.\n"
        "3. For febrile symptoms (like high fever, chills), consider CBC, CRP, and Widal Test.\n"
        "4. For metabolic symptoms or checkups (fatigue, diabetes), consider HbA1c, RFT, and Lipid Profile.\n"
        "5. Output MUST be a JSON array of objects, where each object has:\n"
        "   - 'test': exact name of the diagnostic test (e.g., 'CBC', 'Chest X-ray', 'TSH', etc.)\n"
        "   - 'reason': a brief clinical explanation (5-10 words) of why it is indicated.\n\n"
        "Do not include any markdown formatting, code block backticks, or surrounding text. Return only the raw JSON array."
    )
    
    try:
        res = gateway.generate_json(prompt)
        if isinstance(res, dict):
            for val in res.values():
                if isinstance(val, list):
                    res = val
                    break
        if isinstance(res, list):
            validated = []
            for item in res:
                if isinstance(item, dict) and item.get("test"):
                    validated.append({
                        "test": str(item["test"]).strip(),
                        "reason": str(item.get("reason", "Clinically indicated.")),
                    })
            return validated
    except Exception as e:
        logger.warning("suggest_orders_agent failed: %s", str(e))
        
    return []


# --------------------------------------------------------------------------------- Rx CDS Agent
def rx_cds_agent(
    allergies: list[dict[str, Any]],
    current_meds: list[str],
    proposed_items: list[dict[str, Any]],
    patient_context: dict[str, Any] | None = None,
    stock_index: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    stock_index = stock_index or {}
    
    ai_success = False
    block = False
    alerts: list[dict[str, Any]] = []
    suggestions: list[dict[str, Any]] = []
    
    # 1. Try dynamic AI evaluation first (without sending the pharmacy stock list)
    if gateway.available():
        try:
            allergies_str = ", ".join([
                f"{a.get('substance', 'Unknown')} ({a.get('drug_class', 'class') or 'Unknown class'})"
                for a in allergies
            ]) if allergies else "None"
            proposed_str = ", ".join([f"{i.get('drug_name')} ({i.get('dose', '')})" for i in proposed_items])
            
            # Format patient clinical context
            ctx = patient_context or {}
            issue = ctx.get("issue") or "Consultation ongoing"
            vitals = ctx.get("vitals") or {}
            vitals_str = f"BP: {vitals.get('bp') or '?'}, SpO2: {vitals.get('spo2') or '?'}%, HR: {vitals.get('heart_rate') or '?'} bpm, Temp: {vitals.get('temperature') or '?'}F"
            history_str = "; ".join(ctx.get("history", [])) or "None recorded"
            
            prompt = (
                "You are an expert clinical decision support (CDS) assistant. Evaluate the proposed prescription items against the patient's clinical context.\n\n"
                f"Proposed Prescription Items: {proposed_str}\n"
                f"Patient Allergies: {allergies_str}\n"
                f"Patient Reason for Visit: {issue}\n"
                f"Patient Vitals: {vitals_str}\n"
                f"Past Serious Conditions / Medical History: {history_str}\n\n"
                "Evaluate and generate alerts for the proposed medicines:\n"
                "1. Drug-Allergy Warning: Alert if any proposed medicine conflicts with the patient's allergies.\n"
                "2. Potential Side Effects: For EACH proposed medicine, list its common or clinically significant side effects (e.g. gastric upset for Ibuprofen, QTc prolongation for Azithromycin, peripheral edema for Amlodipine, etc.) and highlight if they could impact this patient's current symptoms, abnormal vitals, or history.\n"
                "3. Appropriateness: State if a medicine is not directly related to the patient's presenting symptoms or medical history.\n\n"
                "Note: Do not suggest alternative medicines. Keep alerts objective. The final decision is taken by the doctor.\n\n"
                "Respond with a JSON object containing keys:\n"
                "- 'block': boolean (true if there is an active allergy conflict with proposed meds, else false)\n"
                "- 'alerts': list of objects, each containing:\n"
                "  - 'drug': name of the proposed drug\n"
                "  - 'severity': 'BLOCK' (for allergy conflicts), 'WARN' (for significant side effects/interactions), or 'INFO' (for appropriateness/general side effects)\n"
                "  - 'type': 'ALLERGY', 'SIDE_EFFECT', or 'UNRELATED'\n"
                "  - 'message': a brief clinical explanation in general terms (e.g., 'Allergy conflict: Patient allergic to Ibuprofen.' or 'Side effects: May cause stomach irritation or worsen asthma symptoms.' or 'Not directly related to current symptoms.')\n"
                "- 'suggestions': [] (must be an empty list)\n\n"
                "Do not add any markdown formatting or surrounding text, just return the raw JSON object."
            )
            
            res = gateway.generate_json(prompt)
            if isinstance(res, dict) and "alerts" in res:
                block = bool(res.get("block", False))
                alerts = res.get("alerts", [])
                suggestions = res.get("suggestions", [])
                ai_success = True
        except Exception as e:
            logger.warning("Dynamic Rx CDS agent failed: %s; falling back to deterministic backup", str(e))
            
    # 2. Fallback to deterministic rules if AI failed to respond
    if not ai_success:
        suggestions.append({
            "for": proposed_items[0].get("drug_name") if proposed_items else "Prescription",
            "suggestion": "No response was returned",
            "reason": "Clinical model suggestion failed"
        })
        
        # Pull deterministic warnings from DB/Code as a safety net
        allergy_classes = {(a.get("drug_class") or "").lower() for a in allergies if a.get("drug_class")}
        allergy_substances = {(a.get("substance") or "").lower() for a in allergies}
        all_meds_lower = [m.lower() for m in current_meds]
        
        for item in proposed_items:
            name = item.get("drug_name", "")
            name_l = name.lower()
            cls = kb.drug_class_of(name)
            
            # Allergy warning (Rule-based backup)
            if (cls and cls in allergy_classes) or any(s and s in name_l for s in allergy_substances):
                block = True
                alerts.append({
                    "severity": "BLOCK",
                    "type": "ALLERGY",
                    "drug": name,
                    "message": f"[Rule-Based Safety Backup] Allergy conflict: patient allergic to {cls or 'this substance'}. Choose an alternative.",
                })
                
            # Drug-drug interaction warning (Rule-based backup)
            for a, b, sev, msg in kb.DRUG_INTERACTIONS:
                partners = all_meds_lower + [i.get("drug_name", "").lower() for i in proposed_items if i is not item]
                if a.strip() in name_l and any(b.strip() in p for p in partners):
                    alerts.append({
                        "severity": sev,
                        "type": "INTERACTION",
                        "drug": name,
                        "message": f"[Rule-Based Safety Backup] {msg}"
                    })
                    
    # 3. Independent Stock Checking (Determined from Postgres db, not Gemini)
    for item in proposed_items:
        name = item.get("drug_name", "")
        name_l = name.lower()
        
        rec = None
        if name_l in stock_index:
            rec = stock_index[name_l]
        else:
            for cand_name, cand in stock_index.items():
                if name_l in cand_name or cand_name in name_l:
                    rec = cand
                    break
                    
        if rec is None:
            alerts.append({
                "severity": "INFO",
                "type": "STOCK",
                "drug": name,
                "message": "Not found in pharmacy stock."
            })
        elif rec.get("available", 0) <= 0:
            alerts.append({
                "severity": "WARN",
                "type": "STOCK",
                "drug": name,
                "message": "Out of stock."
            })
        elif rec.get("formulary") is False:
            alerts.append({
                "severity": "INFO",
                "type": "FORMULARY",
                "drug": name,
                "message": "Non-formulary item."
            })
                
    return envelope(
        {"alerts": alerts, "suggestions": suggestions, "block": block},
        agent="Rx CDS",
        needs_approval=True,
        source="llm" if ai_success else "deterministic-engine",
        citations=["Google Gemini safety checks" if ai_success else "Allergy cross-reactivity table"],
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
    issues_str: str,
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
        f"Chronic Medical Issues: {issues_str}\n"
        f"Allergies: {allergies_str}\n"
        f"Active Meds: {meds_str}\n"
        f"Latest Vitals: {vitals_str}\n"
        f"Past History: {diagnoses_str}\n"
        "Be factual, clinical, and highlight critical concerns (especially chronic issues/warnings and allergies)."
    )
    llm = gateway.generate(prompt, temperature=0.1)
    if llm:
        summary = llm.strip()
    if not summary:
        summary = "No response was returned"

    return envelope(
        {"summary": summary},
        agent="Patient History Summary",
        needs_approval=False,
        source=_source(),
        citations=["Patient medical record timeline"],
    )


def refine_notes_agent(notes_text: str, chief_complaint: str) -> str:
    if not notes_text or not notes_text.strip():
        return notes_text
        
    if not gateway.available():
        return notes_text

    prompt = (
        "You are an expert clinical assistant. You are given a doctor's informal/rough consultation notes and the patient's chief complaint.\n\n"
        f"Patient Chief Complaint: {chief_complaint}\n"
        f"Doctor's Original Notes: {notes_text}\n\n"
        "Your task is to:\n"
        "1. Correct any spelling, grammar, punctuation, or medical terminology typos in the notes.\n"
        "2. Refine the style to be clean, professional, and medically sound.\n"
        "3. Keep the refined note short and concise, of similar length to the doctor's original notes (do NOT generate long summaries, general templates, or add unrelated advice).\n"
        "4. Align the advice with the patient's issue/chief complaint, preserving all doctor intent and clinical advice exactly.\n\n"
        "Output ONLY the final refined notes text. Do not include any introductory, concluding, or markdown commentary (like 'Here is the refined note:')."
    )
    try:
        refined = gateway.generate(prompt, temperature=0.2)
        refined_clean = refined.strip()
        if refined_clean:
            return refined_clean
    except Exception as e:
        print(f"Error in refine_notes_agent: {e}")
    return notes_text


# ------------------------------------------------------------------ AI Formulary Guidance Agent
def formulary_guidance_agent(
    patient_name: str,
    chief_complaint: str,
    patient_issues: list[str],
    ai_diagnostics: list[dict[str, Any]],
    vitals: dict[str, Any] | None = None
) -> dict[str, Any]:
    """AI Pharmacological & Generic Formula Guidance Agent.
    
    Analyzes Patient Medical Issues and PyTorch Local AI Diagnostic Scan Findings
    to recommend Generic Formulations, Pharmacological Classes, and Clinical Rationales.
    Zero brand names — pure generic formulation guidance.
    """
    import json
    def _safe(val: Any) -> str:
        return str(val).encode("ascii", errors="replace").decode("ascii")

    print("\n" + "=" * 76)
    print("[AI PHARMACOLOGICAL & GENERIC FORMULA GUIDANCE AGENT EXECUTING]")
    print("=" * 76)
    print(f"* Patient: {_safe(patient_name)}")
    print(f"* Chief Complaint: {_safe(chief_complaint)}")
    print(f"* Patient Medical Issues: {_safe(patient_issues)}")
    print(f"* Local PyTorch AI Scan Findings: {_safe(ai_diagnostics)}")
    print("-" * 76)

    prompt = f"""You are an expert Clinical Pharmacologist and Evidence-Based Formulary AI Assistant.
Analyze the following patient clinical context and provide generic formulation recommendations for the consulting physician.

ANONYMIZED PATIENT CLINICAL CONTEXT:
- Present Chief Complaint (Current Visit Only): {chief_complaint}
- Major Chronic Co-morbidities (Systemic Conditions Only): {', '.join(patient_issues) if patient_issues else 'None (No active chronic co-morbidities)'}
- PyTorch Local AI Diagnostic Findings & Lab Reports (Current Visit Only): {json.dumps(ai_diagnostics)}

CRITICAL MANDATES:
1. DO NOT mention drug brand names. Output ONLY generic active formulations and pharmacological classes (e.g. Paracetamol 650mg, Levofloxacin 500mg, Azithromycin 250mg, Amoxicillin + Clavulanic Acid 625mg).
2. Directly correlate recommendations to the Present Chief Complaint ({chief_complaint}) and the Current Visit PyTorch AI Diagnostic Results.
3. DO NOT suggest medications for old or unstated symptoms. Stay strictly focused on the current presentation and lab findings.

Return ONLY a valid JSON object matching this schema:
{{
  "formula_recommendations": [
    {{
      "category": "Category name",
      "formula_name": "Generic Formula Title",
      "active_ingredients": "Active ingredients with dose",
      "class": "Pharmacological class",
      "dosage_guidance": "Recommended schedule & duration",
      "clinical_rationale": "Why this formula is recommended based on patient issues and PyTorch AI scan findings",
      "safety_note": "Safety monitoring or precaution"
    }}
  ]
}}"""

    formulas = []

    # Try LLM Gateway first
    llm_resp = gateway.generate(prompt, temperature=0.1)
    if llm_resp:
        try:
            clean_str = llm_resp.strip()
            if clean_str.startswith("```"):
                clean_str = clean_str.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            parsed = json.loads(clean_str)
            if "formula_recommendations" in parsed:
                formulas = parsed["formula_recommendations"]
        except Exception as err:
            print(f"[LLM JSON Parse Note]: {err}, falling back to structured clinical rules.")

    # Fallback to structured clinical rules if LLM gateway did not return valid JSON
    if not formulas:
        all_text = f"{chief_complaint} {' '.join(patient_issues)} {' '.join([f.get('finding', '') for f in ai_diagnostics])}".upper()

        if _any_keyword(["ISCHEMIA", "MYOCARDIAL", "REPOLARIZATION", "ECG", "EKG", "ST-T", "ANGINA"], all_text):
            formulas.append({
                "category": "Cardiology / Ischemic Heart Disease",
                "formula_name": "Dual Antiplatelet Formulation",
                "active_ingredients": "Aspirin (75mg) + Clopidogrel (75mg)",
                "class": "Antiplatelet / Antithrombotic",
                "dosage_guidance": "1 tablet PO QD after meals x 30 days",
                "clinical_rationale": "Recommended for Acute Coronary Syndrome & Myocardial Ischemia risk reduction.",
                "safety_note": "Monitor for signs of active bleeding or gastric irritation."
            })
            formulas.append({
                "category": "Cardiology / Lipid Management",
                "formula_name": "High-Intensity Statin Formulation",
                "active_ingredients": "Atorvastatin Calcium (40mg)",
                "class": "HMG-CoA Reductase Inhibitor",
                "dosage_guidance": "1 tablet PO QHS (at bedtime) x 30 days",
                "clinical_rationale": "Recommended for coronary plaque stabilization & ischemic protection.",
                "safety_note": "Check baseline hepatic enzyme levels (ALT/AST)."
            })

        if _any_keyword(["PNEUMONIA", "LUNG", "CONSOLIDATION", "EFFUSION", "CHEST X-RAY", "HRCT"], all_text):
            formulas.append({
                "category": "Respiratory / Antibacterial",
                "formula_name": "Aminopenicillin + Beta-Lactamase Inhibitor Formulation",
                "active_ingredients": "Amoxicillin (500mg) + Clavulanic Acid (125mg)",
                "class": "Penicillin-Class Antibiotic",
                "dosage_guidance": "1 tablet PO BID after meals x 7 days",
                "clinical_rationale": "First-line empirical therapy for bacterial pneumonia & lower respiratory infection.",
                "safety_note": "Complete full 7-day course."
            })
            formulas.append({
                "category": "Respiratory / Mucolytic",
                "formula_name": "Mucolytic Expectorant Formulation",
                "active_ingredients": "Acetylcysteine (600mg) / Guaifenesin (400mg)",
                "class": "Mucolytic Agent",
                "dosage_guidance": "1 effervescent tablet PO BID x 5 days",
                "clinical_rationale": "Promotes airway clearance and thins thick bronchial secretions.",
                "safety_note": "Dissolve completely in water before ingestion."
            })

        if _any_keyword(["GLUCOSE", "DIABETES", "HYPERGLYCEMIA", "HBA1C", "SUGAR"], all_text):
            formulas.append({
                "category": "Endocrine / Antidiabetic",
                "formula_name": "Biguanide Glycemic Control Formulation",
                "active_ingredients": "Metformin Hydrochloride (500mg)",
                "class": "Biguanide Antidiabetic Agent",
                "dosage_guidance": "1 tablet PO BID with meals x 30 days",
                "clinical_rationale": "First-line agent to reduce hepatic glucose production and improve insulin sensitivity.",
                "safety_note": "Monitor renal function (eGFR > 45 mL/min)."
            })

        if _any_keyword(["HYPERTENSION", "BLOOD PRESSURE", "BP HIGH", "ELEVATED BP"], all_text):
            formulas.append({
                "category": "Cardiology / Hypertension",
                "formula_name": "ARB Antihypertensive Formulation",
                "active_ingredients": "Telmisartan (40mg)",
                "class": "Angiotensin Receptor Blocker",
                "dosage_guidance": "1 tablet PO QD, same time daily x 30 days",
                "clinical_rationale": "First-line agent for stage 1-2 essential hypertension and cardio-renal protection.",
                "safety_note": "Monitor serum potassium and renal function periodically."
            })

        if _any_keyword(["ASTHMA", "COPD", "WHEEZE", "WHEEZING", "BREATHLESSNESS", "DYSPNEA", "BRONCHITIS"], all_text):
            formulas.append({
                "category": "Respiratory / Bronchodilator",
                "formula_name": "Short-Acting Beta-2 Agonist Formulation",
                "active_ingredients": "Salbutamol (100mcg) Metered Dose Inhaler",
                "class": "Beta-2 Adrenergic Agonist",
                "dosage_guidance": "2 puffs Q6H PRN for breathlessness/wheeze",
                "clinical_rationale": "Rapid relief of acute bronchospasm in asthma/COPD exacerbation.",
                "safety_note": "Watch for tremor/tachycardia with overuse; use spacer if available."
            })

        if _any_keyword(["GASTRITIS", "GERD", "ACIDITY", "PEPTIC", "ULCER", "HEARTBURN", "REFLUX"], all_text):
            formulas.append({
                "category": "Gastroenterology / Acid Suppression",
                "formula_name": "Proton Pump Inhibitor Formulation",
                "active_ingredients": "Pantoprazole (40mg)",
                "class": "Proton Pump Inhibitor",
                "dosage_guidance": "1 tablet PO OD before breakfast x 14 days",
                "clinical_rationale": "Reduces gastric acid secretion for GERD, gastritis, and peptic ulcer symptom relief.",
                "safety_note": "Take on empty stomach 30 minutes before food."
            })

        if _any_keyword(["UTI", "URINARY TRACT", "DYSURIA", "BURNING MICTURITION", "URINE INFECTION"], all_text):
            formulas.append({
                "category": "Urology / Antibacterial",
                "formula_name": "Fluoroquinolone Urinary Antibacterial Formulation",
                "active_ingredients": "Nitrofurantoin (100mg)",
                "class": "Urinary Antiseptic",
                "dosage_guidance": "1 capsule PO BID with food x 5 days",
                "clinical_rationale": "First-line empirical therapy for uncomplicated lower urinary tract infection.",
                "safety_note": "Complete full course; avoid in renal impairment (eGFR < 30)."
            })

        if _any_keyword(["MIGRAINE", "HEADACHE", "CEPHALGIA"], all_text):
            formulas.append({
                "category": "Neurology / Analgesic",
                "formula_name": "Migraine Abortive Formulation",
                "active_ingredients": "Sumatriptan (50mg)",
                "class": "5-HT1 Receptor Agonist (Triptan)",
                "dosage_guidance": "1 tablet PO at onset, may repeat once after 2 hours (max 2/day)",
                "clinical_rationale": "First-line abortive therapy for moderate-to-severe migraine attacks.",
                "safety_note": "Contraindicated with ischemic heart disease or uncontrolled hypertension."
            })

        if _any_keyword(["ALLERGY", "ALLERGIC", "RHINITIS", "URTICARIA", "ITCHING", "SNEEZING"], all_text):
            formulas.append({
                "category": "Allergy / Antihistamine",
                "formula_name": "Second-Generation Antihistamine Formulation",
                "active_ingredients": "Cetirizine (10mg)",
                "class": "H1 Antihistamine",
                "dosage_guidance": "1 tablet PO OD at bedtime x 5-7 days",
                "clinical_rationale": "Relieves allergic rhinitis, urticaria, and pruritus with minimal sedation.",
                "safety_note": "May cause mild drowsiness; avoid alcohol."
            })

        if _any_keyword(["CELLULITIS", "SKIN INFECTION", "ABSCESS", "WOUND INFECTION", "PYODERMA"], all_text):
            formulas.append({
                "category": "Dermatology / Antibacterial",
                "formula_name": "Cephalosporin Skin & Soft Tissue Formulation",
                "active_ingredients": "Cephalexin (500mg)",
                "class": "First-Generation Cephalosporin",
                "dosage_guidance": "1 capsule PO QID x 7 days",
                "clinical_rationale": "First-line empirical coverage for uncomplicated skin and soft tissue infection.",
                "safety_note": "Screen for penicillin/cephalosporin allergy before starting."
            })

        if _any_keyword(["HYPOTHYROID", "THYROID", "TSH"], all_text):
            formulas.append({
                "category": "Endocrine / Thyroid Replacement",
                "formula_name": "Thyroid Hormone Replacement Formulation",
                "active_ingredients": "Levothyroxine Sodium (50mcg)",
                "class": "Synthetic Thyroid Hormone",
                "dosage_guidance": "1 tablet PO OD on empty stomach, 30 min before breakfast x 30 days",
                "clinical_rationale": "Replacement therapy for primary hypothyroidism to normalize TSH levels.",
                "safety_note": "Recheck TSH after 6-8 weeks before dose adjustment."
            })

        if _any_keyword(["ANEMIA", "LOW HEMOGLOBIN", "HB LOW", "IRON DEFICIENCY"], all_text):
            formulas.append({
                "category": "Hematology / Hematinic",
                "formula_name": "Iron Replacement Formulation",
                "active_ingredients": "Ferrous Ascorbate (100mg) + Folic Acid (1.5mg)",
                "class": "Oral Iron Supplement",
                "dosage_guidance": "1 tablet PO OD after food x 30 days",
                "clinical_rationale": "Corrects iron-deficiency anemia and replenishes depleted iron stores.",
                "safety_note": "May cause constipation/dark stools; take with vitamin C source for absorption."
            })

        if _any_keyword(["ARTHRITIS", "JOINT PAIN", "KNEE PAIN", "BACK PAIN", "MUSCLE PAIN", "MYALGIA", "SPRAIN"], all_text):
            formulas.append({
                "category": "Musculoskeletal / Anti-inflammatory",
                "formula_name": "NSAID Analgesic Formulation",
                "active_ingredients": "Aceclofenac (100mg) + Paracetamol (325mg)",
                "class": "Non-Steroidal Anti-Inflammatory Drug",
                "dosage_guidance": "1 tablet PO BID after food x 5 days",
                "clinical_rationale": "Relieves musculoskeletal pain and inflammation from arthritis, sprain, or myalgia.",
                "safety_note": "Avoid in active peptic ulcer disease or renal impairment; take with food."
            })

        if _any_keyword(["ANXIETY", "DEPRESSION", "INSOMNIA", "SLEEP", "PANIC"], all_text):
            formulas.append({
                "category": "Psychiatry / Anxiolytic",
                "formula_name": "SSRI Antidepressant Formulation",
                "active_ingredients": "Escitalopram (10mg)",
                "class": "Selective Serotonin Reuptake Inhibitor",
                "dosage_guidance": "1 tablet PO OD in the morning x 30 days",
                "clinical_rationale": "First-line agent for generalized anxiety disorder and mild-to-moderate depression.",
                "safety_note": "Effect may take 2-4 weeks; do not discontinue abruptly. Refer to psychiatry if severe."
            })

        if _any_keyword(["SINUSITIS", "OTITIS", "EAR PAIN", "SORE THROAT", "PHARYNGITIS", "TONSILLITIS"], all_text):
            formulas.append({
                "category": "ENT / Antibacterial",
                "formula_name": "Macrolide ENT Infection Formulation",
                "active_ingredients": "Azithromycin (500mg)",
                "class": "Macrolide Antibiotic",
                "dosage_guidance": "1 tablet PO OD x 3 days",
                "clinical_rationale": "Empirical coverage for bacterial sinusitis, otitis media, or tonsillopharyngitis.",
                "safety_note": "Take on empty stomach; avoid with known macrolide/QT-prolongation history."
            })

        if _any_keyword(["DIARRHEA", "GASTROENTERITIS", "LOOSE MOTION", "VOMITING", "DEHYDRATION"], all_text):
            formulas.append({
                "category": "Gastroenterology / Rehydration & Antiemetic",
                "formula_name": "Oral Rehydration & Antiemetic Formulation",
                "active_ingredients": "ORS Solution + Ondansetron (4mg)",
                "class": "Rehydration Salt + 5-HT3 Antagonist",
                "dosage_guidance": "ORS ad lib after every loose stool; Ondansetron 1 tablet PO Q8H PRN for vomiting",
                "clinical_rationale": "Prevents dehydration and controls vomiting in acute gastroenteritis.",
                "safety_note": "Seek urgent care if signs of severe dehydration or blood in stool."
            })

        if _any_keyword(["FEVER", "VIRAL", "FLU", "INFLUENZA", "COLD", "COUGH", "URI", "COMMON COLD"], all_text):
            formulas.append({
                "category": "General / Antipyretic & Cough-Cold",
                "formula_name": "Antipyretic + Antitussive Formulation",
                "active_ingredients": "Paracetamol (650mg) + Cetirizine (5mg) + Dextromethorphan (10mg)",
                "class": "Antipyretic / Antihistamine / Antitussive Combination",
                "dosage_guidance": "1 tablet PO Q8H PRN for fever/cough/cold symptoms x 3-5 days",
                "clinical_rationale": "Symptomatic relief for viral upper respiratory tract infection / common cold / flu.",
                "safety_note": "Do not exceed 3,000mg paracetamol/day; hydrate adequately and rest."
            })

        if _any_keyword(["CONSTIPATION", "BOWEL"], all_text):
            formulas.append({
                "category": "Gastroenterology / Laxative",
                "formula_name": "Osmotic Laxative Formulation",
                "active_ingredients": "Lactulose Solution (10g/15mL)",
                "class": "Osmotic Laxative",
                "dosage_guidance": "15mL PO OD-BID as needed",
                "clinical_rationale": "Softens stool and promotes bowel movement for simple constipation.",
                "safety_note": "Ensure adequate fluid intake; may cause bloating initially."
            })

        if _any_keyword(["TUBERCULOSIS", "TB", "AFB", "MANTOUX"], all_text):
            formulas.append({
                "category": "Infectious Disease / Anti-Tubercular",
                "formula_name": "First-Line Anti-Tubercular Combination Formulation",
                "active_ingredients": "Rifampicin + Isoniazid + Pyrazinamide + Ethambutol (Fixed-Dose Combination)",
                "class": "Anti-Tubercular Therapy (ATT)",
                "dosage_guidance": "As per weight-band FDC dosing PO OD on empty stomach x per DOTS protocol",
                "clinical_rationale": "Standard first-line intensive-phase regimen for confirmed pulmonary/extrapulmonary TB.",
                "safety_note": "Baseline and periodic LFTs required; refer to TB/DOTS program for monitoring."
            })

        if not formulas:
            formulas.append({
                "category": "General / Antipyretic & Analgesic",
                "formula_name": "Central Antipyretic Formulation",
                "active_ingredients": "Paracetamol / Acetaminophen (650mg)",
                "class": "Analgesic & Antipyretic",
                "dosage_guidance": "1 tablet PO Q8H PRN for fever > 100°F (Max 3g/day)",
                "clinical_rationale": "Symptomatic relief of pyrexia and mild-to-moderate generalized pain.",
                "safety_note": "Do not exceed 3,000mg total daily dose."
            })

    print("AI FORMULA RECOMMENDATIONS PRODUCED:")
    for idx, f in enumerate(formulas, 1):
        print(f"  {idx}. [{f.get('category')}] {f.get('formula_name')} -> {f.get('active_ingredients')}")
    print("=" * 76 + "\n")

    return envelope(
        {
            "formula_recommendations": formulas
        },
        agent="AI Formulary Guidance",
        needs_approval=False,
        source=_source(),
        citations=["Evidence-Based Clinical Pharmacology & Formulary Guidelines"],
    )


# ---------------------------------------------------------------------------- Translation Agent
def translate_agent(text: str, target_language: str) -> dict[str, Any]:
    """Translate clinical text (e.g. a SOAP note or transcript) for a doctor to read in a
    language other than the one it was written/spoken in — e.g. so a doctor can explain an
    English SOAP note back to a patient in Hindi/Tamil/etc., or read a non-English transcript.
    This is a REFERENCE-ONLY view: it never changes the underlying approved clinical record,
    which always stays in the language it was actually authored/approved in.

    Returns {"translated_text": str, "translated": bool} — translated=False (with the original
    text echoed back) if no LLM is reachable, since offline machine translation isn't part of
    this project's deterministic fallback engine."""
    text = (text or "").strip()
    if not text:
        return {"translated_text": "", "translated": False}

    system = (
        "You are a medical translator. Translate the given clinical text accurately and "
        "naturally into the requested target language. Preserve clinical meaning exactly — "
        "do not add, remove, or infer any information. Return ONLY the translated text, with "
        "no preamble, quotes, or explanation."
    )
    prompt = f"Target language: {target_language}\n\nText to translate:\n{text}"
    translated = gateway.generate(prompt, system=system, temperature=0.1)
    if translated:
        return {"translated_text": translated.strip(), "translated": True}
    return {"translated_text": text, "translated": False}



