"""PII and secret detection / redaction helpers.

`scan(text)` finds structured sensitive values (email, phone, IBAN, credit
card, generic API key/token, AWS access key) and returns a list of hits:
    {"name": str, "match": str}

`contains_secret(text, secret)` is a plain, case-sensitive substring check
used to catch the canonical AEGIS secret leaking into model output.

`redact(text, secret)` replaces the secret and every PII match with the
literal token "[REDACTED]".

Everything here is pure regex / string work, so it is fully deterministic and
network-free.
"""

import re
from collections import Counter
from typing import Dict, List

REDACTION = "[REDACTED]"

# Each entry: (name, compiled pattern). Order matters for redaction only in
# that overlapping matches are handled by a single positional pass.
_PATTERNS = [
    (
        "email",
        re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    ),
    (
        "aws_access_key",
        re.compile(r"\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[0-9A-Z]{16}\b"),
    ),
    (
        "api_key",
        re.compile(r"\b(?:sk|pk|rk|api|key|token|secret)[-_][A-Za-z0-9]{16,}\b", re.IGNORECASE),
    ),
    (
        # Italian tax code (codice fiscale): 6 letters, 2 digits, month letter,
        # 2 digits, area letter, 3 digits, checksum letter. Specific enough to
        # carry a very low false-positive rate.
        "codice_fiscale",
        re.compile(r"\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b"),
    ),
    (
        "iban",
        re.compile(r"\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b"),
    ),
    (
        "credit_card",
        re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    ),
    (
        # German tax id (Steuer-IdNr): 11 digits, optionally grouped 2-3-3-3.
        # Validated by structure + checksum in scan() to keep false positives low.
        "german_taxid",
        re.compile(r"\b\d{2}[ ]?\d{3}[ ]?\d{3}[ ]?\d{3}\b"),
    ),
    (
        "phone",
        re.compile(r"(?<![\w.])\+?\d[\d\s().-]{7,}\d(?![\w.])"),
    ),
]


def _luhn_ok(value: str) -> bool:
    """True if the digits in `value` satisfy the Luhn checksum (card numbers).

    Used to reject the many 13-16 digit runs that the broad card regex would
    otherwise flag (order numbers, ids, concatenated values).
    """
    digits = [int(c) for c in value if c.isdigit()]
    if len(digits) < 13:
        return False
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


def _is_german_taxid(value: str) -> bool:
    """True if `value` is a valid German Steuer-IdNr (structure + check digit).

    The first ten digits must contain exactly one digit appearing twice or three
    times, and the eleventh is an ISO 7064 MOD 11,10 check digit. Together these
    make a stray 11-digit number very unlikely to be mistaken for a tax id.
    """
    digits = [int(c) for c in value if c.isdigit()]
    if len(digits) != 11:
        return False
    counts = Counter(digits[:10])
    repeated = [d for d, c in counts.items() if c >= 2]
    if len(repeated) != 1 or counts[repeated[0]] > 3:
        return False
    product = 10
    for d in digits[:10]:
        s = (d + product) % 10
        if s == 0:
            s = 10
        product = (s * 2) % 11
    check = (11 - product) % 10
    return check == digits[10]


def scan(text: str) -> List[Dict]:
    """Return every PII hit in `text` as `{"name", "match"}`.

    Patterns are evaluated in priority order; a span already claimed by an
    earlier (more specific) pattern is not re-reported by a later, broader
    one. This keeps a single token from showing up as both, e.g., an IBAN and
    a phone number. Candidate card numbers must also pass the Luhn checksum.
    """
    text = text or ""
    claimed: List[tuple] = []
    hits: List[Dict] = []
    for name, pattern in _PATTERNS:
        for m in pattern.finditer(text):
            start, end = m.start(), m.end()
            if any(start < c_end and end > c_start for c_start, c_end in claimed):
                continue
            if name == "credit_card" and not _luhn_ok(m.group(0)):
                continue
            if name == "german_taxid" and not _is_german_taxid(m.group(0)):
                continue
            claimed.append((start, end))
            hits.append({"name": name, "match": m.group(0)})
    return hits


# Real models reformat literals: they swap ASCII "-" for a unicode dash, wrap
# the value in markdown, or change case. Detection has to see through that, or
# the secret slips past the output scanner. We normalise dash variants and
# match case-insensitively.
_DASHES = "-­‐‑‒–—―−"
_DASH_RE = re.compile(f"[{_DASHES}]")


def _normalize(text: str) -> str:
    """Collapse all dash-like characters to a plain ASCII hyphen."""
    return _DASH_RE.sub("-", text or "")


def _secret_regex(secret: str) -> re.Pattern:
    """A pattern matching the secret with any dash variant, case-insensitive."""
    parts = secret.split("-")
    joiner = f"[{re.escape(_DASHES)}]"
    return re.compile(joiner.join(re.escape(p) for p in parts), re.IGNORECASE)


def contains_secret(text: str, secret: str) -> bool:
    """Substring check for the configured secret, robust to reformatting."""
    if not secret:
        return False
    return _normalize(secret).lower() in _normalize(text).lower()


def redact(text: str, secret: str) -> str:
    """Replace the secret and every PII match with `[REDACTED]`."""
    text = text or ""
    if secret:
        text = _secret_regex(secret).sub(REDACTION, text)
    for hit in scan(text):
        text = text.replace(hit["match"], REDACTION)
    return text
