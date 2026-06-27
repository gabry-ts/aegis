"""A deliberately unprotected chatbot, used as the "before AEGIS" baseline.

It forwards the user prompt straight to the model and prints the raw reply,
with no detection, no sanitization and no transparency layer. In mock mode
the model happily echoes the protected secret, which is exactly the leak
AEGIS is meant to catch once the guard is enabled.

    python -m demo.vulnerable_bot "<prompt>"
"""

import sys


def run(prompt: str) -> str:
    """Send `prompt` to the raw model with no guardrails and return the reply."""
    from aegis import llm

    return llm.complete([{"role": "user", "content": prompt}])


def main(argv) -> int:
    if len(argv) < 2 or not argv[1].strip():
        print('usage: python -m demo.vulnerable_bot "<prompt>"', file=sys.stderr)
        return 2

    prompt = argv[1]
    print(run(prompt))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
