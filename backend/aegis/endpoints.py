"""Endpoint registry: named guardrail flows over the shared rule library.

Each endpoint is a flow reached at /v1/{slug}/chat/completions. It does not own
rules: the rule definitions stay in detection/rules.yaml (one shared library).
An endpoint only stores the set of rule ids that are *active* for it and whether
the LLM judge runs. The same rule can be active on one endpoint and off on
another — the toggle is per-endpoint membership, not a global flag.

Endpoints are declarative data persisted to endpoints.yaml, validated on every
save (slug shape + uniqueness + types) so a bad edit can never break routing.
If the file is missing or empty a sensible default set is used in memory.
"""

import os
import re
import sys
import threading

import yaml

from .detection import loader

_PATH = os.path.join(os.path.dirname(__file__), "endpoints.yaml")
_lock = threading.Lock()
_registry = {"version": 1, "endpoints": []}

# Slugs travel in URLs: lowercase letters, digits and single hyphens, 1..40 chars.
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


def _slugify(value):
    s = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return s[:40] or "endpoint"


def _all_rule_ids():
    return [r["id"] for r in loader.list_rules()]


def _defaults():
    """In-memory fallback when endpoints.yaml is absent: three example flows."""
    ids = _all_rule_ids()
    one = "prompt_injection" if "prompt_injection" in ids else (ids[0] if ids else "")
    minimal = [one] if one else []
    return [
        {
            "slug": "default",
            "name": "Default",
            "description": "Full rule library, no LLM judge.",
            "rules": list(ids),
            "judge": False,
        },
        {
            "slug": "strict",
            "name": "Strict",
            "description": "Full rule library plus the LLM judge.",
            "rules": list(ids),
            "judge": True,
        },
        {
            "slug": "minimal",
            "name": "Minimal",
            "description": "A single rule — lightweight prompt-injection screen.",
            "rules": minimal,
            "judge": False,
        },
    ]


def _norm_upstream(raw):
    """Normalize an upstream block to {base_url, model, api_key_env}.

    Only the env-var *name* is ever stored, never a raw secret. Non-string or
    empty fields are dropped; a missing/invalid block becomes {}.
    """
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key in ("base_url", "model", "api_key_env"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            out[key] = value.strip()
    return out


def _validate(data):
    """Validate a parsed registry; return (endpoints, error). None on error."""
    if not isinstance(data, dict) or not isinstance(data.get("endpoints"), list):
        return None, "registry must be a mapping with an 'endpoints' list"
    seen = set()
    out = []
    for i, raw in enumerate(data["endpoints"]):
        if not isinstance(raw, dict):
            return None, f"endpoint #{i + 1} is not a mapping"
        slug = raw.get("slug")
        if not slug or not isinstance(slug, str) or not _SLUG_RE.match(slug):
            return None, f"endpoint #{i + 1}: invalid slug (a-z, 0-9, hyphen; 1..40 chars)"
        if slug in seen:
            return None, f"duplicate endpoint slug '{slug}'"
        seen.add(slug)
        name = raw.get("name") or slug
        if not isinstance(name, str):
            return None, f"endpoint '{slug}': name must be a string"
        rules = raw.get("rules") or []
        if not isinstance(rules, list) or not all(isinstance(r, str) for r in rules):
            return None, f"endpoint '{slug}': rules must be a list of rule ids"
        out.append(
            {
                "slug": slug,
                "name": name,
                "description": str(raw.get("description") or ""),
                "rules": list(rules),
                "judge": bool(raw.get("judge", False)),
                "upstream": _norm_upstream(raw.get("upstream")),
            }
        )
    return out, None


def _write(endpoints):
    """Persist the registry verbatim (caller holds the lock)."""
    data = {"version": 1, "endpoints": endpoints}
    with open(_PATH, "w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)


def load():
    with _lock:
        try:
            with open(_PATH, encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except FileNotFoundError:
            data = {}
        if not data.get("endpoints"):
            _registry["version"] = 1
            _registry["endpoints"] = _defaults()
            return {"ok": True, "count": len(_registry["endpoints"]), "seeded": True}
        endpoints, err = _validate(data)
        if err:
            print(f"[aegis] endpoint registry invalid, keeping previous: {err}", file=sys.stderr)
            return {"ok": False, "error": err}
        _registry["version"] = data.get("version", 1)
        _registry["endpoints"] = endpoints
        return {"ok": True, "count": len(endpoints)}


def _public(ep):
    up = ep.get("upstream") or {}
    env = up.get("api_key_env")
    return {
        "slug": ep["slug"],
        "name": ep["name"],
        "description": ep.get("description", ""),
        "rules": list(ep.get("rules", [])),
        "rule_count": len(ep.get("rules", [])),
        "judge": bool(ep.get("judge", False)),
        "upstream": {
            "base_url": up.get("base_url"),
            "model": up.get("model"),
            "api_key_env": env,
            # Whether the referenced env var actually resolves to a value right
            # now — surfaced to the UI, never the secret itself.
            "key_present": bool(env and os.getenv(env)),
        },
    }


def list_endpoints():
    return [_public(e) for e in _registry["endpoints"]]


def get(slug):
    """The raw endpoint config for `slug`, or None. Used by the proxy router."""
    for ep in _registry["endpoints"]:
        if ep["slug"] == slug:
            return _public(ep)
    return None


def active_ids(slug):
    """Active rule ids for `slug` (a set), or None when the endpoint is unknown."""
    ep = get(slug)
    return set(ep["rules"]) if ep else None


def create(name, slug=None, description="", rules=None, judge=False, upstream=None):
    slug = (slug or _slugify(name)).strip().lower()
    if not _SLUG_RE.match(slug):
        return {"ok": False, "error": "invalid slug (a-z, 0-9, hyphen; 1..40 chars)"}
    with _lock:
        if any(e["slug"] == slug for e in _registry["endpoints"]):
            return {"ok": False, "error": f"slug '{slug}' already exists"}
        known = set(_all_rule_ids())
        ep = {
            "slug": slug,
            "name": str(name or slug),
            "description": str(description or ""),
            "rules": [r for r in (rules or []) if r in known],
            "judge": bool(judge),
            "upstream": _norm_upstream(upstream),
        }
        _registry["endpoints"].append(ep)
        _write(_registry["endpoints"])
    return {"ok": True, "endpoint": _public(ep)}


def update(slug, name=None, description=None, rules=None, judge=None, upstream=None):
    with _lock:
        for ep in _registry["endpoints"]:
            if ep["slug"] == slug:
                if name is not None:
                    ep["name"] = str(name)
                if description is not None:
                    ep["description"] = str(description)
                if rules is not None:
                    known = set(_all_rule_ids())
                    ep["rules"] = [r for r in rules if r in known]
                if judge is not None:
                    ep["judge"] = bool(judge)
                if upstream is not None:
                    ep["upstream"] = _norm_upstream(upstream)
                _write(_registry["endpoints"])
                return {"ok": True, "endpoint": _public(ep)}
    return {"ok": False, "error": "endpoint not found"}


def delete(slug):
    with _lock:
        before = len(_registry["endpoints"])
        _registry["endpoints"] = [e for e in _registry["endpoints"] if e["slug"] != slug]
        if len(_registry["endpoints"]) == before:
            return {"ok": False, "error": "endpoint not found"}
        _write(_registry["endpoints"])
    return {"ok": True, "slug": slug}


def toggle_rule(slug, rule_id):
    """Add or remove a rule from an endpoint's active set (per-endpoint toggle)."""
    if rule_id not in set(_all_rule_ids()):
        return {"ok": False, "error": "rule not found"}
    with _lock:
        for ep in _registry["endpoints"]:
            if ep["slug"] == slug:
                if rule_id in ep["rules"]:
                    ep["rules"] = [r for r in ep["rules"] if r != rule_id]
                    active = False
                else:
                    ep["rules"].append(rule_id)
                    active = True
                _write(_registry["endpoints"])
                return {"ok": True, "slug": slug, "rule_id": rule_id, "active": active}
    return {"ok": False, "error": "endpoint not found"}


def toggle_judge(slug):
    with _lock:
        for ep in _registry["endpoints"]:
            if ep["slug"] == slug:
                ep["judge"] = not ep.get("judge", False)
                _write(_registry["endpoints"])
                return {"ok": True, "slug": slug, "judge": ep["judge"]}
    return {"ok": False, "error": "endpoint not found"}


load()
