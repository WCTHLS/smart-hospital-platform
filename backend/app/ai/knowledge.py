"""Clinical knowledge base — the deterministic grounding used by the agent mesh.

In production this is a vector store (Qdrant) over curated guidelines, formulary and SOPs. Here it
is a compact, transparent, auditable rule set so the reference build is safe and works offline.
Every clinically meaningful decision (red flags, allergy conflicts, interactions) is driven by these
tables — the LLM only adds natural-language narrative on top.
"""
from __future__ import annotations

# --- Red-flag symptoms → immediate escalation (ESI 1-2) -----------------------------------------
RED_FLAG_KEYWORDS: dict[str, str] = {
    "chest pain": "Possible acute coronary syndrome — escalate to emergency.",
    "crushing chest": "Possible acute coronary syndrome — escalate to emergency.",
    "shortness of breath": "Respiratory distress — assess airway/breathing immediately.",
    "difficulty breathing": "Respiratory distress — assess airway/breathing immediately.",
    "breathless": "Respiratory distress — assess airway/breathing immediately.",
    "unconscious": "Altered consciousness — emergency escalation.",
    "unresponsive": "Altered consciousness — emergency escalation.",
    "seizure": "Active seizure — emergency escalation.",
    "stroke": "Possible stroke — activate stroke pathway (FAST).",
    "slurred speech": "Possible stroke — activate stroke pathway (FAST).",
    "facial droop": "Possible stroke — activate stroke pathway (FAST).",
    "severe bleeding": "Uncontrolled haemorrhage — emergency escalation.",
    "suicidal": "Psychiatric emergency — do not leave patient unattended.",
    "anaphylaxis": "Anaphylaxis — emergency escalation, prepare adrenaline.",
    "blue lips": "Cyanosis / hypoxia — emergency escalation.",
}

# --- Specialty routing by complaint --------------------------------------------------------------
SPECIALTY_ROUTING: dict[str, str] = {
    "fever": "General Medicine",
    "cough": "General Medicine",
    "cold": "General Medicine",
    "sore throat": "General Medicine",
    "headache": "General Medicine",
    "body ache": "General Medicine",
    "diarrhea": "General Medicine",
    "vomiting": "General Medicine",
    "chest pain": "Cardiology",
    "palpitation": "Cardiology",
    "breathless": "Pulmonology",
    "wheezing": "Pulmonology",
    "skin": "Dermatology",
    "rash": "Dermatology",
    "joint": "Orthopaedics",
    "knee": "Orthopaedics",
    "back pain": "Orthopaedics",
    "fracture": "Orthopaedics",
    "abdomen": "Gastroenterology",
    "stomach": "Gastroenterology",
    "child": "Paediatrics",
    "pregnan": "Obstetrics & Gynaecology",
    "eye": "Ophthalmology",
    "ear": "ENT",
    "tooth": "Dentistry",
    "anxiety": "Psychiatry",
    "depress": "Psychiatry",
    "sugar": "Endocrinology",
    "diabet": "Endocrinology",
    "thyroid": "Endocrinology",
}
DEFAULT_SPECIALTY = "General Medicine"

# --- ICD-10 hints (illustrative) -----------------------------------------------------------------
ICD10_HINTS: list[tuple[tuple[str, ...], str, str]] = [
    (("cough", "fever", "chest"), "J22", "Acute lower respiratory tract infection"),
    (("cough", "fever"), "J06.9", "Acute upper respiratory infection, unspecified"),
    (("fever",), "R50.9", "Fever, unspecified"),
    (("headache",), "R51", "Headache"),
    (("sore throat",), "J02.9", "Acute pharyngitis, unspecified"),
    (("diarrhea", "vomiting"), "A09", "Infectious gastroenteritis and colitis"),
    (("chest pain",), "R07.9", "Chest pain, unspecified"),
    (("back pain",), "M54.5", "Low back pain"),
    (("diabet", "sugar"), "E11.9", "Type 2 diabetes mellitus without complications"),
    (("hypertension", "bp"), "I10", "Essential (primary) hypertension"),
]

# --- Drug knowledge: allergy classes -------------------------------------------------------------
DRUG_CLASS_MEMBERS: dict[str, list[str]] = {
    "penicillin": [
        "amoxicillin",
        "ampicillin",
        "penicillin",
        "piperacillin",
        "amoxiclav",
        "co-amoxiclav",
        "cloxacillin",
    ],
    "sulfa": ["sulfamethoxazole", "cotrimoxazole", "sulfasalazine"],
    "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketorolac"],
    "cephalosporin": ["cefixime", "ceftriaxone", "cefuroxime", "cephalexin"],
}

# --- Drug–drug interactions (illustrative, high-signal pairs) -------------------------------------
DRUG_INTERACTIONS: list[tuple[str, str, str, str]] = [
    ("warfarin", "aspirin", "MAJOR", "Increased bleeding risk — avoid or monitor INR closely."),
    ("warfarin", "ibuprofen", "MAJOR", "Increased bleeding risk (NSAID + anticoagulant)."),
    ("metformin", "contrast", "MODERATE", "Risk of lactic acidosis around contrast imaging."),
    ("clarithromycin", "simvastatin", "MAJOR", "Rhabdomyolysis risk — avoid combination."),
    ("azithromycin", "amiodarone", "MAJOR", "QT prolongation risk."),
    ("tramadol", "sertraline", "MODERATE", "Serotonin syndrome risk."),
    (" acei", "potassium", "MODERATE", "Hyperkalaemia risk."),
]

# --- Formulary equivalents (same salt / therapeutic swap) -----------------------------------------
THERAPEUTIC_EQUIVALENTS: dict[str, list[str]] = {
    "amoxicillin": ["Azithromycin", "Doxycycline", "Cefixime"],
    "cough syrup": ["Dextromethorphan syrup", "Ambroxol syrup"],
    "ibuprofen": ["Paracetamol", "Naproxen"],
    "diclofenac": ["Paracetamol", "Naproxen"],
}

VITAL_THRESHOLDS = {
    "spo2_critical": 92,
    "hr_high": 120,
    "hr_low": 45,
    "sbp_high": 180,
    "sbp_low": 90,
    "temp_high": 103.0,
    "rr_high": 24,
}


def detect_red_flags(text: str) -> list[str]:
    text_l = (text or "").lower()
    return [reason for kw, reason in RED_FLAG_KEYWORDS.items() if kw in text_l]


def route_specialty(text: str) -> str:
    text_l = (text or "").lower()
    for kw, specialty in SPECIALTY_ROUTING.items():
        if kw in text_l:
            return specialty
    return DEFAULT_SPECIALTY


def suggest_icd10(text: str) -> list[dict[str, str]]:
    text_l = (text or "").lower()
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for keys, code, label in ICD10_HINTS:
        if all(k in text_l for k in keys) and code not in seen:
            out.append({"code": code, "label": label})
            seen.add(code)
    return out[:3]


def drug_class_of(drug_name: str) -> str | None:
    name = (drug_name or "").lower()
    for cls, members in DRUG_CLASS_MEMBERS.items():
        if any(member in name for member in members):
            return cls
    return None
