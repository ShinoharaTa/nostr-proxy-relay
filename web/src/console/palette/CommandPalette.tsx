import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Actors, Investigate } from '../api';
import type { IpActorDetail, NpubActorDetail } from '../api';
import { useI18n } from '../i18n';
import { useToast } from '../primitives';
import { useModeration } from '../moderation/useModeration';
import { useTarget, leftText } from '../target/TargetCard';
import { detectInput, hexToNpub, isTyping, shortId, type Detected } from '../utils/nostrId';
import { HUB_SECTIONS } from '../pages/SettingsHub';

/**
 * ⌘K パレット（#54）。何を貼っても受け付け、識別子の種類はこちらで判別する。
 * note / 著者なし nevent は上流に投稿を問い合わせて投稿者を割り出す。
 */

interface PaletteApi { open: (prefill?: string, share?: boolean) => void }
const PaletteCtx = createContext<PaletteApi | null>(null);

export function usePalette(): PaletteApi {
  const v = useContext(PaletteCtx);
  if (!v) throw new Error('usePalette must be used inside <PaletteProvider>');
  return v;
}

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ prefill: string; share: boolean } | null>(null);
  const open = useCallback((prefill = '', share = false) => setState({ prefill, share }), []);
  const api = useMemo(() => ({ open }), [open]);
  const toast = useToast();

  // 全画面共通のキー: ⌘K / Ctrl+K と / でパレット、z で直前の措置を取り消す
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping() || document.querySelector('.crt-backdrop, .v2-palette-scrim')) return;
      if (e.key === '/') { e.preventDefault(); open(); }
      else if (e.key === 'z' && toast.runLastAction()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, toast]);

  return (
    <PaletteCtx.Provider value={api}>
      {children}
      {state && <Palette prefill={state.prefill} share={state.share} onClose={() => setState(null)} />}
    </PaletteCtx.Provider>
  );
}

interface Opt { group: string; label: string; sub?: string; tone?: 'allow' | 'q' | 'deny'; run: () => void }

type Resolved =
  | { kind: 'npub'; id: string; via: string; content?: string }
  | { kind: 'ip'; id: string; cidr: boolean }
  | { kind: 'resolving'; via: string }
  | { kind: 'unresolved'; via: string }
  | null;

function Palette({ prefill, share, onClose }: { prefill: string; share: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const p = t.v2.palette;
  const navigate = useNavigate();
  const target = useTarget();
  const run = useModeration();
  const [value, setValue] = useState(prefill);
  const [sel, setSel] = useState(0);
  const [resolved, setResolved] = useState<Resolved>(null);
  const [detail, setDetail] = useState<NpubActorDetail | IpActorDetail | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const detected: Detected = useMemo(() => detectInput(value), [value]);

  // 判別結果を対象に寄せる（note は上流に問い合わせる）
  useEffect(() => {
    setSel(0);
    setDetail(null);
    if (detected.kind === 'npub') { setResolved({ kind: 'npub', id: detected.npub, via: detected.via }); return; }
    if (detected.kind === 'ip') { setResolved({ kind: 'ip', id: detected.value, cidr: detected.cidr }); return; }
    if (detected.kind !== 'event') { setResolved(null); return; }
    if (detected.author) { setResolved({ kind: 'npub', id: detected.author, via: detected.via }); }
    else setResolved({ kind: 'resolving', via: detected.via });
    let alive = true;
    Investigate.run({ ids: [detected.eventId], limit: 1, timeout_ms: 4000 })
      .then((r) => {
        if (!alive) return;
        const ev = r.analysis.events[0];
        const content = r.analysis.top_contents[0]?.value;
        if (ev) setResolved({ kind: 'npub', id: hexToNpub(ev.pubkey), via: detected.via, content });
        else if (!detected.author) setResolved({ kind: 'unresolved', via: detected.via });
      })
      .catch(() => { if (alive && !detected.author) setResolved({ kind: 'unresolved', via: detected.via }); });
    return () => { alive = false; };
  }, [detected]);

  // 現在の状態（候補の並びと「現在: …」に使う）
  useEffect(() => {
    if (!resolved || (resolved.kind !== 'npub' && resolved.kind !== 'ip')) return;
    let alive = true;
    (resolved.kind === 'npub' ? Actors.npubDetail(resolved.id) : Actors.ipDetail(resolved.id))
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [resolved]);

  const finish = (fn: () => void) => () => { onClose(); fn(); };

  const opts: Opt[] = useMemo(() => {
    const list: Opt[] = [];
    if (resolved?.kind === 'npub') {
      const id = resolved.id;
      const d = detail?.type === 'npub' ? detail : null;
      const states: string[] = [];
      if (d?.safelist?.banned) states.push(t.v2.card.state.deny);
      if (d?.safelist && (d.safelist.flags & 1) === 1) states.push(t.v2.card.state.allow);
      for (const q of d?.quarantine_entries ?? []) states.push(t.v2.card.state.quarantine(leftText(q.expires_at), ''));
      const g = p.groupNpub;
      list.push({ group: g, label: p.openCard, sub: states.length ? p.current(states.join(' / ')) : undefined, run: finish(() => target.open(id)) });
      if ((d?.quarantine_entries.length ?? 0) > 0) list.push({ group: g, label: t.v2.inbox.release, run: finish(() => run({ type: 'unquarantine', npub: id })) });
      if (d?.safelist?.banned) list.push({ group: g, label: t.v2.mod.done.undeny, run: finish(() => run({ type: 'undeny', npub: id })) });
      if (!(d?.safelist && (d.safelist.flags & 1) === 1)) list.push({ group: g, label: t.v2.card.allow, sub: p.allowSub, tone: 'allow', run: finish(() => run({ type: 'allow', npub: id })) });
      list.push({ group: g, label: p.q1d, tone: 'q', run: finish(() => run({ type: 'quarantine', npub: id, secs: 86400 })) });
      if (!d?.safelist?.banned) list.push({ group: g, label: t.v2.card.deny, sub: p.denySub, tone: 'deny', run: finish(() => run({ type: 'deny', npub: id })) });
      list.push({ group: g, label: p.investigate, run: finish(() => navigate(`/settings/investigate?authors=${encodeURIComponent(id)}`)) });
    } else if (resolved?.kind === 'ip') {
      const id = resolved.id;
      const d = detail?.type === 'ip' ? detail : null;
      const g = p.groupIp;
      list.push({ group: g, label: p.openCard, sub: d && d.mode !== 'normal' ? p.current(d.mode.toUpperCase()) : undefined, run: finish(() => target.open(id)) });
      if (d && d.mode !== 'normal') list.push({ group: g, label: p.ipNormal, run: finish(() => run({ type: 'ip', ip: id, mode: 'normal' })) });
      list.push({ group: g, label: p.whitelist, tone: 'allow', run: finish(() => run({ type: 'ip', ip: id, mode: 'whitelist' })) });
      list.push({ group: g, label: p.shadow, sub: p.shadowSub, tone: 'q', run: finish(() => run({ type: 'ip', ip: id, mode: 'shadow_ban' })) });
      list.push({ group: g, label: p.hardBan, sub: p.denySub, tone: 'deny', run: finish(() => run({ type: 'ip', ip: id, mode: 'hard_ban' })) });
    }

    const dests: { label: string; to: string }[] = [
      { label: t.v2.nav.home, to: '/' },
      { label: t.v2.nav.live, to: '/live' },
      { label: t.v2.nav.roster, to: '/roster' },
      ...HUB_SECTIONS.map((s) => ({ label: `${t.v2.nav.settings}: ${t.v2.hub.sections[s]}`, to: `/settings/${s}` })),
    ];
    const q = detected.kind === 'text' ? detected.query.toLowerCase() : '';
    if (detected.kind === 'none' || q) {
      for (const d of dests.filter((x) => !q || x.label.toLowerCase().includes(q))) {
        list.push({ group: p.groupGo, label: d.label, run: finish(() => navigate(d.to)) });
      }
    }
    if (detected.kind === 'text' && list.length === 0) {
      list.push({ group: '', label: p.notFound(detected.query), run: () => {} });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, detail, detected, t]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, opts.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); opts[sel]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const detectLabel =
    resolved?.kind === 'npub' ? p.detected(resolved.via)
    : resolved?.kind === 'ip' ? p.detected(resolved.cidr ? 'CIDR' : 'IP')
    : resolved?.kind === 'resolving' || resolved?.kind === 'unresolved' ? p.detected(resolved.via)
    : null;

  let lastGroup = '';
  return (
    <div className="v2-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="v2-palette" role="dialog" aria-modal="true" aria-label={p.label}>
        {share && <div className="v2-palette__share">{p.share}</div>}
        <div className="v2-palette__input">
          <label htmlFor="palette-input" className="v2-sr">{p.label}</label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input
            id="palette-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={p.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="crt-kbd">Esc</kbd>
        </div>
        {detectLabel && (
          <div className="v2-palette__detect">
            <span className="v2-tagline">{detectLabel}</span>
            {resolved?.kind === 'npub' && <code className="v2-mono">{shortId(resolved.id)}</code>}
            {resolved?.kind === 'resolving' && <span>{p.resolving}</span>}
            {resolved?.kind === 'unresolved' && <span>{p.unresolved}</span>}
            {resolved?.kind === 'npub' && resolved.content && <div className="v2-palette__content">「{resolved.content.slice(0, 120)}」</div>}
          </div>
        )}
        <div className="v2-palette__opts" role="listbox" aria-label={p.label}>
          {opts.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? <div className="v2-palette__group">{o.group}</div> : null;
            lastGroup = o.group;
            return (
              <div key={`${o.group}-${o.label}`}>
                {head}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  className={`v2-palette__opt ${i === sel ? 'is-on' : ''} ${o.tone ? `tone-${o.tone}` : ''}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={o.run}
                >
                  <span>{o.label}</span>
                  {o.sub && <span className="v2-palette__sub">{o.sub}</span>}
                  {i === sel && <kbd className="crt-kbd">↵</kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="v2-palette__foot">{p.foot}</div>
      </div>
    </div>
  );
}
