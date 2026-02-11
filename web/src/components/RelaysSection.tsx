import { useState, useEffect } from 'react';
import { api } from '../api';
import { RelayStatusBar } from './RelayStatusBar';
import type { RelayConfig, RelayStatusItem } from '../types';

export function RelaysSection() {
  const [relays, setRelays] = useState<RelayConfig[]>([]);
  const [relayStatuses, setRelayStatuses] = useState<RelayStatusItem[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [nip11Modal, setNip11Modal] = useState<{ url: string; data: Record<string, unknown> } | null>(null);
  const [nip11Loading, setNip11Loading] = useState(false);
  const [nip11Error, setNip11Error] = useState<string | null>(null);

  const fetchRelays = () => {
    api.getRelay()
      .then(data => { setRelays(data); setLoading(false); });
  };

  const fetchStatus = () => {
    api.getRelayStatus()
      .then(data => setRelayStatuses(data.relays ?? []))
      .catch(() => setRelayStatuses([]));
  };

  useEffect(() => { fetchRelays(); }, []);
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  const openAddWithNip11 = () => {
    if (!newUrl.trim()) return;
    setNip11Error(null);
    setNip11Loading(true);
    api.getRelayNip11(newUrl.trim())
      .then(data => {
        setNip11Modal({ url: newUrl.trim(), data });
        setNip11Loading(false);
      })
      .catch(() => {
        setNip11Error('Failed to fetch NIP-11 info');
        setNip11Loading(false);
      });
  };

  const confirmAddRelay = () => {
    if (!nip11Modal) return;
    const url = nip11Modal.url;
    const updated = [...relays, { url, enabled: true }];
    api.putRelay({ relays: updated }).then(() => {
      fetchRelays();
      setNewUrl('');
      setNip11Modal(null);
    });
  };

  const addRelay = () => {
    if (!newUrl.trim()) return;
    openAddWithNip11();
  };

  const toggleRelay = (index: number) => {
    const updated = relays.map((r, i) =>
      i === index ? { ...r, enabled: !r.enabled } : r
    );
    api.putRelay({ relays: updated }).then(fetchRelays);
  };

  const deleteRelay = (index: number) => {
    if (!confirm('Delete this relay?')) return;
    const updated = relays.filter((_, i) => i !== index);
    api.putRelay({ relays: updated }).then(fetchRelays);
  };

  if (loading) return <div className="loading">Loading...</div>;

  const activeRelay = relays.find(r => r.enabled);

  return (
    <div className="section">
      <h2>Backend Relay Settings</h2>

      {!activeRelay && (
        <div className="alert alert-warning">
          No backend relay configured. WebSocket connections will fail until a relay is added and enabled.
        </div>
      )}

      <div className="form-row">
        <input
          placeholder="wss://relay.example.com"
          value={newUrl}
          onChange={e => { setNewUrl(e.target.value); setNip11Error(null); }}
          className="wide"
        />
        <button onClick={addRelay} disabled={nip11Loading}>
          {nip11Loading ? 'Fetching...' : 'Add Relay'}
        </button>
      </div>
      {nip11Error != null && (
        <div className="alert alert-warning" style={{ marginTop: '0.5rem' }}>{nip11Error}</div>
      )}

      {nip11Modal != null && (
        <div className="modal-overlay" onClick={() => setNip11Modal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>NIP-11 Relay Info</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{nip11Modal.url}</p>
            <pre className="nip11-json">{JSON.stringify(nip11Modal.data, null, 2)}</pre>
            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <button onClick={confirmAddRelay}>Confirm Add</button>
              <button className="btn-secondary" onClick={() => setNip11Modal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

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
              relays.map((relay, index) => {
                const statusItem = relayStatuses.find(s => s.url === relay.url);
                return (
                <tr key={index}>
                  <td style={{ fontFamily: 'monospace' }}>{relay.url}</td>
                  <td>
                    <div>
                      {relay.enabled ? (
                        statusItem?.status === 'connected' ? (
                          <span className="badge badge-success">CONNECTED</span>
                        ) : statusItem?.status === 'connecting' ? (
                          <span className="badge badge-warning">CONNECTING</span>
                        ) : statusItem?.status === 'disconnected' ? (
                          <span className="badge badge-danger">DISCONNECTED</span>
                        ) : (
                          <span className="badge badge-success">ACTIVE</span>
                        )
                      ) : (
                        <span className="badge badge-secondary">DISABLED</span>
                      )}
                    </div>
                    {statusItem != null && statusItem.uptime_history.length > 0 && (
                      <RelayStatusBar
                        uptimeHistory={statusItem.uptime_history}
                      />
                    )}
                    {statusItem?.last_error != null && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.25rem' }}>
                        {statusItem.last_error}
                      </div>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="info-box">
        <h4>Note</h4>
        <p>The first enabled relay will be used as the backend. Currently, only one relay is used at a time.</p>
      </div>
    </div>
  );
}
