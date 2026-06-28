import { useEffect, useRef, useState } from 'react'
import { ActionBadge, ArtChip, fmtTime } from './primitives'

const short = (h) => (h ? h.slice(0, 12) : '—')
const FILTERS = ['all', 'BLOCKED', 'SANITIZED', 'ALLOWED', 'LOGGED']
const SEAL_LABEL = { tampered: 'tampered', invalid: 'invalidated', verified: 'verified', sealed: 'sealed' }
const PAGE = 10

export default function HashChain({ events, phase, brokenAt, endpoint = null }) {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const brokenRef = useRef(null)

  // Scope the listed records to an endpoint when asked; the chain itself stays
  // global, so integrity is always verified across every record.
  const scoped = endpoint ? events.filter((e) => e.endpoint === endpoint) : events
  // newest record first — the convention for a log you actually read
  const ordered = [...scoped].sort((a, b) => b.id - a.id)
  const rows = filter === 'all' ? ordered : ordered.filter((e) => e.action === filter)

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pageCount - 1)
  const start = cur * PAGE
  const pageRows = rows.slice(start, start + PAGE)

  const statusOf = (e) => {
    if (phase === 'broken' && brokenAt != null) {
      if (e.id === brokenAt) return 'tampered'
      if (e.id > brokenAt) return 'invalid' // sealed after the break — no longer matches
      return 'sealed'
    }
    if (phase === 'verified') return 'verified'
    return 'sealed'
  }

  const pickFilter = (f) => {
    setFilter(f)
    setPage(0)
  }

  // reset to the first page when the endpoint scope changes
  useEffect(() => {
    setPage(0)
  }, [endpoint])

  // when the chain breaks, jump to the page holding the tampered record and centre it
  useEffect(() => {
    if (brokenAt == null) return
    setFilter('all')
    const list = endpoint ? events.filter((e) => e.endpoint === endpoint) : events
    const idx = [...list].sort((a, b) => b.id - a.id).findIndex((e) => e.id === brokenAt)
    if (idx >= 0) setPage(Math.floor(idx / PAGE))
    const t = setTimeout(() => {
      brokenRef.current?.scrollIntoView({ behavior: 'auto', block: 'center' })
    }, 160)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokenAt])

  return (
    <div className="audit-table">
      <div className="audit-filters">
        <span className="audit-filters__count mono">
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </span>
        <div className="audit-filters__chips">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={'audit-filter' + (filter === f ? ' is-on' : '')}
              onClick={() => pickFilter(f)}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="audit-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Actor</th>
              <th>Verdict</th>
              <th>Action</th>
              <th>AI Act</th>
              <th>Hash</th>
              <th>Sealed</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e) => {
              const st = statusOf(e)
              return (
                <tr
                  key={e.id}
                  ref={e.id === brokenAt ? brokenRef : null}
                  className={'audit-row is-' + st}
                >
                  <td className="mono">#{String(e.id).padStart(3, '0')}</td>
                  <td className="mono c-muted">{fmtTime(e.ts)}</td>
                  <td>{e.actor}</td>
                  <td className="mono">{String(e.verdict || '').replace(/_/g, ' ')}</td>
                  <td>
                    <ActionBadge action={e.action} />
                  </td>
                  <td>{e.ai_act ? <ArtChip article={e.ai_act} /> : <span className="c-faint">—</span>}</td>
                  <td className="mono c-muted">{short(e.hash)}…</td>
                  <td>
                    <span className={'seal-tag seal-tag--' + st}>
                      <span className="seal-tag__dot" />
                      {SEAL_LABEL[st]}
                    </span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan="8" className="audit-empty c-muted">
                  No {filter.toLowerCase()} records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="audit-pager">
          <span className="audit-pager__info mono">
            {start + 1}–{Math.min(start + PAGE, rows.length)} of {rows.length}
          </span>
          <button
            type="button"
            className="audit-pager__btn"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={cur === 0}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="audit-pager__page mono">
            {cur + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="audit-pager__btn"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={cur >= pageCount - 1}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
