import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IpAcl, Quarantine, Safelist } from '../api';
import type { IpAccessControlRow, QuarantineRow, SafelistRow } from '../api';
import { useI18n } from '../i18n';
import { MODERATION_CHANGED, type ModAction } from '../moderation/actions';
import { useModeration } from '../moderation/useModeration';
import { leftText, reasonText, useTarget } from '../target/TargetCard';
import { shortId } from '../utils/nostrId';

const TABS = ['allow', 'deny', 'quarantine', 'ip', 'bypass'] as const;
type Tab = (typeof TABS)[number];

interface Row { id: string; note: string; state: string; tone: string; release: ModAction }

/**
 * 名簿（#54）。措置済みの対象を確認・解除する場所。登録は ⌘K に任せ、ここには入力欄を置かない。
 */
export function RosterPage() {
  const { t } = useI18n();
  const r = t.v2.roster;
  const run = useModeration();
  const target = useTarget();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'allow';
  const [safelist, setSafelist] = useState<SafelistRow[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineRow[]>([]);
  const [acl, setAcl] = useState<IpAccessControlRow[]>([]);

  const load = useCallback(() => {
    Safelist.list().then(setSafelist).catch(() => {});
    Quarantine.list().then(setQuarantine).catch(() => {});
    IpAcl.list().then(setAcl).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const onChanged = () => window.setTimeout(load, 300);
    window.addEventListener(MODERATION_CHANGED, onChanged);
    return () => window.removeEventListener(MODERATION_CHANGED, onChanged);
  }, [load]);

  const rows: Record<Tab, Row[]> = useMemo(() => {
    const activeQ = quarantine.filter((q) => q.active && (!q.expires_at || leftText(q.expires_at) !== '0m'));
    return {
      allow: safelist.filter((s) => (s.flags & 1) === 1 && !s.banned).map((s) => ({
        id: s.npub, note: s.memo, state: t.v2.card.state.allow, tone: 'allow', release: { type: 'unallow', npub: s.npub },
      })),
      deny: safelist.filter((s) => s.banned).map((s) => ({
        id: s.npub, note: s.memo, state: t.v2.card.state.deny, tone: 'deny', release: { type: 'undeny', npub: s.npub },
      })),
      quarantine: activeQ.map((q) => ({
        id: q.npub, note: reasonText(q.reason), state: t.v2.card.state.quarantine(leftText(q.expires_at), ''), tone: 'q', release: { type: 'unquarantine', npub: q.npub },
      })),
      ip: acl.filter((a) => a.mode !== 'normal').map((a) => ({
        id: a.ip_address, note: a.memo, state: a.mode.toUpperCase().replace('_', ' '), tone: a.mode === 'whitelist' ? 'allow' : a.mode === 'shadow_ban' ? 'q' : 'deny',
        release: { type: 'ip', ip: a.ip_address, mode: 'normal' },
      })),
      bypass: safelist.filter((s) => (s.flags & 2) === 2).map((s) => ({
        id: s.npub, note: s.memo, state: t.v2.card.state.bypass, tone: '', release: { type: 'unbypass', npub: s.npub },
      })),
    };
  }, [safelist, quarantine, acl, t]);

  const list = rows[tab];

  return (
    <div className="v2-page">
      <div className="v2-page__head">
        <h1>{r.title}</h1>
        <span className="v2-muted v2-small">{r.hint}</span>
      </div>
      <div className="v2-filters" role="tablist" aria-label={r.title}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            className="v2-chip"
            aria-selected={tab === k}
            aria-pressed={tab === k}
            onClick={() => setParams({ tab: k }, { replace: true })}
          >
            {r.tabs[k]} <span className="v2-mono">{rows[k].length}</span>
          </button>
        ))}
      </div>
      {tab === 'bypass' && <p className="v2-muted v2-small">{r.bypassNote}</p>}
      {list.length === 0 ? (
        <div className="v2-empty">{r.empty}</div>
      ) : (
        <ul className="v2-list">
          {list.map((row) => (
            <li key={`${row.id}-${row.state}`} className="v2-list__row" onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) target.open(row.id); }}>
              <code className="v2-mono v2-list__id">{shortId(row.id)}</code>
              {row.note && <span className="v2-muted v2-list__note">{row.note}</span>}
              <span className={`v2-badge v2-badge--${row.tone}`}>{row.state}</span>
              <button type="button" className="v2-btn v2-btn--sm" onClick={() => run(row.release)}>{r.release}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
