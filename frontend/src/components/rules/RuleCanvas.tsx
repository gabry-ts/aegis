// The block editor. Renders the pipeline backbone plus one draggable detector
// node per rule, wired to the stage it runs at, over living connections.
// Node positions persist to localStorage so a rearranged board survives reloads.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
} from '@xyflow/react'
import type {
  EdgeTypes,
  NodeMouseHandler,
  NodeTypes,
  OnNodeDrag,
  XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './RuleNodes'
import type { AegisNode, JudgeNodeType, JudgeState, RuleNodeType, StageNodeType } from './RuleNodes'
import { edgeTypes } from './FlowEdge'
import type { FlowEdgeData, FlowEdgeType } from './FlowEdge'
import { STAGES, stagePosition, judgePosition, defaultRulePosition, ACTION_COLOR } from './rulesYaml'
import { toast } from '../../toast'
import type { Rule, Surface } from '../../types'

const POS_KEY = 'aegis.rules.positions.v1'

const MINI_COLOR: Record<string, string> = {
  red: 'var(--red)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
  muted: 'var(--line-2)',
}

const loadPositions = (): Record<string, XYPosition> => {
  try {
    return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}') || {}
  } catch {
    return {}
  }
}
const savePositions = (p: Record<string, XYPosition>) => {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable — positions just won't persist */
  }
}

const anchorOf = (surface: Surface) => (surface === 'output' ? 'output_scan' : 'input_detection')

function buildNodes(
  rules: Rule[],
  positions: Record<string, XYPosition>,
  hitIds: Set<string>,
  selectedId: string | null,
  onToggle: (id: string) => void,
  judge: JudgeState,
  onToggleJudge: () => void,
): AegisNode[] {
  const stages: StageNodeType[] = STAGES.map((s) => ({
    id: `stage:${s.id}`,
    type: 'stage',
    position: stagePosition(s.id),
    data: { ...s },
    draggable: false,
    selectable: false,
    deletable: false,
  }))

  const judgeNode: JudgeNodeType = {
    id: 'judge',
    type: 'judge',
    position: positions.__judge || judgePosition(),
    data: { judge, onToggle: onToggleJudge },
    deletable: false,
  }

  const order: Record<Surface, number> = { input: 0, output: 0 }
  const ruleNodes: RuleNodeType[] = rules.map((rule) => {
    const i = order[rule.surface] ?? order.input
    order[rule.surface] = i + 1
    return {
      id: `rule:${rule.id}`,
      type: 'rule',
      position: positions[rule.id] || defaultRulePosition(rule.surface, i),
      data: { rule, hit: hitIds.has(rule.id), selected: selectedId === rule.id, onToggle },
      deletable: false,
    }
  })

  return [...stages, judgeNode, ...ruleNodes]
}

function buildEdges(
  rules: Rule[],
  hitIds: Set<string>,
  judge: JudgeState,
  activeId: string | null,
): FlowEdgeType[] {
  const edges: FlowEdgeType[] = []
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges.push({
      id: `spine:${i}`,
      source: `stage:${STAGES[i]!.id}`,
      target: `stage:${STAGES[i + 1]!.id}`,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'flow',
      data: { variant: 'spine', color: 'muted' },
    })
  }
  for (const rule of rules) {
    edges.push({
      id: `re:${rule.id}`,
      source: `stage:${anchorOf(rule.surface)}`,
      sourceHandle: 'b',
      target: `rule:${rule.id}`,
      targetHandle: 't',
      type: 'flow',
      data: {
        variant: 'rule',
        color: (ACTION_COLOR[rule.action] || 'muted') as FlowEdgeData['color'],
        hit: hitIds.has(rule.id),
        active: activeId === rule.id,
        enabled: rule.enabled,
      },
    })
  }
  edges.push({
    id: 're:judge',
    source: 'stage:input_detection',
    sourceHandle: 'b',
    target: 'judge',
    targetHandle: 't',
    type: 'flow',
    data: { variant: 'judge', color: 'iris', enabled: !!judge?.enabled, active: !!judge?.enabled },
  })
  return edges
}

export default function RuleCanvas({
  rules,
  hitIds,
  selectedId,
  judge,
  resetKey = 0,
  onSelect,
  onToggle,
  onToggleJudge,
}: {
  rules: Rule[]
  hitIds: Set<string>
  selectedId: string | null
  judge: JudgeState
  resetKey?: number
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
  onToggleJudge: () => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AegisNode>([])
  const [hoverId, setHoverId] = useState<string | null>(null)
  const positionsRef = useRef(loadPositions())
  const draggedOnce = useRef(false)

  useEffect(() => {
    setNodes(buildNodes(rules, positionsRef.current, hitIds, selectedId, onToggle, judge, onToggleJudge))
  }, [rules, hitIds, selectedId, onToggle, judge, onToggleJudge, setNodes])

  // Reset layout: clear saved positions and re-lay the board.
  useEffect(() => {
    if (!resetKey) return
    positionsRef.current = {}
    savePositions({})
    setNodes(buildNodes(rules, {}, hitIds, selectedId, onToggle, judge, onToggleJudge))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const activeId = hoverId || selectedId
  const edges = useMemo(() => buildEdges(rules, hitIds, judge, activeId), [rules, hitIds, judge, activeId])

  const onNodeClick = useCallback<NodeMouseHandler<AegisNode>>(
    (_e, node) => {
      if (node.type === 'rule') onSelect(node.id.slice(5))
    },
    [onSelect],
  )

  const onNodeMouseEnter = useCallback<NodeMouseHandler<AegisNode>>((_e, node) => {
    if (node.type === 'rule') setHoverId(node.id.slice(5))
  }, [])
  const onNodeMouseLeave = useCallback(() => setHoverId(null), [])

  const onNodeDragStop = useCallback<OnNodeDrag<AegisNode>>((_e, node) => {
    if (node.type === 'rule') {
      positionsRef.current = { ...positionsRef.current, [node.id.slice(5)]: node.position }
    } else if (node.type === 'judge') {
      positionsRef.current = { ...positionsRef.current, __judge: node.position }
    } else {
      return
    }
    savePositions(positionsRef.current)
    if (!draggedOnce.current) {
      draggedOnce.current = true
      toast('Layout saved automatically', 'info')
    }
  }, [])

  const miniColor = useCallback((n: AegisNode): string => {
    if (n.type === 'judge') return 'var(--iris)'
    if (n.type === 'rule') return MINI_COLOR[ACTION_COLOR[n.data.rule.action]] || 'var(--line-2)'
    return 'var(--surface-3)'
  }, [])

  return (
    <div className="rule-canvas">
      <ReactFlow<AegisNode, FlowEdgeType>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes as NodeTypes}
        edgeTypes={edgeTypes as EdgeTypes}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
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
        <MiniMap<AegisNode>
          pannable
          zoomable
          nodeColor={miniColor}
          nodeStrokeWidth={0}
          nodeBorderRadius={3}
          maskColor="oklch(0.165 0.012 265 / 0.72)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
