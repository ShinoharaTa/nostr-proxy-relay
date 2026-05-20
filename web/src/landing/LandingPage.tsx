import { useEffect, useMemo, useState } from 'react';
import { Card, KpiTile, StatusDot, Button } from '../console/primitives';
import { fetchPublicStatus, type PublicStatus } from './api';

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
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);

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
      return <span className="crt-hud-tag">profiler uplink — loading</span>;
    }
    if (!stats) {
      return <span className="crt-hud-tag crt-hud-tag--alert">uplink unavailable</span>;
    }
    if (stats.statusLevel === 'down') {
      return <span className="crt-hud-tag crt-hud-tag--alert">uplink down</span>;
    }
    if (stats.statusLevel === 'degraded') {
      return <span className="crt-hud-tag crt-hud-tag--warn">uplink degraded</span>;
    }
    return <span className="crt-hud-tag crt-hud-tag--accent">uplink operational</span>;
  })();

  return (
    <div className="lp-page">
      <div className="lp-page__content">
        <header className="lp-hero">
          <div className="lp-hero__statusrow">
            {statusBadge}
            {load.status === 'error' && stats && (
              <span className="crt-hud-tag crt-hud-tag--warn">stale — last update {stats.lastUpdated}</span>
            )}
            {stats && load.status === 'ok' && (
              <span className="crt-hud-tag">refreshed {stats.lastUpdated}</span>
            )}
          </div>
          <h1 className="lp-hero__title">
            Nostr Relay Gateway <strong>— managed relay add-on</strong>
          </h1>
          <p className="lp-hero__lead">
            複数の Nostr リレー本体を束ね、1 つの <code>wss://</code> エンドポイントとして提供する
            マネージド運用向けの集約レイヤです。リレー本体を置き換えるのではなく、
            前段に追加してフェイルオーバー、アクセス制御、フィルタリング、監視をまとめて扱えます。
          </p>
          <div className="lp-hero__cta">
            <span className="lp-hero__endpoint">{endpoint}</span>
            <Button variant="primary" onClick={onCopy}>{copied ? 'Copied' : 'Copy URL'}</Button>
            <a className="crt-btn crt-btn--ghost" href="/docs/">Architecture docs</a>
          </div>
          <p className="lp-hero__hint">
            既存 relay 群の前に置くだけで、クライアントからは単一 relay のように見えます。
            運用者は backend relay、POST / REQ ポリシー、BAN / Quarantine、ログを管理コンソールから制御できます。
          </p>
        </header>

        <section className="lp-kpis" aria-label="public stats">
          <KpiTile
            label="UPTIME"
            value={stats ? stats.uptime : '—'}
            variant={stats?.statusLevel === 'down' ? 'alert' : 'ok'}
          />
          <KpiTile
            label="CONN NOW"
            value={stats ? stats.connNow : '—'}
            delta={stats ? 'active clients' : ''}
          />
          <KpiTile
            label="EVENTS / MIN"
            value={stats ? stats.evtPerMin : '—'}
            delta={stats ? 'gateway throughput' : ''}
          />
          <KpiTile
            label="REJECT RATE"
            value={stats ? stats.rejectRate : '—'}
            variant={
              stats && parseFloat(stats.rejectRate) > 20 ? 'alert' :
              stats && parseFloat(stats.rejectRate) > 5 ? 'warn' : 'ok'
            }
          />
        </section>

        <section className="lp-section lp-section--split" aria-labelledby="lp-usecases">
          <div>
            <span className="crt-hud-tag">WHEN TO USE</span>
            <h2 id="lp-usecases" className="lp-section__title">
              relay 本体を増やすほど、運用が散らばるときに。
            </h2>
            <p className="lp-section__lead">
              Nostr relay を単体で公開するだけなら、この gateway は必須ではありません。
              価値が出るのは、複数の relay 本体を使い分けたい、でもユーザーには 1 つの
              endpoint だけを案内したい、という managed service 的な運用です。
            </p>
          </div>
          <div className="lp-usecases">
            <Card title="複数 relay を束ねたい" bracket>
              <p>地域別・用途別・冗長化用の backend relay を、1 つの <code>wss://</code> に集約。</p>
            </Card>
            <Card title="ユーザーに設定を増やさせたくない" bracket>
              <p>クライアント側には単一 URL だけを配布。裏側の relay 追加・停止・差し替えは運用側で吸収。</p>
            </Card>
            <Card title="relay 本体を改造せず制御したい" bracket>
              <p>POST / REQ の制御、BAN、Quarantine、kind 制限、DSL フィルタを gateway 側で後付け。</p>
            </Card>
            <Card title="障害時に逃がしたい" bracket>
              <p>backend が落ちても別 relay へ退避。状態確認と復旧判断を管理コンソールで行えます。</p>
            </Card>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="lp-problems">
          <div className="lp-section__header">
            <span className="crt-hud-tag">WHAT IT SOLVES</span>
            <h2 id="lp-problems" className="lp-section__title">relay 運用で面倒になる部分を、前段に集める。</h2>
            <p className="lp-section__lead">
              relay 本体はシンプルに保ち、運用ポリシー・観測・緊急対応を gateway に寄せます。
              「relay を置き換える」のではなく、マネージド運用のための制御面を追加します。
            </p>
          </div>
          <div className="lp-solutions">
            <div className="lp-solution">
              <strong>1 endpoint</strong>
              <span>ユーザーへ案内する URL は 1 つ。backend 構成変更を利用者に見せない。</span>
            </div>
            <div className="lp-solution">
              <strong>Policy edge</strong>
              <span>投稿・購読・IP・npub・kind のルールを relay 本体の外側で統一管理。</span>
            </div>
            <div className="lp-solution">
              <strong>Operational visibility</strong>
              <span>接続、拒否、backend の生死、incident を dashboard / live log で追跡。</span>
            </div>
            <div className="lp-solution">
              <strong>Emergency controls</strong>
              <span>荒れた時は Quarantine / Hard BAN / POST policy 切替をすばやく実行。</span>
            </div>
          </div>
        </section>

        <section className="lp-features">
          <Card title={<>RELAY AGGREGATION <span className="crt-hud-tag">gateway</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              複数 backend relay を束ね、クライアントには単一の <code>wss://</code> として公開。
              追加・停止・重み付けを前段で管理できます。
            </p>
          </Card>
          <Card
            title={
              <>FAILOVER POOL <span className="crt-hud-tag">{stats ? `${stats.poolSize} nodes` : '— nodes'}</span></>
            }
            bracket
          >
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              backend 障害時は別 relay へ退避。読み取り・書き込みの役割や weight を分けて、
              managed relay service の前段として安定運用できます。
            </p>
          </Card>
          <Card title={<>POLICY LAYER <span className="crt-hud-tag">access control</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              POST / REQ、npub、IP、kind、DSL ルールを gateway 側で制御。
              フィルタリングは主機能ではなく、リレー運用に後付けできる安全装置です。
            </p>
          </Card>
          <Card title={<>OPERATIONS <span className="crt-hud-tag crt-hud-tag--accent">live</span></>} bracket>
            <p style={{ margin: 0, color: 'var(--crt-fg)' }}>
              Dashboard、Live Events、Telemetry、System 情報を管理コンソールに集約。
              障害・拒否・接続状況を見ながら即時対応できます。
            </p>
          </Card>
        </section>

        <section className="lp-section lp-flow" aria-labelledby="lp-flow">
          <div className="lp-section__header">
            <span className="crt-hud-tag">HOW IT WORKS</span>
            <h2 id="lp-flow" className="lp-section__title">クライアントと relay 群の間に、運用レイヤを 1 枚挟む。</h2>
          </div>
          <div className="lp-flow__grid">
            <div className="lp-flow__step">
              <span>01</span>
              <strong>Clients connect to gateway</strong>
              <p>Nostr クライアントはこのページの <code>wss://</code> だけを relay として登録します。</p>
            </div>
            <div className="lp-flow__step">
              <span>02</span>
              <strong>Gateway applies policy</strong>
              <p>REQ / POST、npub、IP、kind、DSL ルールを前段で判定し、必要なら遮断・隔離します。</p>
            </div>
            <div className="lp-flow__step">
              <span>03</span>
              <strong>Backend relays do relay work</strong>
              <p>通過した通信を backend relay pool へ中継。障害時は別 backend へ逃がします。</p>
            </div>
          </div>
          <div className="lp-final-cta">
            <div>
              <strong>Managed relay service の add-on として設計。</strong>
              <span>relay 本体、gateway、管理コンソールを分けて考えることで、運用変更を安全に進められます。</span>
            </div>
            <a className="crt-btn crt-btn--primary" href="/docs/">設計ドキュメントを見る</a>
          </div>
        </section>

        {stats && stats.recentLog.length > 0 ? (
          <section>
            <Card title={<>STATUS LOG <span className="crt-hud-tag">recent {stats.recentLog.length}</span></>}>
              <div className="lp-statuslog">
                {stats.recentLog.map((r) => (
                  <StatusDot key={r.key} variant={r.level}>{r.ts}  {r.text}</StatusDot>
                ))}
              </div>
            </Card>
          </section>
        ) : null}

        <footer className="lp-footer">
          <span>{'>>'} Proxy Nostr Relay Gateway (PROFILER)</span>
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
