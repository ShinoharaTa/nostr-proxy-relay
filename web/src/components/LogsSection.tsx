import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import type { ConnectionLog, EventRejectionLog } from '../types';

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

export function LogsSection() {
  const [logType, setLogType] = useState<'rejection' | 'connection'>('rejection');
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [rejectionLogs, setRejectionLogs] = useState<EventRejectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRejection, setFilterRejection] = useState({ npub: '', kind: '', reason: '', from: '', to: '' });
  const [filterConnection, setFilterConnection] = useState({ ip_address: '', from: '', to: '' });

  const fetchLogs = useCallback(() => {
    setLoading(true);
    if (logType === 'connection') {
      const params: { limit: number; ip_address?: string; from?: string; to?: string } = { limit: 100 };
      if (filterConnection.ip_address.trim()) params.ip_address = filterConnection.ip_address.trim();
      if (filterConnection.from.trim()) params.from = filterConnection.from.trim();
      if (filterConnection.to.trim()) params.to = filterConnection.to.trim();
      api.getConnectionLogs(params)
        .then(data => { setConnectionLogs(data); setLoading(false); });
    } else {
      const params: { limit: number; npub?: string; kind?: number; reason?: string; from?: string; to?: string } = { limit: 100 };
      if (filterRejection.npub.trim()) params.npub = filterRejection.npub.trim();
      if (filterRejection.kind.trim()) params.kind = parseInt(filterRejection.kind, 10);
      if (filterRejection.reason.trim()) params.reason = filterRejection.reason.trim();
      if (filterRejection.from.trim()) params.from = filterRejection.from.trim();
      if (filterRejection.to.trim()) params.to = filterRejection.to.trim();
      api.getEventRejectionLogs(params)
        .then(data => { setRejectionLogs(data); setLoading(false); });
    }
  }, [logType, filterRejection.npub, filterRejection.kind, filterRejection.reason, filterRejection.from, filterRejection.to, filterConnection.ip_address, filterConnection.from, filterConnection.to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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

      {logType === 'rejection' ? (
        <div className="logs-filter-bar">
          <input
            placeholder="Npub (partial)"
            value={filterRejection.npub}
            onChange={e => setFilterRejection(f => ({ ...f, npub: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Kind"
            value={filterRejection.kind}
            onChange={e => setFilterRejection(f => ({ ...f, kind: e.target.value }))}
            style={{ width: '80px' }}
          />
          <input
            placeholder="Reason (partial)"
            value={filterRejection.reason}
            onChange={e => setFilterRejection(f => ({ ...f, reason: e.target.value }))}
          />
          <input
            type="datetime-local"
            placeholder="From"
            value={filterRejection.from}
            onChange={e => setFilterRejection(f => ({ ...f, from: e.target.value }))}
          />
          <input
            type="datetime-local"
            placeholder="To"
            value={filterRejection.to}
            onChange={e => setFilterRejection(f => ({ ...f, to: e.target.value }))}
          />
          <button onClick={fetchLogs}>Apply</button>
        </div>
      ) : (
        <div className="logs-filter-bar">
          <input
            placeholder="IP (partial)"
            value={filterConnection.ip_address}
            onChange={e => setFilterConnection(f => ({ ...f, ip_address: e.target.value }))}
          />
          <input
            type="datetime-local"
            placeholder="From"
            value={filterConnection.from}
            onChange={e => setFilterConnection(f => ({ ...f, from: e.target.value }))}
          />
          <input
            type="datetime-local"
            placeholder="To"
            value={filterConnection.to}
            onChange={e => setFilterConnection(f => ({ ...f, to: e.target.value }))}
          />
          <button onClick={fetchLogs}>Apply</button>
        </div>
      )}

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
