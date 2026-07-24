# """Clinical knowledge base — the deterministic grounding used by the agent mesh.

# In production this is a vector store (Qdrant) over curated guidelines, formulary and SOPs. Here it
# is a compact, transparent, auditable rule set so the reference build is safe and works offline.
# Every clinically meaningful decision (red flags, allergy conflicts, interactions) is driven by these
# tables — the LLM only adds natural-language narrative on top.
# """
# from __future__ import annotations

# # --- Red-flag symptoms → immediate escalation (ESI 1-2) -----------------------------------------
# RED_FLAG_KEYWORDS: dict[str, str] = {
#     "chest pain": "Possible acute coronary syndrome — escalate to emergency.",
#     "crushing chest": "Possible acute coronary syndrome — escalate to emergency.",
#     "shortness of breath": "Respiratory distress — assess airway/breathing immediately.",
#     "difficulty breathing": "Respiratory distress — assess airway/breathing immediately.",
#     "breathless": "Respiratory distress — assess airway/breathing immediately.",
#     "unconscious": "Altered consciousness — emergency escalation.",
#     "unresponsive": "Altered consciousness — emergency escalation.",
#     "seizure": "Active seizure — emergency escalation.",
#     "stroke": "Possible stroke — activate stroke pathway (FAST).",
#     "slurred speech": "Possible stroke — activate stroke pathway (FAST).",
#     "facial droop": "Possible stroke — activate stroke pathway (FAST).",
#     "severe bleeding": "Uncontrolled haemorrhage — emergency escalation.",
#     "suicidal": "Psychiatric emergency — do not leave patient unattended.",
#     "anaphylaxis": "Anaphylaxis — emergency escalation, prepare adrenaline.",
#     "blue lips": "Cyanosis / hypoxia — emergency escalation.",
# }

# # --- Specialty routing by complaint --------------------------------------------------------------
# SPECIALTY_ROUTING: dict[str, str] = {
#     "fever": "General Medicine",
#     "cough": "General Medicine",
#     "cold": "General Medicine",
#     "sore throat": "General Medicine",
#     "headache": "General Medicine",
#     "body ache": "General Medicine",
#     "diarrhea": "General Medicine",
#     "vomiting": "General Medicine",
#     "chest pain": "Cardiology",
#     "palpitation": "Cardiology",
#     "breathless": "Pulmonology",
#     "wheezing": "Pulmonology",
#     "skin": "Dermatology",
#     "rash": "Dermatology",
#     "joint": "Orthopaedics",
#     "knee": "Orthopaedics",
#     "back pain": "Orthopaedics",
#     "fracture": "Orthopaedics",
#     "abdomen": "Gastroenterology",
#     "stomach": "Gastroenterology",
#     "child": "Paediatrics",
#     "pregnan": "Obstetrics & Gynaecology",
#     "eye": "Ophthalmology",
#     "ear": "ENT",
#     "tooth": "Dentistry",
#     "anxiety": "Psychiatry",
#     "depress": "Psychiatry",
#     "sugar": "Endocrinology",
#     "diabet": "Endocrinology",
#     "thyroid": "Endocrinology",
# }
# DEFAULT_SPECIALTY = "General Medicine"

# # --- ICD-10 hints (illustrative) -----------------------------------------------------------------
# ICD10_HINTS: list[tuple[tuple[str, ...], str, str]] = [
#     (("cough", "fever", "chest"), "J22", "Acute lower respiratory tract infection"),
#     (("cough", "fever"), "J06.9", "Acute upper respiratory infection, unspecified"),
#     (("fever",), "R50.9", "Fever, unspecified"),
#     (("headache",), "R51", "Headache"),
#     (("sore throat",), "J02.9", "Acute pharyngitis, unspecified"),
#     (("diarrhea", "vomiting"), "A09", "Infectious gastroenteritis and colitis"),
#     (("chest pain",), "R07.9", "Chest pain, unspecified"),
#     (("back pain",), "M54.5", "Low back pain"),
#     (("diabet", "sugar"), "E11.9", "Type 2 diabetes mellitus without complications"),
#     (("hypertension", "bp"), "I10", "Essential (primary) hypertension"),
# ]

# # --- Drug knowledge: allergy classes -------------------------------------------------------------
# DRUG_CLASS_MEMBERS: dict[str, list[str]] = {
#     "penicillin": [
#         "amoxicillin",
#         "ampicillin",
#         "penicillin",
#         "piperacillin",
#         "amoxiclav",
#         "co-amoxiclav",
#         "cloxacillin",
#     ],
#     "sulfa": ["sulfamethoxazole", "cotrimoxazole", "sulfasalazine"],
#     "nsaid": ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketorolac"],
#     "cephalosporin": ["cefixime", "ceftriaxone", "cefuroxime", "cephalexin"],
# }

# # --- Drug–drug interactions (illustrative, high-signal pairs) -------------------------------------
# DRUG_INTERACTIONS: list[tuple[str, str, str, str]] = [
#     ("warfarin", "aspirin", "MAJOR", "Increased bleeding risk — avoid or monitor INR closely."),
#     ("warfarin", "ibuprofen", "MAJOR", "Increased bleeding risk (NSAID + anticoagulant)."),
#     ("metformin", "contrast", "MODERATE", "Risk of lactic acidosis around contrast imaging."),
#     ("clarithromycin", "simvastatin", "MAJOR", "Rhabdomyolysis risk — avoid combination."),
#     ("azithromycin", "amiodarone", "MAJOR", "QT prolongation risk."),
#     ("tramadol", "sertraline", "MODERATE", "Serotonin syndrome risk."),
#     (" acei", "potassium", "MODERATE", "Hyperkalaemia risk."),
# ]

# # --- Formulary equivalents (same salt / therapeutic swap) -----------------------------------------
# THERAPEUTIC_EQUIVALENTS: dict[str, list[str]] = {
#     "amoxicillin": ["Azithromycin", "Doxycycline", "Cefixime"],
#     "cough syrup": ["Dextromethorphan syrup", "Ambroxol syrup"],
#     "ibuprofen": ["Paracetamol", "Naproxen"],
#     "diclofenac": ["Paracetamol", "Naproxen"],
# }

# VITAL_THRESHOLDS = {
#     "spo2_critical": 92,
#     "hr_high": 120,
#     "hr_low": 45,
#     "sbp_high": 180,
#     "sbp_low": 90,
#     "temp_high": 103.0,
#     "rr_high": 24,
# }


# def detect_red_flags(text: str) -> list[str]:
#     text_l = (text or "").lower()
#     return [reason for kw, reason in RED_FLAG_KEYWORDS.items() if kw in text_l]


# def route_specialty(text: str) -> str:
#     text_l = (text or "").lower()
#     for kw, specialty in SPECIALTY_ROUTING.items():
#         if kw in text_l:
#             return specialty
#     return DEFAULT_SPECIALTY


# def suggest_icd10(text: str) -> list[dict[str, str]]:
#     text_l = (text or "").lower()
#     out: list[dict[str, str]] = []
#     seen: set[str] = set()
#     for keys, code, label in ICD10_HINTS:
#         if all(k in text_l for k in keys) and code not in seen:
#             out.append({"code": code, "label": label})
#             seen.add(code)
#     return out[:3]


# def drug_class_of(drug_name: str) -> str | None:
#     name = (drug_name or "").lower()
#     for cls, members in DRUG_CLASS_MEMBERS.items():
#         if any(member in name for member in members):
#             return cls
#     return None

"""Clinical knowledge base — deterministic grounding used by the agent mesh.

This reference implementation contains transparent, auditable rules for:
- Emergency red-flag detection
- Specialty routing
- ICD-10 suggestion hints
- Allergy-class detection
- Drug–drug interaction checks
- Therapeutic alternatives

These rules support clinical workflows but must not replace clinician review.
"""

from __future__ import annotations

import re
from typing import Literal, TypedDict


# --------------------------------------------------------------------------------------------------
# Text helpers
# --------------------------------------------------------------------------------------------------

def normalize_text(text: str | None) -> str:
    """Normalize free text for deterministic matching."""
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def contains_term(text: str, term: str) -> bool:
    """Match phrases and avoid accidental substring matches for short terms.

    Examples:
    - "bp" matches "high bp"
    - "bp" does not match a random substring inside another word
    - "pregnan" can intentionally match pregnancy/pregnant
    """
    text_l = normalize_text(text)
    term_l = normalize_text(term)

    if not term_l:
        return False

    # Prefix matching is deliberately supported using a trailing "*".
    if term_l.endswith("*"):
        prefix = re.escape(term_l[:-1])
        return bool(re.search(rf"\b{prefix}\w*", text_l))

    return bool(re.search(rf"(?<!\w){re.escape(term_l)}(?!\w)", text_l))


def contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(contains_term(text, term) for term in terms)


def contains_all(text: str, terms: tuple[str, ...]) -> bool:
    return all(contains_term(text, term) for term in terms)


# --------------------------------------------------------------------------------------------------
# Red flags
# --------------------------------------------------------------------------------------------------

RED_FLAG_KEYWORDS: dict[str, str] = {
    # Cardiovascular
    "chest pain": "Possible acute coronary syndrome — escalate to emergency.",
    "crushing chest pain": "Possible acute coronary syndrome — escalate to emergency.",
    "chest pressure": "Possible acute coronary syndrome — escalate to emergency.",

    # Respiratory
    "shortness of breath": "Respiratory distress — assess airway and breathing immediately.",
    "difficulty breathing": "Respiratory distress — assess airway and breathing immediately.",
    "severe breathlessness": "Respiratory distress — assess airway and breathing immediately.",
    "blue lips": "Cyanosis or hypoxia — emergency escalation.",
    "coughing blood": "Haemoptysis — urgent respiratory and haemodynamic assessment.",
    "coughing up blood": "Haemoptysis — urgent respiratory and haemodynamic assessment.",

    # Neurological
    "unconscious": "Altered consciousness — emergency escalation.",
    "unresponsive": "Altered consciousness — emergency escalation.",
    "seizure": "Active or recent seizure — emergency escalation.",
    "slurred speech": "Possible stroke — activate stroke pathway.",
    "facial droop": "Possible stroke — activate stroke pathway.",
    "sudden weakness": "Possible stroke or neurological emergency — assess immediately.",

    # Bleeding / allergy / psychiatric
    "severe bleeding": "Uncontrolled haemorrhage — emergency escalation.",
    "vomiting blood": "Possible upper gastrointestinal bleeding — emergency escalation.",
    "black stool": "Possible gastrointestinal bleeding — urgent assessment.",
    "anaphylaxis": "Anaphylaxis — emergency escalation and prepare adrenaline.",
    "suicidal": "Psychiatric emergency — do not leave the patient unattended.",

    # Oncology-specific emergencies
    "fever after chemotherapy": (
        "Possible febrile neutropenia — urgent oncology assessment and sepsis pathway."
    ),
    "fever during chemotherapy": (
        "Possible febrile neutropenia — urgent oncology assessment and sepsis pathway."
    ),
    "chemotherapy and fever": (
        "Possible febrile neutropenia — urgent oncology assessment and sepsis pathway."
    ),
    "neutropenic fever": (
        "Possible febrile neutropenia — urgent oncology assessment and sepsis pathway."
    ),
    "new leg weakness": (
        "Possible spinal cord compression, particularly with known cancer — emergency assessment."
    ),
    "loss of bladder control": (
        "Possible cauda equina or spinal cord compression — emergency assessment."
    ),
    "loss of bowel control": (
        "Possible cauda equina or spinal cord compression — emergency assessment."
    ),
    "facial swelling with breathlessness": (
        "Possible superior vena cava obstruction — urgent oncology assessment."
    ),
    "neck swelling with breathlessness": (
        "Possible airway or superior vena cava obstruction — urgent assessment."
    ),
    "confusion in cancer patient": (
        "Possible metabolic, infectious, neurological, or treatment-related emergency."
    ),
}


# Patterns requiring combinations rather than one fixed phrase.
COMPOSITE_RED_FLAGS: list[dict[str, object]] = [
    {
        "all": ("fever",),
        "any": ("chemotherapy", "chemo", "neutropenia", "low white blood cells"),
        "reason": (
            "Possible febrile neutropenia — urgent oncology assessment and sepsis pathway."
        ),
    },
    {
        "all": ("back pain",),
        "any": (
            "leg weakness",
            "leg numbness",
            "difficulty walking",
            "bladder control",
            "bowel control",
        ),
        "reason": "Possible spinal cord compression — emergency assessment.",
    },
    {
        "all": ("cancer",),
        "any": ("confusion", "drowsiness", "reduced consciousness"),
        "reason": (
            "Possible metabolic, infectious, neurological, or treatment-related emergency."
        ),
    },
]


def detect_red_flags(text: str) -> list[str]:
    text_l = normalize_text(text)
    reasons: list[str] = []

    for keyword, reason in RED_FLAG_KEYWORDS.items():
        if contains_term(text_l, keyword) and reason not in reasons:
            reasons.append(reason)

    for rule in COMPOSITE_RED_FLAGS:
        required = rule.get("all", ())
        alternatives = rule.get("any", ())
        reason = str(rule["reason"])

        if (
            contains_all(text_l, required)  # type: ignore[arg-type]
            and contains_any(text_l, alternatives)  # type: ignore[arg-type]
            and reason not in reasons
        ):
            reasons.append(reason)

    return reasons


# --------------------------------------------------------------------------------------------------
# Specialty routing
# --------------------------------------------------------------------------------------------------

class SpecialtyRule(TypedDict):
    specialty: str
    keywords: tuple[str, ...]
    priority: int


# Rules are explicitly prioritized. More specific specialties should be evaluated first.
SPECIALTY_ROUTING_RULES: list[SpecialtyRule] = [
    # Oncology
    {
        "specialty": "Medical Oncology",
        "priority": 100,
        "keywords": (
            "known cancer",
            "cancer follow-up",
            "cancer treatment",
            "chemotherapy",
            "chemo",
            "immunotherapy",
            "targeted therapy",
            "tumour marker",
            "tumor marker",
            "metastatic cancer",
            "metastasis",
            "cancer recurrence",
            "cancer relapse",
            "oncology consultation",
        ),
    },
    {
        "specialty": "Radiation Oncology",
        "priority": 100,
        "keywords": (
            "radiotherapy",
            "radiation therapy",
            "radiation treatment",
            "radiation planning",
            "radiation follow-up",
        ),
    },
    {
        "specialty": "Surgical Oncology",
        "priority": 95,
        "keywords": (
            "cancer surgery",
            "tumour removal",
            "tumor removal",
            "oncologic surgery",
            "mastectomy",
            "lumpectomy",
            "cancer operation",
        ),
    },
    {
        "specialty": "Haematology & Oncology",
        "priority": 95,
        "keywords": (
            "leukaemia",
            "leukemia",
            "lymphoma",
            "multiple myeloma",
            "bone marrow cancer",
            "blood cancer",
            "abnormal bone marrow",
        ),
    },
    {
        "specialty": "Oncology",
        "priority": 90,
        "keywords": (
            "suspected cancer",
            "possible cancer",
            "malignancy",
            "malignant",
            "abnormal biopsy",
            "positive biopsy",
            "biopsy shows cancer",
            "tumour",
            "tumor",
            "unexplained lump",
            "persistent lump",
            "breast lump",
            "neck lump",
            "unexplained weight loss",
            "non-healing ulcer",
            "non healing ulcer",
            "cancer screening abnormal",
        ),
    },

    # Other specialties
    {
        "specialty": "Cardiology",
        "priority": 80,
        "keywords": (
            "chest pain",
            "chest pressure",
            "palpitation",
            "irregular heartbeat",
            "heart failure",
        ),
    },
    {
        "specialty": "Pulmonology",
        "priority": 75,
        "keywords": (
            "breathless",
            "shortness of breath",
            "difficulty breathing",
            "wheezing",
            "asthma",
            "coughing blood",
        ),
    },
    {
        "specialty": "Endocrinology",
        "priority": 70,
        "keywords": (
            "diabetes",
            "diabetic",
            "high sugar",
            "low sugar",
            "thyroid",
            "hormonal problem",
        ),
    },
    {
        "specialty": "Obstetrics & Gynaecology",
        "priority": 70,
        "keywords": (
            "pregnant",
            "pregnancy",
            "antenatal",
            "vaginal bleeding",
            "menstrual problem",
            "pelvic pain",
        ),
    },
    {
        "specialty": "Paediatrics",
        "priority": 65,
        "keywords": (
            "child",
            "infant",
            "baby",
            "newborn",
            "paediatric",
            "pediatric",
        ),
    },
    {
        "specialty": "Gastroenterology",
        "priority": 60,
        "keywords": (
            "abdominal pain",
            "abdomen pain",
            "stomach pain",
            "blood in stool",
            "black stool",
            "jaundice",
            "acid reflux",
        ),
    },
    {
        "specialty": "Orthopaedics",
        "priority": 60,
        "keywords": (
            "joint pain",
            "knee pain",
            "back pain",
            "fracture",
            "bone pain",
            "shoulder pain",
        ),
    },
    {
        "specialty": "Dermatology",
        "priority": 55,
        "keywords": (
            "skin rash",
            "rash",
            "itching",
            "skin lesion",
            "acne",
        ),
    },
    {
        "specialty": "Psychiatry",
        "priority": 55,
        "keywords": (
            "anxiety",
            "depression",
            "depressed",
            "panic attack",
            "suicidal",
        ),
    },
    {
        "specialty": "Ophthalmology",
        "priority": 50,
        "keywords": (
            "eye pain",
            "blurred vision",
            "vision loss",
            "red eye",
        ),
    },
    {
        "specialty": "ENT",
        "priority": 50,
        "keywords": (
            "ear pain",
            "hearing loss",
            "nose bleed",
            "nasal blockage",
            "tonsil",
        ),
    },
    {
        "specialty": "Dentistry",
        "priority": 50,
        "keywords": (
            "tooth pain",
            "toothache",
            "dental pain",
            "gum swelling",
        ),
    },
    {
        "specialty": "General Medicine",
        "priority": 10,
        "keywords": (
            "fever",
            "cough",
            "cold",
            "sore throat",
            "headache",
            "body ache",
            "diarrhea",
            "diarrhoea",
            "vomiting",
            "fatigue",
            "weakness",
            "high bp",
            "hypertension",
        ),
    },
]

DEFAULT_SPECIALTY = "General Medicine"


def route_specialty(text: str) -> str:
    """Return the highest-priority specialty matching the complaint."""
    sorted_rules = sorted(
        SPECIALTY_ROUTING_RULES,
        key=lambda item: item["priority"],
        reverse=True,
    )

    for rule in sorted_rules:
        if contains_any(text, rule["keywords"]):
            return rule["specialty"]

    return DEFAULT_SPECIALTY


# --------------------------------------------------------------------------------------------------
# ICD-10 suggestion hints
# --------------------------------------------------------------------------------------------------

ICDMatchMode = Literal["any", "all"]


class ICD10Hint(TypedDict):
    terms: tuple[str, ...]
    mode: ICDMatchMode
    code: str
    label: str
    priority: int


ICD10_HINTS: list[ICD10Hint] = [
    # Oncology-related symptoms/findings
    {
        "terms": ("cancer", "malignancy", "malignant tumour", "malignant tumor"),
        "mode": "any",
        "code": "C80.1",
        "label": "Malignant neoplasm without specification of site",
        "priority": 100,
    },
    {
        "terms": ("secondary cancer", "metastatic cancer", "metastasis"),
        "mode": "any",
        "code": "C79.9",
        "label": "Secondary malignant neoplasm, unspecified site",
        "priority": 100,
    },
    {
        "terms": ("breast lump", "breast mass"),
        "mode": "any",
        "code": "N63",
        "label": "Unspecified lump in breast",
        "priority": 90,
    },
    {
        "terms": ("neck lump", "neck mass", "swollen lymph node"),
        "mode": "any",
        "code": "R22.1",
        "label": "Localized swelling, mass and lump, neck",
        "priority": 90,
    },
    {
        "terms": ("abdominal mass", "abdomen mass"),
        "mode": "any",
        "code": "R19.00",
        "label": "Intra-abdominal and pelvic swelling, mass and lump, unspecified site",
        "priority": 90,
    },
    {
        "terms": ("unexplained weight loss", "unintentional weight loss"),
        "mode": "any",
        "code": "R63.4",
        "label": "Abnormal weight loss",
        "priority": 85,
    },
    {
        "terms": ("chemotherapy encounter", "for chemotherapy"),
        "mode": "any",
        "code": "Z51.11",
        "label": "Encounter for antineoplastic chemotherapy",
        "priority": 95,
    },
    {
        "terms": ("radiotherapy encounter", "for radiotherapy", "radiation treatment"),
        "mode": "any",
        "code": "Z51.0",
        "label": "Encounter for antineoplastic radiation therapy",
        "priority": 95,
    },
    {
        "terms": ("history of cancer", "cancer survivor"),
        "mode": "any",
        "code": "Z85.9",
        "label": "Personal history of malignant neoplasm, unspecified",
        "priority": 80,
    },

    # Respiratory/infectious
    {
        "terms": ("cough", "fever", "chest congestion"),
        "mode": "all",
        "code": "J22",
        "label": "Acute lower respiratory infection, unspecified",
        "priority": 75,
    },
    {
        "terms": ("cough", "fever"),
        "mode": "all",
        "code": "J06.9",
        "label": "Acute upper respiratory infection, unspecified",
        "priority": 70,
    },
    {
        "terms": ("sore throat",),
        "mode": "any",
        "code": "J02.9",
        "label": "Acute pharyngitis, unspecified",
        "priority": 65,
    },
    {
        "terms": ("fever",),
        "mode": "any",
        "code": "R50.9",
        "label": "Fever, unspecified",
        "priority": 50,
    },

    # Gastrointestinal
    {
        "terms": ("diarrhea", "vomiting"),
        "mode": "all",
        "code": "A09",
        "label": "Infectious gastroenteritis and colitis, unspecified",
        "priority": 70,
    },

    # Cardiovascular
    {
        "terms": ("chest pain", "chest pressure"),
        "mode": "any",
        "code": "R07.9",
        "label": "Chest pain, unspecified",
        "priority": 80,
    },
    {
        "terms": ("hypertension", "high bp", "high blood pressure"),
        "mode": "any",
        "code": "I10",
        "label": "Essential (primary) hypertension",
        "priority": 70,
    },

    # Endocrine
    {
        "terms": ("type 2 diabetes", "diabetic", "high sugar", "diabetes"),
        "mode": "any",
        "code": "E11.9",
        "label": "Type 2 diabetes mellitus without complications",
        "priority": 70,
    },

    # General symptoms
    {
        "terms": ("headache",),
        "mode": "any",
        "code": "R51.9",
        "label": "Headache, unspecified",
        "priority": 50,
    },
    {
        "terms": ("low back pain", "back pain"),
        "mode": "any",
        "code": "M54.50",
        "label": "Low back pain, unspecified",
        "priority": 50,
    },
]


def suggest_icd10(text: str, limit: int = 3) -> list[dict[str, str]]:
    """Return ranked ICD-10 hints.

    These are candidate codes for clinician review, not confirmed diagnoses.
    """
    matches: list[ICD10Hint] = []

    for hint in ICD10_HINTS:
        matched = (
            contains_all(text, hint["terms"])
            if hint["mode"] == "all"
            else contains_any(text, hint["terms"])
        )

        if matched:
            matches.append(hint)

    matches.sort(key=lambda hint: hint["priority"], reverse=True)

    output: list[dict[str, str]] = []
    seen_codes: set[str] = set()

    for hint in matches:
        if hint["code"] in seen_codes:
            continue

        output.append({
            "code": hint["code"],
            "label": hint["label"],
        })
        seen_codes.add(hint["code"])

        if len(output) >= limit:
            break

    return output


# --------------------------------------------------------------------------------------------------
# Drug allergy classes
# --------------------------------------------------------------------------------------------------

DRUG_CLASS_MEMBERS: dict[str, list[str]] = {
    "penicillin": [
        "amoxicillin",
        "ampicillin",
        "penicillin",
        "piperacillin",
        "amoxiclav",
        "co-amoxiclav",
        "cloxacillin",
        "flucloxacillin",
    ],
    "sulfonamide": [
        "sulfamethoxazole",
        "trimethoprim-sulfamethoxazole",
        "co-trimoxazole",
        "cotrimoxazole",
        "sulfasalazine",
    ],
    "nsaid": [
        "ibuprofen",
        "diclofenac",
        "naproxen",
        "aspirin",
        "ketorolac",
        "indomethacin",
        "aceclofenac",
    ],
    "cephalosporin": [
        "cefixime",
        "ceftriaxone",
        "cefuroxime",
        "cephalexin",
        "cefazolin",
        "cefpodoxime",
    ],
    "fluoroquinolone": [
        "ciprofloxacin",
        "levofloxacin",
        "moxifloxacin",
        "ofloxacin",
    ],
}


def drug_class_of(drug_name: str) -> str | None:
    name = normalize_text(drug_name)

    for drug_class, members in DRUG_CLASS_MEMBERS.items():
        if any(contains_term(name, member) for member in members):
            return drug_class

    return None


# --------------------------------------------------------------------------------------------------
# Drug interactions
# --------------------------------------------------------------------------------------------------

DRUG_INTERACTIONS: list[tuple[str, str, str, str]] = [
    (
        "warfarin",
        "aspirin",
        "MAJOR",
        "Increased bleeding risk — avoid unless specifically indicated and closely monitored.",
    ),
    (
        "warfarin",
        "ibuprofen",
        "MAJOR",
        "Increased gastrointestinal and systemic bleeding risk.",
    ),
    (
        "metformin",
        "iodinated contrast",
        "MODERATE",
        "Assess renal function and follow contrast-related metformin guidance.",
    ),
    (
        "clarithromycin",
        "simvastatin",
        "MAJOR",
        "Increased risk of myopathy and rhabdomyolysis — avoid combination.",
    ),
    (
        "azithromycin",
        "amiodarone",
        "MAJOR",
        "Additive QT-prolongation and arrhythmia risk.",
    ),
    (
        "tramadol",
        "sertraline",
        "MODERATE",
        "Increased risk of serotonin toxicity and seizures.",
    ),
    (
        "ace inhibitor",
        "potassium",
        "MODERATE",
        "Increased hyperkalaemia risk — monitor serum potassium and renal function.",
    ),

    # Common oncology-related interactions
    (
        "methotrexate",
        "trimethoprim",
        "MAJOR",
        "Increased methotrexate toxicity and bone-marrow suppression risk.",
    ),
    (
        "methotrexate",
        "cotrimoxazole",
        "MAJOR",
        "Increased methotrexate toxicity and bone-marrow suppression risk.",
    ),
    (
        "tamoxifen",
        "paroxetine",
        "MAJOR",
        "Paroxetine may reduce formation of tamoxifen's active metabolite.",
    ),
    (
        "capecitabine",
        "warfarin",
        "MAJOR",
        "Marked increase in anticoagulant effect and bleeding risk — monitor closely.",
    ),
    (
        "ondansetron",
        "amiodarone",
        "MAJOR",
        "Additive QT-prolongation risk.",
    ),
]


# --------------------------------------------------------------------------------------------------
# Therapeutic alternatives
# --------------------------------------------------------------------------------------------------

# These are review candidates only—not automatic substitutions.
THERAPEUTIC_EQUIVALENTS: dict[str, list[str]] = {
    "amoxicillin": ["Azithromycin", "Doxycycline", "Cefixime"],
    "cough syrup": ["Dextromethorphan syrup", "Ambroxol syrup"],
    "ibuprofen": ["Paracetamol", "Naproxen"],
    "diclofenac": ["Paracetamol", "Naproxen"],
}


# --------------------------------------------------------------------------------------------------
# Vital thresholds
# --------------------------------------------------------------------------------------------------

VITAL_THRESHOLDS: dict[str, float | int] = {
    "spo2_critical": 92,
    "hr_high": 120,
    "hr_low": 45,
    "sbp_high": 180,
    "sbp_low": 90,
    "temp_high_f": 103.0,
    "temp_high_c": 39.4,
    "rr_high": 24,
}