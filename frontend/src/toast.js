// Tiny global feedback bus (Nielsen #1: visibility of system status).
// Any component can fire a toast without prop drilling.
export function toast(message, kind = 'info') {
  window.dispatchEvent(new CustomEvent('aegis:toast', { detail: { message, kind } }))
}
