// Right-hand editor for the selected detector node. Every change is pushed up
// as a patch; the parent owns the rule list and the dirty flag.

import { SURFACES, ACTIONS, DETECTORS, VERDICTS } from './rulesYaml'
import type { ReactNode } from 'react'
import type { Rule, RuleAction, RuleDetector, RuleMapping, Surface } from '../../types'

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="insp-field">
      <span className="insp-field__label">{label}</span>
      {children}
      {hint && <span className="insp-field__hint">{hint}</span>}
    </label>
  )
}

export default function RuleInspector({
  rule,
  onChange,
  onDelete,
  onClose,
}: {
  rule: Rule | null
  onChange: (id: string, patch: Partial<Rule>) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  if (!rule) return null
  const patch = (p: Partial<Rule>) => onChange(rule.id, p)
  const setMapping = (k: keyof RuleMapping, v: string) =>
    patch({ mapping: { ...rule.mapping, [k]: v } })

  return (
    <aside className="inspector">
      <header className="inspector__head">
        <span className="inspector__eyebrow mono">DETECTOR</span>
        <button type="button" className="inspector__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="inspector__body">
        <p className="insp-note insp-note--shared">
          This rule lives in the shared library. Editing or deleting it affects every
          endpoint that arms it; use the board toggle to arm or disarm it for this endpoint only.
        </p>

        <Field label="Name">
          <input
            type="text"
            value={rule.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </Field>

        <Field label="Verdict" hint="Threat class reported when this rule fires">
          <input
            type="text"
            list="verdict-options"
            className="mono"
            value={rule.verdict}
            onChange={(e) => patch({ verdict: e.target.value.toUpperCase() })}
          />
          <datalist id="verdict-options">
            {VERDICTS.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>

        <div className="insp-grid">
          <Field label="Surface">
            <select value={rule.surface} onChange={(e) => patch({ surface: e.target.value as Surface })}>
              {SURFACES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action">
            <select value={rule.action} onChange={(e) => patch({ action: e.target.value as RuleAction })}>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Severity">
          <div className="insp-sev">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={'insp-sev__btn' + (n <= rule.severity ? ' is-on' : '')}
                onClick={() => patch({ severity: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Detector">
          <select value={rule.detector} onChange={(e) => patch({ detector: e.target.value as RuleDetector })}>
            {DETECTORS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>

        {rule.detector === 'regex' && (
          <Field label="Patterns" hint="One regex per line">
            <textarea
              className="mono"
              rows={6}
              value={(rule.patterns || []).join('\n')}
              onChange={(e) => patch({ patterns: e.target.value.split('\n') })}
              spellCheck={false}
            />
          </Field>
        )}

        {rule.detector === 'keyword' && (
          <Field label="Keywords" hint="One phrase per line, matched case-insensitively">
            <textarea
              className="mono"
              rows={6}
              value={(rule.keywords || []).join('\n')}
              onChange={(e) => patch({ keywords: e.target.value.split('\n') })}
              spellCheck={false}
            />
          </Field>
        )}

        {(rule.detector === 'secret' || rule.detector === 'pii') && (
          <p className="insp-note">
            The <b>{rule.detector}</b> detector is built in and needs no patterns. It scans the{' '}
            {rule.surface} for {rule.detector === 'secret' ? 'the configured secret' : 'personal data'}.
          </p>
        )}

        <div className="insp-grid insp-grid--3">
          <Field label="OWASP">
            <input
              type="text"
              className="mono"
              placeholder="LLM01:2025"
              value={rule.mapping?.owasp || ''}
              onChange={(e) => setMapping('owasp', e.target.value)}
            />
          </Field>
          <Field label="ATLAS">
            <input
              type="text"
              className="mono"
              placeholder="AML.T0051"
              value={rule.mapping?.atlas || ''}
              onChange={(e) => setMapping('atlas', e.target.value)}
            />
          </Field>
          <Field label="AI Act">
            <input
              type="text"
              className="mono"
              placeholder="Art.15(5)"
              value={rule.mapping?.ai_act || ''}
              onChange={(e) => setMapping('ai_act', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <footer className="inspector__foot">
        <button
          type="button"
          className="btn btn--ghost insp-delete"
          onClick={() => onDelete(rule.id)}
          title="Remove this rule from the shared library (affects all endpoints)"
        >
          Delete from library
        </button>
      </footer>
    </aside>
  )
}
