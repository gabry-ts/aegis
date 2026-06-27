import { useEffect, useState } from 'react'
import { getFrameworks, runBenchmark } from '../api.js'
import { Panel } from '../components/primitives.jsx'
import { toast } from '../toast.js'

export default function Benchmark() {
  const [owasp, setOwasp] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getFrameworks()
      .then((d) => setOwasp(d.owasp || []))
      .catch(() => {})
  }, [])

  const run = async () => {
    setBusy(true)
    try {
      const r = await runBenchmark()
      setResult(r)
      toast(`Benchmark complete — ${r.summary.score}% of attacks caught`, 'success')
    } catch {
      toast('Benchmark failed', 'error')
    }
    setBusy(false)
  }

  const s = result?.summary

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Benchmark</h1>
        <p className="page-sub">
          AEGIS detections mapped to the OWASP LLM Top 10 (2025) and MITRE ATLAS. Run the red-team
          corpus to measure how much the guardrail actually catches, with no inflated scores.
        </p>
      </div>

      <div className="grid-2">
        <Panel title="OWASP LLM TOP 10 — COVERAGE">
          <ul className="owasp-list">
            {owasp.map((o) => (
              <li key={o.id} className={'owasp-row' + (o.covered ? ' is-covered' : '')}>
                <span className="owasp-row__check">{o.covered ? '✓' : '·'}</span>
                <span className="owasp-row__id mono">{o.id}</span>
                <span className="owasp-row__name">{o.name}</span>
                <span className="owasp-row__atlas mono">{o.atlas.join('  ')}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="RED-TEAM BENCHMARK"
          actions={
            <button className="btn btn--primary" onClick={run} disabled={busy}>
              {busy ? 'Running…' : 'Run benchmark'}
            </button>
          }
        >
          {!s ? (
            <div className="bench-empty">
              Fire the corpus of known attacks at the guardrail and score what it stops.
            </div>
          ) : (
            <div className="bench-result">
              <div className="bench-score">
                <span className="bench-score__num">
                  {s.score}
                  <small>%</small>
                </span>
                <span className="bench-score__lbl">attacks caught</span>
              </div>
              <div className="bench-stats">
                <div>
                  <b className="c-green">{s.caught}</b>/{s.attacks} caught
                </div>
                <div>
                  <b className="c-red">{s.missed}</b> missed
                </div>
                <div>
                  <b>{s.false_positives}</b>/{s.safe_total} false positives
                </div>
              </div>
              <div className="bench-bars">
                {result.by_owasp.map((b) => (
                  <div className="bench-bar" key={b.owasp_id}>
                    <span className="bench-bar__lbl mono">{b.owasp_id}</span>
                    <span className="bench-bar__track">
                      <span
                        className="bench-bar__fill"
                        style={{ width: `${Math.round((100 * b.caught) / b.total)}%` }}
                      />
                    </span>
                    <span className="bench-bar__n mono">
                      {b.caught}/{b.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {result && (
        <Panel title="RESULTS">
          <div className="ledger__scroll">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Payload</th>
                  <th>Expected</th>
                  <th>OWASP</th>
                  <th>ATLAS</th>
                  <th>Verdict</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => {
                  const ok = r.expected === 'BENIGN' ? !r.caught : r.caught
                  const word =
                    r.expected === 'BENIGN'
                      ? r.caught
                        ? 'FALSE POS'
                        : 'PASS'
                      : r.caught
                        ? 'CAUGHT'
                        : 'MISSED'
                  return (
                    <tr key={r.id}>
                      <td className="mono bench-payload">{r.text}</td>
                      <td className="mono c-muted">{r.expected}</td>
                      <td className="mono">{r.owasp_id || '—'}</td>
                      <td className="mono c-muted">{r.atlas_id || '—'}</td>
                      <td className="mono">{r.verdict.replace(/_/g, ' ')}</td>
                      <td className={'mono ' + (ok ? 'c-green' : 'c-red')}>{word}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}
