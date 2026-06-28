// Thin client over the AEGIS backend. All paths are proxied to :8000 in dev.

import type {
  AssessQuestionsResponse,
  AssessResult,
  Attack,
  AuditChatResponse,
  AuditEvent,
  ChatResponse,
  DeleteEndpointResult,
  DemoResetResult,
  DemoTamperResult,
  DetectionResult,
  DetectionsResponse,
  Direction,
  EndpointCreateBody,
  EndpointMutationResult,
  EndpointUpdateBody,
  EndpointsResponse,
  HealthResponse,
  SaveRawResult,
  ScoreResponse,
  StatsResponse,
  TestDetectionResponse,
  ToggleDetectionResult,
  ToggleEndpointJudgeResult,
  ToggleEndpointRuleResult,
  ToggleJudgeResult,
  VerifyResponse,
} from './types'

const json = (r: Response) => r.json()

// Optional ?endpoint=<slug> filter shared by the read endpoints. Empty when no
// slug is given, which the backend reads as the global (all-endpoints) view.
const epq = (endpoint?: string): string => (endpoint ? `endpoint=${encodeURIComponent(endpoint)}` : '')

export const getStats = (endpoint?: string): Promise<StatsResponse> =>
  fetch(`/api/stats?${epq(endpoint)}`).then(json)
export const getEvents = (since = 0, endpoint?: string): Promise<AuditEvent[]> =>
  fetch(`/api/events?since=${since}&${epq(endpoint)}`).then(json)
export const getAudit = (endpoint?: string): Promise<AuditEvent[]> =>
  fetch(`/api/audit?${epq(endpoint)}`).then(json)
export const getScore = (endpoint?: string): Promise<ScoreResponse> =>
  fetch(`/api/score?${epq(endpoint)}`).then(json)
export const getAttacks = (): Promise<Attack[]> => fetch('/api/attacks').then(json)
export const getHealth = (): Promise<HealthResponse> => fetch('/health').then(json)
export const streamUrl = (endpoint?: string): string =>
  `/api/stream${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`

export const chat = (text: string, guard = true, slug?: string | null): Promise<ChatResponse> =>
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, guard, slug }),
  }).then(json)

export const inspect = (
  text: string,
  direction: Direction = 'input',
  endpoint?: string,
): Promise<DetectionResult> =>
  fetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction, endpoint }),
  }).then(json)

export const exportUrl = (format: 'json' | 'csv' = 'json', endpoint?: string): string =>
  `/api/audit/export?format=${format}${endpoint ? `&endpoint=${encodeURIComponent(endpoint)}` : ''}`

export const auditChat = (question: string): Promise<AuditChatResponse> =>
  fetch('/api/audit/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  }).then(json)

export const verify = (): Promise<VerifyResponse> => fetch('/api/verify').then(json)

interface FrameworksResponse {
  owasp: Array<{ id: string; name: string; atlas: string[]; covered: boolean }>
  mapping: Record<string, { owasp_id: string; owasp: string; atlas_id: string; atlas: string }>
}
export const getFrameworks = (endpoint?: string): Promise<FrameworksResponse> =>
  fetch(`/api/frameworks?${epq(endpoint)}`).then(json)

interface BenchmarkResponse {
  summary: {
    attacks: number
    caught: number
    missed: number
    safe_total: number
    false_positives: number
    score: number
  }
  by_owasp: Array<{ owasp_id: string; owasp: string; total: number; caught: number }>
  results: Array<{
    id: number
    text: string
    kind: string
    stage: Direction
    owasp_id: string
    atlas_id: string
    expected: 'ATTACK' | 'BENIGN'
    caught: boolean
    verdict: string
    action: string
  }>
}
export const runBenchmark = (): Promise<BenchmarkResponse> =>
  fetch('/api/benchmark', { method: 'POST' }).then(json)

export const getAssessQuestions = (): Promise<AssessQuestionsResponse> =>
  fetch('/api/assess/questions').then(json)
export const assess = (answers: Record<string, string>): Promise<AssessResult> =>
  fetch('/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  }).then(json)

export const getDetections = (): Promise<DetectionsResponse> =>
  fetch('/api/detections').then(json)
export const getDetectionsRaw = (): Promise<string> =>
  fetch('/api/detections/raw').then((r) => r.text())
export const saveDetectionsRaw = (text: string): Promise<SaveRawResult> =>
  fetch('/api/detections/raw', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(json)
export const toggleDetection = (id: string): Promise<ToggleDetectionResult> =>
  fetch(`/api/detections/${id}/toggle`, { method: 'POST' }).then(json)
export const toggleJudge = (): Promise<ToggleJudgeResult> =>
  fetch('/api/detections/judge/toggle', { method: 'POST' }).then(json)
export const testDetection = (
  text: string,
  direction: Direction = 'input',
  endpoint?: string,
): Promise<TestDetectionResponse> =>
  fetch('/api/detections/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction, endpoint }),
  }).then(json)
export const demoTamper = (): Promise<DemoTamperResult> =>
  fetch('/api/_demo/tamper', { method: 'POST' }).then(json)
export const demoReset = (): Promise<DemoResetResult> =>
  fetch('/api/_demo/reset', { method: 'POST' }).then(json)

// ---- endpoints (named guardrail flows) ----------------------------------
export const getEndpoints = (): Promise<EndpointsResponse> => fetch('/api/endpoints').then(json)
export const createEndpoint = (body: EndpointCreateBody): Promise<EndpointMutationResult> =>
  fetch('/api/endpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)
export const updateEndpoint = (
  slug: string,
  body: EndpointUpdateBody,
): Promise<EndpointMutationResult> =>
  fetch(`/api/endpoints/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)
export const deleteEndpoint = (slug: string): Promise<DeleteEndpointResult> =>
  fetch(`/api/endpoints/${slug}`, { method: 'DELETE' }).then(json)
export const toggleEndpointRule = (
  slug: string,
  ruleId: string,
): Promise<ToggleEndpointRuleResult> =>
  fetch(`/api/endpoints/${slug}/rules/${ruleId}/toggle`, { method: 'POST' }).then(json)
export const toggleEndpointJudge = (slug: string): Promise<ToggleEndpointJudgeResult> =>
  fetch(`/api/endpoints/${slug}/judge/toggle`, { method: 'POST' }).then(json)
