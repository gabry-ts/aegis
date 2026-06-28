import { ActionBadge, ArtChip, fmtTime } from './primitives'
import { exportUrl } from '../api'
import { toast } from '../toast'
import type { AuditEvent } from '../types'

export default function ComplianceLedger({ events }: { events: AuditEvent[] }) {
  const rows = [...events].slice(-60).reverse()

  return (
    <div className="ledger">
      <div className="ledger__scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Verdict</th>
              <th>Action</th>
              <th>AI Act</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="mono c-muted">{fmtTime(e.ts)}</td>
                <td className="mono">{e.actor}</td>
                <td className="mono">{String(e.verdict).replace(/_/g, ' ')}</td>
                <td>
                  <ActionBadge action={e.action} />
                </td>
                <td>
                  {e.ai_act ? <ArtChip article={e.ai_act} /> : <span className="c-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="export-row">
        <span className="c-muted mono small">Art. 12 record · {events.length} events</span>
        <span className="row gap-8">
          <a
            className="btn btn--ghost"
            href={exportUrl('json')}
            download
            onClick={() => toast('Audit exported (JSON)', 'success')}
          >
            Export JSON
          </a>
          <a
            className="btn btn--blue"
            href={exportUrl('csv')}
            download
            onClick={() => toast('Audit exported (CSV)', 'success')}
          >
            Export CSV
          </a>
        </span>
      </div>
    </div>
  )
}
