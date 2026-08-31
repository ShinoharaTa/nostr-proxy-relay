import { useEffect, useMemo, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Modal, StatusDot, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Relays } from '../api';
import type { RelayConfigRow, RelayStatus } from '../api';
import { ago } from '../utils/format';
import { usePolling } from '../utils/usePolling';
import { useI18n } from '../i18n';

type DraftRow = RelayConfigRow & { dirty?: boolean };

export function BackendRelays() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const status = usePolling((s) => Relays.status(s), 5000);
  const statusMap = useMemo(() => {
    const m = new Map<string, RelayStatus>();
    (status.data?.relays ?? []).forEach((r) => m.set(r.url, r));
    return m;
  }, [status.data]);
  /** 一時停止中の URL → 復帰予定時刻（Issue #33） */
  const suspendedMap = useMemo(() => {
    const m = new Map<string, string>();
    (status.data?.suspended ?? []).forEach((r) => m.set(r.url, r.until));
    return m;
  }, [status.data]);

  const suspend = async (url: string) => {
    const ok = await confirm({
      title: t.investigate.suspendTitle,
      body: t.investigate.suspendBody(url),
      confirmLabel: t.investigate.suspendConfirm,
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await Relays.suspend(url, 3600);
      toast.push({ variant: 'ok', message: t.investigate.suspended(url, r.until) });
      status.refresh();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const resume = async (url: string) => {
    try {
      await Relays.resume(url);
      toast.push({ variant: 'ok', message: t.common.applied });
      status.refresh();
      Relays.list().then(setRows);
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { Relays.list().then(setRows).catch(() => setRows([])); }, []);

  const dirty = useMemo(() => (rows ?? []).some((r) => r.dirty), [rows]);

  const onChange = (url: string, patch: Partial<RelayConfigRow>) => {
    setRows((prev) => prev?.map((r) => r.url === url ? { ...r, ...patch, dirty: true } : r) ?? prev);
  };

  const onRemove = async (url: string) => {
    if (!(await confirm({ ...t.backend.confirmDelete(url), destructive: true }))) return;
    setRows((prev) => prev?.filter((r) => r.url !== url).map((r) => ({ ...r, dirty: true })) ?? prev);
  };

  const onSave = async () => {
    if (!rows) return;
    try {
      await Relays.put(rows.map(({ dirty: _d, ...r }) => r));
      toast.push({ variant: 'ok', message: t.backend.updated });
      Relays.list().then(setRows);
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.saveFailed((e as Error).message) });
    }
  };

  const cols: Column<DraftRow>[] = [
    {
      key: 'status', label: 'STATUS', width: 150,
      render: (r) => {
        const until = suspendedMap.get(r.url);
        if (until) {
          return <Tag variant="warn" title={`until ${until}`}>SUSPENDED</Tag>;
        }
        const s = statusMap.get(r.url);
        const v = !s ? 'idle' : s.status === 'connected' ? 'live' : s.status === 'connecting' ? 'warn' : 'alert';
        return <StatusDot variant={v}>{s?.status ?? 'unknown'}</StatusDot>;
      },
    },
    {
      key: 'suspend', label: '', width: 140,
      render: (r) => suspendedMap.has(r.url)
        ? <Button variant="ghost" onClick={() => resume(r.url)}>{t.backend.resume}</Button>
        : <Button variant="ghost" onClick={() => suspend(r.url)}>{t.investigate.suspend1h}</Button>,
    },
    { key: 'url', label: 'URL', render: (r) => <code>{r.url}</code> },
    {
      key: 'enabled', label: 'EN', width: 60,
      render: (r) => (
        <input type="checkbox" checked={r.enabled} onChange={(e) => onChange(r.url, { enabled: e.target.checked })} />
      ),
    },
    {
      key: 'role', label: 'ROLE', width: 110, hideOnMobile: true,
      render: (r) => (
        <select className="crt-input crt-input--narrow" value={r.role} onChange={(e) => onChange(r.url, { role: e.target.value })}>
          <option value="primary">primary</option>
          <option value="secondary">secondary</option>
          <option value="archive">archive</option>
        </select>
      ),
    },
    {
      key: 'weight', label: 'WT', width: 70, hideOnMobile: true,
      render: (r) => (
        <input
          className="crt-input crt-input--narrow" type="number" min={0}
          value={r.weight} onChange={(e) => onChange(r.url, { weight: Number(e.target.value) || 0 })}
        />
      ),
    },
    {
      key: 'rw', label: 'R/W', width: 90, hideOnMobile: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={r.read_enabled}  onChange={(e) => onChange(r.url, { read_enabled:  e.target.checked })} />R
          </label>
          <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={r.write_enabled} onChange={(e) => onChange(r.url, { write_enabled: e.target.checked })} />W
          </label>
        </span>
      ),
    },
    {
      key: 'last', label: 'LAST EVT', width: 110, hideOnMobile: true,
      render: (r) => {
        const s = statusMap.get(r.url);
        return <span className="crt-hud-tag">{s?.last_event_at ? ago(s.last_event_at) : '—'}</span>;
      },
    },
    {
      key: 'actions', label: '', width: 60,
      render: (r) => (
        <Button variant="danger" iconOnly aria-label="delete" onClick={() => onRemove(r.url)}>
          <Icon name="close" />
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>BACKEND RELAYS <span className="crt-hud-tag">{rows?.length ?? 0} configured</span></>}
        actions={
          <>
            <Button variant="primary" onClick={() => setDrawerOpen(true)}>
              <Icon name="plus" /> ADD
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!dirty}>SAVE</Button>
          </>
        }
      >
        <DataList
          rows={rows ?? []}
          columns={cols}
          rowKey={(r) => r.url}
          emptyTitle="NO BACKEND RELAYS"
          emptyHint={t.backend.emptyHint}
        />
      </Card>

      <AddRelayDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAdd={(row) => {
          setRows((prev) => {
            const next = prev ? [...prev] : [];
            if (next.some((r) => r.url === row.url)) {
              toast.push({ variant: 'warn', message: t.backend.duplicateUrl });
              return prev;
            }
            next.push({ ...row, dirty: true });
            return next;
          });
          setDrawerOpen(false);
          toast.push({ variant: 'ok', message: t.backend.queued });
        }}
      />

      <Modal
        open={confirmOpen}
        title={t.backend.saveTitle}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>CANCEL</Button>
            <Button variant="primary" onClick={() => { setConfirmOpen(false); onSave(); }}>CONFIRM</Button>
          </>
        }
      >
        <p>{t.backend.saveBody}</p>
      </Modal>
    </div>
  );
}

interface AddProps {
  open: boolean;
  onClose: () => void;
  onAdd: (row: RelayConfigRow) => void;
}
function AddRelayDrawer({ open, onClose, onAdd }: AddProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [role, setRole] = useState('primary');
  const [weight, setWeight] = useState(1);
  const [readEn, setReadEn] = useState(true);
  const [writeEn, setWriteEn] = useState(true);
  const [nip11, setNip11] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setUrl(''); setRole('primary'); setWeight(1); setReadEn(true); setWriteEn(true); setNip11(null); } }, [open]);

  const probe = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const info = await Relays.fetchNip11(url);
      setNip11(info);
    } catch (e) {
      toast.push({ variant: 'alert', message: t.backend.nip11ProbeFailed((e as Error).message) });
      setNip11(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="ADD BACKEND RELAY">
      <div className="form-grid">
        <label>
          <span>URL</span>
          <input className="crt-input" placeholder="wss://relay.example.com" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={probe} disabled={!url || busy}>
            {busy ? '…' : 'PROBE NIP-11'}
          </Button>
        </div>
        {nip11 ? (
          <Card title={<>NIP-11 RESPONSE <Tag variant="info">ok</Tag></>}>
            <pre className="json-preview">{JSON.stringify(nip11, null, 2)}</pre>
          </Card>
        ) : null}
        <label>
          <span>ROLE</span>
          <select className="crt-input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="primary">primary</option>
            <option value="secondary">secondary</option>
            <option value="archive">archive</option>
          </select>
        </label>
        <label>
          <span>WEIGHT</span>
          <input className="crt-input" type="number" min={0} value={weight} onChange={(e) => setWeight(Number(e.target.value) || 0)} />
        </label>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={readEn} onChange={(e) => setReadEn(e.target.checked)} /> READ
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={writeEn} onChange={(e) => setWriteEn(e.target.checked)} /> WRITE
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button
            variant="primary"
            disabled={!url}
            onClick={() => onAdd({ url, role, weight, read_enabled: readEn, write_enabled: writeEn, enabled: true })}
          >
            STAGE
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
