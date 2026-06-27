import { useEffect, useState } from 'react'
import { Panel, Skeleton } from '../components/primitives.jsx'
import StatusBar from '../components/StatusBar.jsx'
import ThreatFeed from '../components/ThreatFeed.jsx'
import ComplianceLedger from '../components/ComplianceLedger.jsx'
import SeverityChart from '../components/SeverityChart.jsx'
import ComplianceCoverage from '../components/ComplianceCoverage.jsx'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState(null)

  useEffect(() => {
    // Real-time push over a single SSE connection (EventSource auto-reconnects).
    const es = new EventSource('/api/stream')
    es.onmessage = (e) => {
      let msg
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      if (msg.type === 'init') {
        setEvents(msg.events)
        setStats(msg.stats)
      } else if (msg.type === 'update') {
        setStats(msg.stats)
        setEvents((prev) => {
          const seen = new Set((prev || []).map((x) => x.id))
          const fresh = msg.events.filter((x) => !seen.has(x.id))
          return [...(prev || []), ...fresh]
        })
      }
    }
    return () => es.close()
  }, [])

  const loading = events === null
  const ev = events ?? []
  const threatCount = ev.filter((e) => e.verdict !== 'SAFE').length

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Operations</h1>
        <p className="page-sub">
          Live guardrail activity and the EU AI Act audit trail. One event does two jobs: a
          security signal on the left, compliance evidence on the right.
        </p>
      </div>

      <StatusBar stats={stats} />

      <div className="grid-2">
        <Panel title="LIVE THREAT FEED" count={threatCount} className="panel--feed">
          {loading ? <Skeleton rows={5} /> : <ThreatFeed events={ev} />}
        </Panel>

        <Panel title="COMPLIANCE LEDGER" className="panel--ledger">
          {loading ? <Skeleton rows={5} /> : <ComplianceLedger events={ev} />}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="SEVERITY DISTRIBUTION">
          <SeverityChart hist={stats?.severity_hist} />
        </Panel>

        <Panel title="AI ACT COVERAGE">
          <ComplianceCoverage score={stats?.score} />
        </Panel>
      </div>
    </div>
  )
}
