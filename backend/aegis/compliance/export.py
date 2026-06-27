"""Serialize audit events for download as JSON or CSV."""

import csv
import io
import json

# Stable column order for CSV export.
_COLUMNS = [
    "id",
    "ts",
    "direction",
    "verdict",
    "severity",
    "category",
    "ai_act",
    "ai_act_label",
    "action",
    "matched",
    "excerpt",
    "explanation",
    "judge_used",
    "actor",
]


def to_json(events):
    """Pretty-printed JSON array of the given events."""
    return json.dumps(events, indent=2, ensure_ascii=False)


def to_csv(events):
    """CSV with a fixed header and one row per event.

    The `matched` list is flattened to a ';'-joined string.
    """
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_COLUMNS)

    for ev in events:
        row = []
        for col in _COLUMNS:
            value = ev.get(col)
            if col == "matched":
                value = ";".join(value) if isinstance(value, list) else (value or "")
            elif value is None:
                value = ""
            row.append(value)
        writer.writerow(row)

    return buf.getvalue()
