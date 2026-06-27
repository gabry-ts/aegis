import { useEffect, useState } from 'react'
import { getAttacks } from '../api.js'
import AttackConsole from '../components/AttackConsole.jsx'

export default function Playground() {
  const [attacks, setAttacks] = useState([])

  useEffect(() => {
    getAttacks()
      .then((a) => setAttacks(Array.isArray(a) ? a : []))
      .catch(() => setAttacks([]))
  }, [])

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">Attack Playground</h1>
        <p className="page-sub">
          Probe the guardrail live. Turn protection off to watch the unprotected model leak its
          secret, then on to see AEGIS block the attack and write the evidence to the audit trail.
        </p>
      </div>

      <AttackConsole attacks={attacks} />
    </div>
  )
}
