import { useEffect, useRef } from 'react'
import { ACTION_COLOR } from './primitives.jsx'

const short = (h) => (h ? h.slice(0, 10) : '—')

const SEAL_LABEL = {
  'is-broken': 'hash mismatch',
  'is-stale': 'chain broken above',
}

export default function HashChain({ events, phase, brokenAt }) {
  const brokenIndex = brokenAt != null ? events.findIndex((e) => e.id === brokenAt) : -1
  const brokenRef = useRef(null)

  // When a break appears, bring it into view — otherwise it's lost in the wall.
  useEffect(() => {
    if (brokenAt == null) return
    const t = setTimeout(() => {
      brokenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 140)
    return () => clearTimeout(t)
  }, [brokenAt])

  const animating = phase === 'verified' || phase === 'broken'

  const stateFor = (i) => {
    if (phase === 'broken' && brokenIndex !== -1) {
      if (i < brokenIndex) return 'is-ok'
      if (i === brokenIndex) return 'is-broken'
      return 'is-stale'
    }
    if (phase === 'verified') return 'is-ok'
    return 'is-sealed'
  }

  return (
    <>
      <div className="chain-caption mono">
        {events.length} sealed records · oldest first · each one locked to the previous by its hash
      </div>
      <div className="chain">
        {events.map((e, i) => {
          const st = stateFor(i)
          return (
            <div
              key={e.id}
              ref={e.id === brokenAt ? brokenRef : null}
              className={'chain-block ' + st}
              style={{ transitionDelay: animating ? `${Math.min(i, 60) * 28}ms` : '0ms' }}
            >
              <div className="chain-block__head">
                <span className="chain-block__id">#{String(e.id).padStart(3, '0')}</span>
                <span className={'action-badge action-badge--' + (ACTION_COLOR[e.action] || 'muted')}>
                  {e.action}
                </span>
              </div>
              <div className="chain-block__hash">
                <span className="chain-block__k">prev</span>
                {short(e.prev_hash)}
              </div>
              <div className="chain-block__hash is-self">
                <span className="chain-block__k">hash</span>
                {short(e.hash)}
              </div>
              <div className="chain-block__seal">
                <span className="chain-block__lock" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="M4 7.5h8v5.5H4zM5.6 7.5V5.6a2.4 2.4 0 014.8 0v1.9" />
                  </svg>
                </span>
                {SEAL_LABEL[st] || 'sealed'}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
