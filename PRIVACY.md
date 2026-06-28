# Privacy and data protection

This note explains how AEGIS handles personal data and how to run it in line with
the GDPR and the EU AI Act. It is written for the team that deploys AEGIS, not for
end users, and it is guidance rather than legal advice. Review it against your own
deployment before you rely on it.

## Who is responsible for what

AEGIS is a tool. When you deploy it in front of your LLM application, you decide
why and how the traffic is processed, so under the GDPR you are the **controller**.

If you point AEGIS at a hosted model (for example Regolo in `regolo` mode, or any
upstream you configure on an endpoint), that provider processes prompts and model
output on your behalf and acts as your **processor** or sub-processor. Put a data
processing agreement in place with them. A starting template lives in
[docs/DPA-template.md](docs/DPA-template.md).

In the default offline mode there is no third party: the mock model, the sqlite
audit log and the event bus all run in your own process.

## What AEGIS processes

AEGIS inspects each request and response and records an audit event for every
guardrail decision. An event holds:

- A short excerpt of the inspected text, capped at 160 characters. Before the
  event is stored, the excerpt and the human-readable explanation are redacted:
  the configured secret and common structured PII (email, phone, IBAN, card
  numbers, API keys, Italian codice fiscale) are replaced with `[REDACTED]`. The
  same redaction applies to the CSV/JSON export and to the live SSE feed.
- Detection metadata: the verdict, action, severity, the rule that fired, the
  matched OWASP and MITRE ATLAS identifiers, the AI Act article, a timestamp and
  the endpoint slug.
- A fixed `actor` label that records which surface produced the event (`api`,
  `playground`, `seed` or `assistant`). No client IP address or bearer token is
  written to the audit log. An IP is only ever held in memory as a rate-limiter
  key and is never persisted.
- Two hash-chain fields that link the event to its predecessor, so the log is
  tamper-evident (AI Act Art. 12).

The redaction covers structured identifiers, not free-text names or special
category data under Art. 9. Treat it as data minimisation, not as a full DLP
control. The scope note in the [README](README.md#eu-ai-act-mapping) says the same.

## Purpose and legal basis

AEGIS does two jobs at once: it keeps the LLM application secure and it produces
the evidence that proves you stayed compliant. The same event covers both. A
blocked injection is a security signal and, at the same time, a record that the
Art. 15 control fired.

For the security purpose, legitimate interest under Art. 6(1)(f) is usually the
natural basis. Where logging is itself a legal requirement, Art. 6(1)(c) (legal
obligation) may apply. The right basis depends on your context, so run your own
assessment and write it down.

## Retention

By default the audit log is append-only and is not pruned, which keeps the
out-of-the-box behaviour unchanged. To apply storage limitation under
Art. 5(1)(e), set `AEGIS_AUDIT_RETENTION_DAYS` to the number of days you want to
keep. AEGIS then drops older events at startup and once a day after that. Because
only the oldest events are removed, the retained hash chain stays contiguous and
`/api/verify` still passes over the kept window.

## International transfers

In offline mode nothing leaves your process. In `regolo` mode, or with any
endpoint that forwards to an upstream, the prompts and model output are sent to
that provider. The audit assistant also sends a snapshot of the (already redacted)
audit log to the model that answers questions about it.

If the provider sits outside the EEA, you need a valid transfer mechanism under
Arts. 44 to 49, such as standard contractual clauses, on top of the processing
agreement. Choose the upstream and the region deliberately.

## Data subject rights

Because every event is redacted at rest and carries no IP or account identifier,
the audit log holds little that ties back to an individual. When you do receive an
access or erasure request, the export endpoints (`/api/audit/export`) give you the
records to review.

Erasing a single mid-chain record is the hard case: deleting one row would break
the hash chain that makes the log trustworthy. Today the mitigation is the
redaction already applied at write time plus time-bound retention. Cryptographic
erasure of individual records (encrypt the free-text fields, then shred the key)
is a known design but is not yet implemented; if your deployment needs it, raise
it before you go to production.

## Records of processing (Art. 30)

| Item              | Summary                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| Categories        | Redacted traffic excerpts, detection metadata, timestamps                |
| Data subjects     | Users of the protected LLM application whose prompts pass through AEGIS   |
| Purposes          | Application security and EU AI Act compliance evidence                    |
| Recipients        | The deployer; any configured upstream LLM provider (processor)           |
| Transfers         | Only to the upstream provider you configure; none in offline mode        |
| Retention         | Unbounded by default; bounded by `AEGIS_AUDIT_RETENTION_DAYS` when set    |
| Security          | Redaction at rest, hash-chained audit, optional auth, rate limit, SSRF guard |

Keep your own copy of this register filled in for your specific deployment, since
the recipients, transfers and retention are choices you make.
