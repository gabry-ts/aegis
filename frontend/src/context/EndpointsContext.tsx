// Shared endpoint state: the list of guardrail flows plus the slug currently
// selected for the board and playground. Persisted to localStorage so the
// choice survives reloads; kept valid when endpoints are created or deleted.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getEndpoints } from '../api'
import type { Endpoint, EndpointsContextValue } from '../types'

const KEY = 'aegis.endpoint.current'
const Ctx = createContext<EndpointsContextValue | null>(null)

export function EndpointsProvider({ children }: { children: ReactNode }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [current, setCurrentState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY) || null
    } catch {
      return null
    }
  })

  const setCurrent = useCallback((slug: string | null) => {
    setCurrentState(slug)
    try {
      if (slug) localStorage.setItem(KEY, slug)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const d = await getEndpoints()
      const list = d.endpoints || []
      setEndpoints(list)
      // Keep the selection valid; fall back to the first endpoint when the
      // stored slug is unset or no longer exists.
      setCurrentState((cur) => {
        if (cur && list.some((e) => e.slug === cur)) return cur
        const next = list[0]?.slug || null
        try {
          if (next) localStorage.setItem(KEY, next)
        } catch {
          /* storage unavailable */
        }
        return next
      })
    } catch {
      /* keep last known list */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo<EndpointsContextValue>(
    () => ({ endpoints, loading, current, setCurrent, refresh }),
    [endpoints, loading, current, setCurrent, refresh],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEndpoints(): EndpointsContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEndpoints must be used within an EndpointsProvider')
  return ctx
}
