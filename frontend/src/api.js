// Thin client over the AEGIS backend. All paths are proxied to :8000 in dev.

const json = (r) => r.json()

// Optional ?endpoint=<slug> filter shared by the read endpoints. Empty when no
// slug is given, which the backend reads as the global (all-endpoints) view.
const epq = (endpoint) => (endpoint ? `endpoint=${encodeURIComponent(endpoint)}` : '')

export const getStats = (endpoint) => fetch(`/api/stats?${epq(endpoint)}`).then(json)
export const getEvents = (since = 0, endpoint) =>
  fetch(`/api/events?since=${since}&${epq(endpoint)}`).then(json)
export const getAudit = (endpoint) => fetch(`/api/audit?${epq(endpoint)}`).then(json)
export const getScore = (endpoint) => fetch(`/api/score?${epq(endpoint)}`).then(json)
export const getAttacks = () => fetch('/api/attacks').then(json)
export const getHealth = () => fetch('/health').then(json)
export const streamUrl = (endpoint) =>
  `/api/stream${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`

export const chat = (text, guard = true, slug) =>
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, guard, slug }),
  }).then(json)

export const inspect = (text, direction = 'input', endpoint) =>
  fetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction, endpoint }),
  }).then(json)

export const exportUrl = (format = 'json', endpoint) =>
  `/api/audit/export?format=${format}${endpoint ? `&endpoint=${encodeURIComponent(endpoint)}` : ''}`

export const auditChat = (question) =>
  fetch('/api/audit/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  }).then(json)

export const verify = () => fetch('/api/verify').then(json)
export const getFrameworks = (endpoint) => fetch(`/api/frameworks?${epq(endpoint)}`).then(json)
export const runBenchmark = () => fetch('/api/benchmark', { method: 'POST' }).then(json)
export const getAssessQuestions = () => fetch('/api/assess/questions').then(json)
export const assess = (answers) =>
  fetch('/api/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  }).then(json)

export const getDetections = () => fetch('/api/detections').then(json)
export const getDetectionsRaw = () => fetch('/api/detections/raw').then((r) => r.text())
export const saveDetectionsRaw = (text) =>
  fetch('/api/detections/raw', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(json)
export const toggleDetection = (id) =>
  fetch(`/api/detections/${id}/toggle`, { method: 'POST' }).then(json)
export const toggleJudge = () =>
  fetch('/api/detections/judge/toggle', { method: 'POST' }).then(json)
export const testDetection = (text, direction = 'input', endpoint) =>
  fetch('/api/detections/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction, endpoint }),
  }).then(json)
export const demoTamper = () =>
  fetch('/api/_demo/tamper', { method: 'POST' }).then(json)
export const demoReset = () =>
  fetch('/api/_demo/reset', { method: 'POST' }).then(json)

// ---- endpoints (named guardrail flows) ----------------------------------
export const getEndpoints = () => fetch('/api/endpoints').then(json)
export const createEndpoint = (body) =>
  fetch('/api/endpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)
export const updateEndpoint = (slug, body) =>
  fetch(`/api/endpoints/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(json)
export const deleteEndpoint = (slug) =>
  fetch(`/api/endpoints/${slug}`, { method: 'DELETE' }).then(json)
export const toggleEndpointRule = (slug, ruleId) =>
  fetch(`/api/endpoints/${slug}/rules/${ruleId}/toggle`, { method: 'POST' }).then(json)
export const toggleEndpointJudge = (slug) =>
  fetch(`/api/endpoints/${slug}/judge/toggle`, { method: 'POST' }).then(json)
