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

import hmac
import ipaddress
import socket
import threading
import time
from urllib.parse import urlparse

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


# ---- control plane (/api/*) admin guard ---------------------------------


async def admin_guard(request: Request) -> None:
    """FastAPI dependency: gate the /api/* control plane behind an admin key.

    With AEGIS_ADMIN_API_KEY unset the control plane is open (only safe on a
    trusted / cluster-internal network). When set, every guarded route requires a
    matching X-API-Key header, compared in constant time.
    """
    key = config.ADMIN_API_KEY
    if not key:
        return
    provided = request.headers.get("x-api-key", "").strip()
    if not provided or not hmac.compare_digest(provided, key):
        raise HTTPException(status_code=401, detail="invalid or missing admin API key")


# ---- upstream forwarding safety (SSRF + env-var exfiltration guards) -----


def is_allowed_key_env(name) -> bool:
    """True if `name` is an env var an endpoint may use for its upstream key.

    Restricting this to a closed allowlist stops a crafted endpoint from reading
    arbitrary process env vars (DATABASE_URL, AWS_SECRET_ACCESS_KEY, …) and
    exfiltrating them as a bearer token to an attacker-controlled upstream.
    """
    return bool(name) and isinstance(name, str) and name in config.UPSTREAM_KEY_ENVS


def _is_blocked_ip(addr) -> bool:
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def is_wellformed_upstream_url(url) -> bool:
    """Cheap, network-free check: an http(s) URL whose host is not a private IP.

    Used when storing an endpoint so an obviously unsafe target is rejected up
    front. The authoritative gate is is_safe_upstream_url, run before forwarding.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if config.ALLOW_PRIVATE_UPSTREAM:
        return True
    try:
        addr = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        return True  # a hostname — resolved and re-checked at request time
    return not _is_blocked_ip(addr)


def is_safe_upstream_url(url) -> bool:
    """Authoritative SSRF gate: resolve the host and block private targets.

    Run immediately before forwarding to an endpoint's upstream, so DNS rebinding
    and internal hostnames are caught at the moment of use.
    """
    if not is_wellformed_upstream_url(url):
        return False
    if config.ALLOW_PRIVATE_UPSTREAM:
        return True
    host = urlparse(url).hostname
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for info in infos:
        try:
            addr = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if _is_blocked_ip(addr):
            return False
    return True
