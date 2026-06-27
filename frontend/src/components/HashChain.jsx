import { ACTION_COLOR } from './primitives.jsx'

const short = (h) => (h ? h.slice(0, 10) : '—')

export default function HashChain({ events, phase, brokenAt }) {
  const brokenIndex = brokenAt != null ? events.findIndex((e) => e.id === brokenAt) : -1
  const animating = phase === 'verified' || phase === 'broken'

  const stateFor = (i) => {
    if (!animating) return ''
    if (phase === 'verified') return 'is-ok'
    if (brokenIndex === -1) return 'is-ok'
    if (i < brokenIndex) return 'is-ok'
    if (i === brokenIndex) return 'is-broken'
    return 'is-stale'
  }

  return (
    <div className="chain">
      {events.map((e, i) => (
        <div
          key={e.id}
          className={'chain-block ' + stateFor(i)}
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
        </div>
      ))}
    </div>
  )
}
