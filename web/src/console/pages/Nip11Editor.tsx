import { useEffect, useMemo, useState } from 'react';
import { Card, Button, useToast } from '../primitives';
import { Nip11 } from '../api';
import type { RelayInfoRow } from '../api';

const EMPTY: RelayInfoRow = {
  name: '',
  description: '',
  pubkey: '',
  contact: '',
  supported_nips: '[1,11]',
  software: '',
  version: '',
  limitation_max_limit: null,
  limitation_max_message_length: null,
  limitation_max_subscriptions: null,
  limitation_max_filters: null,
  limitation_max_event_tags: null,
  limitation_max_content_length: null,
  limitation_auth_required: false,
  limitation_payment_required: false,
  icon: '',
  negentropy: null,
};

export function Nip11Editor() {
  const toast = useToast();
  const [row, setRow] = useState<RelayInfoRow>(EMPTY);
  const [orig, setOrig] = useState<RelayInfoRow>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Nip11.get().then((r) => { setRow(r); setOrig(r); }).catch(() => undefined);
  }, []);

  const dirty = useMemo(() => JSON.stringify(row) !== JSON.stringify(orig), [row, orig]);

  const preview = useMemo(() => buildPreview(row), [row]);

  const save = async () => {
    setBusy(true);
    try {
      await Nip11.put(row);
      setOrig(row);
      toast.push({ variant: 'ok', message: 'NIP-11 を保存しました' });
    } catch (e) {
      toast.push({ variant: 'alert', message: `保存失敗: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const change = <K extends keyof RelayInfoRow>(k: K, v: RelayInfoRow[K]) =>
    setRow((p) => ({ ...p, [k]: v }));

  const numField = (k: keyof RelayInfoRow, label: string) => (
    <label>
      <span>{label}</span>
      <input
        className="crt-input"
        type="number"
        value={(row[k] as number | null) ?? ''}
        onChange={(e) => change(k, (e.target.value === '' ? null : Number(e.target.value)) as never)}
      />
    </label>
  );

  return (
    <div className="nip11-grid">
      <Card title={<>NIP-11 EDITOR <span className="crt-hud-tag">{dirty ? 'unsaved' : 'saved'}</span></>}
        actions={<Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy ? '…' : 'SAVE'}</Button>}
      >
        <div className="form-grid">
          <label><span>name</span>        <input className="crt-input" value={row.name ?? ''}        onChange={(e) => change('name', e.target.value)} /></label>
          <label><span>description</span> <textarea className="crt-input" rows={3} value={row.description ?? ''} onChange={(e) => change('description', e.target.value)} /></label>
          <label><span>pubkey (hex)</span><input className="crt-input" value={row.pubkey ?? ''}      onChange={(e) => change('pubkey', e.target.value)} /></label>
          <label><span>contact</span>     <input className="crt-input" value={row.contact ?? ''}     onChange={(e) => change('contact', e.target.value)} /></label>
          <label><span>supported_nips (JSON array)</span><input className="crt-input" value={row.supported_nips ?? ''} onChange={(e) => change('supported_nips', e.target.value)} /></label>
          <label><span>software</span>    <input className="crt-input" value={row.software ?? ''}    onChange={(e) => change('software', e.target.value)} /></label>
          <label><span>version</span>     <input className="crt-input" value={row.version ?? ''}     onChange={(e) => change('version', e.target.value)} /></label>
          <label><span>icon (URL)</span>  <input className="crt-input" value={row.icon ?? ''}        onChange={(e) => change('icon', e.target.value)} /></label>

          <fieldset className="form-grid__group">
            <legend className="crt-hud-tag">limitations</legend>
            {numField('limitation_max_limit',           'max_limit')}
            {numField('limitation_max_message_length',  'max_message_length')}
            {numField('limitation_max_subscriptions',   'max_subscriptions')}
            {numField('limitation_max_filters',         'max_filters')}
            {numField('limitation_max_event_tags',      'max_event_tags')}
            {numField('limitation_max_content_length',  'max_content_length')}
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={row.limitation_auth_required} onChange={(e) => change('limitation_auth_required', e.target.checked)} /> auth_required
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={row.limitation_payment_required} onChange={(e) => change('limitation_payment_required', e.target.checked)} /> payment_required
            </label>
            {numField('negentropy', 'negentropy (kind)')}
          </fieldset>
        </div>
      </Card>

      <Card title={<>LIVE PREVIEW <span className="crt-hud-tag">application/nostr+json</span></>}>
        <pre className="json-preview">{JSON.stringify(preview, null, 2)}</pre>
      </Card>
    </div>
  );
}

/**
 * NIP-11 のレスポンスとして実際に出る JSON を組み立てる。
 * - supported_nips は文字列で持っているのでパースを試みる
 * - limitations は値があるものだけ詰める
 */
function buildPreview(r: RelayInfoRow): Record<string, unknown> {
  let supported: unknown = undefined;
  if (r.supported_nips) {
    try { supported = JSON.parse(r.supported_nips); } catch { supported = r.supported_nips; }
  }

  const limitation: Record<string, unknown> = {};
  const lim: Array<[string, unknown]> = [
    ['max_limit',           r.limitation_max_limit],
    ['max_message_length',  r.limitation_max_message_length],
    ['max_subscriptions',   r.limitation_max_subscriptions],
    ['max_filters',         r.limitation_max_filters],
    ['max_event_tags',      r.limitation_max_event_tags],
    ['max_content_length',  r.limitation_max_content_length],
  ];
  for (const [k, v] of lim) if (v != null) limitation[k] = v;
  if (r.limitation_auth_required)    limitation.auth_required = true;
  if (r.limitation_payment_required) limitation.payment_required = true;

  const out: Record<string, unknown> = {};
  if (r.name) out.name = r.name;
  if (r.description) out.description = r.description;
  if (r.pubkey) out.pubkey = r.pubkey;
  if (r.contact) out.contact = r.contact;
  if (supported) out.supported_nips = supported;
  if (r.software) out.software = r.software;
  if (r.version) out.version = r.version;
  if (r.icon) out.icon = r.icon;
  if (Object.keys(limitation).length > 0) out.limitation = limitation;
  if (r.negentropy != null) out.negentropy = r.negentropy;
  return out;
}
