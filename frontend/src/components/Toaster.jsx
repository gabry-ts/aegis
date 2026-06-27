import { useEffect, useState } from 'react'

let seq = 0

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const id = ++seq
      const { message, kind } = e.detail || {}
      setItems((x) => [...x, { id, message, kind: kind || 'info' }])
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200)
    }
    window.addEventListener('aegis:toast', onToast)
    return () => window.removeEventListener('aegis:toast', onToast)
  }, [])

  if (!items.length) return null
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast toast--' + t.kind}>
          <span className="toast__dot" aria-hidden="true" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
