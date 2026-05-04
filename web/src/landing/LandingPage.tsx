import { useEffect, useState } from 'react';
import { Card, KpiTile, StatusDot, Button, Icon } from '../console/primitives';

interface PublicStats {
  uptime: string;
  connNow: string;
  evtPerMin: string;
  rejectRate: string;
  poolSize: number;
  recentLog: { ts: string; level: 'live' | 'warn' | 'alert'; text: string }[];
}

const FALLBACK: PublicStats = {
  uptime:    '99.97%',
  connNow:   '1284',
  evtPerMin: '9432',
  rejectRate:'2.1%',
  poolSize:  4,
  recentLog: [
    { ts: '12:30', level: 'live',  text: 'reconnect relay.damus.io ok' },
    { ts: '11:42', level: 'warn',  text: 'degraded nos.lol latency 720ms' },
    { ts: '09:11', level: 'alert', text: 'down relay.snort.social' },
    { ts: '07:00', level: 'live',  text: 'cold start pool=4 ok' },
  ],
};

function useEndpoint() {
  if (typeof window === 'undefined') return 'wss://example.invalid';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

/**
 * PROFILER LP — 公開トップ。
 * - リレーの自己紹介・KPI・特徴・接続先を地味に提示
 * - 統計値は将来 GET /api/landing-stats 等で動的化する想定。今は安全な fallback を表示する。
 */
export function LandingPage() {
  const endpoint = useEndpoint();
  const [stats] = useState<PublicStats>(FALLBACK);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      // クリップボードが使えなくても LP は動く必要があるので無視
    }
  };

  return (
    <div className="lp-page">
      <div className="lp-page__content">
        <header className="lp-hero">
          <span className="crt-hud-tag crt-hud-tag--accent">profiler uplink</span>
          <h1 className="lp-hero__title">
            Nostr Proxy Relay <strong>— 前段フィルタとしての wss://</strong>
          </h1>
          <p className="lp-hero__lead">
            日本国内ユーザー向けに公開している Nostr Proxy リレー。
            複数 backend をまとめ、悪質 npub / IP / 大量投稿の前段フィルタとして動作します。
            REQ・POST どちらも同じポリシーで透過的に処理。
          </p>
          <div className="lp-hero__cta">
            <span className="lp-hero__endpoint">{endpoint}</span>
            <Button variant="primary" onClick={onCopy}>{copied ? 'Copied' : 'Copy URL'}</Button>
            <a className="crt-btn crt-btn--ghost" href="/docs/">Read docs</a>
          </div>
        </header>

        <section className="lp-kpis" aria-label="public stats">
          <KpiTile label="UPTIME"        value={stats.uptime}    variant="ok" />
          <KpiTile label="CONN NOW"      value={stats.connNow}   delta="last 5m" />
          <KpiTile label="EVENTS / MIN"  value={stats.evtPerMin} delta={<><Icon name="arrow-up" size={12} /> +203</>} />
          <KpiTile label="REJECT RATE"   value={stats.rejectRate} variant="warn" />
        </section>

        <section className="lp-features">
          <Card title={<>FILTERING <span className="crt-hud-tag">active</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              悪質 npub / IP を Hard / Shadow / Whitelist で前段ブロック。
              REQ も POST も同一ポリシーで判定。
            </p>
          </Card>
          <Card title={<>POOL <span className="crt-hud-tag">{stats.poolSize} nodes</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              複数 backend にフェイルオーバー。fan-out で 1 wss に束ねて配信。
            </p>
          </Card>
          <Card title={<>VISIBILITY <span className="crt-hud-tag crt-hud-tag--accent">live</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              管理者は Shadow / Hard / Quarantine を 1 画面で監視。SSE でリアルタイム反映。
            </p>
          </Card>
        </section>

        <section>
          <Card title={<>STATUS LOG <span className="crt-hud-tag">last 6h</span></>}>
            <div className="lp-statuslog">
              {stats.recentLog.map((r, i) => (
                <StatusDot key={i} variant={r.level}>{r.ts}  {r.text}</StatusDot>
              ))}
            </div>
          </Card>
        </section>

        <footer className="lp-footer">
          <span>{'>>'} Proxy Nostr Relay (PROFILER)</span>
          <span>
            <a href="/docs/">docs</a>
            {' · '}
            <a href="https://github.com/ShinoharaTa/nostr-proxy-relay" rel="noopener noreferrer">github</a>
          </span>
        </footer>
      </div>
      <div className="lp-overlay" aria-hidden="true" />
    </div>
  );
}
