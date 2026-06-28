import { useEffect, useState } from 'react'
import { assess, getAssessQuestions } from '../api'
import { toast } from '../toast'

const TIER_COLOR = { prohibited: 'red', high_risk: 'amber', limited: 'blue', minimal: 'green' }
const AEGIS_LABEL = { yes: 'AEGIS ✓', partial: 'AEGIS partial', no: 'out of scope', na: '—' }

export default function Assessment() {
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getAssessQuestions()
      .then((d) => {
        const qs = d.questions || []
        setQuestions(qs)
        const init = {}
        qs.forEach((q) => {
          init[q.id] = q.options[0]?.value
        })
        setAnswers(init)
      })
      .catch(() => {})
  }, [])

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }))

  const run = async () => {
    setBusy(true)
    try {
      const r = await assess(answers)
      setResult(r)
      toast(`Classified: ${r.tier_label}`, 'info')
    } catch {
      toast('Assessment failed', 'error')
    }
    setBusy(false)
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page-title">AI Act Assessment</h1>
        <p className="page-sub">
          Classify your deployment under the EU AI Act risk tiers, see which obligations apply, and
          which ones AEGIS already helps satisfy. Decision support, not legal advice.
        </p>
      </div>

      <div className="assess-layout">
        <div className="assess-form">
          {questions.map((q) => (
            <div className="assess-q" key={q.id}>
              <div className="assess-q__label">{q.label}</div>
              <div className="assess-q__opts">
                {q.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={'assess-opt' + (answers[q.id] === o.value ? ' is-sel' : '')}
                    onClick={() => set(q.id, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="btn btn--primary" onClick={run} disabled={busy}>
            {busy ? 'Classifying…' : 'Classify'}
          </button>
        </div>

        <div className="assess-result">
          {!result ? (
            <div className="result__hint">
              Answer the questions and classify to see the risk tier and the obligations that apply.
            </div>
          ) : (
            <>
              <div className={'tier-card tier-card--' + (TIER_COLOR[result.tier] || 'muted')}>
                <span className="tier-card__lbl">RISK TIER</span>
                <span className="tier-card__tier">{result.tier_label}</span>
                <p className="tier-card__rationale">{result.rationale}</p>
                {result.tier !== 'prohibited' && result.tier !== 'minimal' && (
                  <span className="tier-card__cov mono">
                    AEGIS addresses {result.aegis_addressable} of {result.obligations_total}{' '}
                    obligations ({result.aegis_covered} fully)
                  </span>
                )}
              </div>
              <ul className="oblig-list">
                {result.obligations.map((o, i) => (
                  <li className="oblig" key={i}>
                    <span className="oblig__art mono">{o.article}</span>
                    <span className="oblig__label">{o.label}</span>
                    <span className={'oblig__aegis aegis--' + o.aegis}>
                      {AEGIS_LABEL[o.aegis] || o.aegis}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
