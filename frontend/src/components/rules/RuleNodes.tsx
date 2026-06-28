// Custom React Flow nodes: the fixed pipeline stages (StageNode) and the
// draggable detector blocks that hang off them (RuleNode).

import { Handle, Position } from '@xyflow/react'
import { Sev, ArtChip } from '../primitives'
import { ACTION_COLOR } from './rulesYaml'

const STAGE_ICON = {
  prompt: <path d="M5 6l4 4-4 4M11 15h5" />,
  shield: <path d="M10 3l6 2.5V10c0 4.2-6 7-6 7s-6-2.8-6-7V5.5L10 3z" />,
  chip: <path d="M6.5 6.5h7v7h-7zM10 3v3.5M10 13.5V17M3 10h3.5M13.5 10H17" />,
  scan: (
    <>
      <circle cx="9" cy="9" r="4.4" />
      <path d="M12.4 12.4L17 17" />
    </>
  ),
  ledger: <path d="M4.5 5h11M4.5 10h11M4.5 15h7" />,
}

export function StageNode({ data }) {
  const { title, sub, icon, surface } = data
  return (
    <div className={'rf-stage' + (surface ? ' rf-stage--anchor' : '')}>
      <Handle type="target" position={Position.Left} id="l" />
      <span className="rf-stage__icon">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          {STAGE_ICON[icon]}
        </svg>
      </span>
      <div className="rf-stage__text">
        <div className="rf-stage__title">{title}</div>
        <div className="rf-stage__sub mono">{sub}</div>
      </div>
      <Handle type="source" position={Position.Right} id="r" />
      {surface && <Handle type="source" position={Position.Bottom} id="b" />}
    </div>
  )
}

// The LLM judge: the model-based second opinion, as its own armable block.
export function JudgeNode({ data }) {
  const { judge, onToggle } = data
  const on = !!judge?.enabled
  return (
    <div className={'rf-judge-node ' + (on ? 'is-on' : 'is-off')}>
      <Handle type="target" position={Position.Top} id="t" />
      <div className="rf-judge-node__head">
        <span className="rf-judge-node__icon">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />
          </svg>
        </span>
        <div className="rf-judge-node__title">LLM judge</div>
        <button
          type="button"
          className={'rf-toggle nodrag' + (on ? ' is-on' : '')}
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          aria-pressed={on}
          title={on ? 'Active — click to pause' : 'Paused — click to resume'}
        >
          <span className="rf-toggle__dot" />
        </button>
      </div>
      <div className="rf-judge-node__sub mono">second opinion · model-based</div>
      <div className="rf-judge-node__tag mono">
        {on ? 'catches what the rules miss' : 'paused'}
      </div>
    </div>
  )
}

export function RuleNode({ data }) {
  const { rule, hit, selected, onToggle } = data
  const color = ACTION_COLOR[rule.action] || 'muted'
  const cls = [
    'rf-rule',
    `rf-rule--${color}`,
    rule.enabled ? '' : 'is-off',
    selected ? 'is-selected' : '',
    hit ? 'is-hit' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <Handle type="target" position={Position.Top} id="t" />
      <div className="rf-rule__head">
        <span className="rf-rule__name">{rule.name}</span>
        <button
          type="button"
          className={'rf-toggle nodrag' + (rule.enabled ? ' is-on' : '')}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(rule.id)
          }}
          aria-pressed={rule.enabled}
          title={rule.enabled ? 'Enabled' : 'Disabled'}
        >
          <span className="rf-toggle__dot" />
        </button>
      </div>

      <div className="rf-rule__meta">
        <span className={'rf-tag rf-tag--' + color}>{rule.action}</span>
        <span className="rf-rule__det mono">{rule.detector}</span>
        <Sev value={rule.severity} />
      </div>

      <div className="rf-rule__foot">
        <span className="rf-rule__verdict mono">{String(rule.verdict).replace(/_/g, ' ')}</span>
        {rule.mapping?.ai_act && <ArtChip article={rule.mapping.ai_act} />}
      </div>

      {hit && <span className="rf-rule__match">MATCH</span>}
    </div>
  )
}

export const nodeTypes = { stage: StageNode, rule: RuleNode, judge: JudgeNode }
