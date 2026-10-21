import { useEffect, useMemo, useRef, useState } from 'react';
import { StatusDot } from '../primitives';
import type { LiveEvent } from '../api';
import { shortTimeOnly } from '../utils/format';
import { useI18n } from '../i18n';
import { isRejection, useLive } from '../state/ConsoleState';
import { useModeration } from '../moderation/useModeration';
import { useTarget } from '../target/TargetCard';
import { isTyping, shortId } from '../utils/nostrId';

const FILTERS = [
  { id: 'all', label: 'ALL' },
  { id: 'rejected', label: 'REJECTED' },
  { id: 'accepted', label: 'ACCEPTED' },
  { id: 'delivered', label: 'DELIVERED' },
];

/**
 * ライブ（#54）。`/api/events/stream` を共有ストリームから表示し、見ている行でそのまま止める。
 * - 行の主ボタンは「時限 1d」、その他は ⋯ メニュー
 * - チェックで複数選択すると一括操作バーが出る
 * - Space で一時停止。停止中に届いた件数を出す
 */
export function LiveEvents() {
  const { t } = useI18n();
  const l = t.v2.live;
  const live = useLive();
  const run = useModeration();
  const target = useTarget();
  const [filter, setFilter] = useState('all');
  const [frozen, setFrozen] = useState<LiveEvent[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ ev: LiveEvent; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 表示中はナビの「未読の拒否」を数えない
  useEffect(() => { live.setViewing(true); return () => live.setViewing(false); }, [live.setViewing]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = frozen ?? live.events;
  const pending = frozen ? live.events.length - frozen.length : 0;
  const visible = useMemo(
    () => (filter === 'all' ? source : source.filter((e) => (e.kind ?? '').includes(filter === 'rejected' ? 'reject' : filter))),
    [source, filter],
  );

  const togglePause = () => setFrozen((f) => (f ? null : live.events));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || isTyping() || target.current || document.querySelector('.crt-backdrop, .v2-palette-scrim')) return;
      e.preventDefault();
      togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('button')?.focus();
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [menu]);

  const toggleSel = (npub: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(npub)) next.delete(npub); else next.add(npub);
      return next;
    });
    // 選んでいる間に行が流れていかないよう止める
    if (!frozen) setFrozen(live.events);
  };

  const bulk = async (type: 'quarantine' | 'deny') => {
    const ids = [...selected];
    for (const npub of ids) {
      const ok = await run(type === 'quarantine' ? { type, npub, secs: 86400 } : { type, npub });
      if (!ok) break;
    }
    setSelected(new Set());
  };

  const openMenu = (ev: LiveEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ ev, x: Math.max(8, Math.min(r.right - 240, window.innerWidth - 248)), y: Math.min(r.bottom + 4, window.innerHeight - 240) });
  };

  const verdict = (e: LiveEvent) => {
    const k = e.kind ?? '';
    if (k.includes('reject')) return { cls: 'deny', text: e.reason ? `REJECT ${e.reason}` : 'REJECT' };
    if (k.includes('drop')) return { cls: 'q', text: e.reason ? `DROP ${e.reason}` : 'DROP' };
    if (k.includes('deliver')) return { cls: '', text: 'DELIVER' };
    if (k.includes('accept')) return { cls: 'ok', text: 'ACCEPT' };
    return { cls: '', text: k.toUpperCase() || '?' };
  };

  return (
    <div className="v2-page">
      <div className="v2-filters">
        <h1>{t.v2.nav.live}</h1>
        {FILTERS.map((x) => (
          <button key={x.id} type="button" className="v2-chip" aria-pressed={filter === x.id} onClick={() => setFilter(x.id)}>{x.label}</button>
        ))}
        <button type="button" className="v2-btn v2-btn--sm" onClick={togglePause}>
          {frozen ? '▶ RESUME' : '⏸ PAUSE'} <kbd className="crt-kbd v2-hide-narrow">Space</kbd>
        </button>
        {live.conn === 'live' && <StatusDot variant="live">stream open</StatusDot>}
        {live.conn === 'connecting' && <StatusDot variant="warn">connecting…</StatusDot>}
        {live.conn === 'disconnected' && <StatusDot variant="alert">stream lost</StatusDot>}
      </div>

      {selected.size > 0 && (
        <div className="v2-bulk" role="toolbar" aria-label="bulk">
          <b><span className="v2-mono">{selected.size}</span> selected</b>
          <button type="button" className="v2-btn v2-btn--q" onClick={() => bulk('quarantine')}>{l.rowQ}</button>
          <button type="button" className="v2-btn v2-btn--deny" onClick={() => bulk('deny')}>{t.v2.card.deny}</button>
          <button type="button" className="v2-btn" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {pending > 0 && (
        <button type="button" className="v2-newer" onClick={togglePause}>▼ {pending} new</button>
      )}

      {visible.length === 0 ? (
        <div className="v2-empty">{frozen ? t.live.pausedHint : t.live.emptyHint}</div>
      ) : (
        <ul className="v2-live">
          {visible.slice(0, 200).map((e, i) => {
            const v = verdict(e);
            const npub = e.npub ?? null;
            return (
              <li
                key={`${e.ts}-${i}`}
                className={`v2-live__row ${npub && selected.has(npub) ? 'is-sel' : ''} ${isRejection(e) ? 'is-rej' : ''}`}
                onClick={(ev) => { if (!(ev.target as HTMLElement).closest('button, input') && npub) target.open(npub); }}
              >
                <span className="v2-live__sel">
                  {npub && (
                    <input type="checkbox" checked={selected.has(npub)} onChange={() => toggleSel(npub)} aria-label={`select ${shortId(npub)}`} />
                  )}
                </span>
                <span className="v2-mono v2-muted v2-live__ts">{shortTimeOnly(e.ts)}</span>
                <span className={`v2-verdict v2-verdict--${v.cls}`}>{v.text}</span>
                {typeof e.event_kind === 'number' && <span className="v2-mono v2-muted">k{e.event_kind}</span>}
                <code className="v2-mono v2-live__who">{npub ? shortId(npub) : e.ip}</code>
                {npub && e.ip && <code className="v2-mono v2-muted v2-hide-narrow">{shortId(e.ip)}</code>}
                {npub && (
                  <span className="v2-live__acts">
                    <button type="button" className="v2-btn v2-btn--sm v2-btn--q" onClick={() => run({ type: 'quarantine', npub, secs: 86400 })}>{l.rowQ}</button>
                    <button type="button" className="v2-btn v2-btn--sm" aria-label={l.more} onClick={(ev) => openMenu(e, ev.currentTarget)}>⋯</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {menu && (
        <div ref={menuRef} className="v2-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          <button type="button" role="menuitem" className="tone-allow" onClick={() => { setMenu(null); run({ type: 'allow', npub: menu.ev.npub! }); }}>{l.menuAllow}</button>
          <button type="button" role="menuitem" className="tone-deny" onClick={() => { setMenu(null); run({ type: 'deny', npub: menu.ev.npub! }); }}>{l.menuDeny}</button>
          {menu.ev.ip && (
            <>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); run({ type: 'ip', ip: menu.ev.ip!, mode: 'shadow_ban' }); }}>{l.menuShadow}</button>
              <button type="button" role="menuitem" className="tone-deny" onClick={() => { setMenu(null); run({ type: 'ip', ip: menu.ev.ip!, mode: 'hard_ban' }); }}>{l.menuHard}</button>
            </>
          )}
          <button type="button" role="menuitem" onClick={() => { setMenu(null); target.open(menu.ev.npub!); }}>{l.menuCard}</button>
        </div>
      )}
    </div>
  );
}
