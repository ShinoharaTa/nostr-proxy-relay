import { useState, useEffect } from 'react'
import './App.css'

// Types
interface IpAccessControl {
  id?: number;
  ip_address: string;
  banned: boolean;
  whitelisted: boolean;
  memo: string;
}

interface SafelistEntry {
  npub: string;
  flags: number;
  memo: string;
  banned?: boolean;
}

interface ReqKindBlacklist {
  id: number;
  kind_value?: number;
  kind_min?: number;
  kind_max?: number;
  enabled: boolean;
}

interface FilterRule {
  id: number;
  name: string;
  nl_text: string;
  parsed_json: string;
  enabled: boolean;
  rule_order: number;
}

interface RelayConfig {
  url: string;
  enabled: boolean;
}

interface ConnectionLog {
  id: number;
  ip_address: string;
  connected_at: string;
  disconnected_at?: string;
  event_count: number;
  rejected_event_count: number;
}

interface EventRejectionLog {
  id: number;
  event_id: string;
  pubkey_hex: string;
  npub: string;
  ip_address?: string;
  kind: number;
  reason: string;
  created_at: string;
}

interface Stats {
  total_connections: number;
  active_connections: number;
  total_rejections: number;
  rejections_by_reason: { reason: string; count: number }[];
  top_npubs_by_rejections: { npub: string; count: number }[];
  top_ips_by_rejections: { ip_address: string; count: number }[];
}

type Tab = 'dashboard' | 'relays' | 'safelist' | 'ip' | 'kind' | 'filters' | 'logs';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="app">
      <header>
        <h1>Proxy Nostr Relay</h1>
      </header>
      <nav className="tabs">
        <button className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={activeTab === 'relays' ? 'active' : ''} onClick={() => setActiveTab('relays')}>
          Relay Settings
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
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
          Event Logs
        </button>
      </nav>
      <main className="main-container">
        <div className="container-fluid">
          {activeTab === 'dashboard' && <DashboardSection />}
          {activeTab === 'relays' && <RelaysSection />}
          {activeTab === 'safelist' && <SafelistSection />}
          {activeTab === 'ip' && <IpSection />}
          {activeTab === 'kind' && <KindBlacklistSection />}
          {activeTab === 'filters' && <FiltersSection />}
          {activeTab === 'logs' && <LogsSection />}
        </div>
      </main>
    </div>
  )
}

// Dashboard Section
function DashboardSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = () => {
      fetch('/api/stats')
        .then(res => res.json())
        .then(data => { setStats(data); setLoading(false); })
        .catch(() => setLoading(false));
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!stats) return <div className="empty-state">Failed to load statistics</div>;

  const maxRejections = Math.max(...stats.top_npubs_by_rejections.map(r => r.count), 1);

  return (
    <>
      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Connections</h3>
          <p className="stat-value">{stats.total_connections.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Active Sessions</h3>
          <p className="stat-value">{stats.active_connections.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <h3>Events Rejected</h3>
          <p className="stat-value">{stats.total_rejections.toLocaleString()}</p>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Rejections by Reason */}
        <div className="mini-panel">
          <div className="mini-panel-header">
            <span className="icon red"></span>
            Rejections by Reason
          </div>
          <div className="mini-list">
            {stats.rejections_by_reason.length === 0 ? (
              <div className="mini-list-item"><span className="label">No rejections yet</span></div>
            ) : (
              stats.rejections_by_reason.map(r => (
                <div className="mini-list-item" key={r.reason}>
                  <span className="label">{formatReason(r.reason)}</span>
                  <span className={`value ${getValueClass(r.count, maxRejections)}`}>{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Rejected Npubs */}
        <div className="mini-panel">
          <div className="mini-panel-header">
            <span className="icon purple"></span>
            Top Rejected Npubs
          </div>
          <div className="mini-list">
            {stats.top_npubs_by_rejections.length === 0 ? (
              <div className="mini-list-item"><span className="label">No data</span></div>
            ) : (
              stats.top_npubs_by_rejections.slice(0, 8).map(r => (
                <div className="mini-list-item" key={r.npub}>
                  <span className="label">{r.npub.slice(0, 20)}...</span>
                  <span className={`value ${getValueClass(r.count, maxRejections)}`}>{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Rejected IPs */}
        <div className="mini-panel">
          <div className="mini-panel-header">
            <span className="icon blue"></span>
            Top Rejected IPs
          </div>
          <div className="mini-list">
            {stats.top_ips_by_rejections.length === 0 ? (
              <div className="mini-list-item"><span className="label">No data</span></div>
            ) : (
              stats.top_ips_by_rejections.slice(0, 8).map(r => (
                <div className="mini-list-item" key={r.ip_address}>
                  <span className="label">{r.ip_address}</span>
                  <span className={`value ${getValueClass(r.count, maxRejections)}`}>{r.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function formatReason(reason: string): string {
  const map: Record<string, string> = {
    'banned_npub': 'Banned Npub',
    'banned_ip': 'Banned IP',
    'kind_blacklist': 'Kind Blacklist',
    'bot_filter': 'Bot Filter',
    'not_in_safelist': 'Not in Safelist',
    'filter_rule': 'Filter Rule',
  };
  return map[reason] || reason;
}

function getValueClass(value: number, max: number): string {
  const ratio = value / max;
  if (ratio > 0.7) return 'high';
  if (ratio > 0.3) return 'medium';
  return 'low';
}

// Relays Section
function RelaysSection() {
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchRelays = () => {
    fetch('/api/relay')
      .then(res => res.json())
      .then(data => { setRelays(data); setLoading(false); });
  };

  useEffect(() => { fetchRelays(); }, []);

  const addRelay = () => {
    if (!newUrl) return;
    // Add new relay to list and save
    const updated = [...relays, { url: newUrl, enabled: true }];
    fetch('/api/relay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relays: updated })
    }).then(() => { fetchRelays(); setNewUrl(''); });
  };

  const toggleRelay = (index: number) => {
    const updated = relays.map((r, i) => 
      i === index ? { ...r, enabled: !r.enabled } : r
    );
    fetch('/api/relay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relays: updated })
    }).then(fetchRelays);
  };

  const deleteRelay = (index: number) => {
    if (!confirm('Delete this relay?')) return;
    const updated = relays.filter((_, i) => i !== index);
    fetch('/api/relay', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relays: updated })
    }).then(fetchRelays);
  };

  if (loading) return <div className="loading">Loading...</div>;

  const activeRelay = relays.find(r => r.enabled);

  return (
    <div className="section">
      <h2>Backend Relay Settings</h2>
      
      {!activeRelay && (
        <div className="alert alert-warning">
          ⚠️ No backend relay configured. WebSocket connections will fail until a relay is added and enabled.
        </div>
      )}

      <div className="form-row">
        <input 
          placeholder="wss://relay.example.com" 
          value={newUrl} 
          onChange={e => setNewUrl(e.target.value)}
          className="wide"
        />
        <button onClick={addRelay}>Add Relay</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Relay URL</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {relays.length === 0 ? (
              <tr><td colSpan={3} className="empty-state">No relays configured</td></tr>
            ) : (
              relays.map((relay, index) => (
                <tr key={index}>
                  <td style={{ fontFamily: 'monospace' }}>{relay.url}</td>
                  <td>
                    {relay.enabled ? (
                      <span className="badge badge-success">ACTIVE</span>
                    ) : (
                      <span className="badge badge-secondary">DISABLED</span>
                    )}
                  </td>
                  <td>
                    <button 
                      className={`btn-small ${relay.enabled ? 'btn-warning' : 'btn-success'}`} 
                      onClick={() => toggleRelay(index)}
                    >
                      {relay.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn-small btn-secondary" onClick={() => deleteRelay(index)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="info-box">
        <h4>ℹ️ Note</h4>
        <p>The first enabled relay will be used as the backend. Currently, only one relay is used at a time.</p>
      </div>
    </div>
  );
}

// Safelist Section
function SafelistSection() {
  const [safelist, setSafelist] = useState<SafelistEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ npub: '', flags: 1, memo: '' });
  const [loading, setLoading] = useState(true);

  const fetchSafelist = () => {
    fetch('/api/safelist')
      .then(res => res.json())
      .then(data => { setSafelist(data); setLoading(false); });
  };

  useEffect(() => { fetchSafelist(); }, []);

  const addEntry = () => {
    if (!newEntry.npub) return;
    fetch('/api/safelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry)
    }).then(() => { fetchSafelist(); setNewEntry({ npub: '', flags: 1, memo: '' }); });
  };

  const deleteEntry = (npub: string) => {
    if (!confirm('Delete this entry?')) return;
    fetch(`/api/safelist/${encodeURIComponent(npub)}`, { method: 'DELETE' }).then(fetchSafelist);
  };

  const banNpub = (npub: string) => {
    fetch(`/api/safelist/${encodeURIComponent(npub)}/ban`, { method: 'PUT' }).then(fetchSafelist);
  };

  const unbanNpub = (npub: string) => {
    fetch(`/api/safelist/${encodeURIComponent(npub)}/unban`, { method: 'PUT' }).then(fetchSafelist);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Npub Management (Safelist)</h2>
      <div className="form-row">
        <input 
          placeholder="npub1..." 
          value={newEntry.npub} 
          onChange={e => setNewEntry({ ...newEntry, npub: e.target.value })}
          className="wide"
        />
        <label>
          <input 
            type="checkbox" 
            checked={(newEntry.flags & 1) === 1} 
            onChange={e => setNewEntry({ ...newEntry, flags: e.target.checked ? newEntry.flags | 1 : newEntry.flags & ~1 })} 
          />
          Post Allowed
        </label>
        <label>
          <input 
            type="checkbox" 
            checked={(newEntry.flags & 2) === 2} 
            onChange={e => setNewEntry({ ...newEntry, flags: e.target.checked ? newEntry.flags | 2 : newEntry.flags & ~2 })} 
          />
          Filter Bypass
        </label>
        <input 
          placeholder="Memo" 
          value={newEntry.memo} 
          onChange={e => setNewEntry({ ...newEntry, memo: e.target.value })} 
        />
        <button onClick={addEntry}>Add Entry</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Npub</th>
              <th>Status</th>
              <th>Post</th>
              <th>Bypass</th>
              <th>Memo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {safelist.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No entries</td></tr>
            ) : (
              safelist.map(s => (
                <tr key={s.npub} className={s.banned ? 'banned' : ''}>
                  <td className="truncate">{s.npub}</td>
                  <td>
                    {s.banned ? (
                      <span className="badge badge-danger">BANNED</span>
                    ) : (
                      <span className="badge badge-success">ACTIVE</span>
                    )}
                  </td>
                  <td>{(s.flags & 1) === 1 ? <span className="badge badge-info">✓</span> : '—'}</td>
                  <td>{(s.flags & 2) === 2 ? <span className="badge badge-warning">✓</span> : '—'}</td>
                  <td>{s.memo || '—'}</td>
                  <td>
                    {s.banned ? (
                      <button className="btn-small btn-success" onClick={() => unbanNpub(s.npub)}>Unban</button>
                    ) : (
                      <button className="btn-small btn-danger" onClick={() => banNpub(s.npub)}>Ban</button>
                    )}
                    <button className="btn-small btn-secondary" onClick={() => deleteEntry(s.npub)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// IP Section
function IpSection() {
  const [ipList, setIpList] = useState<IpAccessControl[]>([]);
  const [newIp, setNewIp] = useState({ ip_address: '', banned: false, whitelisted: false, memo: '' });
  const [loading, setLoading] = useState(true);

  const fetchIpList = () => {
    fetch('/api/ip-access-control')
      .then(res => res.json())
      .then(data => { setIpList(data); setLoading(false); });
  };

  useEffect(() => { fetchIpList(); }, []);

  const addIp = () => {
    if (!newIp.ip_address) return;
    fetch('/api/ip-access-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIp)
    }).then(() => { fetchIpList(); setNewIp({ ip_address: '', banned: false, whitelisted: false, memo: '' }); });
  };

  const deleteIp = (id: number) => {
    if (!confirm('Delete this IP?')) return;
    fetch(`/api/ip-access-control/${id}`, { method: 'DELETE' }).then(fetchIpList);
  };

  const toggleBan = (ip: IpAccessControl) => {
    fetch(`/api/ip-access-control/${ip.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ip, banned: !ip.banned })
    }).then(fetchIpList);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>IP Access Control</h2>
      <div className="form-row">
        <input 
          placeholder="IP Address (e.g., 192.168.1.1)" 
          value={newIp.ip_address} 
          onChange={e => setNewIp({ ...newIp, ip_address: e.target.value })} 
        />
        <label>
          <input type="checkbox" checked={newIp.banned} onChange={e => setNewIp({ ...newIp, banned: e.target.checked })} />
          Banned
        </label>
        <label>
          <input type="checkbox" checked={newIp.whitelisted} onChange={e => setNewIp({ ...newIp, whitelisted: e.target.checked })} />
          Whitelisted
        </label>
        <input placeholder="Memo" value={newIp.memo} onChange={e => setNewIp({ ...newIp, memo: e.target.value })} />
        <button onClick={addIp}>Add IP</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>IP Address</th><th>Status</th><th>Whitelisted</th><th>Memo</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {ipList.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No IPs configured</td></tr>
            ) : (
              ipList.map(ip => (
                <tr key={ip.id} className={ip.banned ? 'banned' : ''}>
                  <td style={{ fontFamily: 'monospace' }}>{ip.ip_address}</td>
                  <td>
                    {ip.banned ? (
                      <span className="badge badge-danger">BANNED</span>
                    ) : (
                      <span className="badge badge-success">ALLOWED</span>
                    )}
                  </td>
                  <td>{ip.whitelisted ? <span className="badge badge-info">✓</span> : '—'}</td>
                  <td>{ip.memo || '—'}</td>
                  <td>
                    <button className={`btn-small ${ip.banned ? 'btn-success' : 'btn-danger'}`} onClick={() => toggleBan(ip)}>
                      {ip.banned ? 'Unban' : 'Ban'}
                    </button>
                    <button className="btn-small btn-secondary" onClick={() => deleteIp(ip.id!)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Kind Blacklist Section
function KindBlacklistSection() {
  const [blacklist, setBlacklist] = useState<ReqKindBlacklist[]>([]);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [newKind, setNewKind] = useState({ kind_value: '', kind_min: '', kind_max: '' });
  const [loading, setLoading] = useState(true);

  const fetchBlacklist = () => {
    fetch('/api/req-kind-blacklist')
      .then(res => res.json())
      .then(data => { setBlacklist(data); setLoading(false); });
  };

  useEffect(() => { fetchBlacklist(); }, []);

  const addKind = () => {
    const body = mode === 'single'
      ? { kind_value: parseInt(newKind.kind_value), kind_min: null, kind_max: null, enabled: true }
      : { kind_value: null, kind_min: parseInt(newKind.kind_min), kind_max: parseInt(newKind.kind_max), enabled: true };
    
    if (mode === 'single' && isNaN(body.kind_value!)) return;
    if (mode === 'range' && (isNaN(body.kind_min!) || isNaN(body.kind_max!))) return;
    
    fetch('/api/req-kind-blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(() => { fetchBlacklist(); setNewKind({ kind_value: '', kind_min: '', kind_max: '' }); });
  };

  const toggleEnabled = (item: ReqKindBlacklist) => {
    fetch(`/api/req-kind-blacklist/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, enabled: !item.enabled })
    }).then(fetchBlacklist);
  };

  const deleteKind = (id: number) => {
    if (!confirm('Delete this rule?')) return;
    fetch(`/api/req-kind-blacklist/${id}`, { method: 'DELETE' }).then(fetchBlacklist);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Kind Blacklist</h2>
      <div className="form-row">
        <button className={mode === 'single' ? 'active' : 'btn-secondary'} onClick={() => setMode('single')}>
          Single Value
        </button>
        <button className={mode === 'range' ? 'active' : 'btn-secondary'} onClick={() => setMode('range')}>
          Range
        </button>
        <span style={{ width: '1rem' }}></span>
        {mode === 'single' ? (
          <input 
            type="number" 
            placeholder="Kind (e.g., 7)" 
            value={newKind.kind_value} 
            onChange={e => setNewKind({ ...newKind, kind_value: e.target.value })} 
          />
        ) : (
          <>
            <input 
              type="number" 
              placeholder="Min" 
              value={newKind.kind_min} 
              onChange={e => setNewKind({ ...newKind, kind_min: e.target.value })} 
              style={{ width: '80px' }}
            />
            <span>→</span>
            <input 
              type="number" 
              placeholder="Max" 
              value={newKind.kind_max} 
              onChange={e => setNewKind({ ...newKind, kind_max: e.target.value })}
              style={{ width: '80px' }}
            />
          </>
        )}
        <button onClick={addKind}>Add Rule</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Kind</th><th>Type</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {blacklist.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No rules configured</td></tr>
            ) : (
              blacklist.map(item => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {item.kind_value !== null ? item.kind_value : `${item.kind_min} → ${item.kind_max}`}
                  </td>
                  <td>
                    <span className={`badge ${item.kind_value !== null ? 'badge-info' : 'badge-warning'}`}>
                      {item.kind_value !== null ? 'SINGLE' : 'RANGE'}
                    </span>
                  </td>
                  <td>
                    <div 
                      className={`toggle ${item.enabled ? 'active' : ''}`} 
                      onClick={() => toggleEnabled(item)}
                    ></div>
                  </td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteKind(item.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Filters Section
function FiltersSection() {
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [newFilter, setNewFilter] = useState({ name: '', nl_text: '' });
  const [loading, setLoading] = useState(true);

  const fetchFilters = () => {
    fetch('/api/filters')
      .then(res => res.json())
      .then(data => { setFilters(data); setLoading(false); });
  };

  useEffect(() => { fetchFilters(); }, []);

  const addFilter = () => {
    if (!newFilter.name || !newFilter.nl_text) return;
    fetch('/api/filters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFilter)
    }).then(() => { fetchFilters(); setNewFilter({ name: '', nl_text: '' }); });
  };

  const toggleEnabled = (filter: FilterRule) => {
    fetch(`/api/filters/${filter.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...filter, enabled: !filter.enabled })
    }).then(fetchFilters);
  };

  const deleteFilter = (id: number) => {
    if (!confirm('Delete this filter?')) return;
    fetch(`/api/filters/${id}`, { method: 'DELETE' }).then(fetchFilters);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Filter Rules</h2>
      <div className="form-row">
        <input 
          placeholder="Rule Name" 
          value={newFilter.name} 
          onChange={e => setNewFilter({ ...newFilter, name: e.target.value })} 
        />
        <input 
          placeholder="Natural language condition..." 
          value={newFilter.nl_text} 
          onChange={e => setNewFilter({ ...newFilter, nl_text: e.target.value })} 
          className="wide"
        />
        <button onClick={addFilter}>Add Rule</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Name</th><th>Condition</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filters.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No filters configured</td></tr>
            ) : (
              filters.map(filter => (
                <tr key={filter.id}>
                  <td style={{ fontWeight: 500 }}>{filter.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{filter.nl_text}</td>
                  <td>
                    <div 
                      className={`toggle ${filter.enabled ? 'active' : ''}`} 
                      onClick={() => toggleEnabled(filter)}
                    ></div>
                  </td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteFilter(filter.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Logs Section
function LogsSection() {
  const [logType, setLogType] = useState<'rejection' | 'connection'>('rejection');
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [rejectionLogs, setRejectionLogs] = useState<EventRejectionLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (logType === 'connection') {
      fetch('/api/connection-logs?limit=100')
        .then(res => res.json())
        .then(data => { setConnectionLogs(data); setLoading(false); });
    } else {
      fetch('/api/event-rejection-logs?limit=100')
        .then(res => res.json())
        .then(data => { setRejectionLogs(data); setLoading(false); });
    }
  }, [logType]);

  return (
    <div className="section">
      <h2>Event Logs</h2>
      <div className="form-row">
        <button 
          className={logType === 'rejection' ? 'active' : 'btn-secondary'} 
          onClick={() => setLogType('rejection')}
        >
          Rejection Logs
        </button>
        <button 
          className={logType === 'connection' ? 'active' : 'btn-secondary'} 
          onClick={() => setLogType('connection')}
        >
          Connection Logs
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading logs...</div>
      ) : logType === 'rejection' ? (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Time</th><th>Reason</th><th>Kind</th><th>Npub</th><th>IP</th></tr>
            </thead>
            <tbody>
              {rejectionLogs.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No rejection logs</td></tr>
              ) : (
                rejectionLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td><span className="badge badge-danger">{formatReason(log.reason)}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{log.kind}</td>
                    <td className="truncate">{log.npub}</td>
                    <td style={{ fontFamily: 'monospace' }}>{log.ip_address || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr><th>Connected</th><th>Disconnected</th><th>IP</th><th>Events</th><th>Rejected</th></tr>
            </thead>
            <tbody>
              {connectionLogs.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No connection logs</td></tr>
              ) : (
                connectionLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.connected_at).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {log.disconnected_at ? (
                        new Date(log.disconnected_at).toLocaleString()
                      ) : (
                        <span className="badge badge-success">ACTIVE</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{log.ip_address}</td>
                    <td style={{ fontFamily: 'monospace' }}>{log.event_count}</td>
                    <td>
                      {log.rejected_event_count > 0 ? (
                        <span className="badge badge-danger">{log.rejected_event_count}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App
