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

# ---- API security -------------------------------------------------------
API_KEYS = _list("AEGIS_API_KEYS")                    # bearer tokens accepted on /v1
AUTH_ENABLED = _flag("AEGIS_AUTH_ENABLED", bool(API_KEYS))
RATE_LIMIT_RPM = int(os.getenv("AEGIS_RATE_LIMIT_RPM", "0"))  # 0 disables
CORS_ORIGINS = _list("AEGIS_CORS_ORIGINS", "*")       # ["*"] by default


def use_regolo() -> bool:
    """True when a real Regolo model should be called instead of the mock."""
    return MODE == "regolo" and bool(REGOLO_API_KEY)


def use_postgres() -> bool:
    return bool(DATABASE_URL)


def use_redis() -> bool:
    return bool(REDIS_URL)
