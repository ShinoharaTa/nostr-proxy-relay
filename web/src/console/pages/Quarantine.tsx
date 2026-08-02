import { useEffect, useMemo, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Tag, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Quarantine as QApi } from '../api';
import type { QuarantineRow, QuarantineScope } from '../api';
import { ago, shortDateTime } from '../utils/format';
import { useI18n } from '../i18n';

const PRESET_DURATIONS: { label: string; secs: number | null }[] = [
  { label: '15 min', secs: 15 * 60 },
  { label: '1 hr',   secs: 60 * 60 },
  { label: '6 hr',   secs: 6 * 60 * 60 },
  { label: '24 hr',  secs: 24 * 60 * 60 },
  { label: '7 day',  secs: 7 * 24 * 60 * 60 },
  { label: '∞',      secs: null },
];

const SCOPES: { id: QuarantineScope; label: string }[] = [
  { id: 'all',  label: 'ALL' },
  { id: 'post', label: 'POST' },
  { id: 'req',  label: 'REQ' },
];

export function QuarantinePage() {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<QuarantineRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const reload = () => QApi.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  const release = async (id: number, npub: string) => {
    if (!confirm(t.quarantine.confirmRelease(npub))) return;
    try { await QApi.remove(id); toast.push({ variant: 'ok', message: t.quarantine.released }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
  };

  const cols: Column<QuarantineRow>[] = [
    { key: 'npub',  label: 'NPUB',  render: (r) => <code className="logs-cell-mono">{r.npub}</code> },
    { key: 'scope', label: 'SCOPE', width: 80,
      render: (r) => <Tag variant={r.scope === 'all' ? 'alert' : 'warn'}>{r.scope.toUpperCase()}</Tag> },
    { key: 'reason', label: 'REASON', render: (r) => r.reason || '—', hideOnMobile: true },
    { key: 'created', label: 'STARTED', render: (r) => <span title={r.created_at}>{ago(r.created_at)}</span>, width: 100 },
    { key: 'expires', label: 'EXPIRES', width: 130,
      render: (r) => r.expires_at
        ? <RemainingBadge expiresAt={r.expires_at} />
        : <Tag variant="alert">PERMANENT</Tag> },
    { key: 'actions', label: '', width: 100,
      render: (r) => r.active
        ? <Button variant="ghost" iconOnly onClick={() => release(r.id, r.npub)} title="release"><Icon name="eye" /></Button>
        : <Tag variant="dim">RELEASED</Tag>,
    },
  ];

  const active = (rows ?? []).filter((r) => r.active);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>QUARANTINE <span className="crt-hud-tag">{active.length} active / {rows?.length ?? 0} total</span></>}
        actions={<Button variant="primary" onClick={() => setDrawerOpen(true)}><Icon name="plus" /> QUARANTINE</Button>}
      >
        <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)}
          emptyTitle="NO QUARANTINE" emptyHint={t.quarantine.emptyHint} />
      </Card>

      <AddDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={async (body) => {
          try {
            await QApi.create(body);
            toast.push({ variant: 'ok', message: t.quarantine.created });
            setDrawerOpen(false);
            reload();
          } catch (e) {
            toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
          }
        }}
      />
    </div>
  );
}

function RemainingBadge({ expiresAt }: { expiresAt: string }) {
  const remaining = useMemo(() => {
    const t = Date.parse(expiresAt.replace(' ', 'T') + 'Z');
    return Number.isFinite(t) ? Math.max(0, Math.floor((t - Date.now()) / 1000)) : 0;
  }, [expiresAt]);

  if (remaining <= 0) return <Tag variant="dim">EXPIRED</Tag>;
  const min = Math.floor(remaining / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const label = day > 0 ? `${day}d ${hr % 24}h`
              : hr  > 0 ? `${hr}h ${min % 60}m`
              :          `${min}m`;
  return <Tag variant={remaining < 600 ? 'warn' : 'info'}><Icon name="clock" size={12} /> {label}</Tag>;
}

interface AddProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: { npub: string; scope: QuarantineScope; reason: string; duration_secs: number | null }) => void;
}
function AddDrawer({ open, onClose, onSubmit }: AddProps) {
  const [npub, setNpub] = useState('');
  const [scope, setScope] = useState<QuarantineScope>('all');
  const [reason, setReason] = useState('');
  const [secs, setSecs] = useState<number | null>(60 * 60);

  useEffect(() => { if (open) { setNpub(''); setScope('all'); setReason(''); setSecs(60 * 60); } }, [open]);

  return (
    <Drawer open={open} onClose={onClose} title="QUARANTINE NPUB">
      <div className="form-grid">
        <label><span>npub</span><input className="crt-input" placeholder="npub1..." value={npub} onChange={(e) => setNpub(e.target.value)} /></label>
        <label>
          <span>scope</span>
          <select className="crt-input" value={scope} onChange={(e) => setScope(e.target.value as QuarantineScope)}>
            {SCOPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label><span>reason</span><input className="crt-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label>
          <span>duration</span>
          <div className="preset-row">
            {PRESET_DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                className={`crt-pill__btn ${secs === d.secs ? 'crt-pill__btn--active' : ''}`}
                onClick={() => setSecs(d.secs)}
              >{d.label}</button>
            ))}
          </div>
          {secs && <small className="muted">expires at {shortDateTime(new Date(Date.now() + secs * 1000).toISOString())}</small>}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button
            variant="primary"
            disabled={!npub.startsWith('npub')}
            onClick={() => onSubmit({ npub, scope, reason, duration_secs: secs })}
          >QUARANTINE</Button>
        </div>
      </div>
    </Drawer>
  );
}
