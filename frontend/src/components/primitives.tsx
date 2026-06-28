// Shared presentational primitives and the verdict/severity color vocabulary.

import type { ReactNode } from 'react'
import type { ActionKind, ColorToken, Verdict } from '../types'

export const ACTION_COLOR: Record<ActionKind, ColorToken> = {
  BLOCKED: 'red',
  SANITIZED: 'amber',
  ALLOWED: 'green',
  LOGGED: 'blue',
}

export function sevColor(n: number): ColorToken {
  if (n >= 5) return 'red'
  if (n >= 4) return 'orange'
  if (n >= 3) return 'amber'
  if (n >= 1) return 'blue'
  return 'faint'
}

export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '--:--:--'
  try {
    return new Date(ts).toLocaleTimeString('it-IT', { hour12: false })
  } catch {
    return ts
  }
}

export function Sev({ value = 0 }: { value?: number }) {
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

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const safe = verdict === 'SAFE'
  return (
    <span className={'verdict' + (safe ? ' verdict--safe' : '')}>
      {String(verdict).replace(/_/g, ' ')}
    </span>
  )
}

export function ActionBadge({ action }: { action: ActionKind }) {
  const c = ACTION_COLOR[action] || 'muted'
  return <span className={`action-badge action-badge--${c}`}>{action}</span>
}

export function ArtChip({ article }: { article?: string | null }) {
  if (!article) return null
  return (
    <span className="art-chip" title="EU AI Act mapping">
      ⬡ {article}
    </span>
  )
}

export function Panel({
  title,
  count,
  actions,
  children,
  className = '',
}: {
  title: ReactNode
  count?: number | null
  actions?: ReactNode
  children?: ReactNode
  className?: string
}) {
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

export function EmptyState({ title, text }: { title: ReactNode; text: ReactNode }) {
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

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-row" key={i} />
      ))}
    </div>
  )
}
