import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Pill, DataList, type Column, Drawer, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Actors, Quarantine as QApi, Safelist } from '../api';
import type { ActorWindow, NpubActorRow, SafelistRow } from '../api';
import { usePolling } from '../utils/usePolling';
import { useI18n } from '../i18n';

const WINDOWS: { id: ActorWindow; label: string }[] = [
  { id: '1h', label: '1h' }, { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: 'all', label: 'ALL' },
];

type SubTab = 'allow' | 'deny' | 'ban';

const TABS = [
  { id: 'allow', label: 'ALLOW' },
  { id: 'deny',  label: 'DENY' },
  { id: 'ban',   label: 'BAN' },
];

/**
 * Npub 管理。allow / deny / ban の 3 サブタブを統合。
 * - allow: flags=1 (whitelist)
 * - deny:  flags=2 (blocklist)
 * - ban:   banned=1 (Hard BAN フラグ)
 *
 * docs/ui_redesign_ja.md §5.8
 */
export function NpubPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<SubTab>('allow');
  const [rows, setRows] = useState<SafelistRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [window_, setWindow] = useState<ActorWindow>('24h');
  const actors = usePolling((sig) => Actors.topNpubs(window_, sig), 15000, [window_]);

  const reload = () => { Safelist.list().then(setRows).catch(() => setRows([])); actors.refresh(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const quickBan = async (npub: string) => {
    if (!(await confirm({ ...t.deck.confirmNpubBan(npub), destructive: true }))) return;
    try { await Safelist.ban(npub); toast.push({ variant: 'ok', message: t.npub.banned }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };
  const quickQuarantine = async (npub: string) => {
    if (!(await confirm({ ...t.deck.confirmQuarantine(npub), destructive: true }))) return;
    try {
      await QApi.create({ npub, scope: 'post', reason: 'from top rejected', duration_secs: 24 * 3600 });
      toast.push({ variant: 'ok', message: t.quarantine.created });
      reload();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };

  const filtered = useMemo(() => {
    const all = rows ?? [];
    if (tab === 'allow') return all.filter((r) => (r.flags & 1) === 1 && !r.banned);
    if (tab === 'deny')  return all.filter((r) => (r.flags & 2) === 2 && !r.banned);
    return all.filter((r) => r.banned);
  }, [rows, tab]);

  const remove = async (npub: string) => {
    if (!(await confirm({ ...t.npub.confirmDelete(npub), destructive: true }))) return;
    try {
      await Safelist.remove(npub);
      toast.push({ variant: 'ok', message: t.common.deleted });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.deleteFailed((e as Error).message) });
    }
  };

  const toggleBroadcast = async (r: SafelistRow) => {
    try {
      const next = r.flags ^ 8;
      await Safelist.upsert({ ...r, flags: next });
      toast.push({ variant: 'ok', message: (next & 8) === 8 ? t.npub.broadcastOn : t.npub.broadcastOff });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
    }
  };

  const toggleBan = async (r: SafelistRow) => {
    try {
      if (r.banned) await Safelist.unban(r.npub);
      else          await Safelist.ban(r.npub);
      toast.push({ variant: 'ok', message: r.banned ? t.npub.unbanned : t.npub.banned });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
    }
  };

  const cols: Column<SafelistRow>[] = [
    { key: 'npub', label: 'NPUB', render: (r) => <code className="logs-cell-mono">{r.npub}</code> },
    {
      key: 'flags', label: 'FLAGS', width: 110, hideOnMobile: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {(r.flags & 1) === 1 && <Tag variant="info">ALLOW</Tag>}
          {(r.flags & 2) === 2 && <Tag variant="warn">DENY</Tag>}
          {(r.flags & 8) === 8 && <Tag variant="info">BCAST</Tag>}
          {r.banned             && <Tag variant="alert">BAN</Tag>}
        </span>
      ),
    },
    { key: 'memo', label: 'MEMO', render: (r) => r.memo || '—', hideOnMobile: true },
    {
      key: 'actions', label: '', width: 130,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {/* broadcast (flags & 8): 全リレー fan-out 許可 (spec §5.15) */}
          <Button variant="ghost" iconOnly onClick={() => toggleBroadcast(r)} title={(r.flags & 8) === 8 ? 'revoke broadcast' : 'grant broadcast'}>
            <Icon name={(r.flags & 8) === 8 ? 'arrow-up' : 'arrow-down'} />
          </Button>
          <Button variant="ghost" iconOnly onClick={() => toggleBan(r)} title={r.banned ? 'unban' : 'BAN'}>
            <Icon name={r.banned ? 'eye' : 'ban'} />
          </Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => remove(r.npub)}>
            <Icon name="close" />
          </Button>
        </span>
      ),
    },
  ];

  const topCols: Column<NpubActorRow>[] = [
    { key: 'rejections', label: 'REJECT', width: 90, sortValue: (r) => r.rejections,
      render: (r) => <span style={{ color: 'var(--crt-danger-text)' }}>{r.rejections.toLocaleString()}</span> },
    { key: 'npub', label: 'NPUB', render: (r) => <code className="logs-cell-mono">{r.npub}</code> },
    { key: 'kinds', label: 'KINDS', width: 100, hideOnMobile: true, render: (r) => r.kinds || '—' },
    { key: 'status', label: 'STATUS', width: 130,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {r.banned && <Tag variant="alert">BAN</Tag>}
          {r.quarantined && <Tag variant="warn">QUARANTINE</Tag>}
          {r.safelist_flags != null && (r.safelist_flags & 1) === 1 && <Tag variant="info">ALLOW</Tag>}
          {!r.banned && !r.quarantined && r.safelist_flags == null && <Tag variant="dim">—</Tag>}
        </span>
      ) },
    { key: 'actions', label: '', width: 200,
      render: (r) => (!r.banned && !r.quarantined) ? (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="danger" onClick={() => quickBan(r.npub)}>BAN</Button>
          <Button variant="ghost" onClick={() => quickQuarantine(r.npub)}>Q 24h</Button>
        </span>
      ) : null },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>TOP REJECTED <span className="crt-hud-tag">{window_} · {(actors.data ?? []).length}</span></>}
        actions={<Pill items={WINDOWS} active={window_} onChange={(v) => setWindow(v as ActorWindow)} ariaLabel="window" />}
      >
        <DataList
          rows={actors.data ?? []}
          columns={topCols}
          rowKey={(r) => r.npub}
          initialSort={{ key: 'rejections', dir: 'desc' }}
          filter={{ placeholder: 'filter npub…', match: (r, q) => r.npub.includes(q) }}
          emptyTitle="NO REJECTIONS"
          emptyHint={t.deck.stackEmpty}
        />
      </Card>

      <Card
        title={<>NPUB <span className="crt-hud-tag">{tab} · {filtered.length}</span></>}
        actions={
          <>
            <Pill items={TABS} active={tab} onChange={(v) => setTab(v as SubTab)} ariaLabel="npub tabs" />
            <Button variant="primary" onClick={() => setDrawerOpen(true)}><Icon name="plus" /> ADD</Button>
          </>
        }
      >
        <DataList
          rows={filtered}
          columns={cols}
          rowKey={(r) => r.npub}
          filter={{ placeholder: 'filter npub / memo…', match: (r, q) => r.npub.includes(q) || r.memo.toLowerCase().includes(q) }}
          emptyTitle="EMPTY"
          emptyHint={t.npub.emptyHint}
        />
      </Card>

      <AddDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        defaultMode={tab}
        onAdd={async (row) => {
          try {
            await Safelist.upsert(row);
            toast.push({ variant: 'ok', message: t.common.added });
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

interface AddProps {
  open: boolean;
  onClose: () => void;
  defaultMode: SubTab;
  onAdd: (row: SafelistRow) => void;
}
function AddDrawer({ open, onClose, defaultMode, onAdd }: AddProps) {
  const [npub, setNpub] = useState('');
  const [memo, setMemo] = useState('');
  const [mode, setMode] = useState<SubTab>(defaultMode);
  useEffect(() => { if (open) { setNpub(''); setMemo(''); setMode(defaultMode); } }, [open, defaultMode]);

  return (
    <Drawer open={open} onClose={onClose} title="ADD NPUB">
      <div className="form-grid">
        <label><span>npub</span><input className="crt-input" placeholder="npub1..." value={npub} onChange={(e) => setNpub(e.target.value)} /></label>
        <label><span>memo</span><input className="crt-input" placeholder="" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        <label>
          <span>mode</span>
          <select className="crt-input" value={mode} onChange={(e) => setMode(e.target.value as SubTab)}>
            <option value="allow">ALLOW (whitelist)</option>
            <option value="deny">DENY (blocklist)</option>
            <option value="ban">BAN (Hard)</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button
            variant="primary"
            disabled={!npub.startsWith('npub')}
            onClick={() => {
              const flags = mode === 'allow' ? 1 : mode === 'deny' ? 2 : 0;
              onAdd({ npub, memo, flags, banned: mode === 'ban' });
            }}
          >ADD</Button>
        </div>
      </div>
    </Drawer>
  );
}
