import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { KindBlocklist as KindApi } from '../api';
import type { ReqKindBlacklistRow } from '../api';
import { useI18n } from '../i18n';

export function KindBlocklistPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<ReqKindBlacklistRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const reload = () => KindApi.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  const remove = async (id: number) => {
    if (!(await confirm({ ...t.common.confirmDelete, destructive: true }))) return;
    try { await KindApi.remove(id); toast.push({ variant: 'ok', message: t.common.deleted }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
  };

  const toggleEnabled = async (r: ReqKindBlacklistRow) => {
    try {
      await KindApi.update(r.id, {
        kind_value: r.kind_value, kind_min: r.kind_min, kind_max: r.kind_max,
        enabled: !r.enabled,
      });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const cols: Column<ReqKindBlacklistRow>[] = [
    { key: 'kind', label: 'KIND', render: (r) =>
        r.kind_value != null ? <code>{r.kind_value}</code>
        : <code>{r.kind_min ?? '*'} – {r.kind_max ?? '*'}</code>,
    },
    { key: 'state', label: 'STATE', width: 100,
      render: (r) => <Tag variant={r.enabled ? 'alert' : 'dim'}>{r.enabled ? 'BLOCKED' : 'OFF'}</Tag>,
    },
    { key: 'actions', label: '', width: 110,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" iconOnly onClick={() => toggleEnabled(r)} title="toggle">
            <Icon name={r.enabled ? 'pause' : 'play'} />
          </Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => remove(r.id)}><Icon name="close" /></Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>KIND BLOCKLIST <span className="crt-hud-tag">{rows?.length ?? 0} rules</span></>}
        actions={<Button variant="primary" onClick={() => setDrawerOpen(true)}><Icon name="plus" /> ADD</Button>}
      >
        <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)}
          emptyTitle="NO RULES" emptyHint={t.kind.emptyHint} />
      </Card>

      <AddDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={async (body) => {
          try { await KindApi.create(body); toast.push({ variant: 'ok', message: t.common.added }); setDrawerOpen(false); reload(); }
          catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
        }}
      />
    </div>
  );
}

interface AddProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: { kind_value: number | null; kind_min: number | null; kind_max: number | null; enabled: boolean }) => void;
}
function AddDrawer({ open, onClose, onSubmit }: AddProps) {
  const [mode, setMode] = useState<'value' | 'range'>('value');
  const [v, setV] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  useEffect(() => { if (open) { setMode('value'); setV(''); setMin(''); setMax(''); } }, [open]);

  return (
    <Drawer open={open} onClose={onClose} title="ADD KIND BLOCK">
      <div className="form-grid">
        <label>
          <span>type</span>
          <select className="crt-input" value={mode} onChange={(e) => setMode(e.target.value as 'value' | 'range')}>
            <option value="value">single value</option>
            <option value="range">range (min – max)</option>
          </select>
        </label>
        {mode === 'value' ? (
          <label><span>kind</span><input className="crt-input" type="number" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ''))} /></label>
        ) : (
          <>
            <label><span>min</span><input className="crt-input" type="number" value={min} onChange={(e) => setMin(e.target.value.replace(/[^0-9]/g, ''))} /></label>
            <label><span>max</span><input className="crt-input" type="number" value={max} onChange={(e) => setMax(e.target.value.replace(/[^0-9]/g, ''))} /></label>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button
            variant="primary"
            disabled={mode === 'value' ? !v : (!min && !max)}
            onClick={() => onSubmit(mode === 'value'
              ? { kind_value: Number(v), kind_min: null, kind_max: null, enabled: true }
              : { kind_value: null, kind_min: min ? Number(min) : null, kind_max: max ? Number(max) : null, enabled: true }
            )}
          >ADD</Button>
        </div>
      </div>
    </Drawer>
  );
}
