import { useMemo, useState } from 'react';
import { Card, KpiTile, StatusDot, Pill, Tag } from '../primitives';
import { Logs, Stats } from '../api';
import type { StatsPeriod } from '../api';
import { usePolling } from '../utils/usePolling';
import { Sparkline } from '../components/Sparkline';
import { ago, durationBetween, prettyNumber, shortDateTime } from '../utils/format';

const PERIODS: StatsPeriod[] = ['15m', '1h', '6h', '24h', '7d'];

export function Dashboard() {
  const [period, setPeriod] = useState<StatsPeriod>('1h');

  const stats = usePolling((sig) => Stats.current(sig), 5000);
  const series = usePolling((sig) => Stats.timeseries(period, sig), 10000, [period]);
  const liveTail = usePolling((sig) => Logs.rejection({ limit: 10 }, sig), 5000);
  const recentConn = usePolling((sig) => Logs.connection({ limit: 10 }, sig), 8000);
  const recentBackend = usePolling((sig) => Logs.backend({ limit: 10 }, sig), 8000);

  const ratesPerMin = useMemo(() => {
    const buckets = series.data ?? [];
    if (buckets.length === 0) return { posted: 0, delivered: 0, rejections: 0 };
    const last = buckets[buckets.length - 1];
    return {
      posted: last.posted ?? 0,
      delivered: last.delivered ?? 0,
      rejections: last.rejections ?? 0,
    };
  }, [series.data]);

  const activeConnRows = useMemo(() => {
    const rows = recentConn.data ?? [];
    return rows.filter((r) => !r.disconnected_at).slice(0, 6);
  }, [recentConn.data]);

  return (
    <div className="page-grid">
      <section className="page-grid__kpis">
        <KpiTile label="ACTIVE" value={prettyNumber(stats.data?.active_connections)} delta="connections" variant="ok" />
        <KpiTile label="POSTED / MIN"    value={prettyNumber(ratesPerMin.posted)}     delta={`peak: ${period}`} />
        <KpiTile label="DELIVERED / MIN" value={prettyNumber(ratesPerMin.delivered)}  delta={`peak: ${period}`} />
        <KpiTile
          label="REJECTED / MIN"
          value={prettyNumber(ratesPerMin.rejections)}
          delta={`total ${prettyNumber(stats.data?.total_rejections)}`}
          variant={ratesPerMin.rejections > 30 ? 'alert' : ratesPerMin.rejections > 5 ? 'warn' : 'default'}
        />
      </section>

      <section className="page-grid__main">
        <Card
          title={<>EVENTS OVER TIME <span className="crt-hud-tag">{period}</span></>}
          actions={
            <Pill
              items={PERIODS.map((p) => ({ id: p, label: p.toUpperCase() }))}
              active={period}
              onChange={(v) => setPeriod(v as StatsPeriod)}
            />
          }
        >
          <Sparkline data={series.data ?? []} />
        </Card>
      </section>

      <section className="page-grid__side">
        <Card title={<>ACTIVE CLIENTS <span className="crt-hud-tag">top {activeConnRows.length}</span></>}>
          {activeConnRows.length === 0 ? (
            <div className="crt-empty">
              <div className="crt-empty__title">NO ACTIVE</div>
              <div>現在接続中のクライアントはありません</div>
            </div>
          ) : (
            <ul className="dash-list">
              {activeConnRows.map((c) => (
                <li key={c.id}>
                  <code>{c.ip_address}</code>
                  <span className="crt-hud-tag">{durationBetween(c.connected_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="page-grid__half-l">
        <Card title={<>LIVE REJECTIONS <span className="crt-hud-tag">last 10</span></>}>
          {liveTail.data && liveTail.data.length > 0 ? (
            <ul className="dash-list">
              {liveTail.data.slice(0, 8).map((r) => (
                <li key={r.id} title={r.reason}>
                  <span className="crt-hud-tag crt-hud-tag--alert">k{r.kind}</span>
                  <code className="dash-list__npub">{shortNpub(r.npub)}</code>
                  <span className="dash-list__reason">{truncate(r.reason, 32)}</span>
                  <span className="crt-hud-tag">{ago(r.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="crt-empty">
              <div className="crt-empty__title">NO REJECTIONS</div>
              <div>直近のイベント拒否はありません</div>
            </div>
          )}
        </Card>
      </section>

      <section className="page-grid__half-r">
        <Card title={<>TOP REJECT REASONS</>}>
          {stats.data && stats.data.rejections_by_reason.length > 0 ? (
            <ul className="dash-list">
              {stats.data.rejections_by_reason.slice(0, 5).map((r) => (
                <li key={r.reason}>
                  <span>{truncate(r.reason, 36)}</span>
                  <Tag variant="alert">{prettyNumber(r.count)}</Tag>
                </li>
              ))}
            </ul>
          ) : (
            <div className="crt-empty">
              <div className="crt-empty__title">NO DATA</div>
              <div>まだ拒否ログがありません</div>
            </div>
          )}
        </Card>

        <Card title={<>RECENT INCIDENTS <span className="crt-hud-tag">backend</span></>} style={{ marginTop: 12 }}>
          {recentBackend.data && recentBackend.data.length > 0 ? (
            <ul className="dash-list">
              {recentBackend.data.slice(0, 5).map((i) => (
                <li key={i.id}>
                  <StatusDot variant={incidentVariant(i.event_type)}>
                    {i.event_type}
                  </StatusDot>
                  <code className="dash-list__url">{i.relay_url}</code>
                  <span className="crt-hud-tag">{shortDateTime(i.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="crt-empty">
              <div className="crt-empty__title">ALL CLEAR</div>
              <div>backend イベントは記録されていません</div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function shortNpub(s: string | null | undefined): string {
  if (!s) return '—';
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function incidentVariant(eventType: string): 'live' | 'warn' | 'alert' | 'idle' {
  const lc = eventType.toLowerCase();
  if (lc.includes('error') || lc.includes('fail') || lc.includes('disconn')) return 'alert';
  if (lc.includes('warn') || lc.includes('reconnect') || lc.includes('degrad')) return 'warn';
  return 'live';
}
