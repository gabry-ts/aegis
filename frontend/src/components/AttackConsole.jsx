import { useState } from 'react'
import { chat } from '../api.js'
import { ActionBadge, ArtChip, Sev, VerdictBadge } from './primitives.jsx'

const KIND_COLOR = {
  PROMPT_INJECTION: 'amber',
  JAILBREAK: 'amber',
  DATA_EXFILTRATION: 'red',
  PII: 'red',
  SAFE: 'green',
}

export default function AttackConsole({ attacks }) {
  const [text, setText] = useState('')
  const [guard, setGuard] = useState(true)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState(null)

  const send = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setRes(null)
    try {
      setRes(await chat(text, guard))
    } catch {
      setRes({ error: true })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="console-layout">
      <section className="console">
        <div className="console__quick">
          {attacks.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`quick-chip quick-chip--${KIND_COLOR[a.kind] || 'muted'}`}
              onClick={() => setText(a.text)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <textarea
          className="console__field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a prompt, or pick an attack above…  (⌘/Ctrl + Enter to send)"
          rows={4}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send()
          }}
        />

        <div className="console__actions">
          <button
            type="button"
            className={'toggle' + (guard ? ' toggle--on' : '')}
            onClick={() => setGuard((g) => !g)}
            aria-pressed={guard}
          >
            <span className="toggle__track">
              <span className="toggle__knob" />
            </span>
            <span className="toggle__label">AEGIS {guard ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={send}
            disabled={loading || !text.trim()}
          >
            {loading ? 'Inspecting…' : 'Send prompt'}
          </button>
        </div>

        {!guard && (
          <p className="console__warn">
            Protection disabled — the raw model response is returned unfiltered.
          </p>
        )}
      </section>

      <section className="result">
        {!res && (
          <div className="result__hint">
            <div className="result-diagram">
              {['input', 'model', 'output', 'audit'].map((n, i) => (
                <span key={n} style={{ display: 'contents' }}>
                  {i > 0 && <span className="result-diagram__arrow">→</span>}
                  <span className="result-diagram__node">
                    <b />
                    {n}
                  </span>
                </span>
              ))}
            </div>
            <p>
              Send a prompt and the input verdict, model reply, output scan and logged
              audit events surface here in real time.
            </p>
          </div>
        )}
        {res?.error && (
          <div className="verdict-card verdict-card--blocked">
            <span className="vc__tag">REQUEST FAILED</span>
            <span className="vc__text">Is the AEGIS backend running on :8000?</span>
          </div>
        )}
        {res && !res.error && <ConsoleResult res={res} />}
      </section>
    </div>
  )
}

function ConsoleResult({ res }) {
  if (!res.guard) {
    const leaked = /AEGIS-|FLAG|secret|password/i.test(res.reply || '')
    return (
      <div className="stack-12">
        <div className="verdict-card verdict-card--unprotected">
          <span className="vc__tag">UNPROTECTED</span>
          <span className="vc__text">
            No guardrail in front of the model. It answered directly
            {leaked ? ' and exposed confidential data.' : '.'}
          </span>
        </div>
        <div className="reply reply--leak">{res.reply}</div>
      </div>
    )
  }

  const di = res.input_detection

  if (res.blocked) {
    return (
      <div className="stack-12">
        <div className="verdict-card verdict-card--blocked">
          <span className="vc__tag">BLOCKED</span>
          <div className="vc__body">
            <div className="row gap-8 wrap">
              <VerdictBadge verdict={di.verdict} />
              <Sev value={di.severity} />
              <ArtChip article={di.ai_act} />
            </div>
            <p className="vc__expl">{di.explanation}</p>
            {di.matched?.length > 0 && (
              <p className="vc__matched mono">matched: {di.matched.join(', ')}</p>
            )}
          </div>
        </div>
        <div className="reply reply--blocked">{res.reply}</div>
        <EventsMini events={res.events} />
      </div>
    )
  }

  const out = res.output_detection
  return (
    <div className="stack-12">
      <div className="verdict-card verdict-card--allowed">
        <span className="vc__tag">INPUT PASSED</span>
        <div className="row gap-8 wrap">
          <VerdictBadge verdict={di.verdict} />
          <Sev value={di.severity} />
        </div>
      </div>
      <div className="reply">{res.reply}</div>
      <div className={'scan-line scan-line--' + (res.sanitized ? 'amber' : 'green')}>
        {res.sanitized ? (
          <>
            Output scan caught a leak → <b>sanitized</b> (
            {String(out?.verdict || '').replace(/_/g, ' ')}). <ArtChip article={out?.ai_act} />
          </>
        ) : (
          <>
            Output scan clean. AI disclosure injected. <ArtChip article="Art.50" />
          </>
        )}
      </div>
      <EventsMini events={res.events} />
    </div>
  )
}

function EventsMini({ events = [] }) {
  if (!events.length) return null
  return (
    <div className="events-mini">
      <span className="events-mini__label">logged → audit</span>
      {events.map((e) => (
        <span className="events-mini__chip" key={e.id}>
          <ActionBadge action={e.action} /> {e.ai_act || e.verdict}
        </span>
      ))}
    </div>
  )
}
