import { useEffect, useState } from 'react'
import { demoReset, demoTamper, getAudit, verify as apiVerify } from '../api.js'
import HashChain from '../components/HashChain.jsx'
import { toast } from '../toast.js'

export default function Integrity() {
  const [events, setEvents] = useState([])
  const [phase, setPhase] = useState('idle')
  const [brokenAt, setBrokenAt] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      setEvents(await getAudit())
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    load()
  }, [])

  const runVerify = async () => {
    setBusy(true)
    setPhase('verifying')
    setBrokenAt(null)
    try {
      const r = await apiVerify()
      setTimeout(() => {
        if (r.ok) {
          setPhase('verified')
          setBrokenAt(null)
          toast(`Chain verified — ${r.count} records intact`, 'success')
        } else {
          setPhase('broken')
          setBrokenAt(r.broken_at ?? null)
          toast(`Integrity broken at record #${r.broken_at}`, 'error')
        }
        setBusy(false)
      }, 240)
    } catch {
      setBusy(false)
      setPhase('idle')
    }
  }

  const runTamper = async () => {
    setBusy(true)
    try {
      await demoTamper()
      await load()
      const r = await apiVerify()
      setPhase('broken')
      setBrokenAt(r.broken_at ?? null)
      toast('Record tampered — chain broken', 'error')
    } catch {
      /* ignore */
    }
    setBusy(false)
  }

  const runReset = async () => {
    setBusy(true)
    setPhase('idle')
    setBrokenAt(null)
    try {
      await demoReset()
      await load()
      toast('Chain reset to a clean state', 'success')
    } catch {
      /* ignore */
    }
    setBusy(false)
  }

  const broken = phase === 'broken'
  const verifying = phase === 'verifying'
  const heroState = broken ? 'is-broken' : verifying ? 'is-busy' : 'is-ok'

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Audit integrity</h1>
        <p className="page-sub">
          The tamper-evident record behind every compliance claim — required by the EU AI Act,
          Art. 12.
        </p>
      </div>

      <div className={'integrity-hero ' + heroState}>
        <span className="integrity-hero__badge" aria-hidden="true">
          {broken ? (
            <svg viewBox="0 0 24 24">
              <path d="M12 3l9 16H3z" />
              <path d="M12 10v4M12 17v.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M6 11h12v8H6zM8.5 11V8a3.5 3.5 0 017 0v3" />
            </svg>
          )}
        </span>
        <div className="integrity-hero__body">
          <div className="integrity-hero__title">
            {broken
              ? `Tampering detected — the chain broke at record #${String(brokenAt).padStart(3, '0')}`
              : verifying
                ? 'Re-hashing every record…'
                : `${events.length} records sealed · chain intact`}
          </div>
          <p className="integrity-hero__text">
            {broken
              ? `Record #${String(brokenAt).padStart(3, '0')} was altered, so its hash no longer matches — and every record after it is now invalid. There is no way to hide it.`
              : 'Each record is locked to the one before it with a SHA-256 hash, like a blockchain. Change any single record and every record after it stops matching — so this log cannot be quietly edited.'}
          </p>
        </div>
        <span className="integrity-hero__state mono">
          {broken ? '✕ BROKEN' : verifying ? '…' : '✓ INTACT'}
        </span>
      </div>

      <div className="integrity-bar">
        <button className="btn btn--primary" onClick={runVerify} disabled={busy}>
          Verify integrity
        </button>
        <button className="btn btn--blue" onClick={runTamper} disabled={busy}>
          Simulate tampering
        </button>
        <button className="btn btn--ghost" onClick={runReset} disabled={busy}>
          Reset chain
        </button>
        <span className="integrity-hint">
          Tamper with a record, then watch the chain break exactly where it was touched.
        </span>
      </div>

      <HashChain events={events} phase={phase} brokenAt={brokenAt} />
    </div>
  )
}
