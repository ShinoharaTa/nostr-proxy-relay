import { useEffect, useState } from 'react';
import { Card, Button, Tag } from '../primitives';
import { System } from '../api';
import type { SystemInfoResponse } from '../api';
import { bytes, formatUptimeSec } from '../utils/format';
import {
  getUiPrefs,
  setUiPref,
  prefersReducedMotion,
  getQuickActionCounts,
  resetQuickActionCounts,
  type QuickActionKind,
} from '../utils/uiPrefs';

const QUICK_ACTION_LABEL: Record<QuickActionKind, string> = {
  quarantine_npub:    'Quarantine npub',
  hard_ban_ip:        'Hard BAN ip',
  toggle_post_policy: 'Toggle POST policy',
  disconnect_ip:      'Disconnect ip',
};

export function SystemPage() {
  const [info, setInfo] = useState<SystemInfoResponse | null>(null);
  const [crtOn, setCrtOn]   = useState(() => getUiPrefs().crtOverlay);
  const [animOn, setAnimOn] = useState(() => getUiPrefs().animations);
  const [quickCounts, setQuickCounts] = useState(() => getQuickActionCounts());

  useEffect(() => { System.info().then(setInfo).catch(() => undefined); }, []);

  // storage イベント (別タブで FAB が使われた / 設定が変わった) を反映
  useEffect(() => {
    const onStorage = () => {
      setCrtOn(getUiPrefs().crtOverlay);
      setAnimOn(getUiPrefs().animations);
      setQuickCounts(getQuickActionCounts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const reducedMotion = prefersReducedMotion();

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>SYSTEM <span className="crt-hud-tag">v{info?.version ?? '—'}</span></>}>
        <dl className="kv-grid">
          <dt>VERSION</dt>          <dd>{info?.version ?? '—'}</dd>
          <dt>UPTIME</dt>           <dd>{formatUptimeSec(info?.uptime_sec)}</dd>
          <dt>DB PATH</dt>          <dd><code>{info?.disk.db_path ?? '—'}</code></dd>
          <dt>DB SIZE</dt>          <dd>{bytes(info?.disk.db_size_bytes)}</dd>
        </dl>
      </Card>

      <Card title={<>AUTH THROTTLE <span className="crt-hud-tag">env-controlled</span></>}>
        {info ? (
          <dl className="kv-grid">
            <dt>THRESHOLD</dt>      <dd>{info.auth_throttle.threshold} fails</dd>
            <dt>WINDOW</dt>         <dd>{info.auth_throttle.window_secs}s</dd>
            <dt>LOCK DURATION</dt>  <dd>{info.auth_throttle.lock_duration_secs}s</dd>
            <dt>LOCKED IPS</dt>     <dd><Tag variant={info.auth_throttle.locked_ips_count > 0 ? 'warn' : 'dim'}>{info.auth_throttle.locked_ips_count}</Tag></dd>
          </dl>
        ) : <p className="muted">loading…</p>}
        <p className="muted">
          設定変更は <code>ADMIN_LOCKOUT_THRESHOLD</code> / <code>ADMIN_LOCKOUT_WINDOW_SECS</code> /
          {' '}<code>ADMIN_LOCKOUT_DURATION_SECS</code> 環境変数で行い、再起動してください。
        </p>
      </Card>

      <Card title={<>RETENTION</>}>
        {info ? (
          <dl className="kv-grid">
            <dt>LOG RETENTION</dt>  <dd>{info.retention.log_retention_days != null ? `${info.retention.log_retention_days}d` : 'default'}</dd>
          </dl>
        ) : null}
        <p className="muted">変更は <code>LOG_RETENTION_DAYS</code> 環境変数で。</p>
      </Card>

      <Card title={<>ENVIRONMENT OVERRIDES <span className="crt-hud-tag">{info?.env_overrides.length ?? 0} keys</span></>}>
        {info && info.env_overrides.length > 0 ? (
          <ul className="dash-list">
            {info.env_overrides.sort().map((k) => (
              <li key={k}>
                <code>{k}</code>
                <span className="crt-hud-tag">{info.retention.overrides[k] ?? '—'}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">env からの上書きはありません</p>}
      </Card>

      <Card title={<>UI PREFERENCES <span className="crt-hud-tag">localStorage</span></>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Toggle label="CRT scanline overlay"
                  checked={crtOn}
                  onChange={(v) => { setCrtOn(v); setUiPref('crtOverlay', v); }} />
          <Toggle label="Animations"
                  checked={animOn}
                  onChange={(v) => { setAnimOn(v); setUiPref('animations', v); }} />
          {reducedMotion && (
            <p className="muted">
              <Tag variant="warn">OS</Tag> <code>prefers-reduced-motion</code> が有効です。
              UI 設定にかかわらずアニメーションは自動で停止されます。
            </p>
          )}
          <Button variant="ghost"
                  onClick={() => {
                    setCrtOn(true); setAnimOn(true);
                    setUiPref('crtOverlay', true); setUiPref('animations', true);
                  }}>
            RESET
          </Button>
        </div>
      </Card>

      <Card title={<>QUICK ACTION USAGE <span className="crt-hud-tag">local · {quickCounts.total} total</span></>}>
        {quickCounts.total === 0 ? (
          <p className="muted">緊急アクション FAB はまだ使用されていません。</p>
        ) : (
          <ul className="dash-list">
            {(Object.keys(QUICK_ACTION_LABEL) as QuickActionKind[]).map((k) => (
              <li key={k}>
                <span>{QUICK_ACTION_LABEL[k]}</span>
                <span className="crt-hud-tag">{quickCounts.per_action[k] ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ marginTop: 8 }}>
          利用回数はブラウザの localStorage に保存されます（個人情報は含まれません）。
        </p>
        <Button variant="ghost"
                onClick={() => { resetQuickActionCounts(); setQuickCounts(getQuickActionCounts()); }}>
          RESET COUNTS
        </Button>
      </Card>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
