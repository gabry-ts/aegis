// Shared presentational primitives and the verdict/severity color vocabulary.

export const ACTION_COLOR = {
  BLOCKED: 'red',
  SANITIZED: 'amber',
  ALLOWED: 'green',
  LOGGED: 'blue',
}

export function sevColor(n) {
  if (n >= 5) return 'red'
  if (n >= 4) return 'orange'
  if (n >= 3) return 'amber'
  if (n >= 1) return 'blue'
  return 'faint'
}

export function fmtTime(ts) {
  if (!ts) return '--:--:--'
  try {
    return new Date(ts).toLocaleTimeString('it-IT', { hour12: false })
  } catch {
    return ts
  }
}

export function Sev({ value = 0 }) {
  const c = sevColor(value)
  return (
    <span className="sev" title={`severity ${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={'sev__dot' + (i <= value ? ` is-on c-bg-${c} c-${c}` : '')}
        />
      ))}
    </span>
  )
}

export function VerdictBadge({ verdict }) {
  const safe = verdict === 'SAFE'
  return (
    <span className={'verdict' + (safe ? ' verdict--safe' : '')}>
      {String(verdict).replace(/_/g, ' ')}
    </span>
  )
}

export function ActionBadge({ action }) {
  const c = ACTION_COLOR[action] || 'muted'
  return <span className={`action-badge action-badge--${c}`}>{action}</span>
}

export function ArtChip({ article }) {
  if (!article) return null
  return (
    <span className="art-chip" title="EU AI Act mapping">
      ⬡ {article}
    </span>
  )
}

export function Panel({ title, count, actions, children, className = '' }) {
  return (
    <section className={'panel ' + className}>
      <header className="panel__head">
        <h2 className="panel__title">
          {title}
          {count != null && <i className="panel__count">{count}</i>}
        </h2>
        {actions}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}

export function EmptyState({ title, text }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        ⬡
      </span>
      <div className="empty__title">{title}</div>
      <p className="empty__text">{text}</p>
    </div>
  )
}

export function Skeleton({ rows = 4 }) {
  return (
    <div className="skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-row" key={i} />
      ))}
    </div>
  )
}
