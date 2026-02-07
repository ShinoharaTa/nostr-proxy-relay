import { useState, useEffect } from 'react';
import { api } from '../api';
import { StatsChart } from './StatsChart';
import type { Stats } from '../types';

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

export function DashboardSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = () => {
      api.getStats()
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
      <div className="info-box" style={{ marginBottom: '1.5rem' }}>
        <h4>Proxy Nostr Relay</h4>
        <p>This relay sits between clients and backend relays. It enforces a safelist for posting (EVENT), filters incoming events (REQ responses) with Simple BAN rules and DSL filter rules, and provides relay health monitoring and metrics.</p>
      </div>
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

      <div className="stats-chart-wrapper" style={{ marginBottom: '1.5rem' }}>
        <StatsChart />
      </div>
      <div className="dashboard-grid">
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
