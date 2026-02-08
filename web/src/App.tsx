import { useState, useEffect } from 'react'
import './App.css'
import { api } from './api'
import type { Tab } from './types'
import {
  DashboardSection,
  RelaysSection,
  RelayInfoSection,
  SafelistSection,
  IpSection,
  KindBlacklistSection,
  FiltersSection,
  LogsSection,
  SimpleBanSection,
  MetricsSettingsSection,
} from './components'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    api.getAppVersion().then((r: { version: string }) => setAppVersion(r.version)).catch(() => {});
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Proxy Nostr Relay</h1>
        {appVersion != null && (
          <span className="app-version" title="Application version">v{appVersion}</span>
        )}
      </header>
      <nav className="tabs">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={activeTab === 'relays' ? 'active' : ''} onClick={() => setActiveTab('relays')}>
          Relay Settings
        </button>
        <button className={activeTab === 'relay-info' ? 'active' : ''} onClick={() => setActiveTab('relay-info')}>
          NIP-11 Info
        </button>
        <button className={activeTab === 'safelist' ? 'active' : ''} onClick={() => setActiveTab('safelist')}>
          Npub Management
        </button>
        <button className={activeTab === 'ip' ? 'active' : ''} onClick={() => setActiveTab('ip')}>
          IP Access Control
        </button>
        <button className={activeTab === 'kind' ? 'active' : ''} onClick={() => setActiveTab('kind')}>
          Kind Blacklist
        </button>
        <button className={activeTab === 'filters' ? 'active' : ''} onClick={() => setActiveTab('filters')}>
          Filter Rules
        </button>
        <button className={activeTab === 'simple-ban' ? 'active' : ''} onClick={() => setActiveTab('simple-ban')}>
          Simple BAN
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
          Event Logs
        </button>
        <button className={activeTab === 'metrics' ? 'active' : ''} onClick={() => setActiveTab('metrics')}>
          Metrics
        </button>
      </nav>
      <main className="main-container">
        <div className="container-fluid">
          {activeTab === 'dashboard' && <DashboardSection />}
          {activeTab === 'relays' && <RelaysSection />}
          {activeTab === 'relay-info' && <RelayInfoSection />}
          {activeTab === 'safelist' && <SafelistSection />}
          {activeTab === 'ip' && <IpSection />}
          {activeTab === 'kind' && <KindBlacklistSection />}
          {activeTab === 'filters' && <FiltersSection />}
          {activeTab === 'simple-ban' && <SimpleBanSection />}
          {activeTab === 'logs' && <LogsSection />}
          {activeTab === 'metrics' && <MetricsSettingsSection />}
        </div>
      </main>
    </div>
  )
}

export default App
