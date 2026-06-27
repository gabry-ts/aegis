"""Tiny thread-safe Prometheus-style counter registry.

FastAPI runs sync endpoints in a worker threadpool, so every mutation and read
of the counter map is guarded by a single lock. Counters are created on first
use; a fixed set is pre-registered at 0 so the exposition output is stable even
before any traffic is served.

Stdlib only (threading) — no external dependency, works fully offline.
"""

import threading

_LOCK = threading.Lock()

# Pre-registered counters so they always render, even at zero traffic.
_COUNTERS = {
    "aegis_requests_total": 0,
    "aegis_blocked_total": 0,
    "aegis_sanitized_total": 0,
    "aegis_allowed_total": 0,
    "aegis_errors_total": 0,
}


def inc(name: str, n: int = 1) -> None:
    """Increment a counter by `n`, creating it on first use."""
    with _LOCK:
        _COUNTERS[name] = _COUNTERS.get(name, 0) + int(n)


def get(name: str) -> int:
    """Return the current value of a counter (0 if it does not exist)."""
    with _LOCK:
        return _COUNTERS.get(name, 0)


def render() -> str:
    """Render all counters in the Prometheus text exposition format."""
    with _LOCK:
        items = list(_COUNTERS.items())
    lines = []
    for name, value in items:
        lines.append(f"# TYPE {name} counter")
        lines.append(f"{name} {value}")
    return "\n".join(lines) + "\n"
