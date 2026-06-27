import { useState } from 'react'
import { chat } from '../api.js'
import LiveFire from './LiveFire.jsx'

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
        <LiveFire res={res} guard={guard} loading={loading} prompt={text} />
      </section>
    </div>
  )
}
