import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Actors, Investigate } from '../api';
import type { InvestigateResponse, IpActorDetail, NpubActorDetail } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../primitives';
import { MODERATION_CHANGED } from '../moderation/actions';
import { useModeration } from '../moderation/useModeration';
import { isTyping, shortId } from '../utils/nostrId';

/**
 * 対象カード（#54）。npub / IP 1 件の状態と措置を 1 枚にまとめ、どの画面からでも同じ形で開く。
 * PC では右パネル、狭い画面ではボトムシートになる（CSS 側で切り替え）。
 */

export const PRESETS: { id: string; secs: number }[] = [
  { id: '6h', secs: 6 * 3600 },
  { id: '1d', secs: 86400 },
  { id: '7d', secs: 7 * 86400 },
  { id: '30d', secs: 30 * 86400 },
];

interface TargetApi {
  current: string | null;
  open: (id: string) => void;
  close: () => void;
  /** カードの「時限」ボタンとキー q が使う長さ */
  preset: string;
}

const TargetCtx = createContext<TargetApi | null>(null);

export function useTarget(): TargetApi {
  const v = useContext(TargetCtx);
  if (!v) throw new Error('useTarget must be used inside <TargetProvider>');
  return v;
}

export function TargetProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [preset, setPreset] = useState('1d');
  const open = useCallback((id: string) => setCurrent(id), []);
  const close = useCallback(() => setCurrent(null), []);
  const api = useMemo(() => ({ current, open, close, preset }), [current, open, close, preset]);
  return (
    <TargetCtx.Provider value={api}>
      {children}
      {current && <TargetCard id={current} preset={preset} setPreset={setPreset} onClose={close} onOpen={open} />}
    </TargetCtx.Provider>
  );
}

/** サーバーの `YYYY-MM-DD HH:MM:SS`（UTC）をローカル時刻の Date にする */
export function parseUtc(s: string): Date {
  return new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
}

export function leftText(expires: string | null): string {
  if (!expires) return '∞';
  const ms = parseUtc(expires).getTime() - Date.now();
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600_000);
  return h >= 48 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${h}h` : `${Math.ceil(ms / 60_000)}m`;
}

function whenText(s: string): string {
  const d = parseUtc(s);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
}

/** 自動ガードの理由（auto_guard:burst）を人が読める形に */
export function reasonText(reason: string): string {
  if (reason.startsWith('auto_guard:')) return `auto guard: ${reason.slice('auto_guard:'.length)}`;
  return reason;
}

type Detail = NpubActorDetail | IpActorDetail;

interface Profile { name?: string; picture?: string }

function TargetCard({ id, preset, setPreset, onClose, onOpen }: {
  id: string;
  preset: string;
  setPreset: (p: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const c = t.v2.card;
  const toast = useToast();
  const run = useModeration();
  const navigate = useNavigate();
  const isNpub = id.startsWith('npub1');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [inv, setInv] = useState<InvestigateResponse | 'loading' | 'error' | null>(null);

  const load = useCallback(() => {
    (isNpub ? Actors.npubDetail(id) : Actors.ipDetail(id)).then(setDetail).catch(() => setDetail(null));
  }, [id, isNpub]);

  useEffect(() => {
    setDetail(null);
    setProfile(null);
    setInv(null);
    load();
    window.addEventListener(MODERATION_CHANGED, load);
    return () => window.removeEventListener(MODERATION_CHANGED, load);
  }, [load]);

  // 表示名は上流の kind 0 から都度取得する（保存しない。失敗しても npub 表示のまま）
  useEffect(() => {
    if (!isNpub) return;
    let alive = true;
    Investigate.run({ authors: [id], kinds: [0], limit: 1, timeout_ms: 3000 })
      .then((r) => {
        const raw = r.analysis.top_contents[0]?.value;
        if (!alive || !raw) return;
        try {
          const p = JSON.parse(raw) as { display_name?: string; name?: string; picture?: string };
          setProfile({ name: p.display_name || p.name, picture: p.picture });
        } catch { /* kind 0 が壊れていれば無視 */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [id, isNpub]);

  // Esc で閉じる（入力中は除く）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.crt-backdrop, .v2-palette-scrim')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const investigate = async () => {
    setInv('loading');
    try {
      setInv(await Investigate.run({ authors: [id], limit: 30, timeout_ms: 5000 }));
    } catch {
      setInv('error');
    }
  };

  const secs = PRESETS.find((p) => p.id === preset)?.secs ?? 86400;

  // カードを開いている間のキー操作（入力中・ダイアログ表示中は除く）
  useEffect(() => {
    if (!isNpub) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping() || document.querySelector('.crt-backdrop, .v2-palette-scrim')) return;
      const k = e.key;
      if (k === 'a') run({ type: 'allow', npub: id });
      else if (k === 'q') run({ type: 'quarantine', npub: id, secs });
      else if (k === 'd') run({ type: 'deny', npub: id });
      else if (k === 'u') run({ type: 'unquarantine', npub: id });
      else if (k === 'i') investigate();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // ホームのキー操作より先に受ける
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNpub, secs, run]);

  const npubD = detail?.type === 'npub' ? detail : null;
  const ipD = detail?.type === 'ip' ? detail : null;

  const badges: { cls: string; label: string; undo: () => void }[] = [];
  if (npubD?.safelist?.banned) badges.push({ cls: 'deny', label: c.state.deny, undo: () => run({ type: 'undeny', npub: id }) });
  if (npubD?.safelist && (npubD.safelist.flags & 1) === 1) badges.push({ cls: 'allow', label: c.state.allow, undo: () => run({ type: 'unallow', npub: id }) });
  if (npubD?.safelist && (npubD.safelist.flags & 2) === 2) badges.push({ cls: '', label: c.state.bypass, undo: () => {} });
  for (const q of npubD?.quarantine_entries ?? []) {
    badges.push({ cls: 'q', label: c.state.quarantine(leftText(q.expires_at), reasonText(q.reason)), undo: () => run({ type: 'unquarantine', npub: id }) });
  }
  if (ipD && ipD.mode !== 'normal') {
    badges.push({ cls: ipD.mode === 'whitelist' ? 'allow' : ipD.mode === 'shadow_ban' ? 'q' : 'deny', label: ipD.mode.toUpperCase().replace('_', ' '), undo: () => run({ type: 'ip', ip: id, mode: 'normal' }) });
  }

  const reasons = detail?.reasons_24h ?? [];
  const total = reasons.reduce((n, r) => n + r.count, 0);

  return (
    <>
      <div className="v2-card-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="v2-card" aria-label={isNpub ? 'npub' : 'IP'}>
        <div className="v2-card__grab" aria-hidden="true" />
        <div className="v2-card__head">
          <div className="v2-avatar" aria-hidden="true">{isNpub ? (profile?.name?.[0] ?? '?') : 'IP'}</div>
          <div className="v2-card__who">
            <div className="v2-card__name">{isNpub ? (profile?.name ?? shortId(id)) : 'IP / CIDR'}</div>
            <div className="v2-card__id">
              <code className="v2-mono">{shortId(id)}</code>
              <button
                type="button"
                className="v2-btn v2-btn--sm"
                onClick={() => { navigator.clipboard?.writeText(id).then(() => toast.push({ message: c.copied })).catch(() => {}); }}
              >{c.copy}</button>
            </div>
          </div>
          <button type="button" className="v2-btn v2-btn--sm" onClick={onClose} aria-label={c.close}>Esc</button>
        </div>

        <div className="v2-badges">
          {badges.length === 0 && <span className="v2-badge">{c.noState}</span>}
          {badges.map((b) => (
            <span key={b.label} className={`v2-badge v2-badge--${b.cls}`}>
              {b.label}
              {b.cls !== '' && <button type="button" onClick={b.undo} aria-label={`${b.label} ×`}>×</button>}
            </span>
          ))}
        </div>

        {isNpub ? (
          <>
            <div className="v2-actions">
              <button type="button" className="v2-btn v2-btn--allow" onClick={() => run({ type: 'allow', npub: id })}>{c.allow} <kbd className="crt-kbd">a</kbd></button>
              <button type="button" className="v2-btn v2-btn--q" onClick={() => run({ type: 'quarantine', npub: id, secs })}>{c.quarantine} {preset} <kbd className="crt-kbd">q</kbd></button>
              <button type="button" className="v2-btn v2-btn--deny" onClick={() => run({ type: 'deny', npub: id })}>{c.deny} <kbd className="crt-kbd">d</kbd></button>
            </div>
            <div className="v2-presets" role="group" aria-label={c.presets}>
              <span>{c.presets}:</span>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="v2-chip" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.id}</button>
              ))}
            </div>
          </>
        ) : (
          <div className="v2-actions">
            <button type="button" className="v2-btn v2-btn--allow" onClick={() => run({ type: 'ip', ip: id, mode: 'whitelist' })}>WHITELIST</button>
            <button type="button" className="v2-btn v2-btn--q" onClick={() => run({ type: 'ip', ip: id, mode: 'shadow_ban' })}>SHADOW</button>
            <button type="button" className="v2-btn v2-btn--deny" onClick={() => run({ type: 'ip', ip: id, mode: 'hard_ban' })}>HARD BAN…</button>
          </div>
        )}

        <section className="v2-box">
          <h2>{c.record}</h2>
          {total === 0 ? (
            <p className="v2-muted">{c.noRejections}</p>
          ) : (
            <>
              <div>{c.rejections} <span className="v2-mono v2-big v2-deny-text">{total}</span></div>
              {reasons.map((r) => (
                <div key={r.reason} className="v2-kv"><span>{reasonText(r.reason)}</span><span className="v2-mono">{r.count}</span></div>
              ))}
            </>
          )}
          {(detail?.related.length ?? 0) > 0 && (
            <div className="v2-related">
              <span className="v2-muted">{c.related(isNpub)}:</span>
              {detail!.related.map((r) => (
                <button key={r.id} type="button" className="v2-btn v2-btn--sm v2-mono" onClick={() => onOpen(r.id)}>{shortId(r.id)}</button>
              ))}
            </div>
          )}
        </section>

        {isNpub && (
          <section className="v2-stack">
            <button type="button" className="v2-btn" onClick={investigate} disabled={inv === 'loading'}>
              {inv === 'loading' ? c.investigating : c.investigate} <kbd className="crt-kbd">i</kbd>
            </button>
            {inv && inv !== 'loading' && (
              <>
                {inv === 'error' || inv.analysis.fetched === 0 ? (
                  <div className="v2-post">{c.noPosts}</div>
                ) : (
                  <>
                    {inv.analysis.verdicts.map((v) => (
                      <div key={v.kind} className="v2-post v2-post--verdict">{v.detail}</div>
                    ))}
                    {inv.analysis.top_contents.slice(0, 3).map((tc) => (
                      <div key={tc.value} className="v2-post">{tc.value.slice(0, 160)}{tc.count > 1 && <span className="v2-mono v2-muted"> ×{tc.count}</span>}</div>
                    ))}
                  </>
                )}
                <p className="v2-muted v2-small">{c.investigateNote}</p>
                <button type="button" className="v2-link" onClick={() => { onClose(); navigate(`/settings/investigate?authors=${encodeURIComponent(id)}`); }}>{c.openInvestigate} →</button>
              </>
            )}
          </section>
        )}

        <section className="v2-stack">
          <h2 className="v2-h2">{c.history}</h2>
          {(detail?.history.length ?? 0) === 0 && <p className="v2-muted">{c.noHistory}</p>}
          {detail?.history.map((h, i) => (
            <div key={i} className="v2-hist">
              <span className="v2-mono v2-muted">{whenText(h.at)}</span>
              <span>{c.actor[h.actor]} · {h.action}{h.detail ? `（${reasonText(h.detail)}）` : ''}</span>
            </div>
          ))}
        </section>
      </aside>
    </>
  );
}
