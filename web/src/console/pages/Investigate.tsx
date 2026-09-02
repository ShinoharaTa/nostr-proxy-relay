import { useState } from 'react';
import { Card, Button, DataList, type Column, Pill, Tag, useConfirm, useToast } from '../primitives';
import { Investigate as Api, IpAcl, Quarantine as QApi, Relays, SimpleBan } from '../api';
import type { Counted, EventRow, InvestigateResponse, RelayStat, TagStat, Verdict } from '../api';
import { useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
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
  const [params] = useSearchParams();
  const [refsText, setRefsText] = useState(params.get('refs') ?? '');
  const [idsText, setIdsText] = useState(params.get('ids') ?? '');
  const [authorsText, setAuthorsText] = useState(params.get('authors') ?? '');
  const [limit, setLimit] = useState(200);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<InvestigateResponse | null>(null);
  /** ページングで蓄積した全イベント（res.analysis.events はページ単位なので別持ち） */
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [kindChip, setKindChip] = useState<string>('all');

  const split = (s: string) =>
    s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  const buildReq = () => ({
    refs: split(refsText),
    ids: split(idsText),
    authors: split(authorsText),
    limit,
    timeout_ms: 6000,
  });

  const run = async () => {
    const req = buildReq();
    if (req.refs.length === 0 && req.ids.length === 0 && req.authors.length === 0) {
      toast.push({ variant: 'alert', message: t.investigate.needInput });
      return;
    }
    setBusy(true);
    try {
      const r = await Api.run(req);
      setRes(r);
      setAllEvents(r.analysis.events);
      setKindChip('all');
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  /** until カーソルで続きを取得して蓄積する（実リレーで動作検証済みのページング） */
  const loadMore = async () => {
    if (allEvents.length === 0) return;
    const oldest = Math.min(...allEvents.map((e) => e.created_at));
    setBusy(true);
    try {
      const r = await Api.run({ ...buildReq(), until: oldest - 1 });
      const known = new Set(allEvents.map((e) => e.id));
      const fresh = r.analysis.events.filter((e) => !known.has(e.id));
      if (fresh.length === 0) {
        toast.push({ variant: 'ok', message: t.investigate.noMore });
      } else {
        setAllEvents((prev) => [...prev, ...fresh]);
      }
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };

  // ワンクリック起点（?authors= / ?refs= 付きで遷移してきた場合）は自動実行
  useEffect(() => {
    if (params.get('authors') || params.get('refs') || params.get('ids')) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const banNpub = async (pubkey: string) => {
    if (!(await confirm({ ...t.deck.confirmNpubBan(pubkey), destructive: true }))) return;
    try {
      await SimpleBan.create({ rule_type: 'npub', npub_list: pubkey, apply_to_post: true, apply_to_backend: true });
      toast.push({ variant: 'ok', message: t.common.added });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const quarantineNpub = async (pubkey: string) => {
    if (!(await confirm({ ...t.deck.confirmQuarantine(pubkey), destructive: true }))) return;
    try {
      await QApi.create({ npub: pubkey, scope: 'post', reason: 'from investigation', duration_secs: 24 * 3600 });
      toast.push({ variant: 'ok', message: t.quarantine.created });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  /** 悪いイベントの配信元を期限付きで切り離す。期限が来れば自動で戻る */
  const suspendRelay = async (url: string) => {
    const ok = await confirm({
      title: t.investigate.suspendTitle,
      body: t.investigate.suspendBody(url),
      confirmLabel: t.investigate.suspendConfirm,
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await Relays.suspend(url, 3600);
      toast.push({ variant: 'ok', message: t.investigate.suspended(url, r.until) });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.failed((e as Error).message) });
    }
  };

  const authorCols: Column<Counted>[] = [
    { key: 'count', label: t.investigate.dupCount, width: 90, sortValue: (r) => r.count,
      render: (r) => <span style={{ color: r.count > 1 ? 'var(--crt-danger-text)' : undefined }}>{r.count}</span> },
    { key: 'pk', label: 'PUBKEY', render: (r) => <code className="logs-cell-mono">{r.value}</code> },
    { key: 'act', label: '', width: 190,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button variant="danger" onClick={() => banNpub(r.value)}>BAN</Button>
          <Button variant="ghost" onClick={() => quarantineNpub(r.value)}>Q 24h</Button>
        </span>
      ) },
  ];

  const eventCols: Column<EventRow>[] = [
    { key: 'at', label: 'CREATED', width: 150, sortValue: (r) => r.created_at,
      render: (r) => <code>{new Date(r.created_at * 1000).toISOString().slice(0, 19).replace('T', ' ')}</code> },
    { key: 'pk', label: 'PUBKEY', render: (r) => <code className="logs-cell-mono">{r.pubkey.slice(0, 24)}…</code> },
    { key: 'kind', label: 'KIND', width: 70, sortValue: (r) => r.kind, render: (r) => r.kind },
    { key: 'hash', label: 'CONTENT', width: 170, hideOnMobile: true,
      render: (r) => <code title={`${r.content_len} chars`}>{r.content_hash}</code> },
    { key: 'tags', label: 'TAGS', width: 70, hideOnMobile: true, sortValue: (r) => r.tag_count, render: (r) => r.tag_count },
    { key: 'relays', label: 'FROM', hideOnMobile: true,
      render: (r) => <span className="muted">{r.relays.map((u) => u.replace('wss://', '')).join(', ')}</span> },
  ];

  const relayCols: Column<RelayStat>[] = [
    { key: 'url', label: 'RELAY', render: (r) => <code>{r.url}</code> },
    { key: 'count', label: 'EVENTS', width: 90, sortValue: (r) => r.count, render: (r) => r.count },
    { key: 'ms', label: 'LATENCY', width: 100, sortValue: (r) => r.latency_ms, render: (r) => `${r.latency_ms}ms` },
    { key: 'ok', label: '', width: 90,
      render: (r) => r.completed ? <Tag variant="info">EOSE</Tag> : <Tag variant="warn">TIMEOUT</Tag> },
    { key: 'act', label: '', width: 130,
      render: (r) => (
        <Button variant="danger" onClick={() => suspendRelay(r.url)} title={t.investigate.suspendTitle}>
          {t.investigate.suspend1h}
        </Button>
      ) },
  ];

  const a = res?.analysis;

  /** 反応マトリクス: 1 回の取得結果を kind チップでローカル分離する（実測: #e は 1/6/7 混在で返る） */
  const CHIP_DEFS: { id: string; label: string; kinds: number[] }[] = [
    { id: 'all', label: 'ALL', kinds: [] },
    { id: 'reply', label: t.investigate.chipReply, kinds: [1, 1111] },
    { id: 'reaction', label: t.investigate.chipReaction, kinds: [7] },
    { id: 'repost', label: t.investigate.chipRepost, kinds: [6, 16] },
    { id: 'zap', label: 'ZAP', kinds: [9735] },
  ];
  const chipCount = (kinds: number[]) =>
    kinds.length === 0 ? allEvents.length : allEvents.filter((e) => kinds.includes(e.kind)).length;
  const kindChips = CHIP_DEFS
    .filter((c) => c.id === 'all' || chipCount(c.kinds) > 0)
    .map((c) => ({ id: c.id, label: `${c.label} ${chipCount(c.kinds)}` }));
  const activeChip = CHIP_DEFS.find((c) => c.id === kindChip) ?? CHIP_DEFS[0];
  const visibleEvents = activeChip.kinds.length === 0
    ? allEvents
    : allEvents.filter((e) => activeChip.kinds.includes(e.kind));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>{t.investigate.title} <span className="crt-hud-tag">{t.investigate.noStore}</span></>}>
        <p className="muted">{t.investigate.intro}</p>
        <div className="form-grid">
          <label>
            <span>{t.investigate.refsLabel}</span>
            <textarea className="crt-input" rows={2} value={refsText}
              onChange={(e) => setRefsText(e.target.value)} placeholder="note1... / nevent1... / hex" />
          </label>
          <label>
            <span>{t.investigate.idsLabel}</span>
            <textarea className="crt-input" rows={2} value={idsText}
              onChange={(e) => setIdsText(e.target.value)} placeholder="note1... / nevent1... / hex" />
          </label>
          <label>
            <span>{t.investigate.authorsLabel}</span>
            <textarea className="crt-input" rows={2} value={authorsText}
              onChange={(e) => setAuthorsText(e.target.value)} placeholder="npub1... / nprofile1... / hex" />
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

      {res && res.roots.length > 0 && (
        <Card title={<>{t.investigate.rootTitle} <span className="crt-hud-tag">{res.roots.length}</span></>}>
          {res.roots.map((r) => (
            <div key={r.id} style={{ borderLeft: '3px solid var(--crt-info)', padding: '8px 12px', marginBottom: 8 }}>
              <div className="muted" style={{ fontSize: 11 }}>
                kind {r.kind} · {new Date(r.created_at * 1000).toISOString().slice(0, 16).replace('T', ' ')} ·{' '}
                <code>{r.pubkey.slice(0, 16)}…</code>
              </div>
              <p style={{ margin: '6px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.content || '—'}</p>
            </div>
          ))}
        </Card>
      )}
      {res && res.unusable_relay_hints.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t.investigate.unusableHints(res.unusable_relay_hints.join(', '))}
        </p>
      )}

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

          <Card title={<>{t.investigate.authorDist} <span className="crt-hud-tag">{a.authors_unique} unique</span></>}>
            <DataList
              rows={a.author_counts}
              columns={authorCols}
              rowKey={(r) => r.value}
              initialSort={{ key: 'count', dir: 'desc' }}
              filter={{ placeholder: 'filter pubkey…', match: (r, q) => r.value.includes(q) }}
              emptyTitle="NONE"
            />
          </Card>

          <Card
            title={<>{t.investigate.eventList} <span className="crt-hud-tag">{visibleEvents.length} / {allEvents.length}</span></>}
            actions={
              <>
                <Pill
                  items={kindChips}
                  active={kindChip}
                  onChange={setKindChip}
                  ariaLabel="kind filter"
                />
                <Button variant="ghost" disabled={busy} onClick={loadMore}>{t.investigate.loadMore}</Button>
              </>
            }
          >
            <DataList
              rows={visibleEvents}
              columns={eventCols}
              rowKey={(r) => r.id}
              initialSort={{ key: 'at', dir: 'desc' }}
              filter={{ placeholder: 'filter pubkey / hash…',
                        match: (r, q) => r.pubkey.includes(q) || r.content_hash.includes(q) }}
              emptyTitle="NONE"
            />
          </Card>
        </>
      )}
    </div>
  );
}
