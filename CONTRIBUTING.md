# Contributing to AEGIS

Thanks for your interest in contributing! AEGIS is a FastAPI backend (the
guardrail + audit + AI Act scoring) and a React/TypeScript frontend (the
console). Everything runs fully offline in mock mode, so you can develop without
any API keys.

## Development setup

### Backend (Python 3.12+)

```bash
cd backend
./run.sh                 # creates a venv, installs deps, starts uvicorn on :8000
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn aegis.main:app --reload --port 8000
```

### Frontend (Node 20+)

```bash
cd frontend
npm install
npm run dev              # Vite dev server on :5173, proxies /api and /v1 to :8000
```

## Before you open a pull request

- **Backend tests**: `cd backend && python -m pytest -q`
- **Frontend types**: `cd frontend && npm run typecheck`
- **Frontend build**: `cd frontend && npm run build`

CI runs all three on every pull request; please make sure they pass locally.

## Conventions

- **Commits**: small and atomic — one logical change per commit. Use a short,
  lowercase, imperative message prefixed with `feat:`, `fix:`, `refactor:`,
  `docs:`, `test:` or `chore:`.
- **Code style**: match the surrounding code. Backend is plain Python with type
  hints where it helps; frontend is strict TypeScript (`tsconfig.json` is in
  full strict mode).
- **No secrets** in code, tests, or commits. Reference credentials by env-var
  name only.

## Adding a detection rule

The shared rule library lives in `backend/aegis/detection/rules.yaml` and can
also be edited live from the Guardrail board. A rule has a `verdict`, `severity`,
`surface` (input/output), `action` (block/sanitize/flag), a `detector`
(regex/keyword/secret/pii) and an optional OWASP / ATLAS / EU AI Act mapping.
When adding a built-in detector or rule, include a test in
`backend/tests/test_detection.py` that proves it fires (and does not over-fire on
benign input).

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md) — do not open a public issue for
vulnerabilities.

By contributing, you agree that your contributions are licensed under the
project's [Apache-2.0](LICENSE) license.
