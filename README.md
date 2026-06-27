# AEGIS

A guardrail proxy for LLM applications that doubles as an **EU AI Act compliance layer**.

AEGIS sits in front of any OpenAI-compatible LLM. It inspects every request and
response, blocks prompt injection / jailbreaks / data exfiltration, sanitizes
leaked PII and secrets, injects the AI-disclosure required by the Act, and writes
a structured audit trail. The same event is both a **security signal** and a
**piece of compliance evidence**.

```
  Your LLM app  ──▶  AEGIS proxy  ──▶  Regolo AI (or any OpenAI-compatible model)
                      │  Detection engine   (Art. 15(5))
                      │  Compliance logger  (Art. 12)
                      │  Transparency layer (Art. 50)
```

## EU AI Act mapping

| Article    | Requirement                                              | AEGIS feature                                       |
| ---------- | -------------------------------------------------------- | --------------------------------------------------- |
| Art. 15(5) | Prevent / detect / respond to model evasion & confidentiality attacks | Detection engine (injection, jailbreak, PII/secret) |
| Art. 12    | Automatic record-keeping / logging                       | Compliance logger + JSON/CSV audit export           |
| Art. 50    | Disclose AI-generated content                            | Transparency injector + `X-AI-Generated` header     |

> Scope note: Art. 15 applies to high-risk systems (Annex III) and to GPAI used
> in those domains. AEGIS is positioned as the control layer that makes a
> high-risk deployment compliant, not as a blanket obligation for every chatbot.

## Quick start

### Backend (FastAPI)

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

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :8000)
```

## What you get

- **Dashboard** — live threat feed, compliance ledger, severity distribution and
  an AI Act coverage ring, all polling the backend in real time.
- **Playground** — an attack console with a guard toggle. Turn protection off to
  see the unprotected model leak its planted secret; turn it on to watch AEGIS
  block the attack and log the evidence.

## Project layout

```
backend/
  aegis/
    main.py            API hub (OpenAI-compatible proxy + compliance endpoints)
    config.py          env-driven settings (mock vs regolo)
    schemas.py         shared vocabulary + AI Act mapping
    llm.py             dual-mode model client (mock / Regolo)
    transparency.py    Art. 50 disclosure
    detection/         rules · pii · judge · engine
    compliance/        logger (sqlite) · export · score
  demo/                vulnerable bot · curated attacks · seed
  tests/               detection + proxy tests
frontend/
  src/
    pages/             Dashboard · Playground
    components/        feed · ledger · console · charts · primitives
```

## Tests

```bash
cd backend && source .venv/bin/activate && pytest -q
```

## API

| Method | Path                    | Purpose                                   |
| ------ | ----------------------- | ----------------------------------------- |
| POST   | `/v1/chat/completions`  | OpenAI-compatible guarded proxy           |
| POST   | `/api/chat`             | Playground call (full trace, guard toggle) |
| POST   | `/api/inspect`          | Run detection without calling the model   |
| GET    | `/api/events`           | Recent events (polling feed)              |
| GET    | `/api/audit`            | Full audit log                            |
| GET    | `/api/audit/export`     | Download report (`?format=json\|csv`)     |
| GET    | `/api/score`            | AI Act coverage score                     |
| GET    | `/api/stats`            | Dashboard summary                         |
| GET    | `/health`               | Liveness + provider info                  |
