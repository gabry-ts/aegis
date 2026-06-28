# AEGIS

[![CI](https://github.com/gabry-ts/aegis/actions/workflows/ci.yml/badge.svg)](https://github.com/gabry-ts/aegis/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Python](https://img.shields.io/badge/python-3.12+-blue.svg)
![Node](https://img.shields.io/badge/node-20+-green.svg)

A guardrail proxy for LLM applications that doubles as an **EU AI Act compliance layer**.

AEGIS sits in front of any OpenAI-compatible LLM. It inspects every request and
response, blocks prompt injection / jailbreaks / data exfiltration, sanitizes
leaked PII and secrets, injects the AI-disclosure required by the Act, and writes
a tamper-evident audit trail. The same event is both a **security signal** and a
**piece of compliance evidence**.

```
  Your LLM app  ──▶  AEGIS proxy  ──▶  Regolo AI (or any OpenAI-compatible model)
                      │  Detection engine   (Art. 15(5))
                      │  Compliance logger  (Art. 12)
                      │  Transparency layer (Art. 50)
```

It runs **fully offline by default** — a deterministic mock model, sqlite audit
and an in-memory bus — so you can clone and explore the whole thing without any
API key.

## EU AI Act mapping

| Article    | Requirement                                                           | AEGIS feature                                       |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| Art. 15(5) | Prevent / detect / respond to model evasion & confidentiality attacks | Detection engine (injection, jailbreak, PII/secret) |
| Art. 12    | Automatic record-keeping / logging                                    | Compliance logger + hash-chained JSON/CSV audit     |
| Art. 50    | Disclose AI-generated content                                         | Transparency injector + `X-AI-Generated` header     |

> Scope note: Art. 15 applies to high-risk systems (Annex III) and to GPAI used
> in those domains. AEGIS is positioned as the control layer that makes a
> high-risk deployment compliant, not as a blanket obligation for every chatbot.

## Quick start

### Backend (FastAPI, Python 3.12+)

Runs fully offline in **mock mode** by default — no API key required.

```bash
cd backend
./run.sh                      # creates a venv, installs deps, serves on :8000
# or manually:
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn aegis.main:app --reload --port 8000
```

To use a real model, set `AEGIS_MODE=regolo` and `REGOLO_API_KEY` in `.env`.

### Frontend (React + Vite, Node 20+)

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api and /v1 to :8000)
```

## The console

The frontend is a five-surface operations console:

- **Dashboard** — live threat feed, compliance ledger, severity distribution and
  an AI Act coverage ring, streamed from the backend over SSE.
- **Playground** — an attack console with a guard toggle and the **LiveFire**
  cinematic pipeline: pick the endpoint to attack, turn protection off to see the
  unprotected model leak its planted secret, and on to watch that flow block the
  attack and seal the evidence.
- **Guardrail** — the selected endpoint's rules as a drag-arrange board (React
  Flow). Arm/disarm a rule for that flow, edit the shared definition, or open the
  **Library** drawer to add rules to / remove them from the board.
- **Compliance · Audit** — the hash-chained audit log with one-click integrity
  verification and a tamper simulation.
- **Compliance · AI Act** — a self-assessment that classifies a deployment into
  the Act's risk tiers and lists which obligations AEGIS already helps satisfy.

## Endpoints (named guardrail flows)

Each endpoint is a named guardrail **flow** that selects which rules from the
shared library are armed, whether the LLM judge runs, and **where passing
requests are forwarded** (its own `base_url` + `model`). The proxy is reached
per-flow at `/v1/{slug}/chat/completions`, and the read endpoints accept an
optional `?endpoint=<slug>` filter (omit it for the aggregate, all-endpoints view).

An endpoint's upstream credential is referenced by the **name** of an environment
variable (`api_key_env`, restricted to an allowlist — see Security), never stored
as a raw secret. With no upstream configured, an endpoint falls back to the
global provider (Regolo, or the offline mock).

```bash
curl http://localhost:8000/v1/default/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

## Security & hardening

AEGIS ships **open by default** so it works zero-config on a trusted / isolated
network. Before exposing it further, set the hardened paths (full reference in
[`backend/.env.example`](backend/.env.example) and [SECURITY.md](SECURITY.md)):

| Variable                      | Purpose                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `AEGIS_ADMIN_API_KEY`         | Require an `X-API-Key` header on mutating `/api/*` admin routes (empty = open).           |
| `AEGIS_API_KEYS` + `AEGIS_AUTH_ENABLED` | Bearer-token auth on the `/v1` data plane.                                     |
| `AEGIS_RATE_LIMIT_RPM`        | Per-principal rate limit on `/v1`.                                                        |
| `AEGIS_CORS_ORIGINS`          | Allowed browser origins (defaults to `http://localhost:5173`).                           |
| `AEGIS_UPSTREAM_KEY_ENVS`     | Allowlist of env-var names an endpoint may use for its upstream key (anti-exfiltration).  |
| `AEGIS_ALLOW_PRIVATE_UPSTREAM`| Allow forwarding to private/loopback hosts (off by default — the SSRF guard).             |
| `AEGIS_FAIL_CLOSED`           | Block traffic when the inspection pipeline errors.                                        |

The upstream forwarder validates `base_url` and only resolves credential env vars
from the allowlist, so a crafted endpoint cannot drive SSRF or exfiltrate
arbitrary process environment variables. Please report vulnerabilities privately
per [SECURITY.md](SECURITY.md).

## Project layout

```
backend/
  aegis/
    main.py            API hub (OpenAI-compatible proxy + compliance endpoints)
    config.py          env-driven settings (mock vs regolo, security)
    security.py        /v1 auth + rate limit, /api admin guard, SSRF/key guards
    schemas.py         request models + AI Act vocabulary
    llm.py             dual-mode model client (mock / Regolo / per-endpoint upstream)
    endpoints.py       named guardrail-flow registry (endpoints.yaml)
    transparency.py    Art. 50 disclosure
    aiact.py           risk-tier self-assessment
    detection/         rules · pii · judge · engine · loader (editable rule pack)
    compliance/        logger (sqlite/postgres) · export · score · bus
  demo/                vulnerable bot · curated attacks · seed
  tests/               detection · endpoints · proxy · hardening tests
frontend/
  src/
    pages/             Dashboard · Playground · Rules · Integrity · Assessment
    components/        feed · ledger · console · LiveFire · charts · rules board · primitives
    context/           shared endpoint state
    api.ts · types.ts  typed client + domain contract
```

## API

A representative subset — the full, always-current contract is at
`http://localhost:8000/docs` (OpenAPI). Routes marked **admin** require
`X-API-Key` when `AEGIS_ADMIN_API_KEY` is set.

| Method | Path                              | Purpose                                              |
| ------ | --------------------------------- | ---------------------------------------------------- |
| POST   | `/v1/{slug}/chat/completions`     | OpenAI-compatible guarded proxy (per flow)           |
| GET    | `/api/endpoints`                  | List guardrail endpoints                             |
| POST   | `/api/endpoints`                  | Create an endpoint — **admin**                       |
| PUT    | `/api/endpoints/{slug}`           | Update rules / judge / board / upstream — **admin**  |
| DELETE | `/api/endpoints/{slug}`           | Delete an endpoint — **admin**                       |
| GET    | `/api/detections`                 | The shared rule library                              |
| PUT    | `/api/detections/raw`             | Replace the rule pack (YAML) — **admin**             |
| POST   | `/api/chat`                       | Playground call (full trace)                         |
| POST   | `/api/inspect`                    | Run detection without calling the model              |
| GET    | `/api/stream`                     | Live events + stats over SSE (`?endpoint=`)          |
| GET    | `/api/events` · `/api/audit`      | Recent events / full audit log (`?endpoint=`)        |
| GET    | `/api/audit/export`               | Download report (`?format=json\|csv`)                |
| GET    | `/api/verify`                     | Verify the audit hash-chain integrity                |
| GET    | `/api/score` · `/api/stats`       | AI Act coverage / dashboard summary (`?endpoint=`)   |
| GET    | `/api/assess/questions` · POST `/api/assess` | AI Act risk-tier self-assessment         |
| POST   | `/api/_demo/tamper` · `/api/_demo/reset` | Demo: break / reset the chain — **admin**     |
| GET    | `/health`                         | Liveness + provider info                             |

## Development

```bash
# backend tests
cd backend && source .venv/bin/activate && pytest -q
# frontend type-check + build
cd frontend && npm run typecheck && npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions and how to add a
detection rule. CI runs the backend tests and the frontend type-check + build on
every pull request.

## License

Licensed under the [Apache License 2.0](LICENSE) — see [NOTICE](NOTICE) for
third-party attributions (the frontend's GSAP animation library keeps its own
GreenSock license).
