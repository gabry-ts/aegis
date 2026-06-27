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
          toast(`Chain verified — ${r.count} blocks intact`, 'success')
        } else {
          setPhase('broken')
          setBrokenAt(r.broken_at ?? null)
          toast(`Integrity broken at block #${r.broken_at}`, 'error')
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

  let banner = null
  if (phase === 'verified') banner = { cls: 'is-ok', text: `CHAIN VERIFIED — ${events.length} BLOCKS INTACT` }
  else if (phase === 'broken')
    banner = {
      cls: 'is-broken',
      text:
        brokenAt != null
          ? `INTEGRITY BROKEN AT BLOCK #${String(brokenAt).padStart(3, '0')}`
          : 'INTEGRITY BROKEN',
    }
  else if (phase === 'verifying') banner = { cls: 'is-busy', text: 'VERIFYING…' }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Integrity</h1>
        <p className="page-sub">
          Every audit record seals the previous one in a SHA-256 hash chain (Art. 12). Verify the
          whole chain, or tamper with a record and watch exactly where it breaks.
        </p>
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
        {banner && <span className={'integrity-banner ' + banner.cls}>{banner.text}</span>}
      </div>

      <HashChain events={events} phase={phase} brokenAt={brokenAt} />
    </div>
  )
}
