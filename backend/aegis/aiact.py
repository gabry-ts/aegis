"""EU AI Act risk-tier assessment.

A guided questionnaire classifies a deployment into the Act's risk tiers
(prohibited / high-risk / limited / minimal), lists the obligations that apply,
and marks which ones AEGIS, as a runtime guardrail + audit layer, helps satisfy.

This is decision-support, not legal advice.
"""

from typing import Any, Dict, List

QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "prohibited",
        "label": "Does the system use any of these practices? (Art. 5)",
        "options": [
            {"value": "none", "label": "None of these"},
            {"value": "social_scoring", "label": "Social scoring of individuals"},
            {"value": "rt_biometric", "label": "Real-time remote biometric ID in public spaces"},
            {"value": "emotion", "label": "Emotion recognition at work or in education"},
            {"value": "manipulation", "label": "Subliminal / manipulative techniques causing harm"},
        ],
    },
    {
        "id": "domain",
        "label": "Which high-risk domain does it operate in? (Annex III)",
        "options": [
            {"value": "none", "label": "None of these"},
            {"value": "biometrics", "label": "Biometrics / identification"},
            {"value": "critical_infra", "label": "Critical infrastructure"},
            {"value": "education", "label": "Education / vocational training"},
            {"value": "employment", "label": "Employment, hiring, worker management"},
            {"value": "essential", "label": "Essential services (credit, insurance, benefits)"},
            {"value": "law_enforcement", "label": "Law enforcement"},
            {"value": "migration", "label": "Migration, asylum, border control"},
            {"value": "justice", "label": "Justice / democratic processes"},
        ],
    },
    {
        "id": "procedural",
        "label": "If in a high-risk domain, does it only perform a narrow procedural or "
                 "preparatory task, without profiling or influencing decisions on people? (Art. 6(3))",
        "options": [
            {"value": "no", "label": "No — it informs or decides about people"},
            {"value": "yes", "label": "Yes — narrow procedural / preparatory only"},
        ],
        # Only relevant once an Annex III domain is selected.
        "visible_when": {"field": "domain", "not_equals": "none"},
    },
    {
        "id": "interacts",
        "label": "Does it interact with people or generate content (text/image/audio/video)?",
        "options": [
            {"value": "yes", "label": "Yes"},
            {"value": "no", "label": "No"},
        ],
    },
    {
        "id": "gpai",
        "label": "Are you the provider of a general-purpose AI model (GPAI)?",
        "options": [
            {"value": "no", "label": "No"},
            {"value": "yes", "label": "Yes"},
        ],
    },
    {
        "id": "systemic",
        "label": "If a GPAI provider, does the model pose systemic risk (high-impact "
                 "capabilities, e.g. trained above ~10^25 FLOPs or designated)? (Art. 51)",
        "options": [
            {"value": "no", "label": "No"},
            {"value": "yes", "label": "Yes — systemic risk"},
        ],
        # Only relevant when the deployer is a GPAI provider.
        "visible_when": {"field": "gpai", "equals": "yes"},
    },
]

TIER_LABELS = {
    "prohibited": "Prohibited",
    "high_risk": "High-risk",
    "limited": "Limited risk",
    "minimal": "Minimal risk",
}

# aegis: "yes" fully addressed, "partial" supported, "no" out of a proxy's scope.
_HIGH_RISK_OBLIGATIONS = [
    {"article": "Art. 9", "label": "Risk management system", "aegis": "partial"},
    {"article": "Art. 10", "label": "Data governance", "aegis": "no"},
    {"article": "Art. 11", "label": "Technical documentation", "aegis": "no"},
    {"article": "Art. 12", "label": "Record-keeping / logging", "aegis": "yes"},
    {"article": "Art. 13", "label": "Transparency & information to users", "aegis": "partial"},
    {"article": "Art. 14", "label": "Human oversight", "aegis": "partial"},
    {"article": "Art. 15", "label": "Accuracy, robustness & cybersecurity", "aegis": "yes"},
]

# Every GPAI provider carries the Art. 53 baseline; the Art. 55 systemic-risk
# duties attach only once the model crosses the Art. 51 threshold.
_GPAI_BASE_OBLIGATIONS = [
    {"article": "Art. 53", "label": "GPAI: technical documentation & training-data summary", "aegis": "no"},
]
_GPAI_SYSTEMIC_OBLIGATIONS = [
    {"article": "Art. 55", "label": "GPAI with systemic risk: evaluation & incident reporting", "aegis": "partial"},
]


def classify(answers: Dict[str, str]) -> Dict[str, Any]:
    prohibited = answers.get("prohibited", "none") != "none"
    in_annex_iii = answers.get("domain", "none") != "none"
    procedural = answers.get("procedural") == "yes"
    interacts = answers.get("interacts") == "yes"
    gpai = answers.get("gpai") == "yes"
    systemic = answers.get("systemic") == "yes"

    # Art. 6(3): a system in an Annex III area is NOT high-risk when it only
    # performs a narrow procedural / preparatory task. The carve-out never lifts
    # an Article 5 prohibition.
    high_risk = in_annex_iii and not procedural
    carved_out = in_annex_iii and procedural

    if prohibited:
        tier = "prohibited"
        rationale = "The declared practice is banned under Article 5 and cannot be placed on the EU market."
        obligations = [
            {"article": "Art. 5", "label": "Prohibited practice — must not be deployed", "aegis": "no"}
        ]
    elif high_risk:
        tier = "high_risk"
        rationale = "Operating in an Annex III domain makes this a high-risk system, triggering the full Chapter III obligations."
        obligations = list(_HIGH_RISK_OBLIGATIONS)
        if interacts:
            obligations.append({"article": "Art. 50", "label": "Transparency (AI disclosure)", "aegis": "partial"})
    elif interacts:
        tier = "limited"
        if carved_out:
            rationale = ("In an Annex III domain but limited to a narrow procedural / preparatory task, "
                         "so the Article 6(3) exception applies and it is not high-risk. Article 50 "
                         "transparency still applies because it interacts with people or generates content.")
        else:
            rationale = "It interacts with people or generates content, so the Article 50 transparency obligations apply."
        obligations = [{"article": "Art. 50", "label": "Transparency (AI disclosure)", "aegis": "partial"}]
    else:
        tier = "minimal"
        if carved_out:
            rationale = ("In an Annex III domain but limited to a narrow procedural / preparatory task, "
                         "so the Article 6(3) exception applies: not high-risk, no mandatory obligations.")
        else:
            rationale = "No mandatory obligations under the Act; adherence to voluntary codes of conduct is encouraged."
        obligations = [{"article": "—", "label": "Voluntary codes of conduct", "aegis": "na"}]

    if gpai:
        obligations = obligations + list(_GPAI_BASE_OBLIGATIONS)
        if systemic:
            obligations = obligations + list(_GPAI_SYSTEMIC_OBLIGATIONS)

    covered = sum(1 for o in obligations if o["aegis"] == "yes")
    addressable = sum(1 for o in obligations if o["aegis"] in ("yes", "partial"))

    return {
        "tier": tier,
        "tier_label": TIER_LABELS[tier],
        "rationale": rationale,
        "gpai": gpai,
        "obligations": obligations,
        "aegis_covered": covered,
        "aegis_addressable": addressable,
        "obligations_total": len(obligations),
    }
