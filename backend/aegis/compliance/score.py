"""EU AI Act coverage scoring derived from the audit trail.

Coverage is demonstrated, not asserted: each tracked article is "covered" only
when the store actually holds evidence that the corresponding control fired.
"""

from .. import schemas


def compute(store):
    """Return AI Act coverage over the three tracked articles."""
    events = store.all()

    robustness = 0
    record_keeping = len(events)
    transparency = 0

    for ev in events:
        action = ev.get("action")
        verdict = ev.get("verdict")
        if action in ("BLOCKED", "SANITIZED") or verdict != schemas.Verdict.SAFE.value:
            robustness += 1
        if ev.get("ai_act") == "Art.50":
            transparency += 1

    evidence_by_id = {
        "Art.15(5)": robustness,
        "Art.12": record_keeping,
        "Art.50": transparency,
    }

    articles = []
    covered_count = 0
    for art in schemas.ARTICLES:
        evidence = evidence_by_id.get(art["id"], 0)
        covered = evidence > 0
        if covered:
            covered_count += 1
        articles.append(
            {
                "id": art["id"],
                "label": art["label"],
                "covered": covered,
                "evidence": evidence,
            }
        )

    return {
        "score": f"{covered_count}/3",
        "percent": round(100 * covered_count / 3),
        "articles": articles,
    }
