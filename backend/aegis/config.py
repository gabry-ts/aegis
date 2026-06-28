"""Runtime configuration loaded from the environment (.env supported).

Every production capability degrades gracefully: with nothing configured AEGIS
runs fully offline (mock model, sqlite audit, in-memory event bus, no auth).
Set DATABASE_URL / REDIS_URL / AEGIS_API_KEYS to switch on the hardened paths.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _flag(name: str, default: bool = False) -> bool:
    return str(os.getenv(name, str(default))).strip().lower() in ("1", "true", "yes", "on")


def _list(name: str, default: str = "") -> list:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# ---- model provider -----------------------------------------------------
MODE = os.getenv("AEGIS_MODE", "mock").strip().lower()
REGOLO_BASE_URL = os.getenv("REGOLO_BASE_URL", "https://api.regolo.ai/v1")
REGOLO_API_KEY = os.getenv("REGOLO_API_KEY", "").strip()
REGOLO_MODEL = os.getenv("REGOLO_MODEL", "llama-3.3-70b-instruct")

# ---- detection ----------------------------------------------------------
AEGIS_SECRET = os.getenv("AEGIS_SECRET", "AEGIS-FLAG-9F2A-7C3E")
BLOCK_THRESHOLD = int(os.getenv("BLOCK_THRESHOLD", "3"))
JUDGE_ENABLED = _flag("JUDGE_ENABLED", True)
# When the inspection pipeline errors, block instead of letting traffic through.
FAIL_CLOSED = _flag("AEGIS_FAIL_CLOSED", False)

# ---- persistence / eventing --------------------------------------------
DB_PATH = os.getenv("DB_PATH", "aegis.db")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()  # postgresql://...  (else sqlite)
REDIS_URL = os.getenv("REDIS_URL", "").strip()        # redis://...       (else in-memory)
SEED = _flag("AEGIS_SEED", True)
# Tamper-evident audit: hash-chain every event (Art. 12 record integrity).
AUDIT_HASH_CHAIN = _flag("AEGIS_AUDIT_HASH_CHAIN", True)
# Storage limitation (GDPR Art. 5(1)(e)): drop audit events older than this many
# days. 0 disables retention so the default behaviour is unchanged (opt-in).
AUDIT_RETENTION_DAYS = int(os.getenv("AEGIS_AUDIT_RETENTION_DAYS", "0"))

# ---- API security -------------------------------------------------------
API_KEYS = _list("AEGIS_API_KEYS")                    # bearer tokens accepted on /v1
AUTH_ENABLED = _flag("AEGIS_AUTH_ENABLED", bool(API_KEYS))
RATE_LIMIT_RPM = int(os.getenv("AEGIS_RATE_LIMIT_RPM", "0"))  # 0 disables
CORS_ORIGINS = _list("AEGIS_CORS_ORIGINS", "http://localhost:5173")

# Control plane (/api/*). When AEGIS_ADMIN_API_KEY is set, mutating admin routes
# require the X-API-Key header. Empty = open (only safe on a trusted network).
ADMIN_API_KEY = os.getenv("AEGIS_ADMIN_API_KEY", "").strip()

# ---- upstream forwarding safety ----------------------------------------
# An endpoint may only reference these env var NAMES for its upstream credential
# (stops exfiltrating arbitrary process env vars), and forwarding to private /
# loopback / metadata hosts is blocked unless explicitly allowed (SSRF guard).
UPSTREAM_KEY_ENVS = _list("AEGIS_UPSTREAM_KEY_ENVS", "OPENAI_API_KEY,REGOLO_API_KEY")
ALLOW_PRIVATE_UPSTREAM = _flag("AEGIS_ALLOW_PRIVATE_UPSTREAM", False)


def use_regolo() -> bool:
    """True when a real Regolo model should be called instead of the mock."""
    return MODE == "regolo" and bool(REGOLO_API_KEY)


def use_postgres() -> bool:
    return bool(DATABASE_URL)


def use_redis() -> bool:
    return bool(REDIS_URL)
