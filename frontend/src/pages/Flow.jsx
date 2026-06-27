import { useEffect, useRef, useState } from 'react'
import { chat, getAttacks } from '../api.js'
import FlowGraph from '../components/FlowGraph.jsx'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VERDICT_COLOR = {
  BLOCKED: 'red',
  SANITIZED: 'amber',
  ALLOWED: 'green',
  running: 'blue',
  error: 'red',
}

const KIND_COLOR = {
  PROMPT_INJECTION: 'amber',
  JAILBREAK: 'amber',
  DATA_EXFILTRATION: 'red',
  PII: 'red',
  SAFE: 'green',
}

const idleNodes = () => ['idle', 'idle', 'idle', 'idle', 'idle', 'idle']
const dimConns = () => ['dim', 'dim', 'dim', 'dim', 'dim']

export default function Flow() {
  const [attacks, setAttacks] = useState([])
  const [nodeStates, setNodeStates] = useState(idleNodes)
  const [connectors, setConnectors] = useState(dimConns)
  const [packet, setPacket] = useState({ index: 0, color: 'amber', visible: false })
  const [auditArc, setAuditArc] = useState(null)
  const [current, setCurrent] = useState(null)
  const [playing, setPlaying] = useState(false)

  const runIdRef = useRef(0)
  const playingRef = useRef(false)
  const attacksRef = useRef([])

  useEffect(() => {
    getAttacks()
      .then((a) => {
        const list = Array.isArray(a) ? a : []
        setAttacks(list)
        attacksRef.current = list
      })
      .catch(() => {})
    return () => {
      playingRef.current = false
      runIdRef.current += 1
    }
  }, [])

  const reset = () => {
    setNodeStates(idleNodes())
    setConnectors(dimConns())
    setAuditArc(null)
    setPacket({ index: 0, color: 'amber', visible: false })
  }

  async function animate(result, myId) {
    const alive = () => runIdRef.current === myId
    const setNode = (i, s) =>
      setNodeStates((prev) => {
        const n = [...prev]
        n[i] = s
        return n
      })
    const setConn = (i, s) =>
      setConnectors((prev) => {
        const n = [...prev]
        n[i] = s
        return n
      })

    reset()
    await sleep(80)
    if (!alive()) return

    setPacket({ index: 0, color: 'amber', visible: true })
    setNode(0, 'active')
    await sleep(420)
    if (!alive()) return
    setNode(0, 'pass')

    setConn(0, 'green')
    setPacket((p) => ({ ...p, index: 1 }))
    setNode(1, 'active')
    await sleep(560)
    if (!alive()) return

    if (result.blocked) {
      setNode(1, 'block')
      setPacket((p) => ({ ...p, color: 'red' }))
      await sleep(480)
      if (!alive()) return
      setAuditArc({ from: 1, color: 'red' })
      setNode(5, 'log')
      return
    }
    setNode(1, 'pass')

    setConn(1, 'green')
    setPacket((p) => ({ ...p, index: 2 }))
    setNode(2, 'active')
    await sleep(560)
    if (!alive()) return
    setNode(2, 'pass')

    setConn(2, 'green')
    setPacket((p) => ({ ...p, index: 3 }))
    setNode(3, 'active')
    await sleep(560)
    if (!alive()) return
    if (result.sanitized) {
      setNode(3, 'warn')
      setAuditArc({ from: 3, color: 'amber' })
      await sleep(320)
      if (!alive()) return
    } else {
      setNode(3, 'pass')
    }

    setConn(3, 'green')
    setPacket((p) => ({ ...p, index: 4 }))
    setNode(4, 'active')
    await sleep(440)
    if (!alive()) return
    setNode(4, 'pass')

    setConn(4, 'green')
    setPacket((p) => ({ ...p, index: 5 }))
    setNode(5, 'active')
    await sleep(440)
    if (!alive()) return
    setNode(5, 'log')
  }

  async function runOne(attack) {
    const myId = (runIdRef.current += 1)
    setCurrent({ label: attack.label, text: attack.text, status: 'running' })
    let result
    try {
      result = await chat(attack.text, true)
    } catch {
      result = null
    }
    if (runIdRef.current !== myId) return
    if (!result) {
      setCurrent((c) => ({ ...(c || {}), status: 'error' }))
      return
    }
    const verdict = result.blocked ? 'BLOCKED' : result.sanitized ? 'SANITIZED' : 'ALLOWED'
    setCurrent({ label: attack.label, text: attack.text, status: verdict })
    await animate(result, myId)
  }

  async function autoLoop() {
    let i = 0
    while (playingRef.current) {
      const list = attacksRef.current
      if (!list.length) {
        await sleep(500)
        continue
      }
      await runOne(list[i % list.length])
      if (!playingRef.current) break
      await sleep(1700)
      i += 1
    }
  }

  const togglePlay = () => {
    if (playingRef.current) {
      playingRef.current = false
      setPlaying(false)
      runIdRef.current += 1
    } else {
      playingRef.current = true
      setPlaying(true)
      autoLoop()
    }
  }

  const runManual = (attack) => {
    playingRef.current = false
    setPlaying(false)
    runOne(attack)
  }

  const statusColor = current ? VERDICT_COLOR[current.status] || 'blue' : 'blue'

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Pipeline</h1>
        <p className="page-sub">
          Every request travels this path. Watch where AEGIS stops it: an attack lights the route
          and halts in red at the node that catches it, while the audit trail records the evidence.
        </p>
      </div>

      <FlowGraph
        nodeStates={nodeStates}
        connectors={connectors}
        packet={packet}
        auditArc={auditArc}
      />

      <div className="flow-status">
        <button
          type="button"
          className={'btn ' + (playing ? 'btn--ghost' : 'btn--primary') + ' play-btn'}
          onClick={togglePlay}
        >
          {playing ? '❚❚ Pause demo' : '▶ Auto-play demo'}
        </button>
        {current ? (
          <>
            <span className={`action-badge action-badge--${statusColor}`}>
              {current.status === 'running' ? 'INSPECTING' : current.status}
            </span>
            <span className="flow-status__prompt" title={current.text}>
              {current.label} — {current.text}
            </span>
          </>
        ) : (
          <span className="flow-status__prompt c-faint">
            Press play, or pick an attack below to send one through.
          </span>
        )}
      </div>

      <div className="flow-controls">
        {attacks.map((a, i) => (
          <button
            key={i}
            type="button"
            className={`quick-chip quick-chip--${KIND_COLOR[a.kind] || 'muted'}`}
            onClick={() => runManual(a)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="flow-legend">
        <span>
          <i className="c-bg-green" /> passed
        </span>
        <span>
          <i className="c-bg-amber" /> sanitized
        </span>
        <span>
          <i className="c-bg-red" /> blocked
        </span>
        <span>
          <i className="c-bg-blue" /> logged to audit
        </span>
      </div>
    </div>
  )
}
