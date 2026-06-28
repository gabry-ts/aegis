"""Tests for the EU AI Act self-assessment classifier (aiact.classify)."""

from aegis import aiact


def _articles(result):
    return {o["article"] for o in result["obligations"]}


def test_annex_iii_domain_is_high_risk_by_default():
    r = aiact.classify({"domain": "employment", "procedural": "no", "interacts": "yes"})
    assert r["tier"] == "high_risk"


def test_procedural_task_triggers_article_6_3_carve_out():
    # Same domain, but a narrow procedural task is not high-risk (Art. 6(3)).
    r = aiact.classify({"domain": "employment", "procedural": "yes", "interacts": "yes"})
    assert r["tier"] == "limited"
    assert "6(3)" in r["rationale"]


def test_gpai_without_systemic_risk_has_no_article_55():
    r = aiact.classify({"gpai": "yes", "systemic": "no", "interacts": "yes"})
    arts = _articles(r)
    assert "Art. 53" in arts
    assert "Art. 55" not in arts


def test_gpai_with_systemic_risk_adds_article_55():
    r = aiact.classify({"gpai": "yes", "systemic": "yes", "interacts": "yes"})
    arts = _articles(r)
    assert "Art. 53" in arts
    assert "Art. 55" in arts


def test_prohibited_overrides_everything():
    r = aiact.classify({"prohibited": "social_scoring", "domain": "employment"})
    assert r["tier"] == "prohibited"
