import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Button, Pill, StatusDot, Tag } from '../primitives';
import { Icon } from '../icons/Icon';
import type { LiveEvent } from '../api';
import { ago, shortTimeOnly } from '../utils/format';

const FILTERS = [
  { id: 'all',       label: 'ALL' },
  { id: 'accepted',  label: 'ACCEPTED' },
  { id: 'delivered', label: 'DELIVERED' },
  { id: 'rejected',  label: 'REJECTED' },
  { id: 'dropped',   label: 'DROPPED' },
];

const MAX_BUFFER = 500;

/**
 * `/api/events/stream` (SSE) をリアルタイム表示。
 *
 * 仕様: docs/ui_redesign_ja.md §5.3
 * - フィルタチップ (accepted / delivered / rejected / dropped)
 * - pause / clear
 * - スマホ等幅 + カード化
 */
export function LiveEvents() {
  const [filter, setFilter] = useState('all');
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connState, setConnState] = useState<'connecting' | 'live' | 'disconnected'>('connecting');

  useEffect(() => {
    let alive = true;
    const es = new EventSource('/api/events/stream');
    setConnState('connecting');

    es.onopen = () => { if (alive) setConnState('live'); };
    es.onerror = () => { if (alive) setConnState('disconnected'); };
    es.onmessage = (msg) => {
      if (pausedRef.current) return;
      try {
        const parsed = JSON.parse(msg.data) as LiveEvent;
        setEvents((prev) => {
          const next = [parsed, ...prev];
          if (next.length > MAX_BUFFER) next.length = MAX_BUFFER;
          return next;
        });
      } catch {
        /* ignore parse error */
      }
    };

    return () => {
      alive = false;
      es.close();
    };
  }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => (e.kind ?? '').toLowerCase().includes(filter));
  }, [events, filter]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={
          <>
            LIVE EVENTS
            <span className="crt-hud-tag">{visible.length} / {events.length}</span>
            {connState === 'live' && <StatusDot variant="live">stream open</StatusDot>}
            {connState === 'connecting' && <StatusDot variant="warn">connecting…</StatusDot>}
            {connState === 'disconnected' && <StatusDot variant="alert">stream lost</StatusDot>}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              iconOnly
              aria-label={paused ? 'resume' : 'pause'}
              onClick={() => setPaused((p) => !p)}
              title={paused ? 'Resume' : 'Pause'}
            >
              <Icon name={paused ? 'play' : 'pause'} />
            </Button>
            <Button
              variant="ghost"
              iconOnly
              aria-label="clear"
              onClick={() => setEvents([])}
              title="Clear"
            >
              <Icon name="close" />
            </Button>
          </>
        }
      >
        <div style={{ marginBottom: 10 }}>
          <Pill items={FILTERS} active={filter} onChange={setFilter} ariaLabel="filter" />
        </div>

        {visible.length === 0 ? (
          <div className="crt-empty">
            <div className="crt-empty__title">{paused ? 'PAUSED' : 'WAITING FOR EVENTS'}</div>
            <div>{paused ? 'pause を解除するとストリームが再開します' : 'まだイベントが届いていません'}</div>
          </div>
        ) : (
          <ul className="live-stream">
            {visible.slice(0, 200).map((e, i) => (
              <li key={`${e.ts}-${i}`} className="live-stream__row">
                <span className="live-stream__ts">{shortTimeOnly(e.ts)}</span>
                <KindTag kind={e.kind} />
                {typeof e.event_kind === 'number' && (
                  <span className="crt-hud-tag">k{e.event_kind}</span>
                )}
                {e.npub && <code className="live-stream__npub">{shortNpub(e.npub)}</code>}
                {e.ip && <code className="live-stream__ip">{e.ip}</code>}
                {(e.reason || e.detail) && (
                  <span className="live-stream__reason" title={(e.reason || e.detail) ?? ''}>
                    {e.reason || e.detail}
                  </span>
                )}
                <span className="live-stream__age">{ago(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function KindTag({ kind }: { kind: string }) {
  const lc = (kind ?? '').toLowerCase();
  if (lc.includes('reject')) return <Tag variant="alert">REJECT</Tag>;
  if (lc.includes('drop'))   return <Tag variant="warn">DROP</Tag>;
  if (lc.includes('deliver')) return <Tag variant="accent">DELIVER</Tag>;
  if (lc.includes('accept')) return <Tag variant="info">ACCEPT</Tag>;
  return <Tag variant="dim">{(kind || '?').toUpperCase()}</Tag>;
}

function shortNpub(s: string): string {
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}
