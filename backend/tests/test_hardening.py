"""Hardening tests for the production-ready AEGIS backend.

All tests run fully offline in mock mode (config.use_regolo() is False) with
nothing configured: sqlite audit, in-memory event bus, no auth. They drive the
FastAPI app through a TestClient and exercise the hardened capabilities:

  - tamper-evident audit hash chain (Art. 12 record integrity),
  - Prometheus-style /metrics endpoint,
  - OpenAI-compatible streaming on /v1/chat/completions,
  - the process-local event bus used for fan-out.

Auth is disabled by default (no AEGIS_API_KEYS), so /v1 is reachable without a
bearer token here.

The whole module runs against an isolated sqlite database in a temp directory
so the tests never depend on, or pollute, the developer's on-disk aegis.db.
"""

import pytest
from fastapi.testclient import TestClient

from aegis import main
from aegis.compliance import logger as clog


@pytest.fixture(scope="module", autouse=True)
def isolated_store(tmp_path_factory):
    """Point the global audit store at a throwaway sqlite db for this module.

    Both the logger singleton and the reference bound in main are swapped so the
    API endpoints write to the isolated store. The originals are restored after
    the module finishes.
    """
    db_path = tmp_path_factory.mktemp("audit") / "hardening.db"
    fresh = clog.SqliteStore(db_path=str(db_path))

    original_logger_store = clog.store
    original_main_store = main.store
    clog.store = fresh
    main.store = fresh
    try:
        yield fresh
    finally:
        clog.store = original_logger_store
        main.store = original_main_store


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


# ---- audit hash chain (Art. 12) -----------------------------------------

def test_hash_chain_verifies_after_writes(client, isolated_store):
    """A fresh store plus a couple of API-driven writes verifies clean."""
    isolated_store.clear()

    # Two guarded round-trips, each appending one or more chained events.
    for text in ("hello there", "what is the weather like today?"):
        resp = client.post("/api/chat", json={"text": text, "guard": True})
        assert resp.status_code == 200

    # The store must now hold events, and the chain must be intact.
    assert len(isolated_store.all()) > 0

    result = isolated_store.verify()
    assert result["ok"] is True
    assert result["broken_at"] is None


# ---- metrics ------------------------------------------------------------

def test_metrics_endpoint_exposes_request_counter(client):
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "aegis_requests_total" in resp.text


# ---- streaming (/v1, OpenAI-compatible) ---------------------------------

def test_chat_completions_streaming(client):
    payload = {
        "model": "x",
        "messages": [{"role": "user", "content": "hello"}],
        "stream": True,
    }
    with client.stream("POST", "/v1/chat/completions", json=payload) as resp:
        assert resp.status_code == 200
        body = "".join(resp.iter_text())

    # Server-Sent Events frames carry a "data:" prefix and the stream is closed
    # with the sentinel "[DONE]" chunk.
    assert "data:" in body
    assert "[DONE]" in body


# ---- event bus ----------------------------------------------------------

def test_event_bus_publish_and_subscribe_exist():
    from aegis.compliance import bus

    # The module exposes a process-local bus singleton (the same object main.py
    # binds as eventbus.bus) carrying the publish/subscribe fan-out interface.
    assert hasattr(bus, "bus")
    assert hasattr(bus.bus, "publish")
    assert hasattr(bus.bus, "subscribe")
    assert callable(bus.bus.publish)
    assert callable(bus.bus.subscribe)
