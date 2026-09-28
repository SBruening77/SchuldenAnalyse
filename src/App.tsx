import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { Dashboard } from './pages/Dashboard'
import { Import } from './pages/Import'
import { Transactions } from './pages/Transactions'
import { Analysis } from './pages/Analysis'
import { Settings } from './pages/Settings'

const tabs = [
  { to: '/', label: 'Start', icon: HomeIcon },
  { to: '/buchungen', label: 'Buchungen', icon: ListIcon },
  { to: '/import', label: 'Import', icon: ImportIcon },
  { to: '/analyse', label: 'Analyse', icon: ChartIcon },
  { to: '/einstellungen', label: 'Mehr', icon: GearIcon },
]

export default function App() {
  return (
    <HashRouter>
      <div className="flex min-h-full flex-col">
        <main className="flex-1 pb-24">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/buchungen" element={<Transactions />} />
            <Route path="/import" element={<Import />} />
            <Route path="/analyse" element={<Analysis />} />
            <Route path="/einstellungen" element={<Settings />} />
          </Routes>
        </main>
        <nav className="safe-bottom fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
          <ul className="mx-auto flex max-w-lg justify-around">
            {tabs.map((t) => (
              <li key={t.to} className="flex-1">
                <NavLink
                  to={t.to}
                  end={t.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-emerald-400' : 'text-slate-400'}`
                  }
                >
                  <t.icon />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </HashRouter>
  )
}

function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}
function ImportIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
