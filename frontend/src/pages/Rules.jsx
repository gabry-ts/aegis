import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDetections, saveDetectionsRaw, testDetection, toggleJudge } from '../api.js'
import RuleCanvas from '../components/rules/RuleCanvas.jsx'
import RuleInspector from '../components/rules/RuleInspector.jsx'
import { blankRule, rulesToYaml } from '../components/rules/rulesYaml.js'
import { toast } from '../toast.js'

export default function Rules() {
  const [rules, setRules] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState(null)
  const [testText, setTestText] = useState('')
  const [testRes, setTestRes] = useState(null)
  const [testing, setTesting] = useState(false)
  const [hitIds, setHitIds] = useState(() => new Set())
  const [judge, setJudge] = useState({ enabled: false, available: false })

  const load = useCallback(async () => {
    try {
      const d = await getDetections()
      setRules(d.rules || [])
      setJudge(d.judge || { enabled: false, available: false })
      setDirty(false)
    } catch {
      /* keep last */
    }
  }, [])

  const onToggleJudge = useCallback(async () => {
    try {
      const r = await toggleJudge()
      setJudge({ enabled: r.enabled, available: r.available })
      toast(`LLM judge ${r.enabled ? 'resumed' : 'paused'}`, r.enabled ? 'success' : 'info')
    } catch {
      toast('Could not toggle the judge', 'error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectedRule = useMemo(
    () => rules.find((r) => r.id === selectedId) || null,
    [rules, selectedId],
  )

  const onToggle = useCallback((id) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
    setDirty(true)
  }, [])

  const onChangeRule = useCallback((id, p) => {
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
    setDirty(true)
  }, [])

  const onAdd = useCallback(() => {
    setRules((rs) => {
      const r = blankRule(rs.map((x) => x.id))
      setSelectedId(r.id)
      return [...rs, r]
    })
    setDirty(true)
  }, [])

  const onDelete = useCallback((id) => {
    setRules((rs) => rs.filter((r) => r.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
    setDirty(true)
  }, [])

  const onSave = async () => {
    setBusy(true)
    setSaveState(null)
    try {
      const r = await saveDetectionsRaw(rulesToYaml(rules))
      if (r.ok) {
        await load()
        setSaveState({ ok: true })
        toast('Rule pack saved & reloaded', 'success')
      } else {
        setSaveState({ ok: false, error: r.error })
        toast(r.error || 'Invalid rule pack', 'error')
      }
    } catch {
      setSaveState({ ok: false, error: 'request failed' })
      toast('Request failed', 'error')
    }
    setBusy(false)
  }

  const onTest = async () => {
    if (!testText.trim() || testing) return
    setTesting(true)
    try {
      const r = await testDetection(testText)
      setHitIds(new Set((r.hits || []).map((h) => h.id)))
      setTestRes(r.detection)
    } catch {
      /* ignore */
    } finally {
      setTesting(false)
    }
  }

  const clearTest = () => {
    setTestText('')
    setTestRes(null)
    setHitIds(new Set())
  }

  return (
    <div className="page page--canvas">
      <div className="page__head">
        <h1 className="page-title">Detection Rules</h1>
        <p className="page-sub">
          The guardrail as a board. Each block is a detector wired to the stage where it runs:
          drag to arrange, toggle to arm, click to edit. Every change is validated before it
          touches the live engine.
        </p>
      </div>

      <div className="rules-toolbar">
        <div className="rules-test">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onTest()}
            placeholder="Test a prompt against the board…"
          />
          <button
            type="button"
            className="btn"
            onClick={onTest}
            disabled={!testText.trim() || testing}
          >
            {testing ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Testing…
              </>
            ) : (
              'Test'
            )}
          </button>
          {testRes && !testing && (
            <span className="rules-test__res">
              <b className={'mono ' + (testRes.verdict === 'SAFE' ? 'c-green' : 'c-red')}>
                {String(testRes.verdict).replace(/_/g, ' ')}
              </b>
              <span className="c-faint mono small">
                {testRes.verdict === 'SAFE'
                  ? '· no rule fired'
                  : hitIds.size > 0
                    ? `· ${hitIds.size} rule${hitIds.size > 1 ? 's' : ''}`
                    : '· caught by LLM judge'}
              </span>
              <button type="button" className="rules-test__clear" onClick={clearTest}>
                clear
              </button>
            </span>
          )}
        </div>

        <div className="rules-actions">
          {saveState && !dirty && (
            <span className={'rule-save ' + (saveState.ok ? 'is-ok' : 'is-err')}>
              {saveState.ok ? 'saved · reloaded' : saveState.error}
            </span>
          )}
          {dirty && <span className="rules-dirty">unsaved changes</span>}
          <button type="button" className="btn btn--ghost" onClick={onAdd}>
            + Add rule
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSave}
            disabled={busy || !dirty}
          >
            {busy ? 'Validating…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="rules-workspace">
        <RuleCanvas
          rules={rules}
          hitIds={hitIds}
          selectedId={selectedId}
          judge={judge}
          onSelect={setSelectedId}
          onToggle={onToggle}
          onToggleJudge={onToggleJudge}
        />
        {selectedRule && (
          <RuleInspector
            rule={selectedRule}
            onChange={onChangeRule}
            onDelete={onDelete}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
