// Tiny global feedback bus (Nielsen #1: visibility of system status).
// Any component can fire a toast without prop drilling.

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastDetail {
  message: string
  kind: ToastKind
}

declare global {
  interface WindowEventMap {
    'aegis:toast': CustomEvent<ToastDetail>
  }
}

export function toast(message: string, kind: ToastKind = 'info'): void {
  window.dispatchEvent(new CustomEvent('aegis:toast', { detail: { message, kind } }))
}
