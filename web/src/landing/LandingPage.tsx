import { useEffect, useMemo, useState } from 'react';
import { Card, KpiTile, StatusDot, Button } from '../console/primitives';
import { fetchPublicStatus, type PublicStatus } from './api';
import { detectInitialLang, landingText, persistLang, type LandingLang } from './i18n';

const POLL_INTERVAL_MS = 10_000;

type StatusLevel = 'operational' | 'degraded' | 'down';

function useEndpoint() {
  if (typeof window === 'undefined') return 'wss://example.invalid';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

/** Uptime 秒を `4d 12h 03m` のように人が読む形に。 */
function formatUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

/** ISO8601 → "HH:MM" 表示 (失敗時は空文字)。 */
function shortTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function levelFromEventType(eventType: string): 'live' | 'warn' | 'alert' {
  const lc = eventType.toLowerCase();
  if (lc.includes('error') || lc.includes('fail') || lc.includes('disconn')) return 'alert';
  if (lc.includes('warn') || lc.includes('degrad') || lc.includes('reconnect')) return 'warn';
  return 'live';
}

function sumLastN(arr: number[], n: number): number {
  if (!arr || arr.length === 0) return 0;
  const start = Math.max(0, arr.length - n);
  let sum = 0;
  for (let i = start; i < arr.length; i++) sum += arr[i] ?? 0;
  return sum;
}

interface DerivedStats {
  uptime: string;
  connNow: string;
  evtPerMin: string;
  rejectRate: string;
  poolSize: number;
  recentLog: { ts: string; level: 'live' | 'warn' | 'alert'; text: string; key: string }[];
  statusLevel: StatusLevel;
  lastUpdated: string;
}

function derive(api: PublicStatus): DerivedStats {
  const window = 5;
  const posted = sumLastN(api.events.posted_1h, window);
  const delivered = sumLastN(api.events.delivered_1h, window);
  const rejected = sumLastN(api.events.rejected_1h, window);
  const total = posted + delivered + rejected;
  const rejectRate = total === 0 ? 0 : (rejected / total) * 100;

  return {
    uptime: formatUptime(api.uptime_sec),
    connNow: api.connections_active.toLocaleString(),
    evtPerMin: Math.round((posted + delivered) / window).toLocaleString(),
    rejectRate: `${rejectRate.toFixed(1)}%`,
    poolSize: api.backends.filter((b) => b.status !== 'disabled').length,
    recentLog: api.incidents.slice(0, 5).map((i, idx) => ({
      ts: shortTime(i.ts),
      level: levelFromEventType(i.event_type),
      text: `${i.event_type}  ${i.summary}`.trim(),
      key: `${i.ts}-${idx}`,
    })),
    statusLevel: (api.status as StatusLevel) ?? 'operational',
    lastUpdated: new Date(api.generated_at).toLocaleTimeString(),
  };
}

interface LoadState {
  status: 'loading' | 'ok' | 'error';
  data?: PublicStatus;
  error?: string;
  loadedAt?: number;
}

/**
 * PROFILER LP — 公開トップ。
 * - リレーの自己紹介・KPI・特徴・接続先を提示
 * - `/api/public/status` を 10s 間隔でポーリングして実データ表示
 * - API 取得失敗時は最後に取れた値を表示し続け、ヘッダにエラーバッジを出す
 */
export function LandingPage() {
  const endpoint = useEndpoint();
  const [lang, setLang] = useState<LandingLang>(() => detectInitialLang());
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const t = landingText[lang];

  const switchLang = (next: LandingLang) => {
    setLang(next);
    persistLang(next);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();

    const tick = async () => {
      try {
        const data = await fetchPublicStatus(ctl.signal);
        if (!alive) return;
        setLoad({ status: 'ok', data, loadedAt: Date.now() });
      } catch (e) {
        if (!alive) return;
        if ((e as Error).name === 'AbortError') return;
        setLoad((prev) => ({
          status: 'error',
          data: prev.data,
          error: (e as Error).message,
          loadedAt: prev.loadedAt,
        }));
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      ctl.abort();
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      // クリップボード不可でも LP は成立する必要があるため握り潰す
    }
  };

  const stats = useMemo(() => (load.data ? derive(load.data) : null), [load.data]);

  const statusBadge = (() => {
    if (load.status === 'loading' && !stats) {
      return <span className="crt-hud-tag">{t.loading}</span>;
    }
    if (!stats) {
      return <span className="crt-hud-tag crt-hud-tag--alert">{t.unavailable}</span>;
    }
    if (stats.statusLevel === 'down') {
      return <span className="crt-hud-tag crt-hud-tag--alert">{t.down}</span>;
    }
    if (stats.statusLevel === 'degraded') {
      return <span className="crt-hud-tag crt-hud-tag--warn">{t.degraded}</span>;
    }
    return <span className="crt-hud-tag crt-hud-tag--accent">{t.operational}</span>;
  })();

  return (
    <div className="lp-page">
      <div className="lp-page__content">
        <header className="lp-hero">
          <div className="lp-hero__statusrow">
            {statusBadge}
            {load.status === 'error' && stats && (
              <span className="crt-hud-tag crt-hud-tag--warn">{t.stale(stats.lastUpdated)}</span>
            )}
            {stats && load.status === 'ok' && (
              <span className="crt-hud-tag">{t.refreshed(stats.lastUpdated)}</span>
            )}
            <div className="lp-lang-switcher" role="group" aria-label={t.langLabel}>
              <button
                type="button"
                className={lang === 'ja' ? 'is-active' : undefined}
                onClick={() => switchLang('ja')}
                aria-pressed={lang === 'ja'}
              >
                JA
              </button>
              <button
                type="button"
                className={lang === 'en' ? 'is-active' : undefined}
                onClick={() => switchLang('en')}
                aria-pressed={lang === 'en'}
              >
                EN
              </button>
            </div>
          </div>
          <h1 className="lp-hero__title">
            {t.hero.title} <strong>{t.hero.subtitle}</strong>
          </h1>
          <p className="lp-hero__lead">{t.hero.lead}</p>
          <div className="lp-hero__cta">
            <span className="lp-hero__endpoint">{endpoint}</span>
            <Button variant="primary" onClick={onCopy}>{copied ? t.copied : t.copyUrl}</Button>
            <a className="crt-btn crt-btn--ghost" href="/docs/">{t.docs}</a>
          </div>
          <p className="lp-hero__hint">{t.hero.hint}</p>
        </header>

        <section className="lp-kpis" aria-label="public stats">
          <KpiTile
            label={t.kpi.uptime}
            value={stats ? stats.uptime : '—'}
            variant={stats?.statusLevel === 'down' ? 'alert' : 'ok'}
          />
          <KpiTile
            label={t.kpi.connNow}
            value={stats ? stats.connNow : '—'}
            delta={stats ? t.kpi.connDelta : ''}
          />
          <KpiTile
            label={t.kpi.eventsPerMin}
            value={stats ? stats.evtPerMin : '—'}
            delta={stats ? t.kpi.eventsDelta : ''}
          />
          <KpiTile
            label={t.kpi.rejectRate}
            value={stats ? stats.rejectRate : '—'}
            variant={
              stats && parseFloat(stats.rejectRate) > 20 ? 'alert' :
              stats && parseFloat(stats.rejectRate) > 5 ? 'warn' : 'ok'
            }
          />
        </section>

        <section className="lp-section lp-section--split" aria-labelledby="lp-usecases">
          <div>
            <span className="crt-hud-tag">{t.useCases.tag}</span>
            <h2 id="lp-usecases" className="lp-section__title">
              {t.useCases.title}
            </h2>
            <p className="lp-section__lead">
              {t.useCases.lead}
            </p>
          </div>
          <div className="lp-usecases">
            {t.useCases.items.map((item) => (
              <Card key={item.title} title={item.title} bracket>
                <p>{item.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-problems">
          <div className="lp-section__header">
            <span className="crt-hud-tag">{t.solves.tag}</span>
            <h2 id="lp-problems" className="lp-section__title">{t.solves.title}</h2>
            <p className="lp-section__lead">
              {t.solves.lead}
            </p>
          </div>
          <div className="lp-solutions">
            {t.solves.items.map(([title, body]) => (
              <div className="lp-solution" key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-features">
          {t.features.map((feature) => {
            const tag = 'tagSuffix' in feature
              ? (stats ? `${stats.poolSize} ${feature.tagSuffix}` : `— ${feature.tagSuffix}`)
              : feature.tag;
            return (
              <Card
                key={feature.title}
                title={<>{feature.title} <span className={feature.title === 'OPERATIONS' ? 'crt-hud-tag crt-hud-tag--accent' : 'crt-hud-tag'}>{tag}</span></>}
                bracket
              >
                <p style={{ margin: 0, color: 'var(--crt-fg)' }}>{feature.body}</p>
              </Card>
            );
          })}
        </section>

        <section className="lp-section lp-flow" aria-labelledby="lp-flow">
          <div className="lp-section__header">
            <span className="crt-hud-tag">{t.flow.tag}</span>
            <h2 id="lp-flow" className="lp-section__title">{t.flow.title}</h2>
          </div>
          <div className="lp-flow__grid">
            {t.flow.steps.map(([num, title, body]) => (
              <div className="lp-flow__step" key={num}>
                <span>{num}</span>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
            ))}
          </div>
          <div className="lp-final-cta">
            <div>
              <strong>{t.flow.ctaTitle}</strong>
              <span>{t.flow.ctaBody}</span>
            </div>
            <a className="crt-btn crt-btn--primary" href="/docs/">{t.flow.cta}</a>
          </div>
        </section>

        {stats && stats.recentLog.length > 0 ? (
          <section>
            <Card title={<>STATUS LOG <span className="crt-hud-tag">{t.statusLog(stats.recentLog.length)}</span></>}>
              <div className="lp-statuslog">
                {stats.recentLog.map((r) => (
                  <StatusDot key={r.key} variant={r.level}>{r.ts}  {r.text}</StatusDot>
                ))}
              </div>
            </Card>
          </section>
        ) : null}

        <footer className="lp-footer">
          <span>{'>>'} {t.footerName}</span>
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
