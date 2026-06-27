#!/usr/bin/env bash
# Start the AEGIS backend. Runs fully offline in mock mode by default.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

[ -f .env ] || cp .env.example .env

echo "AEGIS backend -> http://localhost:8000  (docs: /docs)"
exec uvicorn aegis.main:app --reload --port 8000
