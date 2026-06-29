# Security Policy

AEGIS is an LLM guardrail and EU AI Act compliance console. Security reports are
taken seriously.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead use GitHub's
private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or contact the maintainer privately.

When reporting, include:

- a description of the issue and its impact,
- the steps or a minimal proof of concept to reproduce it,
- affected version / commit and your environment.

You can expect an initial acknowledgement within a few days. Coordinated
disclosure is appreciated: please give a reasonable window to ship a fix before
any public disclosure.

## Supported versions

The project is pre-1.0. Only the latest `main` is supported; fixes land there.

## Hardening notes

AEGIS ships **offline-first and open by default** so it can run in an isolated,
trusted network with zero configuration. Before exposing it beyond a trusted
boundary, enable the hardened paths:

- **Control plane (`/api/*`)** — set `AEGIS_ADMIN_API_KEY` to require an
  `X-API-Key` header on the mutating admin routes (endpoint CRUD, rule-pack
  writes, the demo tamper/reset endpoints).
- **Data plane (`/v1`)** — set `AEGIS_API_KEYS` (bearer tokens) and
  `AEGIS_AUTH_ENABLED=true`, optionally `AEGIS_RATE_LIMIT_RPM`.
- **CORS** — `AEGIS_CORS_ORIGINS` defaults to `http://localhost:5173`; set it to
  your real origins.
- **Upstream forwarding** — an endpoint may only reference the credential env var
  names in `AEGIS_UPSTREAM_KEY_ENVS` (default `OPENAI_API_KEY,REGOLO_API_KEY`),
  and forwarding to private / loopback / metadata hosts is blocked unless
  `AEGIS_ALLOW_PRIVATE_UPSTREAM=true`. This prevents SSRF and env-var
  exfiltration through a crafted endpoint upstream.
- **Fail-closed** — set `AEGIS_FAIL_CLOSED=true` so traffic is blocked when the
  inspection pipeline errors.

Never commit real secrets: `.env` is gitignored and only env-var *names* are
ever stored in the endpoint registry.

## Data protection

AEGIS processes prompt and response excerpts as audit evidence. Audit events are
redacted at rest, no client IP is persisted, and retention is bounded by
`AEGIS_AUDIT_RETENTION_DAYS`. See [PRIVACY.md](PRIVACY.md) for the GDPR data
flows, roles, transfers and data subject rights, and
[docs/DPA-template.md](docs/DPA-template.md) for a controller-to-processor
agreement template.
