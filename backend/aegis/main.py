"""AEGIS API: OpenAI-compatible guardrail proxy + compliance endpoints.

Integration hub. Pins the interface every other backend module exposes and wires
the production capabilities (auth, rate limit, streaming, fail-closed inspection,
tamper-evident audit, push-based SSE, metrics).
"""

import asyncio
import json
import os
import re

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse

from . import config, schemas, llm, transparency, security, metrics, benchmark, aiact, endpoints
from .detection import engine
from .detection import loader as detloader
from .detection import judge
from .compliance import logger as clog
from .compliance import export as cexport
from .compliance import score as cscore
from .compliance import bus as eventbus

app = FastAPI(title="AEGIS", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

store = clog.store
bus = eventbus.bus


async def _retention_loop() -> None:
    """Re-run the retention prune roughly once a day for long-lived deployments."""
    while True:
        await asyncio.sleep(24 * 3600)
        try:
            store.prune(config.AUDIT_RETENTION_DAYS)
        except Exception:
            pass


@app.on_event("startup")
async def _startup() -> None:
    try:
        bus.set_loop(asyncio.get_running_loop())
    except Exception:
        pass
    if config.SEED and store.stats().get("total", 0) == 0:
        try:
            from demo.seed import seed
            seed(store)
        except Exception:
            pass
    # Storage limitation (GDPR Art. 5(1)(e)): purge stale audit events at boot and
    # keep purging on a daily cadence. Disabled when AUDIT_RETENTION_DAYS is 0.
    if config.AUDIT_RETENTION_DAYS > 0:
        try:
            store.prune(config.AUDIT_RETENTION_DAYS)
        except Exception:
            pass
        try:
            asyncio.create_task(_retention_loop())
        except Exception:
            pass


# ---- helpers ------------------------------------------------------------

def _record(event: dict) -> dict:
    """Persist an event to the audit store and push it onto the event bus."""
    stored = store.add(event)
    try:
        bus.publish(stored)
    except Exception:
        pass
    return stored


def _events(endpoint: str = None) -> list:
    """All audit events, optionally narrowed to a single endpoint slug."""
    events = store.all()
    if endpoint:
        events = [e for e in events if e.get("endpoint") == endpoint]
    return events


def _upstream_args(ep: dict) -> dict:
    """Resolve an endpoint's upstream into llm.complete kwargs.

    The credential is read from the environment by the name the endpoint stores
    (api_key_env); the secret never lives in the registry. With nothing
    configured the kwargs are empty and llm.complete falls back to the global
    provider / mock.
    """
    up = ep.get("upstream") or {}
    env = up.get("api_key_env")
    base_url = up.get("base_url")
    api_key = os.getenv(env) if security.is_allowed_key_env(env) else None
    # Authoritative SSRF gate, resolved at the moment of use: never forward to a
    # private / loopback / metadata target. On failure fall back to the global
    # provider rather than leaking the credential to an unsafe host.
    if base_url and not security.is_safe_upstream_url(base_url):
        base_url = None
        api_key = None
    return {
        "model": up.get("model"),
        "base_url": base_url,
        "api_key": api_key,
    }


def _inspect(text: str, direction: str, active_ids=None, judge_enabled=None) -> dict:
    """Inspect with the configured failure policy (fail-closed vs fail-open).

    `active_ids` / `judge_enabled` carry the calling endpoint's armed rule set and
    judge flag (None falls back to the whole library / global switch).
    """
    try:
        return engine.inspect(text, direction, active_ids, judge_enabled)
    except Exception:
        metrics.inc("aegis_errors_total")
        if config.FAIL_CLOSED and direction == "input":
            return schemas.detection_result(
                direction, "PROMPT_INJECTION", 5, "BLOCKED", ["inspection_error"],
                text, "Inspection failed; blocked by fail-closed policy.",
            )
        return schemas.detection_result(direction, "SAFE", 0, "ALLOWED", [], text, "Inspection skipped (error).")


def _completion(content: str, verdict: str = "SAFE") -> dict:
    return {
        "id": "aegis-cmpl",
        "object": "chat.completion",
        "model": "aegis",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}
        ],
        "aegis": {"verdict": verdict},
    }


def _chunk(delta: dict, finish=None) -> str:
    obj = {
        "id": "aegis-cmpl",
        "object": "chat.completion.chunk",
        "model": "aegis",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }
    return "data: " + json.dumps(obj) + "\n\n"


def _stream_text(content: str):
    """Re-stream already-inspected content as OpenAI-compatible chunks.

    Output is buffered and scanned before streaming, so the client only ever
    receives sanitized tokens — safe streaming without leaking mid-flight.
    """
    yield _chunk({"role": "assistant"})
    for piece in re.findall(r"\S+\s*", content) or [content]:
        yield _chunk({"content": piece})
    yield _chunk({}, "stop")
    yield "data: [DONE]\n\n"


def _last_user(messages) -> str:
    for msg in reversed(messages):
        if msg.role == "user":
            return msg.content
    return messages[-1].content if messages else ""


# ---- OpenAI-compatible guarded proxy (auth + rate limit on /v1) ----------

def _endpoint_404(slug: str) -> JSONResponse:
    return JSONResponse(
        {"error": {"message": f"Unknown AEGIS endpoint '{slug}'.", "type": "invalid_request_error"}},
        status_code=404,
    )


@app.post("/v1/{slug}/chat/completions", dependencies=[Depends(security.guard)])
def chat_completions(slug: str, req: schemas.ChatRequest, request: Request):
    metrics.inc("aegis_requests_total")
    ep = endpoints.get(slug)
    if ep is None:
        return _endpoint_404(slug)
    active, judge_on = set(ep["rules"]), ep["judge"]

    text = _last_user(req.messages)
    det = _inspect(text, "input", active, judge_on)
    _record(clog.make_event(det, actor="api", endpoint=slug))

    if det["action"] == "BLOCKED":
        metrics.inc("aegis_blocked_total")
        refusal = f"⚠️ Request blocked by AEGIS ({det['verdict']})."
        if req.stream:
            return StreamingResponse(_stream_text(refusal), media_type="text/event-stream")
        return JSONResponse(
            _completion(refusal, det["verdict"]),
            headers={"X-AEGIS-Verdict": det["verdict"], transparency.HEADER: "false"},
        )

    ua = _upstream_args(ep)
    raw = llm.complete(
        [m.model_dump() for m in req.messages],
        model=ua["model"] or req.model,
        base_url=ua["base_url"],
        api_key=ua["api_key"],
    )
    out = _inspect(raw, "output", active, judge_on)
    content = raw
    if out["action"] == "BLOCKED":
        # Hard disposition: the response is withheld entirely, not partially
        # redacted, and the model output never reaches the client.
        metrics.inc("aegis_blocked_total")
        _record(clog.make_event(out, actor="api", endpoint=slug))
        refusal = f"⚠️ Response blocked by AEGIS ({out['verdict']})."
        if req.stream:
            return StreamingResponse(_stream_text(refusal), media_type="text/event-stream")
        return JSONResponse(
            _completion(refusal, out["verdict"]),
            headers={"X-AEGIS-Verdict": out["verdict"], transparency.HEADER: "false"},
        )
    if out["action"] == "SANITIZED":
        # Soft disposition: redact the sensitive spans, pass the rest through.
        metrics.inc("aegis_sanitized_total")
        content = engine.sanitize(raw)
        _record(clog.make_event(out, actor="api", endpoint=slug))
    else:
        metrics.inc("aegis_allowed_total")

    lang = transparency.resolve_lang(request.headers.get("accept-language"))
    content = transparency.inject(content, lang)
    _record(clog.make_event(schemas.transparency_event(content), actor="api", endpoint=slug))

    if req.stream:
        return StreamingResponse(_stream_text(content), media_type="text/event-stream")
    return JSONResponse(
        _completion(content, out["verdict"]),
        headers={"X-AEGIS-Verdict": out["verdict"], transparency.HEADER: "true"},
    )


# ---- Playground (friendly, full-trace) ----------------------------------

@app.post("/api/chat")
def api_chat(req: schemas.PlaygroundRequest, request: Request):
    metrics.inc("aegis_requests_total")
    events = []

    if not req.guard:
        ep0 = endpoints.get(req.slug) if req.slug else None
        ua0 = _upstream_args(ep0) if ep0 else {"model": None, "base_url": None, "api_key": None}
        raw = llm.complete(
            llm.demo_messages(req.text),
            model=ua0["model"], base_url=ua0["base_url"], api_key=ua0["api_key"],
        )
        return {
            "guard": False, "blocked": False, "input_detection": None, "reply": raw,
            "output_detection": None, "sanitized": False, "transparency": False, "events": [],
        }

    ep = endpoints.get(req.slug) if req.slug else None
    if ep is None:
        return JSONResponse({"error": "unknown or missing endpoint slug"}, status_code=400)
    slug, active, judge_on = ep["slug"], set(ep["rules"]), ep["judge"]

    det = _inspect(req.text, "input", active, judge_on)
    events.append(_record(clog.make_event(det, actor="playground", endpoint=slug)))

    if det["action"] == "BLOCKED":
        metrics.inc("aegis_blocked_total")
        return {
            "guard": True, "blocked": True, "input_detection": det,
            "reply": f"⚠️ Request blocked by AEGIS ({det['verdict']}).",
            "output_detection": None, "sanitized": False, "transparency": False, "events": events,
        }

    ua = _upstream_args(ep)
    raw = llm.complete(
        llm.demo_messages(req.text),
        model=ua["model"],
        base_url=ua["base_url"],
        api_key=ua["api_key"],
    )
    out = _inspect(raw, "output", active, judge_on)
    reply = raw
    sanitized = False
    if out["action"] == "BLOCKED":
        # Hard disposition: withhold the whole response (no partial redaction).
        metrics.inc("aegis_blocked_total")
        events.append(_record(clog.make_event(out, actor="playground", endpoint=slug)))
        return {
            "guard": True, "blocked": True, "input_detection": det,
            "reply": f"⚠️ Response blocked by AEGIS ({out['verdict']}).",
            "output_detection": out, "sanitized": False, "transparency": False, "events": events,
        }
    if out["action"] == "SANITIZED":
        # Soft disposition: redact the sensitive spans, keep the rest.
        metrics.inc("aegis_sanitized_total")
        reply = engine.sanitize(raw)
        sanitized = True
        events.append(_record(clog.make_event(out, actor="playground", endpoint=slug)))
    else:
        metrics.inc("aegis_allowed_total")

    lang = transparency.resolve_lang(request.headers.get("accept-language"))
    reply = transparency.inject(reply, lang)
    events.append(_record(clog.make_event(schemas.transparency_event(reply), actor="playground", endpoint=slug)))

    return {
        "guard": True, "blocked": False, "input_detection": det, "reply": reply,
        "output_detection": out, "sanitized": sanitized, "transparency": True, "events": events,
    }


@app.post("/api/inspect")
def api_inspect(req: schemas.InspectRequest):
    active = endpoints.active_ids(req.endpoint) if req.endpoint else None
    return engine.inspect(req.text, req.direction, active)


# ---- Event feed / audit / compliance ------------------------------------

@app.get("/api/events")
def api_events(since: int = 0, limit: int = 100, endpoint: str = None):
    events = store.recent(limit=limit, since=since)
    if endpoint:
        events = [e for e in events if e.get("endpoint") == endpoint]
    return events


@app.get("/api/audit")
def api_audit(endpoint: str = None):
    return _events(endpoint)


@app.get("/api/audit/export")
def api_export(format: str = "json", endpoint: str = None):
    events = _events(endpoint)
    if format == "csv":
        return PlainTextResponse(
            cexport.to_csv(events), media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=aegis-audit.csv"},
        )
    return PlainTextResponse(
        cexport.to_json(events), media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=aegis-audit.json"},
    )


@app.get("/api/verify")
def api_verify():
    """Tamper-evidence check over the hash-chained audit trail (Art. 12)."""
    try:
        return store.verify()
    except Exception:
        return {"ok": True, "broken_at": None, "count": store.stats().get("total", 0)}


@app.post("/api/_demo/tamper", dependencies=[Depends(security.admin_guard)])
def demo_tamper():
    """Demo only: silently mutate one mid-chain record so the integrity view can
    show the hash chain breaking. Sqlite mode only."""
    if config.use_postgres():
        return {"ok": False, "reason": "demo tamper available in sqlite mode only"}
    import sqlite3

    conn = sqlite3.connect(config.DB_PATH)
    try:
        ids = [r[0] for r in conn.execute("SELECT id FROM aegis_events ORDER BY id").fetchall()]
        if not ids:
            return {"ok": False, "reason": "no events"}
        target = ids[len(ids) // 2]
        conn.execute(
            "UPDATE aegis_events SET ts = '2099-01-01T00:00:00.000000Z' WHERE id = ?",
            (target,),
        )
        conn.commit()
    finally:
        conn.close()
    return {"ok": True, "tampered_id": target, "verify": store.verify()}


@app.post("/api/_demo/reset", dependencies=[Depends(security.admin_guard)])
def demo_reset():
    """Demo only: clear and re-seed the audit trail to a pristine, intact chain."""
    store.clear()
    try:
        from demo.seed import seed
        seed(store)
    except Exception:
        pass
    return {"ok": True, "total": store.stats().get("total", 0)}


@app.get("/api/score")
def api_score(endpoint: str = None):
    return cscore.compute(_events(endpoint))


_AUDIT_ASSISTANT_PROMPT = (
    "You are the AEGIS audit assistant. You answer questions about the security and EU AI Act "
    "compliance log of an LLM guardrail proxy. Use ONLY the AUDIT DATA provided below. If the "
    "answer is not in the data, say you don't have it. Be concise and specific, cite event ids "
    "as #NNN when relevant, and never invent numbers. Answer in short plain-text prose: no "
    "markdown, no bold, no bullet characters."
)


def _audit_context(limit: int = 60) -> str:
    """A compact, grounded snapshot of the audit trail for the assistant."""
    from collections import Counter

    events = store.all()
    by_action = Counter(e.get("action") for e in events)
    by_verdict = Counter(e.get("verdict") for e in events)
    by_article = Counter(e.get("ai_act") for e in events if e.get("ai_act"))
    summary = {
        "total_events": len(events),
        "by_action": dict(by_action),
        "by_verdict": dict(by_verdict),
        "by_ai_act_article": dict(by_article),
        "ai_act_score_percent": cscore.compute(store.all()).get("percent"),
    }
    recent = events[-limit:]
    # Defence in depth: excerpts are already redacted at rest (see make_event),
    # but the assistant forwards them to a possibly third-party LLM (GDPR Arts.
    # 28/44-49), so re-run the redaction here too. It is idempotent, and it also
    # covers any legacy row persisted before redaction was added.
    rows = [
        f"#{e.get('id')} {e.get('ts', '')} actor={e.get('actor')} verdict={e.get('verdict')} "
        f"action={e.get('action')} sev={e.get('severity')} ai_act={e.get('ai_act') or '-'} "
        f"text={engine.sanitize(e.get('excerpt') or '')[:90]!r}"
        for e in recent
    ]
    return (
        "AUDIT DATA\nsummary: " + json.dumps(summary, default=str)
        + f"\n\nrecent events (last {len(recent)}):\n" + "\n".join(rows)
    )


@app.post("/api/audit/chat")
def api_audit_chat(req: schemas.AuditChatRequest):
    """Ask questions about the audit log. The assistant is itself guarded by AEGIS."""
    question = (req.question or "").strip()
    if not question:
        return {"blocked": False, "answer": "Ask me anything about the audit trail."}

    # Dogfooding: the assistant is an LLM app, so it runs behind the guardrail too.
    # Rules only here (not the judge): questions about the log naturally mention
    # "attack", "threat", "blocked" and would otherwise trip the model-based judge.
    det = _inspect(question, "input", active_ids=None, judge_enabled=False)
    if det["action"] == "BLOCKED" and det.get("rule_id") != "llm_judge":
        _record(clog.make_event(det, actor="assistant", endpoint="assistant"))
        verdict = str(det["verdict"]).replace("_", " ")
        return {
            "blocked": True,
            "verdict": det["verdict"],
            "answer": (
                f"That question was blocked by AEGIS ({verdict}). "
                "Even this assistant runs behind the guardrail."
            ),
        }

    try:
        answer = llm.complete(
            [
                {"role": "system", "content": _AUDIT_ASSISTANT_PROMPT + "\n\n" + _audit_context()},
                {"role": "user", "content": question},
            ]
        )
    except Exception:
        answer = "I couldn't reach the model right now. Try again in a moment."
    return {"blocked": False, "verdict": det["verdict"], "answer": answer}


@app.get("/api/frameworks")
def api_frameworks(endpoint: str = None):
    """OWASP LLM Top 10 (2025) coverage (live from an endpoint's armed rules) + ATLAS."""
    active = endpoints.active_ids(endpoint) if endpoint else None
    covered = set(detloader.covered_owasp(active))
    owasp = [{**o, "covered": o["id"] in covered} for o in schemas.OWASP_TOP10]
    return {"owasp": owasp, "mapping": schemas.FRAMEWORKS}


@app.get("/api/detections")
def api_detections():
    """The shared rule library plus whether a real judge model is wired up.

    Per-endpoint judge state lives on the endpoint (see /api/endpoints); here
    `available` only reports that a model exists to run the judge at all.
    """
    return {
        "rules": detloader.list_rules(),
        "judge": {"available": judge.provider_available()},
    }


# ---- endpoints (named guardrail flows over the shared rule library) ------

@app.get("/api/endpoints")
def api_endpoints():
    return {"endpoints": endpoints.list_endpoints()}


@app.post("/api/endpoints", dependencies=[Depends(security.admin_guard)])
def api_endpoints_create(req: schemas.EndpointCreate):
    return endpoints.create(
        name=req.name, slug=req.slug, description=req.description,
        rules=req.rules, judge=req.judge,
        upstream=req.upstream.model_dump() if req.upstream else None,
        board=req.board,
    )


@app.put("/api/endpoints/{slug}", dependencies=[Depends(security.admin_guard)])
def api_endpoints_update(slug: str, req: schemas.EndpointUpdate):
    return endpoints.update(
        slug, name=req.name, description=req.description, rules=req.rules, judge=req.judge,
        upstream=req.upstream.model_dump() if req.upstream else None,
        board=req.board,
    )


@app.delete("/api/endpoints/{slug}", dependencies=[Depends(security.admin_guard)])
def api_endpoints_delete(slug: str):
    return endpoints.delete(slug)


@app.post("/api/endpoints/{slug}/rules/{rule_id}/toggle", dependencies=[Depends(security.admin_guard)])
def api_endpoints_rule_toggle(slug: str, rule_id: str):
    """Arm or disarm a library rule for this endpoint (per-endpoint membership)."""
    return endpoints.toggle_rule(slug, rule_id)


@app.post("/api/endpoints/{slug}/judge/toggle", dependencies=[Depends(security.admin_guard)])
def api_endpoints_judge_toggle(slug: str):
    return endpoints.toggle_judge(slug)


@app.post("/api/detections/judge/toggle", dependencies=[Depends(security.admin_guard)])
def api_detections_judge_toggle():
    """Pause or resume the LLM judge live (the second detection layer)."""
    judge.set_enabled(not judge.is_enabled())
    return {"ok": True, "enabled": judge.is_enabled(), "available": judge.available()}


@app.get("/api/detections/raw")
def api_detections_raw():
    return PlainTextResponse(detloader.raw_yaml(), media_type="text/yaml")


@app.put("/api/detections/raw", dependencies=[Depends(security.admin_guard)])
def api_detections_raw_save(req: schemas.RawRules):
    """Validate and persist an edited rule pack; never applies an invalid pack."""
    return detloader.save_raw(req.text)


@app.post("/api/detections/{rule_id}/toggle", dependencies=[Depends(security.admin_guard)])
def api_detections_toggle(rule_id: str):
    return detloader.toggle(rule_id)


@app.post("/api/detections/test")
def api_detections_test(req: schemas.InspectRequest):
    """Run a prompt against an endpoint's armed rules: which fire and the verdict."""
    ep = endpoints.get(req.endpoint) if req.endpoint else None
    active = set(ep["rules"]) if ep else None
    judge_on = ep["judge"] if ep else None
    return {
        "hits": detloader.run(req.text, req.direction, active),
        "detection": engine.inspect(req.text, req.direction, active, judge_on),
    }


@app.post("/api/benchmark")
def api_benchmark():
    """Run the red-team corpus through the guardrail and report caught vs missed."""
    return benchmark.run_benchmark()


@app.get("/api/assess/questions")
def api_assess_questions():
    return {"questions": aiact.QUESTIONS}


@app.post("/api/assess")
def api_assess(req: schemas.AssessRequest):
    """Classify a deployment under the EU AI Act risk tiers (decision support)."""
    return aiact.classify(req.answers)


def _full_stats(endpoint: str = None) -> dict:
    events = _events(endpoint)
    stats = clog.aggregate_stats(events)
    stats["provider"] = llm.provider_info()
    stats["score"] = cscore.compute(events)
    return stats


@app.get("/api/stats")
def api_stats(endpoint: str = None):
    return _full_stats(endpoint)


@app.get("/api/stream")
async def api_stream(endpoint: str = None):
    """Server-Sent Events fed by the event bus (in-memory or Redis pub/sub).

    With ?endpoint=<slug> the feed and its rolling stats are scoped to that
    endpoint; without it the stream carries every endpoint (the global view).
    """

    def _sse(payload: dict) -> str:
        return "data: " + json.dumps(payload) + "\n\n"

    async def gen():
        yield _sse({"type": "init", "events": _events(endpoint), "stats": _full_stats(endpoint)})
        async for ev in bus.subscribe():
            if ev is None:
                yield ": keepalive\n\n"
                continue
            if endpoint and ev.get("endpoint") != endpoint:
                continue
            yield _sse({"type": "update", "events": [ev], "stats": _full_stats(endpoint)})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@app.get("/api/attacks")
def api_attacks():
    path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "demo", "attacks.json"))
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return []


@app.get("/metrics")
def api_metrics():
    return PlainTextResponse(metrics.render(), media_type="text/plain; version=0.0.4")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mode": config.MODE,
        "provider": llm.provider_info(),
        "auth": config.AUTH_ENABLED,
        "store": "postgres" if config.use_postgres() else "sqlite",
        "bus": "redis" if config.use_redis() else "memory",
    }
