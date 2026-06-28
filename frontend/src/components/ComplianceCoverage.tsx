import type { ScoreResponse } from '../types'

export default function ComplianceCoverage({ score }: { score?: ScoreResponse }) {
  const articles = score?.articles ?? []
  const percent = score?.percent ?? 0
  const total = articles.reduce((s, a) => s + (a.evidence || 0), 0)
  const R = 30
  const C = 2 * Math.PI * R

  return (
    <div className="coverage">
      <div className="coverage__meter">
        <div className="coverage__ring">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={R} className="ring-track" />
            <circle
              cx="36"
              cy="36"
              r={R}
              className="ring-fill"
              style={{ strokeDasharray: C, strokeDashoffset: C * (1 - percent / 100) }}
            />
          </svg>
          <span className="coverage__pct">{score?.score ?? '0/3'}</span>
        </div>
        <span className="coverage__sub mono" title="audit records backing the coverage">
          {total} on record
        </span>
      </div>

      <ul className="articles">
        {articles.map((a) => (
          <li className={'article' + (a.covered ? ' is-covered' : '')} key={a.id}>
            <span className="article__check">{a.covered ? '✓' : '○'}</span>
            <span className="article__id">{a.id}</span>
            <span className="article__label">{a.label}</span>
            <span className="article__evid" title="events on record">
              {a.evidence}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
