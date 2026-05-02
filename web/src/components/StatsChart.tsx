import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';
import type { StatsTimeseriesBucket } from '../types';

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
];

export function StatsChart() {
  const [data, setData] = useState<StatsTimeseriesBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('1h');

  useEffect(() => {
    setLoading(true);
    api
      .getStatsTimeseries({ period })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [period]);

  return (
    <div className="stats-chart-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h3>Events over time</h3>
        <div className="form-row" style={{ gap: 4 }}>
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              className={`btn-small ${period === p.value ? 'active' : 'btn-secondary'}`}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="loading">Loading chart...</div>
      ) : data.length === 0 ? (
        <div className="empty-state">No time series data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
              labelStyle={{ color: 'var(--text-primary)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="posted" stroke="var(--success)" strokeWidth={2} dot={false} name="Posted" />
            <Line
              type="monotone"
              dataKey="delivered"
              stroke="var(--info)"
              strokeWidth={2}
              dot={false}
              name="Delivered"
            />
            <Line
              type="monotone"
              dataKey="rejections"
              stroke="var(--danger)"
              strokeWidth={2}
              dot={false}
              name="Rejected"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
