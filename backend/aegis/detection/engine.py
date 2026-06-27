"""Detection engine: turns text into a verdict using the declarative rule pack.

`inspect(text, direction)` runs every enabled rule for that surface (loaded from
rules.yaml), takes the worst match, and falls back to the optional LLM judge for
subtle inputs. The result is always built through `schemas.detection_result(...)`
so the JSON shape never drifts and carries the rule's OWASP / ATLAS / AI Act
mapping.

`sanitize(text)` produces the redacted version of model output.
"""

from typing import Dict

from .. import config, schemas
from . import loader, pii, judge


def inspect(text: str, direction: str = "input", active_ids=None, judge_enabled=None) -> Dict:
    """Inspect `text` against an endpoint's active rules and return the canonical dict.

    `active_ids` is the set of armed rule ids for the calling endpoint (None means
    the whole library). `judge_enabled` is the endpoint's judge flag; None falls
    back to the global runtime switch so endpoint-agnostic callers keep working.
    """
    hit = loader.worst(text, direction, active_ids)
    if hit:
        mapping = hit.get("mapping", {})
        return schemas.detection_result(
            direction=direction,
            verdict=hit["verdict"],
            severity=hit["severity"],
            action=loader.action_for(hit["action"]),
            matched=[hit["id"]],
            text=text,
            explanation=f"Matched rule '{hit['name']}'.",
            rule_id=hit["id"],
            ai_act=mapping.get("ai_act"),
            owasp_id=mapping.get("owasp"),
            atlas_id=mapping.get("atlas"),
        )

    use_judge = judge.is_enabled() if judge_enabled is None else bool(judge_enabled)
    if direction == "input" and use_judge and judge.provider_available():
        verdict_data = judge.classify(text)
        if verdict_data.get("verdict", "SAFE") != schemas.Verdict.SAFE.value:
            severity = int(verdict_data.get("severity", 3))
            action = (
                schemas.Action.BLOCKED.value
                if severity >= config.BLOCK_THRESHOLD
                else schemas.Action.LOGGED.value
            )
            return schemas.detection_result(
                direction=direction,
                verdict=verdict_data["verdict"],
                severity=severity,
                action=action,
                matched=["llm_judge"],
                text=text,
                explanation=verdict_data.get("reason") or "Flagged by the LLM judge.",
                judge_used=True,
                rule_id="llm_judge",
            )

    explanation = (
        "No rule matched the input." if direction == "input" else "No sensitive data in output."
    )
    return schemas.detection_result(
        direction=direction,
        verdict=schemas.Verdict.SAFE.value,
        severity=0,
        action=schemas.Action.ALLOWED.value,
        matched=[],
        text=text,
        explanation=explanation,
    )


def sanitize(text: str) -> str:
    """Return the redacted version of `text` (secret + PII removed)."""
    return pii.redact(text, config.AEGIS_SECRET)
