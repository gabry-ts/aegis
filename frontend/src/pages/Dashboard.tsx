import { useEffect, useState } from 'react'
import { Panel, Skeleton } from '../components/primitives'
import StatusBar from '../components/StatusBar'
import ThreatFeed from '../components/ThreatFeed'
import ComplianceLedger from '../components/ComplianceLedger'
import SeverityChart from '../components/SeverityChart'
import ComplianceCoverage from '../components/ComplianceCoverage'
import EndpointSwitcher from '../components/EndpointSwitcher'
import { useEndpoints } from '../context/EndpointsContext'
import { streamUrl } from '../api'
import type { AuditEvent, StatsResponse, StreamMessage } from '../types'

export default function Dashboard() {
  const { endpoints } = useEndpoints()
  const [filter, setFilter] = useState<string | null>(null) // null = all endpoints
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [events, setEvents] = useState<AuditEvent[] | null>(null)

  useEffect(() => {
    // Real-time push over a single SSE connection, scoped to the selected
    // endpoint (or all of them). Reconnects whenever the filter changes.
    setEvents(null)
    setStats(null)
    const es = new EventSource(streamUrl(filter))
    es.onmessage = (e) => {
      let msg: StreamMessage
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
  }, [filter])

  const loading = events === null
  const ev = events ?? []
  const threatCount = ev.filter((e) => e.verdict !== 'SAFE').length

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Operations</h1>
        <p className="page-sub">
          Every request is inspected, hostile ones are blocked, and each one is sealed into a
          tamper-evident audit trail. One event does two jobs: a live security signal on the
          left, EU AI Act evidence on the right.
        </p>
      </div>

      <div className="rules-epbar">
        <EndpointSwitcher
          endpoints={endpoints}
          value={filter}
          onChange={setFilter}
          allowAll
          label="View"
        />
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
