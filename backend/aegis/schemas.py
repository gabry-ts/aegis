"""Canonical data shapes shared across the whole backend.

This module is the single source of truth for:
  - the verdict / action / category vocabulary,
  - the verdict -> EU AI Act article mapping,
  - the `detection result` dict produced by `detection.engine.inspect`,
  - the request models exposed by the API.

Every other backend module is expected to build detection results through
`detection_result(...)` and transparency events through `transparency_event(...)`
so that the JSON shape stays identical everywhere (API, store, frontend).
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class Verdict(str, Enum):
    SAFE = "SAFE"
    PROMPT_INJECTION = "PROMPT_INJECTION"
    JAILBREAK = "JAILBREAK"
    DATA_EXFILTRATION = "DATA_EXFILTRATION"
    PII_LEAK = "PII_LEAK"
    SECRET_LEAK = "SECRET_LEAK"


class Action(str, Enum):
    ALLOWED = "ALLOWED"
    BLOCKED = "BLOCKED"
    SANITIZED = "SANITIZED"
    LOGGED = "LOGGED"


class Category(str, Enum):
    SAFE = "safe"
    MODEL_EVASION = "model_evasion"
    CONFIDENTIALITY = "confidentiality_attack"
    TRANSPARENCY = "transparency"


# Verdict -> EU AI Act mapping. Injection/jailbreak are adversarial "model
# evasion"; leaks are "confidentiality attacks". Both live under Art. 15(5).
AI_ACT: Dict[str, Dict[str, str]] = {
    "SAFE": {"article": "", "label": "", "category": Category.SAFE.value},
    "PROMPT_INJECTION": {"article": "Art.15(5)", "label": "model evasion", "category": Category.MODEL_EVASION.value},
    "JAILBREAK": {"article": "Art.15(5)", "label": "model evasion", "category": Category.MODEL_EVASION.value},
    "DATA_EXFILTRATION": {"article": "Art.15(5)", "label": "confidentiality attack", "category": Category.CONFIDENTIALITY.value},
    "PII_LEAK": {"article": "Art.15(5)", "label": "confidentiality attack", "category": Category.CONFIDENTIALITY.value},
    "SECRET_LEAK": {"article": "Art.15(5)", "label": "confidentiality attack", "category": Category.CONFIDENTIALITY.value},
}

# The three AI Act requirements AEGIS demonstrates coverage for.
ARTICLES: List[Dict[str, str]] = [
    {"id": "Art.15(5)", "label": "Accuracy, Robustness & Cybersecurity"},
    {"id": "Art.12", "label": "Record-keeping / Logging"},
    {"id": "Art.50", "label": "Transparency"},
]

# Verdict -> industry threat-framework mapping (OWASP LLM Top 10 2025 + MITRE ATLAS).
FRAMEWORKS: Dict[str, Dict[str, str]] = {
    "PROMPT_INJECTION": {"owasp_id": "LLM01:2025", "owasp": "Prompt Injection", "atlas_id": "AML.T0051", "atlas": "LLM Prompt Injection"},
    "JAILBREAK": {"owasp_id": "LLM01:2025", "owasp": "Prompt Injection", "atlas_id": "AML.T0054", "atlas": "LLM Jailbreak"},
    "DATA_EXFILTRATION": {"owasp_id": "LLM02:2025", "owasp": "Sensitive Information Disclosure", "atlas_id": "AML.T0057", "atlas": "LLM Data Leakage"},
    "PII_LEAK": {"owasp_id": "LLM02:2025", "owasp": "Sensitive Information Disclosure", "atlas_id": "AML.T0057", "atlas": "LLM Data Leakage"},
    "SECRET_LEAK": {"owasp_id": "LLM07:2025", "owasp": "System Prompt Leakage", "atlas_id": "AML.T0056", "atlas": "LLM Meta Prompt Extraction"},
    "SAFE": {"owasp_id": "", "owasp": "", "atlas_id": "", "atlas": ""},
}


def frameworks_for(verdict: str) -> Dict[str, str]:
    return FRAMEWORKS.get(verdict, FRAMEWORKS["SAFE"])


# The full OWASP LLM Top 10 (2025) with what AEGIS, a runtime I/O proxy, addresses.
OWASP_TOP10: List[Dict[str, Any]] = [
    {"id": "LLM01:2025", "name": "Prompt Injection", "atlas": ["AML.T0051", "AML.T0054"], "covered": True},
    {"id": "LLM02:2025", "name": "Sensitive Information Disclosure", "atlas": ["AML.T0057"], "covered": True},
    {"id": "LLM03:2025", "name": "Supply Chain", "atlas": [], "covered": False},
    {"id": "LLM04:2025", "name": "Data and Model Poisoning", "atlas": [], "covered": False},
    {"id": "LLM05:2025", "name": "Improper Output Handling", "atlas": [], "covered": False},
    {"id": "LLM06:2025", "name": "Excessive Agency", "atlas": [], "covered": False},
    {"id": "LLM07:2025", "name": "System Prompt Leakage", "atlas": ["AML.T0056"], "covered": True},
    {"id": "LLM08:2025", "name": "Vector and Embedding Weaknesses", "atlas": [], "covered": False},
    {"id": "LLM09:2025", "name": "Misinformation", "atlas": [], "covered": False},
    {"id": "LLM10:2025", "name": "Unbounded Consumption", "atlas": [], "covered": False},
]


def detection_result(
    direction: str,
    verdict: str,
    severity: int,
    action: str,
    matched: List[str],
    text: str,
    explanation: str,
    judge_used: bool = False,
    ai_act: Optional[str] = None,
    owasp_id: Optional[str] = None,
    atlas_id: Optional[str] = None,
    rule_id: Optional[str] = None,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the canonical detection-result dict used everywhere.

    When a rule supplies its own framework mapping (ai_act / owasp / atlas) it is
    used directly; otherwise the value is derived from the verdict so legacy
    verdicts keep working. This lets the rule pack introduce brand-new verdicts.
    """
    meta = AI_ACT.get(verdict, AI_ACT["SAFE"])
    fw = FRAMEWORKS.get(verdict, FRAMEWORKS["SAFE"])
    if category is not None:
        cat = category
    elif verdict in AI_ACT:
        cat = meta["category"]
    elif verdict == "SAFE":
        cat = Category.SAFE.value
    else:
        cat = Category.MODEL_EVASION.value
    return {
        "direction": direction,
        "verdict": verdict,
        "severity": int(severity),
        "category": cat,
        "ai_act": ai_act if ai_act is not None else (meta["article"] or None),
        "ai_act_label": meta["label"],
        "owasp_id": owasp_id if owasp_id is not None else (fw["owasp_id"] or None),
        "atlas_id": atlas_id if atlas_id is not None else (fw["atlas_id"] or None),
        "action": action,
        "matched": list(matched),
        "excerpt": (text or "")[:160],
        "explanation": explanation,
        "judge_used": judge_used,
        "rule_id": rule_id,
    }


def transparency_event(text: str) -> Dict[str, Any]:
    """A detection-shaped record marking an Art. 50 AI-disclosure injection."""
    return {
        "direction": "output",
        "verdict": Verdict.SAFE.value,
        "severity": 0,
        "category": Category.TRANSPARENCY.value,
        "ai_act": "Art.50",
        "ai_act_label": "transparency disclosure",
        "action": Action.LOGGED.value,
        "matched": ["ai_disclosure"],
        "excerpt": (text or "")[:160],
        "explanation": "AI-generated content disclosure injected (Art. 50).",
        "judge_used": False,
    }


# ---- API request models -------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    stream: bool = False


class PlaygroundRequest(BaseModel):
    text: str
    guard: bool = True


class InspectRequest(BaseModel):
    text: str
    direction: str = "input"


class AssessRequest(BaseModel):
    answers: Dict[str, str]


class RawRules(BaseModel):
    text: str
