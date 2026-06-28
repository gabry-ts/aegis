import { useEffect, useState } from 'react'
import { getAttacks } from '../api'
import AttackConsole from '../components/AttackConsole'
import EndpointSwitcher from '../components/EndpointSwitcher'
import { useEndpoints } from '../context/EndpointsContext'

export default function Playground() {
  const { endpoints, current, setCurrent } = useEndpoints()
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
          Probe a guardrail endpoint live. Pick the flow to attack, then turn protection off to
          watch the unprotected model leak its secret, and on to see that endpoint block the attack
          and write the evidence to the audit trail.
        </p>
      </div>

      <div className="rules-epbar">
        <EndpointSwitcher
          endpoints={endpoints}
          value={current}
          onChange={(s) => s && setCurrent(s)}
          label="Attacking"
        />
      </div>

      <AttackConsole attacks={attacks} slug={current} />
    </div>
  )
}
