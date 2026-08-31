import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Modal, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Filters as FiltersApi, Translate } from '../api';
import type { FilterRow, DryRunResult } from '../api';
import { useI18n } from '../i18n';

export function DslRulesPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<FilterRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<FilterRow | null>(null);
  const [dryFor, setDryFor] = useState<FilterRow | null>(null);

  const reload = () => FiltersApi.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  const remove = async (id: number) => {
    if (!(await confirm({ ...t.common.confirmDelete, destructive: true }))) return;
    try { await FiltersApi.remove(id); toast.push({ variant: 'ok', message: t.common.deleted }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
  };

  const toggleEnabled = async (r: FilterRow) => {
    try {
      const res = await FiltersApi.update(r.id, {
        name: r.name, nl_text: r.nl_text, enabled: !r.enabled, rule_order: r.rule_order,
        apply_to_post: r.apply_to_post, apply_to_backend: r.apply_to_backend,
      });
      if (!res.success) throw new Error(res.error || 'unknown');
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const cols: Column<FilterRow>[] = [
    { key: 'order', label: '#', width: 50, render: (r) => r.rule_order },
    { key: 'name', label: 'NAME', width: 160, render: (r) => r.name },
    { key: 'dsl', label: 'DSL', render: (r) => <code className="logs-cell-mono">{r.nl_text}</code> },
    { key: 'apply', label: 'APPLY', width: 130, hideOnMobile: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {r.apply_to_post    && <Tag variant="warn">POST</Tag>}
          {r.apply_to_backend && <Tag variant="info">BACKEND</Tag>}
        </span>
      ) },
    { key: 'state', label: 'STATE', width: 90, render: (r) => <Tag variant={r.enabled ? 'alert' : 'dim'}>{r.enabled ? 'ON' : 'OFF'}</Tag> },
    { key: 'actions', label: '', width: 150,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" iconOnly onClick={() => setDryFor(r)} title="dry run"><Icon name="play" /></Button>
          <Button variant="ghost" iconOnly onClick={() => toggleEnabled(r)} title="toggle">
            <Icon name={r.enabled ? 'pause' : 'play'} />
          </Button>
          <Button variant="ghost" iconOnly onClick={() => { setEditing(r); setDrawerOpen(true); }} title="edit"><Icon name="eye" /></Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => remove(r.id)}><Icon name="close" /></Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>DSL RULES <span className="crt-hud-tag">{rows?.length ?? 0}</span></>}
        actions={<Button variant="primary" onClick={() => { setEditing(null); setDrawerOpen(true); }}><Icon name="plus" /> ADD</Button>}
      >
        <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)}
          emptyTitle="NO RULES" emptyHint={t.dsl.emptyHint} />
      </Card>

      <EditDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        editing={editing}
        onSaved={reload}
      />

      <DryRunModal open={!!dryFor} onClose={() => setDryFor(null)} rule={dryFor} />
    </div>
  );
}

interface EditProps {
  open: boolean;
  onClose: () => void;
  editing: FilterRow | null;
  onSaved: () => void;
}
function EditDrawer({ open, onClose, editing, onSaved }: EditProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState('');
  const [dsl, setDsl] = useState('');
  const [order, setOrder] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [applyPost, setApplyPost] = useState(false);
  const [applyBackend, setApplyBackend] = useState(true);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setDsl(editing?.nl_text ?? '');
      setOrder(editing?.rule_order ?? 0);
      setEnabled(editing?.enabled ?? true);
      setApplyPost(editing?.apply_to_post ?? false);
      setApplyBackend(editing?.apply_to_backend ?? true);
      setValidation(null);
    }
  }, [open, editing]);

  const validate = async () => {
    try {
      const r = await FiltersApi.validate(dsl);
      setValidation({ valid: r.valid, error: r.error });
    } catch (e) {
      setValidation({ valid: false, error: (e as Error).message });
    }
  };

  const save = async () => {
    try {
      if (editing) {
        const res = await FiltersApi.update(editing.id, {
          name, nl_text: dsl, enabled, rule_order: order,
          apply_to_post: applyPost, apply_to_backend: applyBackend,
        });
        if (!res.success) throw new Error(res.error || 'failed');
      } else {
        const res = await FiltersApi.create({ name, nl_text: dsl, apply_to_post: applyPost, apply_to_backend: applyBackend });
        if (!res.success) throw new Error(res.error || 'failed');
      }
      toast.push({ variant: 'ok', message: t.common.saved });
      onClose(); onSaved();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.saveFailed((e as Error).message) });
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'EDIT DSL RULE' : 'ADD DSL RULE'}>
      <div className="form-grid">
        <label><span>name</span><input className="crt-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>order</span><input className="crt-input" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value) || 0)} /></label>
        <label>
          <span>DSL</span>
          <textarea className="crt-input" rows={6} value={dsl} onChange={(e) => setDsl(e.target.value)} placeholder='kind = 1 and content matches "spam"' />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={validate} disabled={!dsl}>VALIDATE</Button>
          {validation && (validation.valid
            ? <Tag variant="info">VALID</Tag>
            : <Tag variant="alert">INVALID: {validation.error}</Tag>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={enabled}      onChange={(e) => setEnabled(e.target.checked)} /> ENABLED
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={applyPost}    onChange={(e) => setApplyPost(e.target.checked)} /> apply_to_post
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={applyBackend} onChange={(e) => setApplyBackend(e.target.checked)} /> apply_to_backend
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button variant="primary" disabled={!name || !dsl} onClick={save}>{editing ? 'SAVE' : 'CREATE'}</Button>
        </div>
      </div>
    </Drawer>
  );
}

function DryRunModal({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: FilterRow | null }) {
  const { t } = useI18n();
  const [eventJson, setEventJson] = useState('');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEventJson(JSON.stringify({
        id: '0'.repeat(64),
        pubkey: '0'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'sample text',
        sig: '0'.repeat(128),
      }, null, 2));
      setResult(null); setErr(null);
    }
  }, [open]);

  const run = async () => {
    if (!rule) return;
    setBusy(true); setErr(null); setResult(null);
    try {
      const ev = JSON.parse(eventJson);
      const r = await Translate.dryRun(rule.nl_text, ev);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`DRY RUN — ${rule?.name ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>CLOSE</Button>
          <Button variant="primary" onClick={run} disabled={busy}>{busy ? '…' : 'RUN'}</Button>
        </>
      }
    >
      <p className="muted">{t.dsl.dryRunNote}</p>
      <textarea className="crt-input" rows={10} value={eventJson} onChange={(e) => setEventJson(e.target.value)} />
      {err    && <p className="muted" style={{ color: 'var(--crt-danger-text)' }}>{err}</p>}
      {result && (
        <div style={{ marginTop: 8 }}>
          <strong>{result.matched ? <Tag variant="alert">MATCHED (would reject)</Tag> : <Tag variant="info">PASS</Tag>}</strong>
          {result.reason && <p className="muted">reason: {result.reason}</p>}
        </div>
      )}
    </Modal>
  );
}
