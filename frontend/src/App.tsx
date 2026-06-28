import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getStats } from './api'
import Dashboard from './pages/Dashboard'
import Integrity from './pages/Integrity'
import Playground from './pages/Playground'
import Assessment from './pages/Assessment'
import Rules from './pages/Rules'
import Toaster from './components/Toaster'
import Assistant from './components/Assistant'
import type { StatsResponse } from './types'

interface SubItem {
  to: string
  label: string
}
interface Section {
  label: string
  caption: string
  base: string
  paths: string[]
  subs: SubItem[]
}

const SECTIONS: Section[] = [
  { label: 'Dashboard', caption: 'live activity', base: '/', paths: ['/'], subs: [] },
  { label: 'Playground', caption: 'attack it live', base: '/playground', paths: ['/playground'], subs: [] },
  {
    label: 'Guardrail',
    caption: 'detection rules',
    base: '/detections',
    paths: ['/detections'],
    subs: [],
  },
  {
    label: 'Compliance',
    caption: 'audit & ai act',
    base: '/integrity',
    paths: ['/integrity', '/assessment'],
    subs: [
      { to: '/integrity', label: 'Audit' },
      { to: '/assessment', label: 'AI Act' },
    ],
  },
]

function activeSection(pathname: string): Section {
  return SECTIONS.find((s) => s.paths.includes(pathname)) || SECTIONS[0]
}

function SubNav() {
  const { pathname } = useLocation()
  const section = activeSection(pathname)
  if (section.subs.length < 2) return null
  return (
    <div className="subnav">
      <div className="subnav__wrap">
        {section.subs.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className={'subtab' + (s.to === pathname ? ' subtab--active' : '')}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const [meta, setMeta] = useState<StatsResponse | null>(null)
  const [offline, setOffline] = useState(false)
  const { pathname } = useLocation()
  const section = activeSection(pathname)

  useEffect(() => {
    let alive = true
    const tick = () =>
      getStats()
        .then((s) => {
          if (!alive) return
          setMeta(s)
          setOffline(false)
        })
        .catch(() => alive && setOffline(true))
    tick()
    const id = setInterval(tick, 2500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const isRegolo = meta?.provider?.regolo
  const badge = offline ? 'offline' : isRegolo ? 'regolo' : 'mock'

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark" aria-hidden="true" />
          AEGIS
          <span className="brand-sub">guardrail · ai act</span>
        </div>

        <nav className="nav-tabs" aria-label="Sections">
          {SECTIONS.map((s) => (
            <Link
              key={s.label}
              to={s.base}
              className={'tab' + (s === section ? ' tab--active' : '')}
            >
              <span className="tab__label">{s.label}</span>
              <span className="tab__sub">{s.caption}</span>
            </Link>
          ))}
        </nav>

        <div className="topbar__meta">
          <span className="mode-badge" data-on={badge}>
            <span className="live-dot" />
            {offline ? 'OFFLINE' : isRegolo ? 'REGOLO' : 'MOCK'}
          </span>
          <span className="score-pill" title="EU AI Act articles covered, each backed by logged evidence">
            AI ACT <b>{meta?.score?.score ?? '0/3'}</b>
          </span>
        </div>
      </header>

      <SubNav />

      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/detections" element={<Rules />} />
          <Route path="/integrity" element={<Integrity />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/pipeline" element={<Navigate to="/playground" replace />} />
          <Route path="/benchmark" element={<Navigate to="/detections" replace />} />
        </Routes>
      </main>

      <Assistant />
      <Toaster />
    </div>
  )
}
