import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Pill, DataList, type Column, Tag, useConfirm, useToast } from '../primitives';
import { Icon } from '../icons/Icon';
import { Actors, Quarantine as QApi, Safelist } from '../api';
import type { ActorWindow, NpubActorRow, SafelistRow } from '../api';
import { usePolling } from '../utils/usePolling';
import { useI18n } from '../i18n';
import { QuickRegister, applyAll } from './QuickRegister';

const WINDOWS: { id: ActorWindow; label: string }[] = [
  { id: '1h', label: '1h' }, { id: '24h', label: '24h' }, { id: '7d', label: '7d' }, { id: 'all', label: 'ALL' },
];

type SubTab = 'allow' | 'deny' | 'bypass';

const TABS = [
  { id: 'allow',  label: 'ALLOW' },
  { id: 'deny',   label: 'DENY' },
  { id: 'bypass', label: 'BYPASS' },
];

/** ランキングの初期表示件数。全件並べると登録欄が埋もれるため絞る（#50） */
const TOP_LIMIT = 10;

const isNpub = (v: string) => /^npub1[02-9ac-hj-np-z]{58}$/.test(v);

/**
 * Npub 管理。
 * - allow:  flags & 1（post_allowed。allowlist 方式で POST を許可）
 * - deny:   banned = 1（仕様 §5.2 の per-npub deny。方式に関係なく最強の拒否）
 * - bypass: flags & 2（filter_bypass。フィルタと自動ガードの対象外）
 *
 * 以前は DENY タブ / ADD の DENY が flags=2 を立てており、ブロックのつもりが
 * filter_bypass（素通し）になっていた。BAN 選択も API が banned を無視して効いていなかった（#50）。
 *
 * docs/ui_redesign_ja.md §5.8
 */
export function NpubPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [tab, setTab] = useState<SubTab>('allow');
  const [rows, setRows] = useState<SafelistRow[] | null>(null);
  const [showAllTop, setShowAllTop] = useState(false);

  const [window_, setWindow] = useState<ActorWindow>('24h');
  const actors = usePolling((sig) => Actors.topNpubs(window_, sig), 15000, [window_]);

  const reload = () => { Safelist.list().then(setRows).catch(() => setRows([])); actors.refresh(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, []);

  const quickBan = async (npub: string) => {
    if (!(await confirm({ ...t.deck.confirmNpubBan(npub), destructive: true }))) return;
    try { await Safelist.ban(npub); toast.push({ variant: 'ok', message: t.npub.banned }); reload(); }
    catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };
  const quickQuarantine = async (npub: string) => {
    if (!(await confirm({ ...t.deck.confirmQuarantine(npub), destructive: true }))) return;
    try {
      await QApi.create({ npub, scope: 'post', reason: 'from top rejected', duration_secs: 24 * 3600 });
      toast.push({ variant: 'ok', message: t.quarantine.created });
      reload();
    } catch (e) { toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) }); }
  };

  const filtered = useMemo(() => {
    const all = rows ?? [];
    if (tab === 'allow') return all.filter((r) => (r.flags & 1) === 1 && !r.banned);
    if (tab === 'deny')  return all.filter((r) => r.banned);
    return all.filter((r) => (r.flags & 2) === 2);
  }, [rows, tab]);

  const remove = async (npub: string) => {
    if (!(await confirm({ ...t.npub.confirmDelete(npub), destructive: true }))) return;
    try {
      await Safelist.remove(npub);
      toast.push({ variant: 'ok', message: t.common.deleted });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.deleteFailed((e as Error).message) });
    }
  };

  const toggleBroadcast = async (r: SafelistRow) => {
    try {
      const next = r.flags ^ 8;
      await Safelist.upsert({ ...r, flags: next });
      toast.push({ variant: 'ok', message: (next & 8) === 8 ? t.npub.broadcastOn : t.npub.broadcastOff });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
    }
  };

  const toggleBan = async (r: SafelistRow) => {
    try {
      if (r.banned) await Safelist.unban(r.npub);
      else          await Safelist.ban(r.npub);
      toast.push({ variant: 'ok', message: r.banned ? t.npub.unbanned : t.npub.banned });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
    }
  };

  /** クイック登録。ALLOW は flags に 1 を足し、DENY は banned を立てる（既存のフラグは保つ） */
  const register = async (values: string[], action: string, memo: string): Promise<boolean> => {
    if (action === 'deny' && !(await confirm({ ...t.block.confirmDeny(values.length, values[0]), destructive: true }))) {
      return false;
    }
    const existing = new Map((rows ?? []).map((r) => [r.npub, r]));
    const { ok, failed } = await applyAll(values, async (npub) => {
      const prev = existing.get(npub);
      if (action === 'allow') {
        await Safelist.upsert({ npub, memo: memo || prev?.memo || '', flags: (prev?.flags ?? 0) | 1, banned: false });
        // 明示的に ALLOW したら DENY は外す
        if (prev?.banned) await Safelist.unban(npub);
      } else {
        if (memo || !prev) {
          await Safelist.upsert({ npub, memo: memo || prev?.memo || '', flags: prev?.flags ?? 0, banned: false });
        }
        await Safelist.ban(npub);
      }
    });
    if (ok > 0) toast.push({ variant: 'ok', message: t.block.quickDone(ok) });
    if (failed.length > 0) toast.push({ variant: 'alert', message: t.block.quickFailed(failed.length, failed[0]) });
    setTab(action as SubTab);
    reload();
    return failed.length === 0;
  };

  const cols: Column<SafelistRow>[] = [
    { key: 'npub', label: 'NPUB', render: (r) => <code className="logs-cell-mono">{r.npub}</code> },
    {
      key: 'flags', label: 'FLAGS', width: 110, hideOnMobile: true,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {(r.flags & 1) === 1 && <Tag variant="info">ALLOW</Tag>}
          {(r.flags & 2) === 2 && <Tag variant="warn">BYPASS</Tag>}
          {(r.flags & 8) === 8 && <Tag variant="info">BCAST</Tag>}
          {r.banned             && <Tag variant="alert">DENY</Tag>}
        </span>
      ),
    },
    { key: 'memo', label: 'MEMO', render: (r) => r.memo || '—', hideOnMobile: true },
    {
      key: 'actions', label: '', width: 130,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {/* broadcast (flags & 8): 全リレー fan-out 許可 (spec §5.15) */}
          <Button variant="ghost" iconOnly onClick={() => toggleBroadcast(r)} title={(r.flags & 8) === 8 ? 'revoke broadcast' : 'grant broadcast'}>
            <Icon name={(r.flags & 8) === 8 ? 'arrow-up' : 'arrow-down'} />
          </Button>
          <Button variant="ghost" iconOnly onClick={() => toggleBan(r)} title={r.banned ? 'undeny' : 'DENY'}>
            <Icon name={r.banned ? 'eye' : 'ban'} />
          </Button>
          <Button variant="danger" iconOnly aria-label="delete" onClick={() => remove(r.npub)}>
            <Icon name="close" />
          </Button>
        </span>
      ),
    },
  ];

  const topCols: Column<NpubActorRow>[] = [
    { key: 'rejections', label: 'REJECT', width: 90, sortValue: (r) => r.rejections,
      render: (r) => <span style={{ color: 'var(--crt-danger-text)' }}>{r.rejections.toLocaleString()}</span> },
    { key: 'npub', label: 'NPUB',
      render: (r) => <code className="logs-cell-mono" title={r.npub}>{`${r.npub.slice(0, 16)}…${r.npub.slice(-8)}`}</code> },
    { key: 'kinds', label: 'KINDS', width: 100, hideOnMobile: true, render: (r) => r.kinds || '—' },
    { key: 'status', label: 'STATUS', width: 130,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {r.banned && <Tag variant="alert">DENY</Tag>}
          {r.quarantined && <Tag variant="warn">QUARANTINE</Tag>}
          {r.safelist_flags != null && (r.safelist_flags & 1) === 1 && <Tag variant="info">ALLOW</Tag>}
          {!r.banned && !r.quarantined && r.safelist_flags == null && <Tag variant="dim">—</Tag>}
        </span>
      ) },
    { key: 'actions', label: '', width: 250,
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {/* ワンクリック起点 (#35 P1): npub をコピーせず調査画面へ */}
          <Button variant="ghost" onClick={() => navigate(`/investigate?authors=${encodeURIComponent(r.npub)}`)}>
            {t.investigate.title}
          </Button>
          {(!r.banned && !r.quarantined) && (
            <>
              <Button variant="danger" onClick={() => quickBan(r.npub)}>DENY</Button>
              <Button variant="ghost" onClick={() => quickQuarantine(r.npub)}>Q 24h</Button>
            </>
          )}
        </span>
      ) },
  ];

  const topAll = actors.data ?? [];
  const topRows = showAllTop ? topAll : topAll.slice(0, TOP_LIMIT);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <QuickRegister
        title={t.block.quickNpubTitle}
        placeholder={t.block.quickNpubPlaceholder}
        isValid={isNpub}
        actions={[
          { id: 'allow', label: 'ALLOW', variant: 'primary' },
          { id: 'deny',  label: 'DENY',  variant: 'danger' },
        ]}
        onSubmit={register}
      />

      <Card
        title={<>NPUB <span className="crt-hud-tag">{tab} · {filtered.length}</span></>}
        actions={<Pill items={TABS} active={tab} onChange={(v) => setTab(v as SubTab)} ariaLabel="npub tabs" />}
      >
        <DataList
          rows={filtered}
          columns={cols}
          rowKey={(r) => r.npub}
          filter={{ placeholder: 'filter npub / memo…', match: (r, q) => r.npub.includes(q) || r.memo.toLowerCase().includes(q) }}
          emptyTitle="EMPTY"
          emptyHint={t.npub.emptyHint}
        />
      </Card>

      <Card
        title={<>TOP REJECTED <span className="crt-hud-tag">{window_} · {topAll.length}</span></>}
        actions={<Pill items={WINDOWS} active={window_} onChange={(v) => setWindow(v as ActorWindow)} ariaLabel="window" />}
      >
        <DataList
          rows={topRows}
          columns={topCols}
          rowKey={(r) => r.npub}
          initialSort={{ key: 'rejections', dir: 'desc' }}
          filter={{ placeholder: 'filter npub…', match: (r, q) => r.npub.includes(q) }}
          emptyTitle="NO REJECTIONS"
          emptyHint={t.deck.stackEmpty}
        />
        {topAll.length > TOP_LIMIT && (
          <Button variant="ghost" onClick={() => setShowAllTop((v) => !v)}>
            {showAllTop ? t.block.showLess : t.block.showMore(topAll.length - TOP_LIMIT)}
          </Button>
        )}
      </Card>
    </div>
  );
}
