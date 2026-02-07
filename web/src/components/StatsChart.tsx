import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import type { StatsTimeseriesBucket } from '../types';

export function StatsChart() {
  const [data, setData] = useState<StatsTimeseriesBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getStatsTimeseries({ period: '1h' })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading chart...</div>;
  if (data.length === 0) return <div className="empty-state">No time series data yet</div>;

  return (
    <div className="stats-chart-container">
      <h3 style={{ marginBottom: '0.5rem' }}>Rejections over time</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
            labelStyle={{ color: 'var(--text-primary)' }}
          />
          <Line type="monotone" dataKey="rejections" stroke="var(--danger)" strokeWidth={2} dot={false} name="Rejections" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
