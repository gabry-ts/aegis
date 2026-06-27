// Thin client over the AEGIS backend. All paths are proxied to :8000 in dev.

const json = (r) => r.json()

export const getStats = () => fetch('/api/stats').then(json)
export const getEvents = (since = 0) => fetch(`/api/events?since=${since}`).then(json)
export const getAudit = () => fetch('/api/audit').then(json)
export const getScore = () => fetch('/api/score').then(json)
export const getAttacks = () => fetch('/api/attacks').then(json)
export const getHealth = () => fetch('/health').then(json)

export const chat = (text, guard = true) =>
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, guard }),
  }).then(json)

export const inspect = (text, direction = 'input') =>
  fetch('/api/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction }),
  }).then(json)

export const exportUrl = (format = 'json') => `/api/audit/export?format=${format}`

export const verify = () => fetch('/api/verify').then(json)
export const getFrameworks = () => fetch('/api/frameworks').then(json)
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
export const testDetection = (text, direction = 'input') =>
  fetch('/api/detections/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction }),
  }).then(json)
export const demoTamper = () =>
  fetch('/api/_demo/tamper', { method: 'POST' }).then(json)
export const demoReset = () =>
  fetch('/api/_demo/reset', { method: 'POST' }).then(json)
