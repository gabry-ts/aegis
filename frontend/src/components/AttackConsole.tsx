import { useEffect, useRef, useState } from 'react'
import { chat } from '../api'
import LiveFire from './LiveFire'
import type { Attack, ChatResponse, ColorToken } from '../types'

const KIND_COLOR: Record<string, ColorToken> = {
  PROMPT_INJECTION: 'amber',
  JAILBREAK: 'amber',
  DATA_EXFILTRATION: 'red',
  PII: 'red',
  SAFE: 'green',
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface PlayInfo {
  i: number
  total: number
  label: string
}

export default function AttackConsole({
  attacks,
  slug,
}: {
  attacks: Attack[]
  slug?: string | null
}) {
  const [text, setText] = useState('')
  const [guard, setGuard] = useState(true)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<ChatResponse | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playInfo, setPlayInfo] = useState<PlayInfo | null>(null)

  const runIdRef = useRef(0)
  const playingRef = useRef(false)
  const attacksRef = useRef<Attack[]>([])
  attacksRef.current = attacks
  // Read the live slug inside async loops so a mid-play endpoint switch lands.
  const slugRef = useRef<string | null | undefined>(slug)
  slugRef.current = slug

  useEffect(
    () => () => {
      playingRef.current = false
      runIdRef.current += 1
    },
    [],
  )

  // Fire one prompt and surface the real trace, ignoring stale runs.
  const fire = async (txt: string, g: boolean, myId: number): Promise<ChatResponse | null> => {
    setLoading(true)
    setRes(null)
    let r: ChatResponse
    try {
      r = await chat(txt, g, slugRef.current)
    } catch {
      r = { error: true }
    }
    if (runIdRef.current !== myId) return null
    setRes(r)
    setLoading(false)
    return r
  }

  const stopPlay = () => {
    playingRef.current = false
    setPlaying(false)
    setPlayInfo(null)
  }

  const send = async () => {
    if (!text.trim() || loading) return
    stopPlay()
    const myId = (runIdRef.current += 1)
    await fire(text, guard, myId)
  }

  // Hands-free showcase: walk the attack deck, letting each cascade play out.
  async function autoLoop() {
    let i = 0
    while (playingRef.current) {
      const list = attacksRef.current
      if (!list.length) {
        await sleep(400)
        continue
      }
      const a = list[i % list.length]
      const myId = (runIdRef.current += 1)
      setPlayInfo({ i: (i % list.length) + 1, total: list.length, label: a.label })
      setText(a.text)
      setGuard(true)
      await fire(a.text, true, myId)
      if (!playingRef.current || runIdRef.current !== myId) break
      await sleep(4200)
      i += 1
    }
  }

  const togglePlay = () => {
    if (playingRef.current) {
      playingRef.current = false
      setPlaying(false)
      setPlayInfo(null)
      runIdRef.current += 1
      setLoading(false)
    } else {
      playingRef.current = true
      setPlaying(true)
      autoLoop()
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
              onClick={() => {
                stopPlay()
                setText(a.text)
              }}
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

          <div className="console__buttons">
            <button
              type="button"
              className={'btn ' + (playing ? 'btn--blue' : 'btn--ghost')}
              onClick={togglePlay}
              title="Cycle the attack deck hands-free"
            >
              {playing ? '❚❚ Pause demo' : '▶ Auto-play'}
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
        </div>

        {playing && playInfo && (
          <p className="console__playinfo mono">
            ▶ Auto-play · {playInfo.i}/{playInfo.total} · {playInfo.label}
            <span className="c-muted"> · protection forced on</span>
          </p>
        )}

        {!guard && (
          <p className="console__warn">
            Protection disabled — the raw model response is returned unfiltered.
          </p>
        )}
      </section>

      <section className="result">
        <LiveFire res={res} loading={loading} />
      </section>
    </div>
  )
}
