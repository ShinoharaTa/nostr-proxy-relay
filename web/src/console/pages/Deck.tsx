import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Pill, Tag, useToast } from '../primitives';
import { Actors, AutoGuard as GuardApi, IpAcl, Quarantine as QApi, Relays, Safelist, Stats } from '../api';
import type { ActorWindow, IpActorRow, LiveEvent, NpubActorRow, QuarantineRow } from '../api';
import { usePolling } from '../utils/usePolling';
import { useI18n } from '../i18n';
import '../design/deck.css';

const LIVE_BUFFER = 40;
const WINDOWS: { id: ActorWindow; label: string }[] = [
  { id: '1h', label: '1h' }, { id: '24h', label: '24h' }, { id: '7d', label: '7d' },
];

/**
 * DECK — Command Center (GOD'S EYE)。
 * docs/ui_redesign_ja.md §14 案B: 発見と制裁を 1 画面に集約する管制卓。
 * 構成: トラッキングバンド / LIVE INTERCEPT / TARGET STACK / SYSTEM DIALS / ATTENTION QUEUE / ティッカー
 */
export function DeckPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [targetBy, setTargetBy] = useState<'ip' | 'npub'>('ip');
  const [window_, setWindow] = useState<ActorWindow>('1h');

  const ipActors = usePolling((sig) => Actors.topIps(window_, 'rejections', sig), 10000, [window_]);
  const npubActors = usePolling((sig) => Actors.topNpubs(window_, sig), 10000, [window_]);
  const quarantine = usePolling((sig) => QApi.list(sig), 10000);
  const stats = usePolling((sig) => Stats.timeseries('1h', sig), 10000);
  const guard = usePolling((sig) => GuardApi.get(sig), 30000);
  const relays = usePolling((sig) => Relays.status(sig), 15000);

  const refreshActors = () => { ipActors.refresh(); npubActors.refresh(); quarantine.refresh(); };

  /* ── LIVE INTERCEPT (SSE) ── */
  const [live, setLive] = useState<LiveEvent[]>([]);
  const [rec, setRec] = useState(false);
  useEffect(() => {
    let alive = true;
    const es = new EventSource('/api/events/stream');
    es.onopen = () => { if (alive) setRec(true); };
    es.onerror = () => { if (alive) setRec(false); };
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as LiveEvent;
        setLive((prev) => {
          const next = [parsed, ...prev];
          if (next.length > LIVE_BUFFER) next.length = LIVE_BUFFER;
          return next;
        });
      } catch { /* ignore */ }
    };
    return () => { alive = false; es.close(); };
  }, []);

  /* ── 集計値 ── */
  const sums = useMemo(() => {
    const b = stats.data ?? [];
    const posted = b.reduce((a, x) => a + x.posted, 0);
    const delivered = b.reduce((a, x) => a + x.delivered, 0);
    const rejected = b.reduce((a, x) => a + x.rejections, 0);
    return { posted, delivered, rejected, evtPerMin: Math.round((posted + delivered) / 60) };
  }, [stats.data]);
  const acceptRate = sums.posted + sums.rejected > 0
    ? Math.round((sums.posted / (sums.posted + sums.rejected)) * 100) : 100;
  const rejectRatio = sums.posted + sums.rejected > 0
    ? Math.round((sums.rejected / (sums.posted + sums.rejected)) * 1000) / 10 : 0;

  const flagged = useMemo(
    () => (ipActors.data ?? []).filter((a) => a.mode === 'normal' && a.rejections > 0).length,
    [ipActors.data],
  );
  const autoGuardEntries = useMemo(
    () => (quarantine.data ?? []).filter((q) => q.active && q.reason.startsWith('auto_guard:')),
    [quarantine.data],
  );
  const rateItems = useMemo(
    () => (ipActors.data ?? []).filter((a) => a.mode === 'normal' && a.rejections >= 10).slice(0, 3),
    [ipActors.data],
  );

  /* ── アクション ── */
  const banIp = async (ip: string, mode: 'hard_ban' | 'shadow_ban') => {
    if (!confirm(t.deck.confirmIp(mode, ip))) return;
    try {
      await IpAcl.create({ ip_address: ip, mode, memo: 'deck quick action' });
      toast.push({ variant: 'ok', message: t.common.applied });
      refreshActors();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };
  const banNpub = async (npub: string) => {
    if (!confirm(t.deck.confirmNpubBan(npub))) return;
    try {
      await Safelist.ban(npub);
      toast.push({ variant: 'ok', message: t.npub.banned });
      refreshActors();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };
  const quarantineNpub = async (npub: string) => {
    if (!confirm(t.deck.confirmQuarantine(npub))) return;
    try {
      await QApi.create({ npub, scope: 'post', reason: 'deck quick action', duration_secs: 24 * 3600 });
      toast.push({ variant: 'ok', message: t.quarantine.created });
      refreshActors();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };
  const releaseQuarantine = async (q: QuarantineRow) => {
    try {
      await QApi.remove(q.id);
      toast.push({ variant: 'ok', message: t.quarantine.released });
      refreshActors();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };

  const tickerText = useMemo(() => {
    const parts: string[] = [];
    for (const q of autoGuardEntries) parts.push(`GUARD ${q.reason} ${q.npub.slice(0, 16)}…`);
    for (const r of relays.data?.relays ?? []) parts.push(`MESH ${r.url.replace('wss://', '')} ${r.status}`);
    parts.push(`SCAN ${(ipActors.data ?? []).length} sources / ${flagged} flagged`);
    parts.push(`SYS accept ${acceptRate}% · reject ${rejectRatio}%`);
    return parts.join('  •  ');
  }, [autoGuardEntries, relays.data, ipActors.data, flagged, acceptRate, rejectRatio]);

  return (
    <div className="deck">
      {/* ─ トラッキングバンド ─ */}
      <div className="deck-band">
        <div className="deck-band__title">TRACKING<small>GLOBAL EVENT MESH</small></div>
        <div className="deck-stat"><b>SOURCES</b><span>{(ipActors.data ?? []).length}</span></div>
        <div className="deck-stat"><b>FLAGGED</b><span style={{ color: 'var(--crt-danger-text)' }}>{flagged}</span></div>
        <div className="deck-stat"><b>EVT/MIN</b><span>{sums.evtPerMin}</span></div>
        <div className="deck-stat"><b>GUARD</b>
          <span style={{ color: guard.data?.enabled ? 'var(--crt-info)' : 'var(--crt-fg-dim)' }}>
            {guard.data?.enabled ? 'ARMED' : 'OFF'}
          </span>
        </div>
        <div className="deck-band__scan">▓▒░ SCANNING ░▒▓</div>
      </div>

      <div className="deck-quad">
        {/* ─ LIVE INTERCEPT ─ */}
        <Card title={<><span className="deck-rec">{rec ? '● REC' : '○ ---'}</span> LIVE INTERCEPT
          <span className="crt-hud-tag">{live.length}</span></>}>
          <div className="deck-cam">
            {live.length === 0 && <div className="deck-cam__ev">{t.deck.liveEmpty}</div>}
            {live.map((e, i) => {
              const isRej = (e.kind ?? '').includes('reject') || (e.kind ?? '').includes('drop');
              return (
                <div key={i} className={`deck-cam__ev ${isRej ? 'deck-cam__ev--rej' : ''}`}>
                  {(e.ts ?? '').slice(11, 19)} {isRej ? 'REJ' : 'OK '} k{e.event_kind ?? '?'}{' '}
                  {e.npub ? `${String(e.npub).slice(0, 14)}…` : e.ip}{e.reason ? ` ${e.reason}` : ''}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ─ TARGET STACK ─ */}
        <Card
          title={<>TARGET STACK <span className="crt-hud-tag">{window_} · reject desc</span></>}
          actions={
            <>
              <Pill items={[{ id: 'ip', label: 'IP' }, { id: 'npub', label: 'NPUB' }]}
                active={targetBy} onChange={(v) => setTargetBy(v as 'ip' | 'npub')} ariaLabel="target type" />
              <Pill items={WINDOWS} active={window_} onChange={(v) => setWindow(v as ActorWindow)} ariaLabel="window" />
            </>
          }
        >
          <div className="deck-stack">
            {targetBy === 'ip'
              ? (ipActors.data ?? []).slice(0, 6).map((a) => <IpTargetCard key={a.ip} a={a} onBan={banIp} />)
              : (npubActors.data ?? []).slice(0, 6).map((a) => (
                  <NpubTargetCard key={a.npub} a={a} onBan={banNpub} onQuarantine={quarantineNpub} />
                ))}
            {((targetBy === 'ip' ? ipActors.data : npubActors.data) ?? []).length === 0 && (
              <div className="deck-tcard"><div className="deck-tcard__meta">{t.deck.stackEmpty}</div></div>
            )}
          </div>
        </Card>

        {/* ─ SYSTEM DIALS ─ */}
        <Card title={<>SYSTEM DIALS <span className="crt-hud-tag">last 1h</span></>}>
          <div className="deck-dials">
            <Ring pct={acceptRate} label={`${acceptRate}%`} color="var(--crt-info)" dimColor="rgba(42,212,200,0.12)" />
            <div className="deck-ring__label">ACCEPT<br />RATE</div>
            <Ring pct={Math.min(100, rejectRatio * 3)} label={`${rejectRatio}%`} color="var(--crt-warn)" dimColor="rgba(255,179,71,0.12)" />
            <div className="deck-ring__label">REJECT<br />RATIO</div>
          </div>
        </Card>

        {/* ─ ATTENTION QUEUE ─ */}
        <Card title={<><span style={{ color: 'var(--crt-warn)' }}>⚠ ATTENTION QUEUE</span>
          <span className="crt-hud-tag">{autoGuardEntries.length + rateItems.length}</span></>}>
          {autoGuardEntries.length === 0 && rateItems.length === 0 && (
            <div className="deck-queue__item deck-queue__item--p3">
              <div className="deck-queue__why">{t.deck.queueEmpty}</div>
            </div>
          )}
          {autoGuardEntries.map((q) => (
            <div key={q.id} className="deck-queue__item deck-queue__item--p1">
              <span className="deck-queue__prio">P1</span>
              <div className="deck-queue__who"><Tag variant="alert">AUTO</Tag> {q.npub}</div>
              <div className="deck-queue__why">{q.reason} — {q.expires_at ? `expires ${q.expires_at}` : 'permanent'}</div>
              <div className="deck-tcard__actions">
                <Button variant="danger" onClick={() => banNpub(q.npub)}>{t.deck.permanentBan}</Button>
                <Button variant="ghost" onClick={() => releaseQuarantine(q)}>{t.deck.falsePositive}</Button>
              </div>
            </div>
          ))}
          {rateItems.map((a) => (
            <div key={a.ip} className="deck-queue__item deck-queue__item--p2">
              <span className="deck-queue__prio">P2</span>
              <div className="deck-queue__who"><Tag variant="warn">RATE</Tag> {a.ip}</div>
              <div className="deck-queue__why">{t.deck.rateWhy(a.rejections, window_)}</div>
              <div className="deck-tcard__actions">
                <Button variant="danger" onClick={() => banIp(a.ip, 'hard_ban')}>HARD BAN</Button>
                <Button variant="danger" onClick={() => banIp(a.ip, 'shadow_ban')}>SHADOW</Button>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* ─ ティッカー ─ */}
      <div className="deck-ticker"><div>{tickerText}</div></div>
    </div>
  );
}

function Ring({ pct, label, color, dimColor }: { pct: number; label: string; color: string; dimColor: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="deck-ring"
      data-v={label}
      style={{ background: `conic-gradient(${color} 0 ${clamped}%, ${dimColor} ${clamped}% 100%)` }}
    />
  );
}

function IpTargetCard({ a, onBan }: { a: IpActorRow; onBan: (ip: string, mode: 'hard_ban' | 'shadow_ban') => void }) {
  const unhandled = a.mode === 'normal' && a.rejections > 0;
  return (
    <div className={`deck-tcard ${unhandled ? 'deck-tcard--hot' : ''}`}>
      <Reticle />
      <div className="deck-tcard__pct">{a.rejections}<small>REJ</small></div>
      <div className="deck-tcard__id">{a.ip}</div>
      <div className="deck-tcard__meta">
        CONN {a.connections} · EVT {a.events} ·{' '}
        {a.mode === 'normal'
          ? (unhandled ? <Tag variant="alert">UNHANDLED</Tag> : '—')
          : <Tag variant={a.mode === 'whitelist' ? 'info' : 'warn'}>{a.mode.toUpperCase()}</Tag>}
        {a.active_connections > 0 && <> · <Tag variant="info">{a.active_connections} LIVE</Tag></>}
      </div>
      {a.mode === 'normal' && (
        <div className="deck-tcard__actions">
          <Button variant="danger" onClick={() => onBan(a.ip, 'hard_ban')}>BAN</Button>
          <Button variant="danger" onClick={() => onBan(a.ip, 'shadow_ban')}>SHADOW</Button>
        </div>
      )}
    </div>
  );
}

function NpubTargetCard({ a, onBan, onQuarantine }: {
  a: NpubActorRow;
  onBan: (npub: string) => void;
  onQuarantine: (npub: string) => void;
}) {
  const handled = a.banned || a.quarantined;
  return (
    <div className={`deck-tcard ${!handled && a.rejections > 0 ? 'deck-tcard--hot' : ''}`}>
      <Reticle />
      <div className="deck-tcard__pct">{a.rejections}<small>REJ</small></div>
      <div className="deck-tcard__id" title={a.npub}>{a.npub}</div>
      <div className="deck-tcard__meta">
        kinds {a.kinds || '—'} ·{' '}
        {a.banned && <Tag variant="alert">BANNED</Tag>}
        {a.quarantined && <Tag variant="warn">QUARANTINE</Tag>}
        {a.safelist_flags != null && (a.safelist_flags & 1) === 1 && <Tag variant="info">ALLOW</Tag>}
        {!handled && a.safelist_flags == null && 'unlisted'}
      </div>
      {!handled && (
        <div className="deck-tcard__actions">
          <Button variant="danger" onClick={() => onBan(a.npub)}>BAN</Button>
          <Button variant="ghost" onClick={() => onQuarantine(a.npub)}>QUARANTINE 24h</Button>
        </div>
      )}
    </div>
  );
}

function Reticle() {
  return (
    <>
      <span className="deck-tcard__c deck-tcard__c--tl" />
      <span className="deck-tcard__c deck-tcard__c--tr" />
      <span className="deck-tcard__c deck-tcard__c--bl" />
      <span className="deck-tcard__c deck-tcard__c--br" />
    </>
  );
}
