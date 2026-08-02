import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Modal, ModeBadge, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { IpAcl as IpAclApi } from '../api';
import type { IpAccessControlRow, IpAclMode } from '../api';
import { ago } from '../utils/format';
import { useI18n } from '../i18n';

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
  const [rows, setRows] = useState<IpAccessControlRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<IpAccessControlRow | null>(null);
  const [confirmHardBan, setConfirmHardBan] = useState<{ ip: string; cb: () => void } | null>(null);

  const reload = () => IpAclApi.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  const remove = async (id: number) => {
    if (!confirm(t.common.confirmDelete)) return;
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

  return (
    <div style={{ display: 'grid', gap: 12 }}>
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
        <p className="muted">{t.ipacl.hardBanNote(ago(new Date().toISOString()))}</p>
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
