// Shared domain contract for the AEGIS frontend.
//
// Single source of truth for the shapes exchanged with the FastAPI backend and
// reused across components. Pure types, zero runtime. Field shapes mirror the
// backend serializers (schemas.py, compliance/logger.py, endpoints.py, …).

// ---- UI vocabulary ---------------------------------------------------------

/** Color tokens used by the severity/verdict/action/edge palettes. */
export type ColorToken =
  | 'red'
  | 'orange'
  | 'amber'
  | 'blue'
  | 'green'
  | 'iris'
  | 'muted'
  | 'faint'

/** Enforcement applied to a request, as recorded on every audit event. */
export type ActionKind = 'ALLOWED' | 'BLOCKED' | 'SANITIZED' | 'LOGGED'

/** Traffic direction / rule surface — both are the same two-valued axis. */
export type Direction = 'input' | 'output'
export type Surface = Direction

/**
 * Detection verdict. The known set covers the built-in rules, but the editable
 * YAML rule pack can introduce custom verdicts, so the field stays widened to
 * `string` while keeping literal autocomplete for the common ones.
 */
export type Verdict =
  | 'SAFE'
  | 'PROMPT_INJECTION'
  | 'JAILBREAK'
  | 'DATA_EXFILTRATION'
  | 'PII_LEAK'
  | 'SECRET_LEAK'
  | (string & {})

// ---- detection results & audit log -----------------------------------------

/** Result of running the detection pipeline over a single piece of text. */
export interface DetectionResult {
  direction: Direction
  verdict: Verdict
  severity: number
  category: 'safe' | 'model_evasion' | 'confidentiality_attack' | 'transparency'
  ai_act: string | null
  ai_act_label: string
  owasp_id: string | null
  atlas_id: string | null
  action: ActionKind
  matched: string[]
  excerpt: string
  explanation: string
  judge_used: boolean
  rule_id: string | null
}

/** A sealed audit-log entry: a detection result plus recording metadata. */
export interface AuditEvent extends DetectionResult {
  id: number
  ts: string
  actor: string
  endpoint: string | null
  prev_hash?: string
  hash?: string
}

// ---- stats & compliance scoring --------------------------------------------

export interface ProviderInfo {
  mode: string
  model: string
  regolo: boolean
}

export interface ArticleCoverage {
  id: string
  label: string
  covered: boolean
  evidence: number
}

export interface ScoreResponse {
  score: string
  percent: number
  articles: ArticleCoverage[]
}

export interface StatsResponse {
  total: number
  blocked: number
  sanitized: number
  allowed: number
  by_verdict: Record<string, number>
  /** Histogram of counts by severity, fixed length 6 (index = severity 0..5). */
  severity_hist: number[]
  transparency: number
  provider: ProviderInfo
  score: ScoreResponse
}

/** SSE payloads pushed over the /api/stream EventSource. */
export type StreamMessage =
  | { type: 'init'; events: AuditEvent[]; stats: StatsResponse }
  | { type: 'update'; events: AuditEvent[]; stats: StatsResponse }

// ---- chat & assistant ------------------------------------------------------

/** Successful full-trace response from POST /api/chat (playground). */
export interface ChatTrace {
  guard: boolean
  blocked: boolean
  input_detection: DetectionResult | null
  output_detection: DetectionResult | null
  reply: string
  sanitized: boolean
  transparency: boolean
  events: AuditEvent[]
}

/** Failure variant: the backend 400 body, or a client-side network failure. */
export interface ChatError {
  error: string
}

/** POST /api/chat resolves to a trace or an error; discriminate with `'error' in res`. */
export type ChatResponse = ChatTrace | ChatError

/** Response from POST /api/audit/chat (audit assistant). */
export interface AuditChatResponse {
  blocked: boolean
  verdict: Verdict
  answer: string
}

// ---- integrity -------------------------------------------------------------

export interface VerifyResponse {
  ok: boolean
  broken_at: number | null
  count: number
}

// ---- endpoints (named guardrail flows) -------------------------------------

export interface EndpointUpstream {
  base_url: string | null
  model: string | null
  api_key_env: string | null
  key_present: boolean
}

export interface Endpoint {
  slug: string
  name: string
  description: string
  rules: string[]
  rule_count: number
  judge: boolean
  /** Rule ids placed on this endpoint's board; null means the whole library. */
  board: string[] | null
  upstream: EndpointUpstream
}

export interface EndpointsResponse {
  endpoints: Endpoint[]
}

/** Upstream patch sent by the settings form (all optional; null clears a field). */
export interface UpstreamInput {
  base_url?: string | null
  model?: string | null
  api_key_env?: string | null
}

export interface EndpointCreateBody {
  name: string
  slug?: string
  description?: string
  rules?: string[]
  judge?: boolean
  board?: string[] | null
  upstream?: UpstreamInput
}

export type EndpointUpdateBody = Partial<Omit<EndpointCreateBody, 'slug'>>

// ---- detection rules -------------------------------------------------------

export type RuleAction = 'block' | 'sanitize' | 'flag'
export type RuleDetector = 'regex' | 'keyword' | 'secret' | 'pii'

export interface RuleMapping {
  owasp?: string
  atlas?: string
  ai_act?: string
}

export interface Rule {
  id: string
  name: string
  verdict: Verdict
  severity: number
  surface: Surface
  action: RuleAction
  detector: RuleDetector
  enabled: boolean
  mapping: RuleMapping
  patterns?: string[]
  keywords?: string[]
}

export interface DetectionsResponse {
  rules: Rule[]
  judge: { available: boolean }
}

export interface TestDetectionResponse {
  hits: Rule[]
  detection: DetectionResult
}

// ---- AI Act self-assessment ------------------------------------------------

export interface AssessOption {
  value: string
  label: string
}

export interface AssessQuestion {
  id: string
  label: string
  options: AssessOption[]
}

export interface AssessQuestionsResponse {
  questions: AssessQuestion[]
}

export interface Obligation {
  article: string
  label: string
  aegis: 'yes' | 'partial' | 'no' | 'na'
}

export interface AssessResult {
  tier: 'prohibited' | 'high_risk' | 'limited' | 'minimal'
  tier_label: string
  rationale: string
  gpai: boolean
  obligations: Obligation[]
  aegis_covered: number
  aegis_addressable: number
  obligations_total: number
}

// ---- attack samples & misc reads -------------------------------------------

/** Demo attack sample from GET /api/attacks (kind is data-driven). */
export interface Attack {
  label: string
  text: string
  kind: string
}

export interface HealthResponse {
  status: 'ok'
  mode: string
  provider: ProviderInfo
  auth: boolean
  store: 'sqlite' | 'postgres'
  bus: 'memory' | 'redis'
}

// ---- mutation results ------------------------------------------------------

export interface ApiError {
  ok: false
  error: string
}

export type SaveRawResult = { ok: true; count: number } | ApiError
export type ToggleDetectionResult = { ok: true; id: string; enabled: boolean } | ApiError
export type ToggleJudgeResult = { ok: true; enabled: boolean; available: boolean }
export type EndpointMutationResult = { ok: true; endpoint: Endpoint } | ApiError
export type DeleteEndpointResult = { ok: true; slug: string } | ApiError
export type ToggleEndpointRuleResult =
  | { ok: true; slug: string; rule_id: string; active: boolean }
  | ApiError
export type ToggleEndpointJudgeResult = { ok: true; slug: string; judge: boolean } | ApiError
export type DemoTamperResult =
  | { ok: true; tampered_id: number; verify: VerifyResponse }
  | { ok: false; reason: string }
export type DemoResetResult = { ok: true; total: number }

// ---- shared context --------------------------------------------------------

export interface EndpointsContextValue {
  endpoints: Endpoint[]
  loading: boolean
  current: string | null
  setCurrent: (slug: string | null) => void
  refresh: () => Promise<void>
}
