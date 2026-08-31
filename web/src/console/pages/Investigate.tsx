import { useState } from 'react';
import { Card, Button, DataList, type Column, Tag, useConfirm, useToast } from '../primitives';
import { Investigate as Api, IpAcl, SimpleBan } from '../api';
import type { Counted, InvestigateResponse, RelayStat, TagStat, Verdict } from '../api';
import { useI18n } from '../i18n';

/**
 * イベント調査（Issue #31）。
 *
 * 証跡は保存しない。実行のたびに上流リレーへ REQ を投げ、集めたイベントを
 * その場で解析して結果だけを表示する。ブロックは人間が確認してから適用する。
 */
export function InvestigatePage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [idsText, setIdsText] = useState('');
  const [authorsText, setAuthorsText] = useState('');
  const [limit, setLimit] = useState(200);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<InvestigateResponse | null>(null);

  const split = (s: string) =>
    s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  const run = async () => {
    const ids = split(idsText);
    const authors = split(authorsText);
    if (ids.length === 0 && authors.length === 0) {
      toast.push({ variant: 'alert', message: t.investigate.needInput });
      return;
    }
    setBusy(true);
    try {
      setRes(await Api.run({ ids, authors, limit, timeout_ms: 6000 }));
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  /** 解析が出した提案ルールを Quick BAN として登録する（適用前に必ず確認）。 */
  const applyRule = async (rule: Record<string, unknown>) => {
    const ok = await confirm({
      title: t.investigate.applyTitle,
      body: <pre className="json-preview">{JSON.stringify(rule, null, 2)}</pre>,
      confirmLabel: t.investigate.applyConfirm,
      destructive: true,
    });
    if (!ok) return;
    try {
      await SimpleBan.create(rule as { rule_type: string });
      toast.push({ variant: 'ok', message: t.common.added });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const banIp = async (ip: string) => {
    if (!(await confirm({ ...t.deck.confirmIp('hard_ban', ip), destructive: true }))) return;
    try {
      await IpAcl.create({ ip_address: ip, mode: 'hard_ban', memo: 'from investigation' });
      toast.push({ variant: 'ok', message: t.common.applied });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const relayCols: Column<RelayStat>[] = [
    { key: 'url', label: 'RELAY', render: (r) => <code>{r.url}</code> },
    { key: 'count', label: 'EVENTS', width: 90, sortValue: (r) => r.count, render: (r) => r.count },
    { key: 'ms', label: 'LATENCY', width: 100, sortValue: (r) => r.latency_ms, render: (r) => `${r.latency_ms}ms` },
    { key: 'ok', label: '', width: 90,
      render: (r) => r.completed ? <Tag variant="info">EOSE</Tag> : <Tag variant="warn">TIMEOUT</Tag> },
  ];

  const a = res?.analysis;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>{t.investigate.title} <span className="crt-hud-tag">{t.investigate.noStore}</span></>}>
        <p className="muted">{t.investigate.intro}</p>
        <div className="form-grid">
          <label>
            <span>{t.investigate.idsLabel}</span>
            <textarea className="crt-input" rows={3} value={idsText}
              onChange={(e) => setIdsText(e.target.value)} placeholder="event id を改行 / カンマ区切りで" />
          </label>
          <label>
            <span>{t.investigate.authorsLabel}</span>
            <textarea className="crt-input" rows={2} value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)} placeholder="pubkey (hex) を改行 / カンマ区切りで" />
          </label>
          <label>
            <span>limit</span>
            <input className="crt-input" type="number" min={1} max={1000} value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" disabled={busy} onClick={run}>
              {busy ? t.investigate.running : t.investigate.run}
            </Button>
          </div>
        </div>
      </Card>

      {a && (
        <>
          <Card title={<>{t.investigate.verdictTitle} <span className="crt-hud-tag">{a.fetched} events</span></>}>
            {a.verdicts.length === 0 && <p className="muted">{t.investigate.noPattern}</p>}
            {a.verdicts.map((v: Verdict, i) => (
              <div key={i} style={{ borderLeft: '3px solid var(--crt-warn)', padding: '8px 12px', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tag variant={v.confidence === 'high' ? 'alert' : 'warn'}>{v.kind}</Tag>
                  <span className="muted">confidence: {v.confidence}</span>
                </div>
                <p style={{ margin: '6px 0' }}>{v.detail}</p>
                {v.suggested_rule != null && (
                  <Button variant="danger" onClick={() => applyRule(v.suggested_rule as Record<string, unknown>)}>
                    {t.investigate.applyRule}
                  </Button>
                )}
              </div>
            ))}
            {res.local.suggested_ip_ban && (
              <div style={{ borderLeft: '3px solid var(--crt-danger)', padding: '8px 12px' }}>
                <Tag variant="alert">single_ip</Tag>
                <p style={{ margin: '6px 0' }}>
                  {t.investigate.singleIp(String(res.local.suggested_ip_ban), res.local.matched)}
                </p>
                <Button variant="danger" onClick={() => banIp(String(res.local.suggested_ip_ban))}>
                  {t.investigate.banIp}
                </Button>
              </div>
            )}
          </Card>

          <Card title={t.investigate.breakdown}>
            <div className="form-grid">
              <div><b>{t.investigate.authors}</b>: {a.authors_unique} unique / {a.fetched}</div>
              <div><b>{t.investigate.contents}</b>: {a.content_unique} unique</div>
              {a.timing && (
                <div>
                  <b>{t.investigate.timing}</b>: span {a.timing.span_secs}s ·
                  median {a.timing.median_interval_secs}s ·
                  regularity {(a.timing.regularity * 100).toFixed(0)}%
                </div>
              )}
              {res.local.matched > 0 && (
                <div>
                  <b>{t.investigate.localIps}</b>:{' '}
                  {res.local.ips.map((x) => `${x.ip} (${x.count})`).join(', ') || '—'}
                </div>
              )}
            </div>
          </Card>

          <Card title={t.investigate.byRelay}>
            <DataList rows={a.by_relay} columns={relayCols} rowKey={(r) => r.url}
              initialSort={{ key: 'count', dir: 'desc' }} emptyTitle="NO RESPONSE" />
          </Card>

          {a.common_tags.length > 0 && (
            <Card title={t.investigate.commonTags}>
              <DataList
                rows={a.common_tags}
                columns={[
                  { key: 'tag', label: 'TAG', render: (r: TagStat) => <code>{r.name}={r.value}</code> },
                  { key: 'count', label: 'COUNT', width: 90, render: (r: TagStat) => r.count },
                  { key: 'cov', label: 'COVERAGE', width: 110, render: (r: TagStat) => `${(r.coverage * 100).toFixed(0)}%` },
                ]}
                rowKey={(r) => `${r.name}=${r.value}`}
                emptyTitle="NONE"
              />
            </Card>
          )}

          <Card title={t.investigate.topAuthors}>
            <DataList
              rows={a.top_authors}
              columns={[
                { key: 'v', label: 'PUBKEY', render: (r: Counted) => <code className="logs-cell-mono">{r.value}</code> },
                { key: 'c', label: 'COUNT', width: 90, render: (r: Counted) => r.count },
              ]}
              rowKey={(r) => r.value}
              emptyTitle="NONE"
            />
          </Card>
        </>
      )}
    </div>
  );
}
