"""Declarative detection rule pack: load, validate, persist and run.

The engine no longer hardcodes detections. Rules live in rules.yaml and are
loaded here. A new threat class is a new rule (data, not code). Saving is
validated first (parse + schema + regex compile with length guards) so a bad
edit from the UI can never crash the running engine.
"""

import os
import re
import sys
import threading

import yaml

from .. import config
from . import pii

_PATH = os.path.join(os.path.dirname(__file__), "rules.yaml")
_lock = threading.Lock()
_pack = {"version": 1, "rules": []}  # active rules, each with compiled "_compiled"

_VALID_SURFACE = {"input", "output"}
_VALID_ACTION = {"block", "sanitize", "flag"}
_VALID_DETECTOR = {"regex", "keyword", "secret", "pii"}
_MAX_PATTERN = 500
_ACTION_MAP = {"block": "BLOCKED", "sanitize": "SANITIZED", "flag": "LOGGED"}


def _validate_and_compile(data):
    """Validate a parsed pack; return (rules, error). rules is None on error."""
    if not isinstance(data, dict) or not isinstance(data.get("rules"), list):
        return None, "pack must be a mapping with a 'rules' list"
    seen = set()
    out = []
    for i, raw in enumerate(data["rules"]):
        if not isinstance(raw, dict):
            return None, f"rule #{i + 1} is not a mapping"
        rid = raw.get("id")
        if not rid or not isinstance(rid, str):
            return None, f"rule #{i + 1} is missing a string 'id'"
        if rid in seen:
            return None, f"duplicate rule id '{rid}'"
        seen.add(rid)
        if raw.get("detector") not in _VALID_DETECTOR:
            return None, f"rule '{rid}': detector must be one of {sorted(_VALID_DETECTOR)}"
        if raw.get("surface") not in _VALID_SURFACE:
            return None, f"rule '{rid}': surface must be 'input' or 'output'"
        if raw.get("action") not in _VALID_ACTION:
            return None, f"rule '{rid}': action must be block|sanitize|flag"
        if not raw.get("verdict") or not isinstance(raw.get("verdict"), str):
            return None, f"rule '{rid}': missing a string 'verdict'"
        try:
            sev = int(raw.get("severity", 1))
        except (TypeError, ValueError):
            return None, f"rule '{rid}': severity must be an integer"
        if not 1 <= sev <= 5:
            return None, f"rule '{rid}': severity must be 1..5"

        compiled = []
        det = raw["detector"]
        if det == "regex":
            patterns = raw.get("patterns") or []
            if not isinstance(patterns, list) or not patterns:
                return None, f"rule '{rid}': regex detector needs a non-empty 'patterns' list"
            for pat in patterns:
                if not isinstance(pat, str) or len(pat) > _MAX_PATTERN:
                    return None, f"rule '{rid}': a pattern is not a string or exceeds {_MAX_PATTERN} chars"
                try:
                    compiled.append(re.compile(pat))
                except re.error as exc:
                    return None, f"rule '{rid}': invalid regex ({exc})"
        elif det == "keyword":
            keywords = raw.get("keywords") or []
            if not isinstance(keywords, list) or not keywords:
                return None, f"rule '{rid}': keyword detector needs a non-empty 'keywords' list"

        rule = dict(raw)
        rule["severity"] = sev
        rule["enabled"] = bool(raw.get("enabled", True))
        rule["mapping"] = raw.get("mapping") or {}
        rule["_compiled"] = compiled
        out.append(rule)
    return out, None


def load():
    with _lock:
        try:
            with open(_PATH, encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except FileNotFoundError:
            data = {"version": 1, "rules": []}
        rules, err = _validate_and_compile(data)
        if err:
            print(f"[aegis] rule pack invalid, keeping previous: {err}", file=sys.stderr)
            return {"ok": False, "error": err}
        _pack["version"] = data.get("version", 1)
        _pack["rules"] = rules
        return {"ok": True, "count": len(rules)}


def raw_yaml():
    try:
        with open(_PATH, encoding="utf-8") as fh:
            return fh.read()
    except FileNotFoundError:
        return ""


def save_raw(text):
    """Validate raw YAML; only on success write it verbatim and reload."""
    try:
        data = yaml.safe_load(text) or {}
    except yaml.YAMLError as exc:
        return {"ok": False, "error": f"YAML parse error: {exc}"}
    rules, err = _validate_and_compile(data)
    if err:
        return {"ok": False, "error": err}
    with _lock:
        with open(_PATH, "w", encoding="utf-8") as fh:
            fh.write(text)
    load()
    return {"ok": True, "count": len(rules)}


def _public(rule):
    return {
        "id": rule["id"],
        "name": rule.get("name", rule["id"]),
        "verdict": rule["verdict"],
        "severity": rule["severity"],
        "surface": rule["surface"],
        "action": rule["action"],
        "detector": rule["detector"],
        "enabled": rule["enabled"],
        "mapping": rule.get("mapping", {}),
        "patterns": rule.get("patterns", []),
        "keywords": rule.get("keywords", []),
    }


def list_rules():
    return [_public(r) for r in _pack["rules"]]


def toggle(rule_id):
    with _lock:
        try:
            with open(_PATH, encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
        except FileNotFoundError:
            return {"ok": False, "error": "no rule pack"}
        enabled = None
        for raw in data.get("rules", []):
            if raw.get("id") == rule_id:
                enabled = not bool(raw.get("enabled", True))
                raw["enabled"] = enabled
                break
        if enabled is None:
            return {"ok": False, "error": "rule not found"}
        with open(_PATH, "w", encoding="utf-8") as fh:
            yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)
    load()
    return {"ok": True, "id": rule_id, "enabled": enabled}


def _detect(rule, text):
    det = rule["detector"]
    if det == "regex":
        return any(p.search(text) for p in rule["_compiled"])
    if det == "keyword":
        low = text.lower()
        return any(str(k).lower() in low for k in rule.get("keywords", []))
    if det == "secret":
        return pii.contains_secret(text, config.AEGIS_SECRET)
    if det == "pii":
        return bool(pii.scan(text))
    return False


def run(text, surface):
    """Public summaries of every enabled rule that fires on `text`."""
    return [
        _public(r)
        for r in _pack["rules"]
        if r["enabled"] and r["surface"] == surface and _detect(r, text)
    ]


def worst(text, surface):
    hits = run(text, surface)
    if not hits:
        return None
    return max(hits, key=lambda h: h["severity"])


def action_for(rule_action):
    return _ACTION_MAP.get(rule_action, "LOGGED")


def covered_owasp():
    """OWASP ids covered by at least one enabled rule."""
    return sorted(
        {
            r.get("mapping", {}).get("owasp")
            for r in _pack["rules"]
            if r["enabled"] and r.get("mapping", {}).get("owasp")
        }
    )


load()
