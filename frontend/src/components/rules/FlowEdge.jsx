// A living connection. The base path is quiet; a dotted overlay flows along it
// like data on a wire, brighter and faster when the rule is hit or highlighted.
// Pure CSS animation, so prefers-reduced-motion freezes it into a calm dotted line.

import { getSmoothStepPath } from '@xyflow/react'

const SIGNAL = {
  red: 'var(--red)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  iris: 'var(--iris)',
  green: 'var(--green)',
  muted: 'var(--line-2)',
}

export default function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  })
  const color = SIGNAL[data?.color] || SIGNAL.muted
  const cls = [
    'rf-edge',
    'rf-edge--' + (data?.variant || 'rule'),
    data?.hit ? 'is-hit' : '',
    data?.active ? 'is-active' : '',
    data?.enabled === false ? 'is-off' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <g className={cls} style={{ '--ec': color }}>
      <path className="rf-edge__base" d={path} fill="none" />
      <path className="rf-edge__flow" d={path} fill="none" />
    </g>
  )
}

export const edgeTypes = { flow: FlowEdge }
