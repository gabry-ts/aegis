"""Unit tests for the Art. 50 transparency layer (marker + multilingual)."""

from aegis import transparency


def test_inject_marks_output_and_is_idempotent():
    once = transparency.inject("hello", "en")
    assert transparency.DISCLOSURES["en"] in once
    assert transparency.MARKER in once

    twice = transparency.inject(once, "en")
    assert twice == once
    assert twice.count(transparency.MARKER) == 1


def test_inject_uses_requested_language():
    out = transparency.inject("ciao", "it")
    assert transparency.DISCLOSURES["it"] in out
    assert transparency.MARKER in out
    # An already-disclosed text is not re-disclosed even in another language.
    assert transparency.inject(out, "de") == out


def test_resolve_lang_prefers_accept_language_then_falls_back():
    assert transparency.resolve_lang("it-IT,it;q=0.9,en;q=0.8") == "it"
    assert transparency.resolve_lang("xx-YY") in transparency.DISCLOSURES
    assert transparency.resolve_lang(None) in transparency.DISCLOSURES
