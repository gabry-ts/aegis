"""Event store for the AEGIS compliance audit trail.

Every guardrail decision is recorded here as a JSON event with a handful of
indexed columns so the API can serve recent feeds, full audits, aggregate
statistics and AI Act coverage scoring without re-parsing every row.

Two interchangeable backends are provided behind one interface:

  - SqliteStore  : the default, fully offline store. Each call opens its own
                   short-lived connection and writes are serialized with a
                   process-wide lock, because FastAPI runs sync endpoints in a
                   worker threadpool and a single shared sqlite3 connection is
                   not safe across threads.
  - PostgresStore: used only when config.use_postgres() is set AND `psycopg`
                   imports and connects successfully. The import is guarded; on
                   ImportError or any connection failure a warning is printed to
                   stderr and the store falls back to SqliteStore.

Tamper-evidence: when config.AUDIT_HASH_CHAIN is on, every event is linked into
a sha256 hash chain (Art. 12 record integrity). `verify()` recomputes the chain
and reports the first id where the stored hash diverges from the recomputed one.
"""

import hashlib
import json
import sqlite3
import sys
import threading
from contextlib import closing
from datetime import datetime, timezone

from .. import config

_write_lock = threading.Lock()


def _utc_now() -> str:
    """Current UTC time as an ISO-8601 string ending in 'Z'."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def make_event(detection, actor):
    """Wrap a detection dict with the acting principal.

    The id and ts are assigned later by the store's add(), never here.
    """
    return {**detection, "actor": actor}


def _event_hash(event, prev_hash):
    """sha256 of the canonical event (sans 'hash') joined with prev_hash.

    The event is serialized with sorted keys and no whitespace so the digest is
    stable regardless of dict insertion order. The 'hash' key is excluded so the
    digest can be recomputed and compared against the stored value.
    """
    payload = {k: v for k, v in event.items() if k != "hash"}
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256((canonical + prev_hash).encode("utf-8")).hexdigest()


def _aggregate_stats(events):
    """Shared stats reducer used by both backends."""
    by_verdict = {}
    severity_hist = [0, 0, 0, 0, 0, 0]
    blocked = sanitized = allowed = transparency = 0

    for ev in events:
        verdict = ev.get("verdict")
        if verdict is not None:
            by_verdict[verdict] = by_verdict.get(verdict, 0) + 1

        sev = ev.get("severity", 0)
        try:
            sev = int(sev)
        except (TypeError, ValueError):
            sev = 0
        if 0 <= sev <= 5:
            severity_hist[sev] += 1

        action = ev.get("action")
        if action == "BLOCKED":
            blocked += 1
        elif action == "SANITIZED":
            sanitized += 1
        elif action == "ALLOWED":
            allowed += 1

        if action == "LOGGED" and ev.get("ai_act") == "Art.50":
            transparency += 1

    return {
        "total": len(events),
        "blocked": blocked,
        "sanitized": sanitized,
        "allowed": allowed,
        "by_verdict": by_verdict,
        "severity_hist": severity_hist,
        "transparency": transparency,
    }


def _verify_chain(events):
    """Recompute the hash chain over `events` (ascending by id).

    Returns {"ok", "broken_at", "count"}. `broken_at` is the id of the first
    event whose stored hash does not match the recomputed one, or None if the
    chain is intact (or hash-chaining was never applied).
    """
    prev_hash = ""
    for ev in events:
        expected = _event_hash(ev, prev_hash)
        stored = ev.get("hash")
        if stored is not None and stored != expected:
            return {"ok": False, "broken_at": ev.get("id"), "count": len(events)}
        # Continue the chain from the stored hash so a single corrupted row does
        # not cascade into reporting every later row as broken.
        prev_hash = stored if stored is not None else expected
    return {"ok": True, "broken_at": None, "count": len(events)}


class SqliteStore:
    """Persistent, append-only audit log backed by sqlite3."""

    def __init__(self, db_path=None):
        self.db_path = db_path or config.DB_PATH
        self._last_hash = ""
        self._init_schema()
        self._load_last_hash()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self):
        with _write_lock, closing(self._connect()) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS aegis_events (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts        TEXT NOT NULL,
                    verdict   TEXT,
                    action    TEXT,
                    ai_act    TEXT,
                    prev_hash TEXT,
                    hash      TEXT,
                    data      TEXT NOT NULL
                )
                """
            )
            # Migrate older tables that predate the hash-chain columns.
            existing = {row[1] for row in conn.execute("PRAGMA table_info(aegis_events)").fetchall()}
            for column in ("prev_hash", "hash"):
                if column not in existing:
                    conn.execute(f"ALTER TABLE aegis_events ADD COLUMN {column} TEXT")
            conn.commit()

    def _load_last_hash(self):
        """Seed the chain head from the most recent persisted hash, if any."""
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "SELECT hash FROM aegis_events WHERE hash IS NOT NULL "
                "ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
        self._last_hash = (row["hash"] if row and row["hash"] else "")

    def add(self, event):
        """Persist an event, assigning id and ts; return the stored event."""
        stored = dict(event)
        stored["ts"] = _utc_now()

        with _write_lock, closing(self._connect()) as conn:
            cur = conn.execute(
                "INSERT INTO aegis_events (ts, verdict, action, ai_act, data) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    stored["ts"],
                    stored.get("verdict"),
                    stored.get("action"),
                    stored.get("ai_act"),
                    "{}",
                ),
            )
            stored["id"] = cur.lastrowid

            if config.AUDIT_HASH_CHAIN:
                prev_hash = self._last_hash
                stored["prev_hash"] = prev_hash
                stored["hash"] = _event_hash(stored, prev_hash)
                self._last_hash = stored["hash"]

            conn.execute(
                "UPDATE aegis_events SET prev_hash = ?, hash = ?, data = ? "
                "WHERE id = ?",
                (
                    stored.get("prev_hash"),
                    stored.get("hash"),
                    json.dumps(stored, ensure_ascii=False),
                    stored["id"],
                ),
            )
            conn.commit()

        return stored

    def _row_to_event(self, row):
        event = json.loads(row["data"])
        event["id"] = row["id"]
        event["ts"] = row["ts"]
        if row["prev_hash"] is not None:
            event["prev_hash"] = row["prev_hash"]
        if row["hash"] is not None:
            event["hash"] = row["hash"]
        return event

    def recent(self, limit=100, since=0):
        """Events with id > since, ascending by id, capped to the last `limit`."""
        with closing(self._connect()) as conn:
            cur = conn.execute(
                "SELECT * FROM aegis_events WHERE id > ? ORDER BY id ASC",
                (since,),
            )
            events = [self._row_to_event(r) for r in cur.fetchall()]
        if limit is not None and len(events) > limit:
            events = events[-limit:]
        return events

    def all(self):
        """Every event, ascending by id."""
        with closing(self._connect()) as conn:
            cur = conn.execute("SELECT * FROM aegis_events ORDER BY id ASC")
            return [self._row_to_event(r) for r in cur.fetchall()]

    def stats(self):
        """Aggregate counters over the whole store."""
        return _aggregate_stats(self.all())

    def verify(self):
        """Recompute the hash chain and report the first divergence, if any."""
        return _verify_chain(self.all())

    def clear(self):
        """Remove every event from the store and reset the chain head."""
        with _write_lock, closing(self._connect()) as conn:
            conn.execute("DELETE FROM aegis_events")
            conn.commit()
        self._last_hash = ""


class PostgresStore:
    """Audit log backed by PostgreSQL via psycopg.

    Mirrors SqliteStore's table and interface exactly. Writes are serialized
    with the same process-wide lock and each call uses its own connection.
    """

    def __init__(self, dsn=None):
        import psycopg  # guarded by make_store(); raises if unavailable

        self._psycopg = psycopg
        self.dsn = dsn or config.DATABASE_URL
        self._last_hash = ""
        # A throwaway connection here validates the DSN so make_store() can fall
        # back to sqlite on failure before this store is ever installed.
        self._init_schema()
        self._load_last_hash()

    def _connect(self):
        return self._psycopg.connect(self.dsn)

    def _init_schema(self):
        with _write_lock, closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS aegis_events (
                        id        SERIAL PRIMARY KEY,
                        ts        TEXT NOT NULL,
                        verdict   TEXT,
                        action    TEXT,
                        ai_act    TEXT,
                        prev_hash TEXT,
                        hash      TEXT,
                        data      JSONB NOT NULL
                    )
                    """
                )
            conn.commit()

    def _load_last_hash(self):
        with closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT hash FROM aegis_events WHERE hash IS NOT NULL "
                    "ORDER BY id DESC LIMIT 1"
                )
                row = cur.fetchone()
        self._last_hash = (row[0] if row and row[0] else "")

    def add(self, event):
        """Persist an event, assigning id and ts; return the stored event."""
        stored = dict(event)
        stored["ts"] = _utc_now()

        with _write_lock, closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO aegis_events (ts, verdict, action, ai_act, data) "
                    "VALUES (%s, %s, %s, %s, %s::jsonb) RETURNING id",
                    (
                        stored["ts"],
                        stored.get("verdict"),
                        stored.get("action"),
                        stored.get("ai_act"),
                        "{}",
                    ),
                )
                stored["id"] = cur.fetchone()[0]

                if config.AUDIT_HASH_CHAIN:
                    prev_hash = self._last_hash
                    stored["prev_hash"] = prev_hash
                    stored["hash"] = _event_hash(stored, prev_hash)
                    self._last_hash = stored["hash"]

                cur.execute(
                    "UPDATE aegis_events SET prev_hash = %s, hash = %s, "
                    "data = %s::jsonb WHERE id = %s",
                    (
                        stored.get("prev_hash"),
                        stored.get("hash"),
                        json.dumps(stored, ensure_ascii=False),
                        stored["id"],
                    ),
                )
            conn.commit()

        return stored

    def _row_to_event(self, row):
        # row = (id, ts, prev_hash, hash, data)
        data = row[4]
        event = data if isinstance(data, dict) else json.loads(data)
        event = dict(event)
        event["id"] = row[0]
        event["ts"] = row[1]
        if row[2] is not None:
            event["prev_hash"] = row[2]
        if row[3] is not None:
            event["hash"] = row[3]
        return event

    def recent(self, limit=100, since=0):
        with closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, ts, prev_hash, hash, data FROM aegis_events "
                    "WHERE id > %s ORDER BY id ASC",
                    (since,),
                )
                events = [self._row_to_event(r) for r in cur.fetchall()]
        if limit is not None and len(events) > limit:
            events = events[-limit:]
        return events

    def all(self):
        with closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, ts, prev_hash, hash, data FROM aegis_events "
                    "ORDER BY id ASC"
                )
                return [self._row_to_event(r) for r in cur.fetchall()]

    def stats(self):
        return _aggregate_stats(self.all())

    def verify(self):
        return _verify_chain(self.all())

    def clear(self):
        with _write_lock, closing(self._connect()) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM aegis_events")
            conn.commit()
        self._last_hash = ""


def make_store():
    """Build the configured backend, degrading gracefully to sqlite.

    Postgres is used only when config.use_postgres() is set and psycopg imports
    and connects. Any ImportError or connection failure prints a warning to
    stderr and falls back to the offline sqlite store.
    """
    if config.use_postgres():
        try:
            return PostgresStore()
        except Exception as exc:  # ImportError, connection/auth errors, etc.
            print(
                f"[aegis] Postgres audit store unavailable ({exc!r}); "
                "falling back to sqlite.",
                file=sys.stderr,
            )
    return SqliteStore()


# Backwards-compatible alias: older references expect an `EventStore` symbol.
EventStore = SqliteStore

store = make_store()
