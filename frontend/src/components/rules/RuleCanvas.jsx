// The block editor. Renders the pipeline backbone plus one draggable detector
// node per rule, wired to the stage it runs at. Node positions persist to
// localStorage so a rearranged board survives reloads.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ReactFlow, Background, BackgroundVariant, Controls, useNodesState } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './RuleNodes.jsx'
import {
  STAGES,
  stagePosition,
  judgePosition,
  defaultRulePosition,
  ACTION_COLOR,
} from './rulesYaml.js'

const POS_KEY = 'aegis.rules.positions.v1'
const SIGNAL = {
  red: 'var(--red)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  muted: 'var(--line-2)',
}

const loadPositions = () => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY)) || {}
  } catch {
    return {}
  }
}
const savePositions = (p) => {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable — positions just won't persist */
  }
}

const anchorOf = (surface) => (surface === 'output' ? 'output_scan' : 'input_detection')

function buildNodes(rules, positions, hitIds, selectedId, onToggle, judge, onToggleJudge) {
  const stages = STAGES.map((s) => ({
    id: `stage:${s.id}`,
    type: 'stage',
    position: stagePosition(s.id),
    data: { ...s },
    draggable: false,
    selectable: false,
    deletable: false,
  }))

  const judgeNode = {
    id: 'judge',
    type: 'judge',
    position: positions.__judge || judgePosition(),
    data: { judge, onToggle: onToggleJudge },
    deletable: false,
  }

  const order = { input: 0, output: 0 }
  const ruleNodes = rules.map((rule) => {
    const i = order[rule.surface] ?? order.input
    order[rule.surface] = i + 1
    return {
      id: `rule:${rule.id}`,
      type: 'rule',
      position: positions[rule.id] || defaultRulePosition(rule.surface, i),
      data: {
        rule,
        hit: hitIds.has(rule.id),
        selected: selectedId === rule.id,
        onToggle,
      },
      deletable: false,
    }
  })

  return [...stages, judgeNode, ...ruleNodes]
}

function buildEdges(rules, hitIds, judge) {
  const edges = []
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges.push({
      id: `spine:${i}`,
      source: `stage:${STAGES[i].id}`,
      target: `stage:${STAGES[i + 1].id}`,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'smoothstep',
      style: { stroke: 'var(--line-2)', strokeWidth: 2 },
    })
  }
  for (const rule of rules) {
    const color = ACTION_COLOR[rule.action] || 'muted'
    const hit = hitIds.has(rule.id)
    edges.push({
      id: `re:${rule.id}`,
      source: `stage:${anchorOf(rule.surface)}`,
      sourceHandle: 'b',
      target: `rule:${rule.id}`,
      targetHandle: 't',
      type: 'smoothstep',
      animated: hit,
      style: {
        stroke: SIGNAL[color],
        strokeWidth: hit ? 2.4 : 1.6,
        opacity: rule.enabled ? 1 : 0.35,
      },
    })
  }
  edges.push({
    id: 're:judge',
    source: 'stage:input_detection',
    sourceHandle: 'b',
    target: 'judge',
    targetHandle: 't',
    type: 'smoothstep',
    animated: !!judge?.enabled,
    style: {
      stroke: 'var(--iris)',
      strokeWidth: 1.8,
      strokeDasharray: '5 4',
      opacity: judge?.enabled ? 1 : 0.4,
    },
  })
  return edges
}

export default function RuleCanvas({
  rules,
  hitIds,
  selectedId,
  judge,
  onSelect,
  onToggle,
  onToggleJudge,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const positionsRef = useRef(loadPositions())

  useEffect(() => {
    setNodes(
      buildNodes(rules, positionsRef.current, hitIds, selectedId, onToggle, judge, onToggleJudge),
    )
  }, [rules, hitIds, selectedId, onToggle, judge, onToggleJudge, setNodes])

  const edges = useMemo(() => buildEdges(rules, hitIds, judge), [rules, hitIds, judge])

  const onNodeClick = useCallback(
    (_e, node) => {
      if (node.type === 'rule') onSelect(node.id.slice(5))
    },
    [onSelect],
  )

  const onNodeDragStop = useCallback((_e, node) => {
    if (node.type === 'rule') {
      positionsRef.current = { ...positionsRef.current, [node.id.slice(5)]: node.position }
    } else if (node.type === 'judge') {
      positionsRef.current = { ...positionsRef.current, __judge: node.position }
    } else {
      return
    }
    savePositions(positionsRef.current)
  }, [])

  return (
    <div className="rule-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => onSelect(null)}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.3}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="var(--line)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
