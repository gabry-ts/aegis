// Rule-pack helpers: vocabulary, canvas layout, blank-rule template and a
// YAML serializer. The backend validates whatever we send, so the serializer
// only needs to be correct, not clever: every string is double-quoted with
// the two escapes YAML requires, which safely carries regex metacharacters.

import type { ColorToken, Rule, RuleAction, RuleDetector, Surface } from '../../types'

export const SURFACES: Surface[] = ['input', 'output']
export const ACTIONS: RuleAction[] = ['block', 'sanitize', 'flag']
export const DETECTORS: RuleDetector[] = ['regex', 'keyword', 'secret', 'pii']

// Common verdict labels offered as suggestions; the field stays free-form.
export const VERDICTS: string[] = [
  'PROMPT_INJECTION',
  'JAILBREAK',
  'DATA_EXFILTRATION',
  'SECRET_LEAK',
  'PII_LEAK',
  'EXCESSIVE_AGENCY',
  'RESOURCE_ABUSE',
]

export const ACTION_COLOR: Record<RuleAction, ColorToken> = {
  block: 'red',
  sanitize: 'amber',
  flag: 'blue',
}

export type StageIcon = 'prompt' | 'shield' | 'chip' | 'scan' | 'ledger'

export interface Stage {
  id: string
  title: string
  sub: string
  icon: StageIcon
  surface?: Surface
}

// The fixed pipeline backbone. Input-surface rules hang off `input_detection`,
// output-surface rules off `output_scan`.
export const STAGES: Stage[] = [
  { id: 'ingress', title: 'Incoming request', sub: 'user input', icon: 'prompt' },
  { id: 'input_detection', title: 'Input detection', sub: 'rules · judge', icon: 'shield', surface: 'input' },
  { id: 'model', title: 'LLM', sub: 'mock / Regolo', icon: 'chip' },
  { id: 'output_scan', title: 'Output scan', sub: 'PII · secret', icon: 'scan', surface: 'output' },
  { id: 'audit', title: 'Audit log', sub: 'record-keeping', icon: 'ledger' },
]

const STAGE_X: Record<string, number> = { ingress: 40, input_detection: 360, model: 720, output_scan: 1080, audit: 1420 }
const STAGE_Y = 40
const RULE_TOP = 220
const RULE_STEP = 150
const RULE_COL_W = 268

export function stagePosition(id: string) {
  return { x: STAGE_X[id] ?? 0, y: STAGE_Y }
}

// The LLM judge node sits at the top of the input lane, centred under the
// Input detection stage, above the regex rule columns.
export function judgePosition() {
  const baseX = (STAGE_X.input_detection ?? 0) - 18
  return { x: baseX + RULE_COL_W / 2, y: RULE_TOP }
}

// Default position for a rule node, hung under its anchor stage. Input-surface
// rules stagger across two columns to keep the lane short and readable, and
// start one row below the judge node; output-surface rules stay single-column.
export function defaultRulePosition(surface: Surface, order: number) {
  const anchor = surface === 'output' ? 'output_scan' : 'input_detection'
  const baseX = (STAGE_X[anchor] ?? 0) - 18
  if (surface === 'output') {
    return { x: baseX, y: RULE_TOP + order * RULE_STEP }
  }
  const col = order % 2
  const row = Math.floor(order / 2) + 1
  return { x: baseX + col * RULE_COL_W, y: RULE_TOP + row * RULE_STEP }
}

const slug = (s: string): string =>
  String(s || 'rule')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'rule'

export function uniqueId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  let id = slug(base)
  let n = 2
  while (taken.has(id)) id = `${slug(base)}_${n++}`
  return id
}

export function blankRule(existingIds: string[]): Rule {
  return {
    id: uniqueId('new_rule', existingIds),
    name: 'New rule',
    verdict: 'CUSTOM',
    severity: 3,
    surface: 'input',
    action: 'block',
    detector: 'regex',
    patterns: ['(?i)example pattern'],
    keywords: [],
    mapping: { owasp: '', atlas: '', ai_act: 'Art.15(5)' },
    enabled: true,
  }
}

const quote = (s: string): string =>
  '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'

// Serialize the editable rule list back into the pack's YAML shape.
export function rulesToYaml(rules: Rule[]): string {
  let out = 'version: 1\nrules:\n'
  for (const r of rules) {
    out += `- id: ${quote(r.id)}\n`
    out += `  name: ${quote(r.name)}\n`
    out += `  verdict: ${quote(r.verdict)}\n`
    out += `  severity: ${Math.min(5, Math.max(1, Number(r.severity) || 1))}\n`
    out += `  surface: ${quote(r.surface)}\n`
    out += `  action: ${quote(r.action)}\n`
    out += `  detector: ${quote(r.detector)}\n`
    if (r.detector === 'regex') {
      const list = (r.patterns || []).filter((p) => p.trim())
      out += '  patterns:\n'
      for (const p of list) out += `  - ${quote(p)}\n`
    }
    if (r.detector === 'keyword') {
      const list = (r.keywords || []).filter((k) => k.trim())
      out += '  keywords:\n'
      for (const k of list) out += `  - ${quote(k)}\n`
    }
    const m = r.mapping || {}
    out += '  mapping:\n'
    out += `    owasp: ${quote(m.owasp || '')}\n`
    out += `    atlas: ${quote(m.atlas || '')}\n`
    out += `    ai_act: ${quote(m.ai_act || '')}\n`
    out += `  enabled: ${r.enabled ? 'true' : 'false'}\n`
  }
  return out
}
