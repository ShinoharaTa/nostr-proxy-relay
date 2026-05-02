import { useEffect, useRef, useState } from 'react';
import type { LiveEvent } from '../types';

const TYPE_BADGE: Record<LiveEvent['type'], string> = {
  event_accepted: 'badge-success',
  event_rejected: 'badge-danger',
  event_delivered: 'badge-info',
  event_dropped: 'badge-warning',
  connection_opened: 'badge-info',
  connection_closed: 'badge-secondary',
};

const TYPE_LABEL: Record<LiveEvent['type'], string> = {
  event_accepted: 'POST OK',
  event_rejected: 'POST REJECT',
  event_delivered: 'REQ DELIVER',
  event_dropped: 'REQ DROP',
  connection_opened: 'CONNECT',
  connection_closed: 'DISCONNECT',
};

function summarize(e: LiveEvent): string {
  switch (e.type) {
    case 'event_accepted':
      return `kind=${e.kind} npub=${e.npub.slice(0, 16)}… ip=${e.ip ?? '-'}`;
    case 'event_rejected':
      return `kind=${e.kind} npub=${e.npub.slice(0, 16)}… ip=${e.ip ?? '-'} reason=${e.reason}`;
    case 'event_delivered':
      return `kind=${e.kind} npub=${e.npub.slice(0, 16)}… sub=${e.sub_id}`;
    case 'event_dropped':
      return `kind=${e.kind} npub=${e.npub.slice(0, 16)}… sub=${e.sub_id} reason=${e.reason}`;
    case 'connection_opened':
    case 'connection_closed':
      return `ip=${e.ip}`;
  }
}

const MAX_BUFFER = 500;

export function LiveEventsSection() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<{
    accepted: boolean;
    rejected: boolean;
    delivered: boolean;
    dropped: boolean;
    conn: boolean;
  }>({
    accepted: true,
    rejected: true,
    delivered: true,
    dropped: true,
    conn: true,
  });
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = ev => {
      if (pausedRef.current) return;
      try {
        const data = JSON.parse(ev.data) as LiveEvent;
        setEvents(prev => {
          const next = [data, ...prev];
          if (next.length > MAX_BUFFER) next.length = MAX_BUFFER;
          return next;
        });
      } catch {
        // ignore parse error
      }
    };
    return () => es.close();
  }, []);

  const visible = events.filter(e => {
    if (e.type === 'event_accepted') return filter.accepted;
    if (e.type === 'event_rejected') return filter.rejected;
    if (e.type === 'event_delivered') return filter.delivered;
    if (e.type === 'event_dropped') return filter.dropped;
    return filter.conn;
  });

  return (
    <div className="section">
      <h2>
        Live Events
        <span
          className={`badge ${connected ? 'badge-success' : 'badge-danger'}`}
          style={{ marginLeft: 8 }}
        >
          {connected ? 'STREAMING' : 'DISCONNECTED'}
        </span>
      </h2>
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          Server-Sent Events で受信中のリアルタイム配信です。直近 {MAX_BUFFER} 件まで保持し、
          ページを離れるとリセットされます。
        </p>
      </div>

      <div className="form-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          className={paused ? 'btn-success' : 'btn-warning'}
          onClick={() => setPaused(p => !p)}
        >
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        <button className="btn-secondary" onClick={() => setEvents([])}>
          Clear
        </button>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filter.accepted}
            onChange={e => setFilter({ ...filter, accepted: e.target.checked })}
          />
          POST OK
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filter.rejected}
            onChange={e => setFilter({ ...filter, rejected: e.target.checked })}
          />
          POST REJECT
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filter.delivered}
            onChange={e => setFilter({ ...filter, delivered: e.target.checked })}
          />
          REQ DELIVER
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filter.dropped}
            onChange={e => setFilter({ ...filter, dropped: e.target.checked })}
          />
          REQ DROP
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={filter.conn}
            onChange={e => setFilter({ ...filter, conn: e.target.checked })}
          />
          CONNECT
        </label>
      </div>

      <div className="table-container" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 170 }}>Time</th>
              <th style={{ width: 130 }}>Type</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-state">
                  まだイベントはありません
                </td>
              </tr>
            ) : (
              visible.map((e, idx) => (
                <tr key={idx}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </td>
                  <td>
                    <span className={`badge ${TYPE_BADGE[e.type]}`}>{TYPE_LABEL[e.type]}</span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{summarize(e)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
