import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Drawer, Modal, Tag, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { SimpleBan, Translate } from '../api';
import type { SimpleBanRuleRow } from '../api';
import { useI18n } from '../i18n';

const RULE_TYPES = [
  { id: 'npub', label: 'NPUB list (deny)' },
  { id: 'kind', label: 'KIND list' },
  { id: 'tag',  label: 'TAG match' },
];

export function QuickBanPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<SimpleBanRuleRow[] | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SimpleBanRuleRow | null>(null);
  const [previewFor, setPreviewFor] = useState<SimpleBanRuleRow | null>(null);

  const reload = () => SimpleBan.list().then(setRows).catch(() => setRows([]));
  useEffect(() => { reload(); }, []);

  const remove = async (id: number) => {
    if (!confirm(t.common.confirmDelete)) return;
    try { await SimpleBan.remove(id); toast.push({ variant: 'ok', message: t.common.deleted }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
  };

  const cols: Column<SimpleBanRuleRow>[] = [
    { key: 'type', label: 'TYPE', width: 90, render: (r) => <Tag variant="warn">{r.rule_type.toUpperCase()}</Tag> },
    {
      key: 'detail', label: 'DETAIL',
      render: (r) => (
        <code className="logs-cell-mono">
          {r.npub_list || r.kind_list ||
            (r.tag_name ? `${r.tag_name}=${r.tag_value_pattern ?? '*'}` : '—')}
        </code>
      ),
    },
    {
      key: 'apply', label: 'APPLY', width: 130, hideOnMobile: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 4 }}>
          {r.apply_to_post    && <Tag variant="warn">POST</Tag>}
          {r.apply_to_backend && <Tag variant="info">BACKEND</Tag>}
        </span>
      ),
    },
    { key: 'state', label: 'STATE', width: 90, render: (r) => <Tag variant={r.enabled ? 'alert' : 'dim'}>{r.enabled ? 'ON' : 'OFF'}</Tag> },
    { key: 'memo',  label: 'MEMO', render: (r) => r.memo || '—', hideOnMobile: true },
    { key: 'actions', label: '', width: 130,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="ghost" iconOnly onClick={() => setPreviewFor(r)} title="DSL preview"><Icon name="eye" /></Button>
          <Button variant="ghost" iconOnly onClick={() => { setEditing(r); setDrawerOpen(true); }} title="edit"><Icon name="play" /></Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => remove(r.id)}><Icon name="close" /></Button>
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={<>QUICK BAN <span className="crt-hud-tag">{rows?.length ?? 0}</span></>}
        actions={<Button variant="primary" onClick={() => { setEditing(null); setDrawerOpen(true); }}><Icon name="plus" /> ADD</Button>}
      >
        <DataList rows={rows ?? []} columns={cols} rowKey={(r) => String(r.id)}
          emptyTitle="NO RULES" emptyHint={t.quickban.emptyHint} />
      </Card>

      <EditDrawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setEditing(null); }}
        editing={editing}
        onSaved={reload}
      />

      <DslPreviewModal open={!!previewFor} onClose={() => setPreviewFor(null)} rule={previewFor} />
    </div>
  );
}

interface EditProps {
  open: boolean;
  onClose: () => void;
  editing: SimpleBanRuleRow | null;
  onSaved: () => void;
}
function EditDrawer({ open, onClose, editing, onSaved }: EditProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [type, setType] = useState('npub');
  const [npubList, setNpubList] = useState('');
  const [kindList, setKindList] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagPattern, setTagPattern] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [applyPost, setApplyPost] = useState(false);
  const [applyBackend, setApplyBackend] = useState(true);
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (open) {
      setType(editing?.rule_type ?? 'npub');
      setNpubList(editing?.npub_list ?? '');
      setKindList(editing?.kind_list ?? '');
      setTagName(editing?.tag_name ?? '');
      setTagPattern(editing?.tag_value_pattern ?? '');
      setEnabled(editing?.enabled ?? true);
      setApplyPost(editing?.apply_to_post ?? false);
      setApplyBackend(editing?.apply_to_backend ?? true);
      setMemo(editing?.memo ?? '');
    }
  }, [open, editing]);

  const submit = async () => {
    const body = {
      rule_type: type,
      npub_list: type === 'npub' ? npubList || null : null,
      kind_list: type === 'kind' ? kindList || null : null,
      tag_name:  type === 'tag'  ? tagName  || null : null,
      tag_value_pattern: type === 'tag' ? tagPattern || null : null,
      enabled, apply_to_post: applyPost, apply_to_backend: applyBackend, memo,
    };
    try {
      if (editing) await SimpleBan.update(editing.id, body);
      else         await SimpleBan.create(body);
      toast.push({ variant: 'ok', message: t.common.saved });
      onClose(); onSaved();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'EDIT QUICK BAN' : 'ADD QUICK BAN'}>
      <div className="form-grid">
        <label>
          <span>type</span>
          <select className="crt-input" value={type} onChange={(e) => setType(e.target.value)}>
            {RULE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {type === 'npub' && (
          <label>
            <span>npub list (comma-separated)</span>
            <textarea className="crt-input" rows={3} value={npubList} onChange={(e) => setNpubList(e.target.value)} />
          </label>
        )}
        {type === 'kind' && (
          <label>
            <span>kind list (comma-separated)</span>
            <input className="crt-input" value={kindList} onChange={(e) => setKindList(e.target.value)} placeholder="1,7,9735" />
          </label>
        )}
        {type === 'tag' && (
          <>
            <label><span>tag name</span><input className="crt-input" value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="t" /></label>
            <label><span>value pattern</span><input className="crt-input" value={tagPattern} onChange={(e) => setTagPattern(e.target.value)} placeholder="spam.*" /></label>
          </>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
        <label><span>memo</span><input className="crt-input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button variant="primary" onClick={submit}>{editing ? 'SAVE' : 'CREATE'}</Button>
        </div>
      </div>
    </Drawer>
  );
}

function DslPreviewModal({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: SimpleBanRuleRow | null }) {
  const { t } = useI18n();
  const [dsl, setDsl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !rule) return;
    setDsl(''); setErr(null);
    Translate.simpleToDsl({
      rule_type: rule.rule_type,
      npub_list: rule.npub_list,
      kind_list: rule.kind_list,
      tag_name: rule.tag_name,
      tag_value_pattern: rule.tag_value_pattern,
    } as unknown).then((r) => setDsl(r.dsl)).catch((e) => setErr((e as Error).message));
  }, [open, rule]);

  return (
    <Modal open={open} title="DSL PREVIEW" onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>CLOSE</Button>}
    >
      <p className="muted">{t.quickban.dslPreviewNote}</p>
      {err ? <p style={{ color: 'var(--crt-danger-text)' }}>{err}</p> : <pre className="json-preview">{dsl || '…'}</pre>}
    </Modal>
  );
}
