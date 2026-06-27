"""Compiled regex pattern tables for adversarial input detection.

The tables cover three verdict families:
  - PROMPT_INJECTION: attempts to override or extract the system prompt,
  - JAILBREAK: persona/roleplay tricks that try to bypass safety policy,
  - DATA_EXFILTRATION: attempts to smuggle data out of the system.

`scan(text)` returns a flat list of hits, each a small dict:
    {"name": str, "verdict": str, "severity": int}

Severity is a fixed 3-5 weight per pattern; it is deterministic and never
depends on the environment, so the scan behaves identically offline.
"""

import re
from typing import Dict, List

from ..schemas import Verdict

# Each entry: (name, compiled pattern, verdict, severity).
# Patterns are case-insensitive and tolerant of extra whitespace so that
# trivial obfuscation ("ignore   all previous instructions") still matches.
_PATTERNS = [
    # ---- Prompt injection -------------------------------------------------
    (
        "ignore_previous_instructions",
        re.compile(r"ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions", re.IGNORECASE),
        Verdict.PROMPT_INJECTION.value,
        4,
    ),
    (
        "disregard_instructions",
        re.compile(r"(disregard|forget|override)\s+(all\s+)?(previous|prior|above|the)\s+(instructions|rules|prompt)", re.IGNORECASE),
        Verdict.PROMPT_INJECTION.value,
        4,
    ),
    (
        "system_prompt_reference",
        re.compile(r"system\s+prompt", re.IGNORECASE),
        Verdict.PROMPT_INJECTION.value,
        3,
    ),
    (
        "reveal_instructions",
        re.compile(r"(reveal|print|show|repeat|output|tell\s+me)\s+(me\s+)?(your|the)\s+(instructions|rules|system\s+prompt|prompt|guidelines)", re.IGNORECASE),
        Verdict.PROMPT_INJECTION.value,
        5,
    ),
    (
        "new_instructions",
        re.compile(r"(your\s+new\s+instructions\s+are|from\s+now\s+on\s+you\s+(will|must|are))", re.IGNORECASE),
        Verdict.PROMPT_INJECTION.value,
        4,
    ),
    # ---- Jailbreak --------------------------------------------------------
    (
        "dan",
        re.compile(r"\bDAN\b", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        4,
    ),
    (
        "do_anything_now",
        re.compile(r"do\s+anything\s+now", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        5,
    ),
    (
        "developer_mode",
        re.compile(r"developer\s+mode", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        4,
    ),
    (
        "jailbreak",
        re.compile(r"jail\s*break", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        4,
    ),
    (
        "pretend_you_are",
        re.compile(r"(pretend|act\s+as\s+if|imagine)\s+(you\s+are|to\s+be|you're)", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        3,
    ),
    (
        "no_restrictions",
        re.compile(r"(without|no|ignore)\s+(any\s+)?(restrictions|rules|filters|guardrails|limitations)", re.IGNORECASE),
        Verdict.JAILBREAK.value,
        4,
    ),
    # ---- Data exfiltration ------------------------------------------------
    (
        "exfiltrate",
        re.compile(r"exfiltrat", re.IGNORECASE),
        Verdict.DATA_EXFILTRATION.value,
        5,
    ),
    (
        "send_to_url",
        re.compile(r"send\s+.{0,80}?\s+to\s+https?://", re.IGNORECASE | re.DOTALL),
        Verdict.DATA_EXFILTRATION.value,
        5,
    ),
    (
        "post_to_url",
        re.compile(r"(post|upload|forward|leak)\s+.{0,80}?\s+to\s+https?://", re.IGNORECASE | re.DOTALL),
        Verdict.DATA_EXFILTRATION.value,
        5,
    ),
    (
        "base64_your",
        re.compile(r"base64\s+(encode\s+)?(your|the|all)", re.IGNORECASE),
        Verdict.DATA_EXFILTRATION.value,
        4,
    ),
]


def scan(text: str) -> List[Dict]:
    """Return every pattern hit found in `text`.

    Each hit is `{"name", "verdict", "severity"}`. The order follows the
    pattern table, so the result is stable for a given input.
    """
    text = text or ""
    hits: List[Dict] = []
    for name, pattern, verdict, severity in _PATTERNS:
        if pattern.search(text):
            hits.append({"name": name, "verdict": verdict, "severity": severity})
    return hits
