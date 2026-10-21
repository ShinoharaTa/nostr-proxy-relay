import { useEffect, useState } from 'react';
import type { InboxItem } from '../api';
import { useI18n } from '../i18n';
import { useInbox } from '../state/ConsoleState';
import { useModeration } from '../moderation/useModeration';
import type { ModAction } from '../moderation/actions';
import { useTarget, parseUtc, reasonText } from '../target/TargetCard';
import { isTyping, shortId } from '../utils/nostrId';
import { ago } from '../utils/format';

/**
 * ホーム = 受信箱（#54）。人の判断が要るものだけを新しい順に並べ、その場で処置する。
 * 処置した項目は消えて次の項目にフォーカスが移る（Submit & Next）。
 */
export function HomePage() {
  const { t } = useI18n();
  const h = t.v2.inbox;
  const { items, loaded, hide } = useInbox();
  const run = useModeration();
  const target = useTarget();
  const [focus, setFocus] = useState(0);
  const f = Math.min(focus, Math.max(0, items.length - 1));

  const act = async (item: InboxItem, a: ModAction) => {
    if (await run(a)) hide(item.key);
  };

  const primary = (item: InboxItem): { label: string; key?: string; tone: string; action: ModAction }[] => {
    const snooze = { label: h.snooze, key: 'e', tone: '', action: { type: 'snooze', key: item.key } as ModAction };
    switch (item.kind) {
      case 'guard':
        return [
          { label: h.release, key: 'u', tone: '', action: { type: 'unquarantine', npub: item.target } },
          { label: t.v2.card.deny, key: 'd', tone: 'deny', action: { type: 'deny', npub: item.target } },
          snooze,
        ];
      case 'npub_surge':
        return [
          { label: t.v2.palette.q1d, key: 'q', tone: 'q', action: { type: 'quarantine', npub: item.target, secs: 86400 } },
          { label: t.v2.card.deny, key: 'd', tone: 'deny', action: { type: 'deny', npub: item.target } },
          snooze,
        ];
      case 'ip_surge':
        return [
          { label: 'SHADOW', tone: 'q', action: { type: 'ip', ip: item.target, mode: 'shadow_ban' } },
          { label: 'HARD BAN…', tone: 'deny', action: { type: 'ip', ip: item.target, mode: 'hard_ban' } },
          snooze,
        ];
      case 'relay_down':
        return [
          { label: h.pauseRelay, tone: '', action: { type: 'relay-suspend', url: item.target, secs: 3600 } },
          snooze,
        ];
    }
  };

  // キー操作（カード・パレット・ダイアログが開いていないとき）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping() || target.current) return;
      if (document.querySelector('.crt-backdrop, .v2-palette-scrim')) return;
      const item = items[f];
      if (e.key === 'j') setFocus(Math.min(f + 1, items.length - 1));
      else if (e.key === 'k') setFocus(Math.max(f - 1, 0));
      else if (!item) return;
      else if (e.key === 'Enter' && item.target_type !== 'relay') target.open(item.target);
      else {
        const hit = primary(item).find((p) => p.key === e.key);
        if (hit) act(item, hit.action);
        else if (e.key === 'a' && item.target_type === 'npub') act(item, { type: 'allow', npub: item.target });
        else return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const label = (item: InboxItem) => {
    const d = item.detail;
    switch (item.kind) {
      case 'guard': return { head: `⚡ ${h.guard}`, tone: 'q', text: h.guardDetail(reasonText(d.reason ?? '')) };
      case 'npub_surge': return { head: `↑ ${h.npubSurge}`, tone: 'deny', text: `${h.surgeDetail(d.rejections ?? 0, d.window_min ?? 10)} · kind ${d.kinds ?? '?'}${d.top_reason ? ` · ${d.top_reason}` : ''}` };
      case 'ip_surge': return { head: `↑ ${h.ipSurge}`, tone: 'deny', text: h.ipDetail(d.rejections ?? 0, d.window_min ?? 10, d.npubs ?? 0) };
      case 'relay_down': return { head: `● ${h.relayDown}`, tone: 'q', text: `${h.relayDetail}${d.last_error ? ` · ${d.last_error}` : ''}` };
    }
  };

  return (
    <div className="v2-page">
      <div className="v2-page__head">
        <h1>{h.title} <span className="v2-mono v2-muted">{items.length}</span></h1>
        <div className="v2-keys v2-hide-narrow"><kbd className="crt-kbd">j</kbd><kbd className="crt-kbd">k</kbd> {h.keys}</div>
      </div>

      {loaded && items.length === 0 && <div className="v2-empty">{h.empty}</div>}

      <ul className="v2-inbox">
        {items.map((item, i) => {
          const l = label(item);
          return (
            <li
              key={item.key}
              className={`v2-inbox__item ${i === f ? 'is-focus' : ''}`}
              onClick={(e) => {
                setFocus(i);
                if ((e.target as HTMLElement).closest('button')) return;
                if (item.target_type !== 'relay') target.open(item.target);
              }}
            >
              <div className="v2-inbox__what">
                <div className="v2-inbox__meta">
                  <span className={`v2-inbox__head tone-${l.tone}`}>{l.head}</span>
                  <span className="v2-muted">{l.text}</span>
                  <span className="v2-mono v2-faint">{ago(parseUtc(item.at).toISOString())}</span>
                </div>
                <code className="v2-mono">{item.target_type === 'relay' ? item.target : shortId(item.target)}</code>
              </div>
              <div className="v2-inbox__acts">
                {primary(item).map((p) => (
                  <button key={p.label} type="button" className={`v2-btn ${p.tone ? `v2-btn--${p.tone}` : ''}`} onClick={() => act(item, p.action)}>
                    {p.label}{p.key && <kbd className="crt-kbd v2-hide-narrow">{p.key}</kbd>}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > 0 && <p className="v2-muted v2-small">{h.note}</p>}
    </div>
  );
}
