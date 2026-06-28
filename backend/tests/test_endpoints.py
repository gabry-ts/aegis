"""Tests for the per-endpoint registry, including upstream targets.

These run fully offline. The registry path is pointed at a throwaway file so
the tests never touch the committed endpoints.yaml, and the upstream secret is
only ever referenced by env-var name — never stored as a raw value.
"""

import pytest

from aegis import endpoints


@pytest.fixture(autouse=True)
def isolated_registry(tmp_path, monkeypatch):
    """Persist registry writes to a temp file for the duration of a test."""
    monkeypatch.setattr(endpoints, "_PATH", str(tmp_path / "endpoints.yaml"))
    yield


def test_seeded_endpoints_have_empty_upstream():
    ep = endpoints.get("default")
    assert ep is not None
    assert ep["upstream"]["base_url"] is None
    assert ep["upstream"]["key_present"] is False


def test_create_with_upstream_persists_and_tracks_key(monkeypatch):
    from aegis import config

    # An admin allows the custom credential env var name (closed allowlist).
    monkeypatch.setattr(config, "UPSTREAM_KEY_ENVS", ["AEGIS_TEST_UPSTREAM_KEY"])
    monkeypatch.setenv("AEGIS_TEST_UPSTREAM_KEY", "sk-not-a-real-key")
    r = endpoints.create(
        name="Up Test",
        slug="up-test",
        upstream={
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o",
            "api_key_env": "AEGIS_TEST_UPSTREAM_KEY",
        },
    )
    assert r["ok"], r
    try:
        ep = endpoints.get("up-test")
        assert ep["upstream"]["base_url"] == "https://api.openai.com/v1"
        assert ep["upstream"]["model"] == "gpt-4o"
        assert ep["upstream"]["api_key_env"] == "AEGIS_TEST_UPSTREAM_KEY"
        assert ep["upstream"]["key_present"] is True

        # When the referenced env var is gone, key_present flips to False.
        monkeypatch.delenv("AEGIS_TEST_UPSTREAM_KEY")
        assert endpoints.get("up-test")["upstream"]["key_present"] is False
    finally:
        endpoints.delete("up-test")


def test_upstream_rejects_unsafe_values(monkeypatch):
    """An endpoint cannot reference an env var outside the allowlist (no env-var
    exfiltration) and cannot target a private/metadata host (SSRF guard)."""
    from aegis import config

    monkeypatch.setattr(config, "UPSTREAM_KEY_ENVS", ["OPENAI_API_KEY"])
    monkeypatch.setattr(config, "ALLOW_PRIVATE_UPSTREAM", False)
    endpoints.create(
        name="Bad Up",
        slug="bad-up",
        upstream={
            "base_url": "http://169.254.169.254/latest/meta-data",
            "api_key_env": "DATABASE_URL",
        },
    )
    try:
        up = endpoints.get("bad-up")["upstream"]
        assert up.get("api_key_env") is None
        assert up["base_url"] is None
    finally:
        endpoints.delete("bad-up")


def test_update_can_clear_upstream():
    endpoints.create(name="Clear Me", slug="clear-me", upstream={"base_url": "https://x"})
    try:
        assert endpoints.get("clear-me")["upstream"]["base_url"] == "https://x"
        endpoints.update("clear-me", upstream={})
        assert endpoints.get("clear-me")["upstream"]["base_url"] is None
    finally:
        endpoints.delete("clear-me")
