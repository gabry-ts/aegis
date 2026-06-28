import { useEffect, useRef, useState } from 'react'
import { auditChat } from '../api'
import type { Verdict } from '../types'

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  blocked?: boolean
  verdict?: Verdict
  error?: boolean
}

const SUGGESTIONS = [
  'How many attacks did we block?',
  "What's the most common threat?",
  'Which AI Act articles do I have evidence for?',
  'Summarize the latest activity.',
]

export default function Assistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [messages, busy])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = async (q?: string) => {
    const question = (q ?? input).trim()
    if (!question || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setBusy(true)
    try {
      const r = await auditChat(question)
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: r.answer, blocked: r.blocked, verdict: r.verdict },
      ])
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'I could not reach the assistant right now.', error: true },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={'assistant-fab' + (open ? ' is-open' : '')}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close audit assistant' : 'Open audit assistant'}
      >
        {open ? (
          '✕'
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />
          </svg>
        )}
      </button>

      {open && (
        <section className="assistant" role="dialog" aria-label="Audit assistant">
          <header className="assistant__head">
            <div className="assistant__head-row">
              <div className="assistant__title">
                <span className="assistant__dot" />
                Audit assistant
              </div>
              <button
                type="button"
                className="assistant__new"
                onClick={() => {
                  setMessages([])
                  setInput('')
                }}
                disabled={messages.length === 0 && !input}
                title="Start a new chat"
              >
                ↺ New chat
              </button>
            </div>
            <div className="assistant__sub mono">grounded on your log · guarded by AEGIS</div>
          </header>

          <div className="assistant__body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="assistant__empty">
                <p>Ask anything about your security and EU AI Act compliance log.</p>
                <div className="assistant__chips">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="assistant__chip"
                      onClick={() => send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  'amsg amsg--' +
                  m.role +
                  (m.blocked ? ' amsg--blocked' : '') +
                  (m.error ? ' amsg--error' : '')
                }
              >
                {m.role === 'assistant' && m.blocked && (
                  <span className="amsg__tag">
                    BLOCKED · {String(m.verdict).replace(/_/g, ' ')}
                  </span>
                )}
                <div className="amsg__text">{m.text}</div>
              </div>
            ))}

            {busy && (
              <div className="amsg amsg--assistant">
                <div className="amsg__typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <form
            className="assistant__input"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the audit log…"
            />
            <button type="submit" className="btn btn--primary" disabled={busy || !input.trim()}>
              Ask
            </button>
          </form>
        </section>
      )}
    </>
  )
}
