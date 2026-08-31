import { useEffect, useState } from 'react';
import { Card, Button, DataList, type Column, Tag, useConfirm, useToast } from '../primitives';
import { AutoGuard as GuardApi } from '../api';
import type { AutoGuardMute, AutoGuardResponse, PutAutoGuardBody } from '../api';
import { useI18n } from '../i18n';

/**
 * 自動ガード (spec §5.14)。
 * - バースト投稿レート / 同一イベント検知の閾値編集
 * - アクティブな content mute の一覧と緊急クリア
 * 発火時のアクションは時限 Quarantine のみ（QUARANTINE 画面に `auto_guard:` 理由で並ぶ）。
 */
export function AutoGuardPage() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<AutoGuardResponse | null>(null);
  const [form, setForm] = useState<PutAutoGuardBody | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = () =>
    GuardApi.get()
      .then((r) => {
        setData(r);
        setForm({
          enabled: r.enabled,
          burst_window_secs: r.burst_window_secs,
          burst_max_events: r.burst_max_events,
          exclude_kinds: r.exclude_kinds,
          duplicate_threshold: r.duplicate_threshold,
          duplicate_window_secs: r.duplicate_window_secs,
          quarantine_secs: r.quarantine_secs,
        });
      })
      .catch(() => undefined);
  useEffect(() => { reload(); }, []);

  const dirty =
    !!data && !!form &&
    (form.enabled !== data.enabled ||
      form.burst_window_secs !== data.burst_window_secs ||
      form.burst_max_events !== data.burst_max_events ||
      form.exclude_kinds !== data.exclude_kinds ||
      form.duplicate_threshold !== data.duplicate_threshold ||
      form.duplicate_window_secs !== data.duplicate_window_secs ||
      form.quarantine_secs !== data.quarantine_secs);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await GuardApi.put(form);
      setData(res);
      toast.push({ variant: 'ok', message: res.enabled ? t.autoGuard.savedOn : t.autoGuard.savedOff });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.saveFailed((e as Error).message) });
    } finally {
      setSaving(false);
    }
  };

  const clearMutes = async () => {
    if (!(await confirm({ ...t.autoGuard.confirmClear, destructive: true }))) return;
    try {
      const res = await GuardApi.clearContentMutes();
      toast.push({ variant: 'ok', message: t.autoGuard.cleared(res.cleared) });
      reload();
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
    }
  };

  const num = (key: keyof PutAutoGuardBody) => ({
    value: form ? String(form[key]) : '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (form && Number.isFinite(v)) setForm({ ...form, [key]: Math.max(0, Math.floor(v)) });
    },
  });

  const muteCols: Column<AutoGuardMute>[] = [
    {
      key: 'hash', label: 'CONTENT SHA-256',
      render: (r) => <code className="logs-cell-mono">{r.content_hash.slice(0, 24)}…</code>,
    },
    {
      key: 'expires', label: 'EXPIRES', width: 140,
      render: (r) => {
        const remain = Math.max(0, r.expires_at - Math.floor(Date.now() / 1000));
        return <Tag variant={remain > 0 ? 'warn' : 'dim'}>{remain > 0 ? `${Math.ceil(remain / 60)} min` : 'expired'}</Tag>;
      },
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card
        title={
          <>AUTO GUARD{' '}
            <Tag variant={data?.enabled ? 'warn' : 'dim'}>{data?.enabled ? 'ARMED' : 'OFF'}</Tag>
          </>
        }
        actions={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form?.enabled ?? false}
              onChange={(e) => form && setForm({ ...form, enabled: e.target.checked })}
            />
            <span>{t.autoGuard.enabledLabel}</span>
          </label>
        }
      >
        <p className="muted">{t.autoGuard.intro}</p>
      </Card>

      <Card title={t.autoGuard.burstTitle}>
        <p className="muted">{t.autoGuard.burstDesc}</p>
        <div className="form-grid">
          <label><span>{t.autoGuard.windowSecs}</span><input className="crt-input" type="number" min={1} {...num('burst_window_secs')} /></label>
          <label><span>{t.autoGuard.maxEvents}</span><input className="crt-input" type="number" min={1} {...num('burst_max_events')} /></label>
          <label>
            <span>{t.autoGuard.excludeKinds}</span>
            <input
              className="crt-input" placeholder="7"
              value={form?.exclude_kinds ?? ''}
              onChange={(e) => form && setForm({ ...form, exclude_kinds: e.target.value })}
            />
          </label>
        </div>
      </Card>

      <Card title={t.autoGuard.dupTitle}>
        <p className="muted">{t.autoGuard.dupDesc}</p>
        <div className="form-grid">
          <label><span>{t.autoGuard.dupThreshold}</span><input className="crt-input" type="number" min={2} {...num('duplicate_threshold')} /></label>
          <label><span>{t.autoGuard.dupWindowSecs}</span><input className="crt-input" type="number" min={1} {...num('duplicate_window_secs')} /></label>
          <label><span>{t.autoGuard.quarantineSecs}</span><input className="crt-input" type="number" min={1} {...num('quarantine_secs')} /></label>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={!dirty || saving} onClick={save}>APPLY</Button>
        <Button variant="ghost" disabled={!dirty || saving} onClick={reload}>RESET</Button>
      </div>

      <Card
        title={<>{t.autoGuard.mutesTitle} <span className="crt-hud-tag">{data?.content_mute_total ?? 0}</span></>}
        actions={
          <Button variant="danger" disabled={!data || data.content_mute_total === 0} onClick={clearMutes}>
            {t.autoGuard.clearMutes}
          </Button>
        }
      >
        <DataList
          rows={data?.content_mutes ?? []}
          columns={muteCols}
          rowKey={(r) => r.content_hash}
          emptyTitle="NO MUTES"
          emptyHint={t.autoGuard.mutesEmpty}
        />
      </Card>
    </div>
  );
}
