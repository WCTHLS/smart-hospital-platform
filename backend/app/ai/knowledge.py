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
    # Oncology (Priority 100)
    {
        "specialty": "Oncology",
        "priority": 100,
        "keywords": (
            "cancer", "oncology", "oncologist", "malignancy", "malignant", "carcinoma", "sarcoma",
            "lymphoma", "leukaemia", "leukemia", "chemotherapy", "chemo", "radiotherapy",
            "radiation therapy", "radiation treatment", "tumour", "tumor", "biopsy shows", "positive biopsy",
            "metastasis", "metastatic", "breast lump", "neck lump", "unexplained lump",
            "abnormal bone marrow", "mastectomy", "lumpectomy", "pet scan cancer", "oncologic",
            "cancer recurrence", "cancer follow-up", "cancer treatment", "cancer screening abnormal",
        ),
    },

    # Paediatrics (Priority 90 - when patient is a child / baby / infant)
    {
        "specialty": "Paediatrics",
        "priority": 90,
        "keywords": (
            "paediatric", "pediatric", "paediatrician", "pediatrician", "newborn",
            "infant", "baby", "babies", "toddler", "toddlers", "child", "children",
            "neonatal", "vaccination for baby", "childhood", "milestones delay", "pediatric consultation",
        ),
    },

    # Dentistry (Priority 85)
    {
        "specialty": "Dentistry",
        "priority": 85,
        "keywords": (
            "tooth", "teeth", "dental", "dentist", "dentistry", "toothache", "tooth pain",
            "teeth pain", "wisdom tooth", "gum", "gums", "bleeding gum", "bleeding gums",
            "gum bleeding", "gum swelling", "swollen gum", "cavity", "cavities", "root canal",
            "rct", "molar", "incisor", "denture", "dentures", "braces", "orthodontic",
            "gingivitis", "periodontitis", "jaw pain", "dental caries", "tooth sensitivity",
            "mouth ulcer", "mouth pain", "dental abscess", "bleeding in mouth",
        ),
    },

    # Cardiology (Priority 80)
    {
        "specialty": "Cardiology",
        "priority": 80,
        "keywords": (
            "cardiology", "cardiologist", "cardiac", "heart", "angina", "palpitation", "palpitations",
            "chest pain", "chest pressure", "chest tightness", "chest heaviness", "chest burning",
            "chest discomfort", "irregular heartbeat", "arrhythmia", "tachycardia", "bradycardia",
            "heart failure", "heart attack", "myocardial infarction", "high bp", "hypertension",
            "high blood pressure", "elevated blood pressure", "ecg", "ekg", "echocardiogram", "echo test",
            "coronary", "stent", "bypass surgery", "cabg", "cardiovascular", "heart flutter",
            "heart racing", "heart skipping", "breathless on exertion", "cardiac health",
        ),
    },

    # Pulmonology / Respiratory (Priority 78)
    {
        "specialty": "Pulmonology",
        "priority": 78,
        "keywords": (
            "pulmonology", "pulmonologist", "respiratory", "lungs", "lung", "asthma", "asthmatic",
            "copd", "bronchitis", "pneumonia", "wheeze", "wheezing", "breathless", "breathlessness",
            "shortness of breath", "short of breath", "difficulty breathing", "trouble breathing",
            "cannot breathe", "coughing blood", "cough up blood", "blood in sputum", "hemoptysis",
            "chronic cough", "persistent cough", "chest congestion", "lung congestion", "tuberculosis",
            "pleurisy", "inhaler", "nebulizer", "spirometry", "heavy phlegm", "lung infection",
        ),
    },

    # Orthopaedics / Musculoskeletal (Priority 75)
    {
        "specialty": "Orthopaedics",
        "priority": 75,
        "keywords": (
            # Explicit terms & conditions
            "orthopaedics", "orthopedics", "orthopaedic", "orthopedic", "ortho", "fracture",
            "broken bone", "bone fracture", "dislocation", "dislocated", "subluxation",
            "arthritis", "osteoarthritis", "rheumatoid arthritis", "gout", "uric acid joint",
            "spondylosis", "spondylitis", "ankylosing", "sciatica", "slip disc", "slipped disc",
            "herniated disc", "frozen shoulder", "carpal tunnel", "bursitis", "synovitis",
            "osteoporosis", "bone density", "scoliosis", "tennis elbow", "golfer elbow",
            "plantar fasciitis", "achilles tendon", "ligament tear", "torn ligament",
            "meniscus tear", "acl tear", "pcl tear", "rotator cuff", "cartilage damage",
            "bone pain", "joint pain", "joint swelling", "swollen joint", "joint stiffness",
            "stiff joints", "back pain", "lower back pain", "lumbago", "backache",
            "neck pain", "cervical pain", "spine pain", "spinal pain",
            # Key anatomical indicators
            "knee", "knees", "knee pain", "swelling knee", "swollen knee", "knee swelling",
            "knee injury", "knee stiffness", "shoulder", "shoulder pain", "swollen shoulder",
            "ankle", "ankle pain", "ankle sprain", "swollen ankle", "twisted ankle",
            "elbow", "elbow pain", "wrist", "wrist pain", "hip pain", "hip joint",
            "heel pain", "foot pain", "bone crack", "bone ache", "musculoskeletal",
            "sprain", "strain", "muscle tear", "tendonitis", "tendinitis", "cannot walk",
            "unable to walk", "limping",
        ),
    },

    # Dermatology (Priority 70)
    {
        "specialty": "Dermatology",
        "priority": 70,
        "keywords": (
            "dermatology", "dermatologist", "skin", "derma", "rash", "rashes", "skin rash",
            "itching", "itchy skin", "eczema", "psoriasis", "acne", "pimples", "pimple",
            "urticaria", "hives", "skin allergy", "allergic rash", "dermatitis", "vitiligo",
            "alopecia", "hair loss", "hair fall", "dandruff", "fungal infection", "ringworm",
            "tinea", "scabies", "warts", "mole", "moles", "skin pigmentation", "rosacea",
            "blister", "blisters", "boil", "boils", "skin lesion", "skin peeling",
            "dry scaly skin", "red patches on skin", "skin infection",
        ),
    },

    # Gastroenterology (Priority 68)
    {
        "specialty": "Gastroenterology",
        "priority": 68,
        "keywords": (
            "gastro", "gastroenterology", "gastroenterologist", "stomach pain", "abdominal pain",
            "abdomen pain", "belly pain", "gastric pain", "stomach ache", "acidity",
            "acid reflux", "gerd", "heartburn", "stomach burning", "gastritis", "peptic ulcer",
            "stomach ulcer", "endoscopy", "colonoscopy", "blood in stool", "black stool",
            "melena", "rectal bleeding", "jaundice", "yellow eyes liver", "liver problem",
            "fatty liver", "hepatitis", "cirrhosis", "gallstone", "gallstones", "gallbladder",
            "pancreatitis", "severe constipation", "bloating", "indigestion", "irritable bowel",
            "ibs", "crohn", "colitis", "gut infection",
        ),
    },

    # Neurology (Priority 65)
    {
        "specialty": "Neurology",
        "priority": 65,
        "keywords": (
            "neurology", "neurologist", "neuro", "stroke", "paralysis", "seizure", "seizures",
            "epilepsy", "convulsion", "convulsions", "fits", "migraine", "severe migraine",
            "vertigo", "dizziness", "unsteadiness", "loss of balance", "tremor", "tremors",
            "parkinson", "neuropathy", "nerve pain", "tingling in hands", "numbness in fingers",
            "loss of sensation", "facial palsy", "bell palsy", "slurred speech", "syncope",
            "fainting", "memory loss", "amnesia", "dementia", "nerve disorder",
        ),
    },

    # Endocrinology (Priority 62)
    {
        "specialty": "Endocrinology",
        "priority": 62,
        "keywords": (
            "endocrinology", "endocrinologist", "diabetes", "diabetic", "high sugar", "low sugar",
            "blood sugar", "hba1c", "insulin", "thyroid", "hypothyroidism", "hyperthyroidism",
            "tsh", "goiter", "hormonal imbalance", "hormone problem", "pcos", "pcod",
            "metabolic disorder", "pituitary", "adrenal",
        ),
    },

    # Obstetrics & Gynaecology (Priority 60)
    {
        "specialty": "Obstetrics & Gynaecology",
        "priority": 60,
        "keywords": (
            "gynaecology", "gynecology", "gynaecologist", "gynecologist", "obstetrics", "obgyn",
            "pregnant", "pregnancy", "prenatal", "antenatal", "postnatal", "missed period",
            "menstrual", "period pain", "dysmenorrhea", "irregular periods", "heavy menstrual bleeding",
            "vaginal bleeding", "vaginal discharge", "white discharge", "pelvic pain",
            "ovarian cyst", "fibroid", "uterus", "infertility", "conception",
        ),
    },

    # Ophthalmology (Priority 58)
    {
        "specialty": "Ophthalmology",
        "priority": 58,
        "keywords": (
            "ophthalmology", "ophthalmologist", "eye", "eyes", "eye pain", "blurred vision",
            "blurry vision", "vision loss", "loss of vision", "double vision", "red eye",
            "watery eyes", "dry eyes", "cataract", "glaucoma", "conjunctivitis", "eye infection",
            "eye strain", "cornea", "retina", "spectacles", "lasik", "eye irritation",
        ),
    },

    # ENT - Ear, Nose, Throat (Priority 55)
    {
        "specialty": "ENT",
        "priority": 55,
        "keywords": (
            "ent", "ear", "ears", "ear pain", "earache", "ear discharge", "hearing loss",
            "hard of hearing", "tinnitus", "ringing in ear", "nose", "nasal", "nose bleed",
            "epistaxis", "nasal blockage", "blocked nose", "sinus", "sinusitis", "sinus pressure",
            "throat", "tonsil", "tonsils", "tonsillitis", "sore throat", "hoarse voice",
            "loss of voice", "difficulty swallowing", "pain on swallowing", "adenoids",
        ),
    },

    # Psychiatry / Mental Health (Priority 52)
    {
        "specialty": "Psychiatry",
        "priority": 52,
        "keywords": (
            "psychiatry", "psychiatrist", "psychology", "psychologist", "mental health",
            "depression", "depressed", "anxiety", "anxious", "panic attack", "panic attacks",
            "insomnia", "cannot sleep", "sleep disorder", "hallucination", "bipolar",
            "schizophrenia", "ocd", "phobia", "suicidal", "severe stress", "mood swings",
        ),
    },

    # General Medicine (Priority 10 - Constitutional / systemic complaints)
    {
        "specialty": "General Medicine",
        "priority": 10,
        "keywords": (
            "general medicine", "physician", "fever", "high temperature", "chills", "cold",
            "runny nose", "flu", "viral", "headache", "body ache", "body pain", "fatigue",
            "weakness", "tiredness", "exhaustion", "malaise", "diarrhea", "diarrhoea",
            "loose motions", "vomiting", "nausea", "food poisoning", "infection",
            "general checkup", "routine checkup", "health checkup", "unwell",
        ),
    },
]

DEFAULT_SPECIALTY = "General Medicine"


def route_specialty(text: str) -> str:
    """Return the clinical specialty matching the patient's complaint with advanced multi-word & anatomical inference."""
    if not text or not text.strip():
        return DEFAULT_SPECIALTY

    text_l = normalize_text(text)

    # 1. First check prioritized explicit keywords & phrases
    sorted_rules = sorted(
        SPECIALTY_ROUTING_RULES,
        key=lambda item: item["priority"],
        reverse=True,
    )

    for rule in sorted_rules:
        if contains_any(text_l, rule["keywords"]):
            return rule["specialty"]

    # 2. Secondary Compound / Semantic anatomical matching for natural language queries
    # e.g. "severe pain and swelling knee" -> Orthopedic anatomy ("knee") + Orthopedic symptom ("pain", "swelling")
    
    # Orthopaedics Composite Rule (bone/joint/limb + pain/swelling/ache/injury)
    ortho_anatomy = (
        "knee", "knees", "shoulder", "shoulders", "elbow", "elbows", "wrist", "wrists",
        "ankle", "ankles", "hip", "hips", "joint", "joints", "bone", "bones", "spine",
        "spinal", "back", "lumbar", "cervical", "neck", "ligament", "tendon", "cartilage",
        "meniscus", "patella", "heel", "foot", "feet", "toe", "toes", "finger", "fingers",
        "arm", "arms", "leg", "legs", "thigh", "thighs", "calf", "rib", "ribs", "clavicle",
    )
    ortho_symptoms = (
        "pain", "swelling", "swollen", "stiff", "stiffness", "ache", "aching", "injury",
        "injured", "fracture", "crack", "sprain", "strain", "dislocation", "tenderness",
        "cramp", "cramps", "tear", "torn", "fall", "twist", "twisted", "walk", "walking",
        "limp", "limping", "sore", "soreness", "immobility", "mobility", "bend", "bending",
    )
    if contains_any(text_l, ortho_anatomy) and contains_any(text_l, ortho_symptoms):
        return "Orthopaedics"

    # Cardiology Composite Rule (chest/heart/cardio + pressure/burning/tightness/heavy/pain)
    cardio_anatomy = ("chest", "heart", "cardiac")
    cardio_symptoms = (
        "pain", "pressure", "tightness", "tight", "heaviness", "heavy", "burning",
        "discomfort", "flutter", "fluttering", "palpitation", "palpitations", "squeeze",
        "squeezing", "skip", "skipping", "racing", "rate", "pulse",
    )
    if contains_any(text_l, cardio_anatomy) and contains_any(text_l, cardio_symptoms):
        return "Cardiology"

    # Pulmonology Composite Rule (breathing/lungs + difficulty/shortness/wheeze/phlegm)
    pulmo_anatomy = ("lung", "lungs", "breath", "breathing", "respiratory", "airway", "chest")
    pulmo_symptoms = (
        "difficulty", "trouble", "short", "shortness", "hard", "cannot", "wheeze",
        "wheezing", "phlegm", "cough", "blood", "congestion", "gasping",
    )
    if contains_any(text_l, pulmo_anatomy) and contains_any(text_l, pulmo_symptoms):
        return "Pulmonology"

    # Dermatology Composite Rule (skin/face/scalp + rash/itching/allergy/redness/patches)
    derma_anatomy = ("skin", "face", "scalp", "forehead", "arm", "arms", "leg", "legs", "hand", "hands", "body")
    derma_symptoms = (
        "rash", "rashes", "itching", "itchy", "allergy", "allergic", "redness", "red",
        "spots", "patches", "dry", "peeling", "bumps", "lesion", "lesions", "boil", "boils",
        "blister", "blisters", "pimple", "pimples", "acne", "scab", "scaly",
    )
    if contains_any(text_l, derma_anatomy) and contains_any(text_l, derma_symptoms):
        return "Dermatology"

    # Dentistry Composite Rule (tooth/teeth/gum/jaw + pain/swelling/bleeding)
    dental_anatomy = ("tooth", "teeth", "gum", "gums", "jaw", "mouth", "molar", "incisor")
    dental_symptoms = (
        "pain", "ache", "aching", "swelling", "swollen", "bleed", "bleeding", "sensitive",
        "sensitivity", "cavity", "cavities", "ulcer", "ulcers", "decay", "broken",
    )
    if contains_any(text_l, dental_anatomy) and contains_any(text_l, dental_symptoms):
        return "Dentistry"

    # Gastroenterology Composite Rule (stomach/abdomen/belly + pain/cramp/burning/reflux)
    gastro_anatomy = ("stomach", "abdomen", "abdominal", "belly", "gut", "bowel", "liver")
    gastro_symptoms = (
        "pain", "ache", "aching", "cramp", "cramps", "burning", "burn", "acid", "acidity",
        "reflux", "bloating", "bloated", "gas", "constipation", "constipated", "stool",
        "motion", "motions", "vomit", "vomiting", "spasm",
    )
    if contains_any(text_l, gastro_anatomy) and contains_any(text_l, gastro_symptoms):
        return "Gastroenterology"

    # ENT Composite Rule (ear/nose/throat + pain/blockage/bleeding/infection)
    ent_anatomy = ("ear", "ears", "nose", "nasal", "throat", "sinus", "tonsil", "tonsils")
    ent_symptoms = (
        "pain", "ache", "aching", "block", "blocked", "blockage", "bleed", "bleeding",
        "discharge", "hearing", "ringing", "infection", "sore", "hoarse", "swallow",
        "swallowing", "drainage",
    )
    if contains_any(text_l, ent_anatomy) and contains_any(text_l, ent_symptoms):
        return "ENT"

    # Ophthalmology Composite Rule (eye/eyes/vision + pain/blur/red/watery)
    eye_anatomy = ("eye", "eyes", "vision", "sight")
    eye_symptoms = (
        "pain", "blur", "blurry", "blurred", "red", "redness", "water", "watery", "itchy",
        "itching", "strain", "loss", "double", "irritation", "burning",
    )
    if contains_any(text_l, eye_anatomy) and contains_any(text_l, eye_symptoms):
        return "Ophthalmology"

    # Paediatrics Composite Rule (child/baby/infant/kid/son/daughter)
    paed_terms = (
        "child", "children", "baby", "babies", "infant", "infants", "toddler", "toddlers",
        "kid", "kids", "son", "daughter", "months old", "year old", "years old",
    )
    if contains_any(text_l, paed_terms):
        return "Paediatrics"

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