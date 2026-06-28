import { useEffect, useRef, useState } from 'react'
import type { StatsResponse } from '../types'

function useCountUp(value: number, duration = 600): number {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const rafRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return display
}

function Metric({ label, value, c }: { label: string; value?: number; c: string }) {
  const n = useCountUp(value ?? 0)
  return (
    <div className="statusbar__item">
      <span className={'metric-value ' + c}>{n}</span>
      <span className="metric-label">{label}</span>
    </div>
  )
}

export default function StatusBar({ stats }: { stats: StatsResponse | null }) {
  const isRegolo = stats?.provider?.regolo
  const mode = isRegolo ? 'Regolo AI' : 'Mock · offline'
  const model = stats?.provider?.model ?? '—'

  return (
    <div className="statusbar">
      <div className="statusbar__provider">
        <span className="live-dot" />
        <div>
          <div className="statusbar__mode">{mode}</div>
          <div className="statusbar__model mono">{model}</div>
        </div>
      </div>
      <div className="statusbar__metrics">
        <Metric label="Requests" value={stats?.total} c="" />
        <Metric label="Blocked" value={stats?.blocked} c="c-red" />
        <Metric label="Sanitized" value={stats?.sanitized} c="c-amber" />
        <Metric label="Allowed" value={stats?.allowed} c="c-green" />
      </div>
    </div>
  )
}
