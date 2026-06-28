// Accessible fallback for the detection board on small screens: the same rules
// as a plain keyboard- and touch-operable list (the React Flow canvas is
// pointer-and-zoom only, unusable on a phone or by keyboard).

import { ACTION_COLOR } from './rulesYaml'
import type { Rule } from '../../types'

export default function RuleList({
  rules,
  hitIds,
  selectedId,
  onToggle,
  onSelect,
}: {
  rules: Rule[]
  hitIds: Set<string>
  selectedId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <ul className="rule-mlist">
      {rules.map((r) => {
        const color = ACTION_COLOR[r.action] || 'muted'
        const cls =
          'rule-mrow' +
          (r.enabled ? '' : ' is-off') +
          (selectedId === r.id ? ' is-sel' : '') +
          (hitIds.has(r.id) ? ' is-hit' : '')
        return (
          <li key={r.id} className={cls}>
            <button
              type="button"
              className={'rule-mtoggle' + (r.enabled ? ' is-on' : '')}
              onClick={() => onToggle(r.id)}
              aria-pressed={r.enabled}
              aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
            >
              <span className="rule-mtoggle__dot" />
            </button>
            <button type="button" className="rule-mmain" onClick={() => onSelect(r.id)}>
              <span className="rule-mrow__top">
                <span className="rule-mname">{r.name}</span>
                <span className={'rf-tag rf-tag--' + color}>{r.action}</span>
              </span>
              <span className="rule-mrow__meta mono">
                {String(r.verdict).replace(/_/g, ' ')} · {r.detector}
                {r.mapping?.ai_act ? ' · ' + r.mapping.ai_act : ''}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
