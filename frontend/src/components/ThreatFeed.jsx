import { ArtChip, EmptyState, Sev, VerdictBadge, ActionBadge, fmtTime } from './primitives.jsx'

export default function ThreatFeed({ events }) {
  const threats = events.filter((e) => e.verdict !== 'SAFE').slice(-40).reverse()

  if (!threats.length) {
    return (
      <EmptyState
        title="No threats detected"
        text="Send an attack from the Playground and it surfaces here in real time."
      />
    )
  }

  return (
    <ul className="feed">
      {threats.map((e) => (
        <li className="feed-row" key={e.id}>
          <time className="feed-row__time">{fmtTime(e.ts)}</time>
          <div className="feed-row__main">
            <div className="row gap-8 wrap">
              <VerdictBadge verdict={e.verdict} />
              <Sev value={e.severity} />
              <ArtChip article={e.ai_act} />
            </div>
            <p className="feed-row__excerpt" title={e.excerpt}>
              {e.excerpt}
            </p>
          </div>
          <ActionBadge action={e.action} />
        </li>
      ))}
    </ul>
  )
}
