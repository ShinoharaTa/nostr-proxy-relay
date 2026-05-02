import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import './App.css'
import { api } from './api'
import {
  DashboardSection,
  LiveEventsSection,
  RelaysSection,
  RelayInfoSection,
  PostPolicySection,
  SafelistSection,
  IpSection,
  QuarantineSection,
  KindBlacklistSection,
  FiltersSection,
  SimpleBanSection,
  LogsSection,
  MetricsSettingsSection,
} from './components'

interface TabDef {
  path: string
  label: string
  group?: string
}

const tabs: TabDef[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/live', label: 'Live Events' },
  { path: '/relays', label: 'Backend Relays' },
  { path: '/relay-info', label: 'NIP-11' },
  { path: '/post-policy', label: 'POST Policy' },
  { path: '/safelist', label: 'Npub' },
  { path: '/ip', label: 'IP ACL' },
  { path: '/quarantine', label: 'Quarantine' },
  { path: '/kind', label: 'Kind Blacklist' },
  { path: '/filters', label: 'Filter Rules' },
  { path: '/simple-ban', label: 'Simple BAN' },
  { path: '/logs', label: 'Logs' },
  { path: '/metrics', label: 'Metrics' },
]

function App() {
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    api.getAppVersion().then((r: { version: string }) => setAppVersion(r.version)).catch(() => {})
  }, [])

  return (
    <div className="app">
      <header>
        <h1>Proxy Nostr Relay</h1>
        {appVersion != null && (
          <span className="app-version" title="Application version">v{appVersion}</span>
        )}
      </header>
      <nav className="tabs">
        {tabs.map(tab => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <main className="main-container">
        <div className="container-fluid">
          <Routes>
            <Route path="/" element={<DashboardSection />} />
            <Route path="/live" element={<LiveEventsSection />} />
            <Route path="/relays" element={<RelaysSection />} />
            <Route path="/relay-info" element={<RelayInfoSection />} />
            <Route path="/post-policy" element={<PostPolicySection />} />
            <Route path="/safelist" element={<SafelistSection />} />
            <Route path="/ip" element={<IpSection />} />
            <Route path="/quarantine" element={<QuarantineSection />} />
            <Route path="/kind" element={<KindBlacklistSection />} />
            <Route path="/filters" element={<FiltersSection />} />
            <Route path="/simple-ban" element={<SimpleBanSection />} />
            <Route path="/logs" element={<LogsSection />} />
            <Route path="/metrics" element={<MetricsSettingsSection />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default App
