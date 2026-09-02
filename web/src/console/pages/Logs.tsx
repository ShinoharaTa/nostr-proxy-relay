import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Pill, DataList, type Column, Tag } from '../primitives';
import { Icon } from '../icons/Icon';
import { Logs as LogsApi } from '../api';
import type { ConnectionLogRow, EventRejectionLogRow, RelayEventLogRow } from '../api';
import { durationBetween, shortDateTime } from '../utils/format';

type TabId = 'rejection' | 'connection' | 'backend';

const TABS = [
  { id: 'rejection',  label: 'REJECTION' },
  { id: 'connection', label: 'CONNECTION' },
  { id: 'backend',    label: 'BACKEND RELAY' },
];

const PAGE_SIZE = 50;

export function LogsPage() {
  const [tab, setTab] = useState<TabId>('rejection');
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>LOGS <span className="crt-hud-tag">{tab}</span></>}
        actions={<Pill items={TABS} active={tab} onChange={(v) => setTab(v as TabId)} ariaLabel="log tabs" />}
      >
        {tab === 'rejection'  && <RejectionTab />}
        {tab === 'connection' && <ConnectionTab />}
        {tab === 'backend'    && <BackendTab />}
      </Card>
    </div>
  );
}

/* ─── Rejection ─── */
function RejectionTab() {
  const [npub, setNpub]     = useState('');
  const [kind, setKind]     = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage]     = useState(0);
  const [rows, setRows]     = useState<EventRejectionLogRow[] | null>(null);
  const [busy, setBusy]     = useState(false);

  useEffect(() => { setPage(0); }, [npub, kind, reason]);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    setBusy(true);
    LogsApi.rejection(
      {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        npub: npub || undefined,
        kind: kind ? Number(kind) : undefined,
        reason: reason || undefined,
      },
      ctl.signal,
    )
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; ctl.abort(); };
  }, [npub, kind, reason, page]);

  const cols: Column<EventRejectionLogRow>[] = [
    { key: 'ts',     label: 'TIME',   render: (r) => <code>{shortDateTime(r.created_at)}</code>, width: 120 },
    { key: 'kind',   label: 'KIND',   render: (r) => <Tag variant="alert">k{r.kind}</Tag>, width: 70 },
    { key: 'npub',   label: 'NPUB',
      render: (r) => r.npub
        ? <Link to={`/investigate?authors=${encodeURIComponent(r.npub)}`} title="調査画面で開く">
            <code className="logs-cell-mono">{r.npub}</code>
          </Link>
        : '—' },
    { key: 'ip',     label: 'IP',     render: (r) => <code>{r.ip_address ?? '—'}</code>, hideOnMobile: true, width: 130 },
    { key: 'reason', label: 'REASON', render: (r) => <span title={r.reason}>{r.reason}</span> },
  ];

  return (
    <>
      <FilterBar>
        <input className="crt-input" placeholder="npub..."  value={npub}   onChange={(e) => setNpub(e.target.value)} />
        <input className="crt-input crt-input--narrow" placeholder="kind"   value={kind}   onChange={(e) => setKind(e.target.value.replace(/[^0-9]/g, ''))} />
        <input className="crt-input" placeholder="reason..." value={reason} onChange={(e) => setReason(e.target.value)} />
      </FilterBar>
      <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)} emptyTitle={busy ? 'LOADING' : 'NO RECORDS'} />
      <Pager page={page} hasNext={(rows?.length ?? 0) >= PAGE_SIZE} onPage={setPage} />
    </>
  );
}

/* ─── Connection ─── */
function ConnectionTab() {
  const [ip, setIp] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ConnectionLogRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPage(0); }, [ip]);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    setBusy(true);
    LogsApi.connection({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, ip_address: ip || undefined }, ctl.signal)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; ctl.abort(); };
  }, [ip, page]);

  const cols: Column<ConnectionLogRow>[] = [
    { key: 'connected', label: 'CONNECTED',  render: (r) => <code>{shortDateTime(r.connected_at)}</code>, width: 130 },
    { key: 'ip',        label: 'IP',         render: (r) => <code>{r.ip_address}</code>, width: 150 },
    { key: 'duration',  label: 'DURATION',   render: (r) => durationBetween(r.connected_at, r.disconnected_at), width: 110, hideOnMobile: true },
    { key: 'events',    label: 'EVENTS',     sortValue: (r) => r.event_count,
      render: (r) => `${r.event_count.toLocaleString()} / ${r.rejected_event_count.toLocaleString()} rej`, width: 150, hideOnMobile: true },
    { key: 'rejected',  label: 'REJ',        sortValue: (r) => r.rejected_event_count,
      render: (r) => r.rejected_event_count > 0
        ? <span style={{ color: 'var(--crt-danger-text)' }}>{r.rejected_event_count.toLocaleString()}</span>
        : '0', width: 70, hideOnMobile: true },
    { key: 'status',    label: 'STATUS',     render: (r) => r.disconnected_at ? <Tag variant="dim">CLOSED</Tag> : <Tag variant="info">OPEN</Tag>, width: 90 },
  ];

  return (
    <>
      <FilterBar>
        <input className="crt-input" placeholder="ip..." value={ip} onChange={(e) => setIp(e.target.value)} />
      </FilterBar>
      <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)} emptyTitle={busy ? 'LOADING' : 'NO RECORDS'} />
      <Pager page={page} hasNext={(rows?.length ?? 0) >= PAGE_SIZE} onPage={setPage} />
    </>
  );
}

/* ─── Backend ─── */
function BackendTab() {
  const [url, setUrl] = useState('');
  const [type, setType] = useState('');
  const [rows, setRows] = useState<RelayEventLogRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();
    setBusy(true);
    LogsApi.backend({ limit: 200, relay_url: url || undefined, event_type: type || undefined }, ctl.signal)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; ctl.abort(); };
  }, [url, type]);

  const cols: Column<RelayEventLogRow>[] = [
    { key: 'ts',     label: 'TIME',  render: (r) => <code>{shortDateTime(r.created_at)}</code>, width: 130 },
    { key: 'type',   label: 'EVENT', render: (r) => <Tag variant={badgeVariant(r.event_type)}>{r.event_type}</Tag>, width: 130 },
    { key: 'url',    label: 'RELAY', render: (r) => <code>{r.relay_url}</code> },
    { key: 'detail', label: 'DETAIL', render: (r) => <span title={r.detail}>{r.detail || '—'}</span>, hideOnMobile: true },
  ];

  return (
    <>
      <FilterBar>
        <input className="crt-input" placeholder="relay url..." value={url}  onChange={(e) => setUrl(e.target.value)} />
        <input className="crt-input crt-input--narrow" placeholder="event type" value={type} onChange={(e) => setType(e.target.value)} />
      </FilterBar>
      <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)} emptyTitle={busy ? 'LOADING' : 'NO RECORDS'} />
    </>
  );
}

/* ─── Helpers ─── */

function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
      {children}
    </div>
  );
}

function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontFamily: 'var(--crt-font-mono)' }}>
      <Button variant="ghost" disabled={page <= 0} onClick={() => onPage(Math.max(0, page - 1))}>
        <Icon name="arrow-up" /> PREV
      </Button>
      <span className="crt-hud-tag">page {page + 1}</span>
      <Button variant="ghost" disabled={!hasNext} onClick={() => onPage(page + 1)}>
        NEXT <Icon name="arrow-down" />
      </Button>
    </div>
  );
}

function badgeVariant(t: string): 'info' | 'warn' | 'alert' | 'accent' | 'dim' {
  const lc = t.toLowerCase();
  if (lc.includes('error') || lc.includes('fail') || lc.includes('disconn')) return 'alert';
  if (lc.includes('warn') || lc.includes('reconnect')) return 'warn';
  if (lc.includes('connect')) return 'info';
  return 'dim';
}
