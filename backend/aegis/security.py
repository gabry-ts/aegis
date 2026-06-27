"""API security for the /v1 data plane: bearer auth + per-principal rate limit.

The `guard` FastAPI dependency authenticates the caller and enforces an
in-memory token-bucket rate limit. Both degrade gracefully: with no API keys
configured and AUTH_ENABLED off, every caller is admitted as their client IP,
and with RATE_LIMIT_RPM at 0 the limiter is a no-op.

NOTE: the token bucket lives in this process only. Each AEGIS instance keeps an
independent bucket per principal, so behind a load balancer the effective limit
scales with the number of instances. A shared limiter (e.g. Redis) is required
to enforce a single global rate limit across a multi-instance deployment.
"""

import threading
import time

from fastapi import HTTPException, Request

from . import config

# Per-principal token buckets, guarded by a single process-wide lock.
# Each entry maps principal -> {"tokens": float, "updated": monotonic_seconds}.
_buckets = {}
_bucket_lock = threading.Lock()


def _principal(request: Request) -> str:
    """Resolve the calling principal, enforcing bearer auth when enabled."""
    if config.AUTH_ENABLED:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token or token not in config.API_KEYS:
            raise HTTPException(status_code=401, detail="invalid or missing API key")
        return token

    client = request.client
    return client.host if client and client.host else "anonymous"


def _check_rate_limit(principal: str) -> None:
    """Consume one token for `principal`; raise 429 when the bucket is empty."""
    rpm = config.RATE_LIMIT_RPM
    if rpm <= 0:
        return

    capacity = float(rpm)
    refill_per_second = capacity / 60.0
    now = time.monotonic()

    with _bucket_lock:
        bucket = _buckets.get(principal)
        if bucket is None:
            # New principals start with a full bucket.
            bucket = {"tokens": capacity, "updated": now}
            _buckets[principal] = bucket

        elapsed = now - bucket["updated"]
        if elapsed > 0:
            bucket["tokens"] = min(capacity, bucket["tokens"] + elapsed * refill_per_second)
            bucket["updated"] = now

        if bucket["tokens"] < 1.0:
            raise HTTPException(status_code=429, detail="rate limit exceeded")

        bucket["tokens"] -= 1.0


async def guard(request: Request) -> str:
    """FastAPI dependency: authenticate, rate-limit, and return the principal."""
    principal = _principal(request)
    _check_rate_limit(principal)
    return principal
