import { useCallback, useEffect, useMemo, useState } from 'react';
import { Relays } from '../api';
import type { RelayConfigRow, RelayStatus } from '../api';
import { useConfirm, useToast } from '../primitives';
import { ago } from '../utils/format';
import { usePolling } from '../utils/usePolling';
import { useI18n } from '../i18n';
import { parseUtc } from '../target/TargetCard';

/**
 * 上流リレー（#54 で作り直し）。
 *
 * 旧版は 9 列の表で、スマホではカード化されて 1 リレーが画面 1 枚分になっていた。
 * 一覧は 1 リレー 1 行（状態・URL・役割・読み書き）にし、細かい設定は行を開いて編集する。
 * 変更は「まとめて SAVE」ではなく即保存し、取り消せるようにする。
 */
export function BackendRelays() {
  const { t } = useI18n();
  const r = t.v2.relays;
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<RelayConfigRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const status = usePolling((s) => Relays.status(s), 5000);

  const statusMap = useMemo(() => new Map<string, RelayStatus>((status.data?.relays ?? []).map((s) => [s.url, s])), [status.data]);
  const suspendedMap = useMemo(() => new Map((status.data?.suspended ?? []).map((s) => [s.url, s.until])), [status.data]);

  const load = useCallback(() => { Relays.list().then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);

  /** 一覧全体を保存し、直前の状態に戻す「取り消す」を出す */
  const save = async (next: RelayConfigRow[], message: string) => {
    const prev = rows ?? [];
    setRows(next);
    try {
      await Relays.put(next);
      toast.push({
        variant: 'ok',
        message,
        action: {
          label: t.v2.mod.undo,
          onClick: () => {
            Relays.put(prev)
              .then(() => { setRows(prev); status.refresh(); toast.push({ message: t.v2.mod.undone }); })
              .catch((e: Error) => toast.push({ variant: 'alert', message: t.common.saveFailed(e.message) }));
          },
        },
      });
      status.refresh();
    } catch (e) {
      setRows(prev);
      toast.push({ variant: 'alert', message: t.common.saveFailed((e as Error).message) });
    }
  };

  const patch = (url: string, p: Partial<RelayConfigRow>) =>
    save((rows ?? []).map((x) => (x.url === url ? { ...x, ...p } : x)), r.saved);

  const add = () => {
    const url = newUrl.trim();
    if (!/^wss?:\/\/[^\s/]+/.test(url)) { toast.push({ variant: 'warn', message: r.invalidUrl }); return; }
    if ((rows ?? []).some((x) => x.url === url)) { toast.push({ variant: 'warn', message: r.duplicate }); return; }
    setNewUrl('');
    save([...(rows ?? []), { url, enabled: true, role: 'primary', weight: 1, read_enabled: true, write_enabled: true }], r.added);
  };

  const remove = async (url: string) => {
    if (!(await confirm({ ...r.confirmRemove(url), destructive: true }))) return;
    setOpen(null);
    save((rows ?? []).filter((x) => x.url !== url), r.removed);
  };

  const pause = async (url: string) => {
    try {
      await Relays.suspend(url, 3600);
      toast.push({ variant: 'ok', message: t.v2.mod.done.relaySuspend, action: { label: t.v2.mod.undo, onClick: () => { Relays.resume(url).then(() => status.refresh()); } } });
      status.refresh();
      load();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };
  const resume = async (url: string) => {
    try { await Relays.resume(url); status.refresh(); load(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) }); }
  };

  const list = rows ?? [];
  const up = list.filter((x) => x.enabled && statusMap.get(x.url)?.status === 'connected').length;

  return (
    <div className="v2-page">
      <div className="v2-page__head">
        <h1>{r.title}</h1>
        <span className="v2-muted v2-small">{r.summary(up, list.filter((x) => x.enabled).length)}</span>
      </div>

      <form className="v2-addrow" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label htmlFor="relay-add" className="v2-sr">{r.addPlaceholder}</label>
        <input id="relay-add" className="v2-input v2-mono" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder={r.addPlaceholder} autoComplete="off" spellCheck={false} />
        <button type="submit" className="v2-btn" disabled={!newUrl.trim()}>{r.add}</button>
      </form>

      {rows && list.length === 0 && <div className="v2-empty">{r.empty}</div>}

      <ul className="v2-relays">
        {list.map((x) => {
          const st = statusMap.get(x.url);
          const until = suspendedMap.get(x.url);
          const state = until ? 'paused' : !x.enabled ? 'disabled' : (st?.status ?? 'unknown');
          const dot = state === 'connected' ? 'ok' : state === 'disabled' ? 'off' : 'warm';
          const isOpen = open === x.url;
          const id = `relay-${x.url.replace(/[^a-z0-9]/gi, '-')}`;
          return (
            <li key={x.url} className={`v2-relay ${x.enabled ? '' : 'is-off'} ${isOpen ? 'is-open' : ''}`}>
              <div className="v2-relay__row">
                <button type="button" className="v2-relay__main" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : x.url)}>
                  <span className={`v2-dot v2-dot--${dot}`} aria-hidden="true" />
                  <span className="v2-relay__text">
                    <span className="v2-mono v2-relay__url">{x.url.replace(/^wss:\/\//, '')}</span>
                    <span className="v2-relay__meta">
                      {until ? r.suspendedUntil(parseUtc(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : r.status[state] ?? state}
                      {' · '}{x.role}
                      {' · '}{x.read_enabled ? 'R' : '–'}{x.write_enabled ? 'W' : '–'}
                      {st?.last_event_at && <span className="v2-hide-narrow"> · {r.lastEvent(ago(st.last_event_at))}</span>}
                    </span>
                  </span>
                </button>
                {/* 一時停止中は設定上 enabled = false になるので、until を先に見る */}
                {(x.enabled || until) && (until
                  ? <button type="button" className="v2-btn v2-btn--sm" onClick={() => resume(x.url)}>{r.resume}</button>
                  : <button type="button" className="v2-btn v2-btn--sm" onClick={() => pause(x.url)}>{r.pause}</button>)}
              </div>

              {isOpen && (
                <div className="v2-relay__edit" id={id}>
                  <label className="v2-toggle">
                    <input type="checkbox" checked={x.enabled} onChange={(e) => patch(x.url, { enabled: e.target.checked })} />
                    {r.enabled}
                  </label>
                  <label className="v2-toggle">
                    <input type="checkbox" checked={x.read_enabled} onChange={(e) => patch(x.url, { read_enabled: e.target.checked })} />
                    {r.read}
                  </label>
                  <label className="v2-toggle">
                    <input type="checkbox" checked={x.write_enabled} onChange={(e) => patch(x.url, { write_enabled: e.target.checked })} />
                    {r.write}
                  </label>
                  <label className="v2-field">
                    <span>{r.role}</span>
                    <select className="v2-input" value={x.role} onChange={(e) => patch(x.url, { role: e.target.value })}>
                      {['primary', 'secondary', 'archive'].map((v) => <option key={v} value={v}>{r.roles[v]}</option>)}
                    </select>
                  </label>
                  <label className="v2-field">
                    <span>{r.weight}</span>
                    <input
                      className="v2-input v2-input--num"
                      type="number"
                      min={0}
                      defaultValue={x.weight}
                      onBlur={(e) => { const w = Number(e.target.value) || 0; if (w !== x.weight) patch(x.url, { weight: w }); }}
                    />
                  </label>
                  <button type="button" className="v2-btn v2-btn--deny v2-relay__remove" onClick={() => remove(x.url)}>{r.remove}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
