"""Tests for audit retention (storage limitation, GDPR Art. 5(1)(e)).

A throwaway SqliteStore on a temp path is used so the dev audit db is never
touched. Event timestamps are driven through a monkeypatched clock so the
"old" prefix is deterministic.
"""

from aegis import schemas
from aegis.compliance import logger as clog


def _det():
    return schemas.detection_result("input", "SAFE", 0, "ALLOWED", [], "hello world", "ok")


def test_prune_removes_old_prefix_and_chain_stays_valid(tmp_path, monkeypatch):
    store = clog.SqliteStore(str(tmp_path / "retention.db"))
    real_now = clog._utc_now

    # Three events fixed far in the past, then two at the real current time.
    monkeypatch.setattr(clog, "_utc_now", lambda: "2020-01-01T00:00:00.000000Z")
    for _ in range(3):
        store.add(clog.make_event(_det(), "seed"))
    monkeypatch.setattr(clog, "_utc_now", real_now)
    for _ in range(2):
        store.add(clog.make_event(_det(), "seed"))

    assert store.stats()["total"] == 5
    assert store.verify()["ok"] is True

    removed = store.prune(1)  # 1-day retention drops the 2020 prefix
    assert removed == 3
    assert store.stats()["total"] == 2
    # The retained window still verifies despite the deleted predecessor links:
    # this is exactly what the _verify_chain seeding fix guarantees.
    assert store.verify()["ok"] is True


def test_prune_zero_is_a_noop(tmp_path):
    store = clog.SqliteStore(str(tmp_path / "retention-off.db"))
    for _ in range(3):
        store.add(clog.make_event(_det(), "seed"))
    assert store.prune(0) == 0
    assert store.stats()["total"] == 3
