import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getDetections,
  saveDetectionsRaw,
  testDetection,
  updateEndpoint,
  createEndpoint,
  deleteEndpoint,
} from '../api.js'
import { useEndpoints } from '../context/EndpointsContext.jsx'
import EndpointSwitcher from '../components/EndpointSwitcher.jsx'
import RuleCanvas from '../components/rules/RuleCanvas.jsx'
import RuleList from '../components/rules/RuleList.jsx'
import RuleInspector from '../components/rules/RuleInspector.jsx'
import { blankRule, rulesToYaml } from '../components/rules/rulesYaml.js'
import { toast } from '../toast.js'

function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

export default function Rules() {
  const { endpoints, current, setCurrent, refresh: refreshEndpoints } = useEndpoints()

  // The shared rule library (definitions, editable) and, separately, which of
  // those rules are armed for the selected endpoint plus its judge flag.
  const [library, setLibrary] = useState([])
  const [armed, setArmed] = useState(() => new Set())
  const [judge, setJudge] = useState(false)
  const [judgeAvailable, setJudgeAvailable] = useState(false)

  const [selectedId, setSelectedId] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState(null)
  const [testText, setTestText] = useState('')
  const [testRes, setTestRes] = useState(null)
  const [testing, setTesting] = useState(false)
  const [hitIds, setHitIds] = useState(() => new Set())
  const [resetKey, setResetKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const narrow = useNarrow()
  const loadedSlugRef = useRef(null)

  const currentEp = useMemo(
    () => endpoints.find((e) => e.slug === current) || null,
    [endpoints, current],
  )

  const loadLibrary = useCallback(async () => {
    try {
      const d = await getDetections()
      setLibrary(d.rules || [])
      setJudgeAvailable(!!d.judge?.available)
    } catch {
      /* keep last */
    }
  }, [])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // Pull armed rules + judge from the endpoint whenever the selection changes.
  useEffect(() => {
    if (!currentEp || loadedSlugRef.current === currentEp.slug) return
    loadedSlugRef.current = currentEp.slug
    setArmed(new Set(currentEp.rules || []))
    setJudge(!!currentEp.judge)
    setDirty(false)
    setSaveState(null)
    setSelectedId(null)
  }, [currentEp])

  useEffect(() => {
    setConfirmDel(false)
  }, [current])

  const selectedRule = useMemo(
    () => library.find((r) => r.id === selectedId) || null,
    [library, selectedId],
  )

  // What the board renders: library definitions with `enabled` standing in for
  // "armed for this endpoint", so the canvas dims and wires them accordingly.
  const boardRules = useMemo(
    () => library.map((r) => ({ ...r, enabled: armed.has(r.id) })),
    [library, armed],
  )

  const onToggle = useCallback((id) => {
    setArmed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDirty(true)
  }, [])

  const onToggleJudge = useCallback(() => {
    setJudge((j) => !j)
    setDirty(true)
  }, [])

  const onChangeRule = useCallback((id, p) => {
    setLibrary((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
    setDirty(true)
  }, [])

  const onAdd = useCallback(() => {
    setLibrary((rs) => {
      const r = blankRule(rs.map((x) => x.id))
      setSelectedId(r.id)
      setArmed((prev) => new Set(prev).add(r.id))
      return [...rs, r]
    })
    setDirty(true)
  }, [])

  const onDelete = useCallback((id) => {
    setLibrary((rs) => rs.filter((r) => r.id !== id))
    setArmed((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setSelectedId((cur) => (cur === id ? null : cur))
    setDirty(true)
  }, [])

  const onSave = async () => {
    if (!current) return
    setBusy(true)
    setSaveState(null)
    try {
      // Save the shared library first so any brand-new rule ids exist before we
      // pin them as this endpoint's armed set.
      const r = await saveDetectionsRaw(rulesToYaml(library))
      if (!r.ok) {
        setSaveState({ ok: false, error: r.error })
        toast(r.error || 'Invalid rule pack', 'error')
        return
      }
      const u = await updateEndpoint(current, { rules: [...armed], judge })
      if (!u.ok) {
        setSaveState({ ok: false, error: u.error })
        toast(u.error || 'Could not save endpoint', 'error')
        return
      }
      await loadLibrary()
      await refreshEndpoints()
      setDirty(false)
      setSaveState({ ok: true })
      toast('Endpoint saved & reloaded', 'success')
    } catch {
      setSaveState({ ok: false, error: 'request failed' })
      toast('Request failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (slug) => {
    if (!slug || slug === current) return
    if (dirty) toast('Unsaved changes discarded', 'info')
    loadedSlugRef.current = null
    setCurrent(slug)
  }

  const onCreate = async () => {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const r = await createEndpoint({ name })
      if (r.ok) {
        await refreshEndpoints()
        loadedSlugRef.current = null
        setCurrent(r.endpoint.slug)
        setCreating(false)
        setNewName('')
        toast(`Endpoint “${r.endpoint.name}” created`, 'success')
      } else {
        toast(r.error || 'Could not create endpoint', 'error')
      }
    } catch {
      toast('Request failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteEndpoint = async () => {
    if (!current || endpoints.length <= 1) return
    if (!confirmDel) {
      setConfirmDel(true)
      return
    }
    setBusy(true)
    try {
      const r = await deleteEndpoint(current)
      if (r.ok) {
        const remaining = endpoints.filter((e) => e.slug !== current)
        await refreshEndpoints()
        loadedSlugRef.current = null
        setCurrent(remaining[0]?.slug || null)
        toast('Endpoint deleted', 'info')
      } else {
        toast(r.error || 'Could not delete', 'error')
      }
    } catch {
      toast('Request failed', 'error')
    } finally {
      setConfirmDel(false)
      setBusy(false)
    }
  }

  const onTest = async () => {
    if (!testText.trim() || testing) return
    setTesting(true)
    try {
      const r = await testDetection(testText, 'input', current)
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
          The guardrail as a board, one flow per endpoint. Arm rules from the shared library or add
          new ones; the toggles and the judge apply to the selected endpoint only. Editing a rule's
          definition changes it for every endpoint that arms it.
        </p>
      </div>

      <div className="rules-epbar">
        <EndpointSwitcher
          endpoints={endpoints}
          value={current}
          onChange={switchTo}
          label="Endpoint"
        />
        {currentEp && (
          <span className="rules-epbar__meta c-faint small mono">
            {armed.size} rule{armed.size === 1 ? '' : 's'} armed{judge ? ' · judge on' : ''}
          </span>
        )}
        <div className="rules-epbar__spacer" />
        {creating ? (
          <span className="rules-epnew">
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              placeholder="New endpoint name…"
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={onCreate}
              disabled={busy || !newName.trim()}
            >
              Create
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setCreating(true)}>
            + New endpoint
          </button>
        )}
        <button
          type="button"
          className={'btn btn--ghost rules-epdel' + (confirmDel ? ' is-confirm' : '')}
          onClick={onDeleteEndpoint}
          disabled={busy || endpoints.length <= 1}
          title={
            endpoints.length <= 1 ? 'At least one endpoint is required' : 'Delete this endpoint'
          }
        >
          {confirmDel ? 'Confirm delete' : 'Delete'}
        </button>
      </div>

      <div className="rules-toolbar">
        <div className="rules-test">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onTest()}
            placeholder="Test a prompt against this endpoint…"
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
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setResetKey((k) => k + 1)
              toast('Board layout reset', 'info')
            }}
            title="Restore the default tidy arrangement"
          >
            Reset layout
          </button>
          <button type="button" className="btn btn--ghost" onClick={onAdd}>
            + Add rule
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSave}
            disabled={busy || !dirty}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="rules-workspace">
        {narrow ? (
          <RuleList
            rules={boardRules}
            hitIds={hitIds}
            selectedId={selectedId}
            onToggle={onToggle}
            onSelect={setSelectedId}
          />
        ) : (
          <RuleCanvas
            rules={boardRules}
            hitIds={hitIds}
            selectedId={selectedId}
            judge={{ enabled: judge, available: judgeAvailable }}
            resetKey={resetKey}
            onSelect={setSelectedId}
            onToggle={onToggle}
            onToggleJudge={onToggleJudge}
          />
        )}
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
