import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Modal, ModeBadge, Pill, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Actors, IpAcl as IpAclApi } from '../api';
import type { ActorWindow, IpAccessControlRow, IpAclMode, IpActorRow } from '../api';
import { usePolling } from '../utils/usePolling';
import { ago } from '../utils/format';
import { useI18n } from '../i18n';

const WINDOWS: { id: ActorWindow; label: string }[] = [
  { id: '1h', label: '1h' }, { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: 'all', label: 'ALL' },
];

const MODES: IpAclMode[] = ['hard_ban', 'shadow_ban', 'whitelist', 'normal'];

const MODE_BADGE: Record<IpAclMode, 'hard' | 'shadow' | 'whitelist' | 'neutral'> = {
  hard_ban:   'hard',
  shadow_ban: 'shadow',
  whitelist:  'whitelist',
  normal:     'neutral',
};

export function IpAclPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<IpAccessControlRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<IpAccessControlRow | null>(null);
  const [confirmHardBan, setConfirmHardBan] = useState<{ ip: string; cb: () => void } | null>(null);

  const [window_, setWindow] = useState<ActorWindow>('1h');
  const actors = usePolling((sig) => Actors.topIps(window_, 'connections', sig), 15000, [window_]);

  const reload = () => { IpAclApi.list().then(setRows).catch(() => setRows([])); actors.refresh(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  /* TOP SOURCES からのワンクリック制裁。hard_ban は既存の確認モーダルを通す */
  const quickBan = (ip: string, mode: 'hard_ban' | 'shadow_ban') => {
    const doApply = async () => {
      try {
        await IpAclApi.create({ ip_address: ip, mode, memo: 'from top sources' });
        reload();
        toast.push({ variant: 'ok', message: t.common.applied });
      } catch (e) {
        toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
      }
    };
    if (mode === 'hard_ban') setConfirmHardBan({ ip, cb: doApply });
    else confirm({ ...t.deck.confirmIp('shadow_ban', ip), destructive: true }).then((ok) => { if (ok) doApply(); });
  };

  const remove = async (id: number) => {
    if (!(await confirm({ ...t.common.confirmDelete, destructive: true }))) return;
    try { await IpAclApi.remove(id); reload(); toast.push({ variant: 'ok', message: t.common.deleted }); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.deleteFailed((e as Error).message) }); }
  };

  const submit = async (body: { ip_address: string; mode: IpAclMode; memo: string }, id?: number) => {
    const doApply = async () => {
      try {
        if (id) await IpAclApi.update(id, body);
        else    await IpAclApi.create(body);
        reload();
        setDrawerOpen(false);
        setEditing(null);
        toast.push({ variant: 'ok', message: t.common.applied });
      } catch (e) {
        toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
      }
    };
    if (body.mode === 'hard_ban') {
      setConfirmHardBan({ ip: body.ip_address, cb: doApply });
    } else {
      doApply();
    }
  };

  const cols: Column<IpAccessControlRow>[] = [
    { key: 'ip',   label: 'IP / CIDR', render: (r) => <code>{r.ip_address}</code> },
    { key: 'mode', label: 'MODE', width: 120, render: (r) => <ModeBadge mode={MODE_BADGE[r.mode]} >{r.mode.toUpperCase()}</ModeBadge> },
    { key: 'memo', label: 'MEMO', render: (r) => r.memo || '—', hideOnMobile: true },
    {
      key: 'actions', label: '', width: 100,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" iconOnly onClick={() => { setEditing(r); setDrawerOpen(true); }} title="edit">
            <Icon name="eye" />
          </Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => r.id && remove(r.id)}>
            <Icon name="close" />
          </Button>
        </span>
      ),
    },
  ];

  const topCols: Column<IpActorRow>[] = [
    { key: 'connections', label: 'CONNS', width: 90, sortValue: (r) => r.connections,
      render: (r) => <span className="num">{r.connections.toLocaleString()}</span> },
    { key: 'events', label: 'EVENTS', width: 90, hideOnMobile: true, sortValue: (r) => r.events,
      render: (r) => r.events.toLocaleString() },
    { key: 'rejections', label: 'REJECT', width: 90, sortValue: (r) => r.rejections,
      render: (r) => r.rejections > 0
        ? <span style={{ color: 'var(--crt-danger-text)' }}>{r.rejections.toLocaleString()}</span>
        : '0' },
    { key: 'ip', label: 'IP', render: (r) => <code>{r.ip}</code> },
    { key: 'state', label: 'STATE', width: 140,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {r.mode === 'normal'
            ? <Tag variant="dim">—</Tag>
            : <ModeBadge mode={MODE_BADGE[r.mode]}>{r.mode.toUpperCase()}</ModeBadge>}
          {r.active_connections > 0 && <Tag variant="info">{r.active_connections} LIVE</Tag>}
        </span>
      ) },
    { key: 'last', label: 'LAST', width: 90, hideOnMobile: true,
      render: (r) => <span title={r.last_seen}>{ago(r.last_seen)}</span> },
    { key: 'actions', label: '', width: 150,
      render: (r) => r.mode === 'normal' ? (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="danger" onClick={() => quickBan(r.ip, 'hard_ban')}>BAN</Button>
          <Button variant="ghost" onClick={() => quickBan(r.ip, 'shadow_ban')}>SHADOW</Button>
        </span>
      ) : null },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>TOP SOURCES <span className="crt-hud-tag">{window_} · {(actors.data ?? []).length}</span></>}
        actions={<Pill items={WINDOWS} active={window_} onChange={(v) => setWindow(v as ActorWindow)} ariaLabel="window" />}
      >
        <DataList
          rows={actors.data ?? []}
          columns={topCols}
          rowKey={(r) => r.ip}
          initialSort={{ key: 'connections', dir: 'desc' }}
          filter={{ placeholder: 'filter ip…', match: (r, q) => r.ip.includes(q) }}
          emptyTitle="NO TRAFFIC"
          emptyHint={t.deck.stackEmpty}
        />
      </Card>

      <Card
        title={<>IP ACL <span className="crt-hud-tag">{rows?.length ?? 0} entries</span></>}
        actions={
          <Button variant="primary" onClick={() => { setEditing(null); setDrawerOpen(true); }}>
            <Icon name="plus" /> ADD
          </Button>
        }
      >
        <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id ?? r.ip_address)}
          emptyTitle="NO ENTRIES" emptyHint={t.ipacl.emptyHint} />
      </Card>

      <EditDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        editing={editing}
        onSubmit={submit}
      />

      <Modal
        open={!!confirmHardBan}
        title={t.ipacl.hardBanTitle}
        onClose={() => setConfirmHardBan(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmHardBan(null)}>CANCEL</Button>
            <Button
              variant="danger"
              onClick={() => { confirmHardBan?.cb(); setConfirmHardBan(null); }}
            >EXECUTE</Button>
          </>
        }
      >
        {t.ipacl.hardBanBody(confirmHardBan?.ip ?? '')}
        <p className="muted">{t.ipacl.hardBanNote}</p>
      </Modal>
    </div>
  );
}

interface EditProps {
  open: boolean;
  onClose: () => void;
  editing: IpAccessControlRow | null;
  onSubmit: (body: { ip_address: string; mode: IpAclMode; memo: string }, id?: number) => void;
}
function EditDrawer({ open, onClose, editing, onSubmit }: EditProps) {
  const [ip, setIp] = useState('');
  const [mode, setMode] = useState<IpAclMode>('normal');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setIp(editing?.ip_address ?? '');
      setMode(editing?.mode ?? 'normal');
      setMemo(editing?.memo ?? '');
    }
  }, [open, editing]);

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'EDIT IP ENTRY' : 'ADD IP ENTRY'}>
      <div className="form-grid">
        <label><span>IP / CIDR</span>
          <input className="crt-input" placeholder="192.0.2.1 or 198.51.100.0/24" value={ip} onChange={(e) => setIp(e.target.value)} />
        </label>
        <label><span>mode</span>
          <select className="crt-input" value={mode} onChange={(e) => setMode(e.target.value as IpAclMode)}>
            {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label><span>memo</span>
          <input className="crt-input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button
            variant={mode === 'hard_ban' ? 'danger' : 'primary'}
            disabled={!ip}
            onClick={() => onSubmit({ ip_address: ip, mode, memo }, editing?.id ?? undefined)}
          >
            {editing ? 'UPDATE' : 'ADD'}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
