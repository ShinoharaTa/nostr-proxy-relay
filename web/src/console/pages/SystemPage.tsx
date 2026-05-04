import { useEffect, useState } from 'react';
import { Card, Button, Tag } from '../primitives';
import { System } from '../api';
import type { SystemInfoResponse } from '../api';
import { bytes, formatUptimeSec } from '../utils/format';

const CRT_KEY = 'profiler.crtOverlay';
const ANIM_KEY = 'profiler.animations';

export function SystemPage() {
  const [info, setInfo] = useState<SystemInfoResponse | null>(null);
  const [crtOn, setCrtOn] = useState(() => loadBool(CRT_KEY, true));
  const [animOn, setAnimOn] = useState(() => loadBool(ANIM_KEY, true));

  useEffect(() => { System.info().then(setInfo).catch(() => undefined); }, []);

  useEffect(() => { document.body.classList.toggle('crt-overlay-off',   !crtOn);  saveBool(CRT_KEY,  crtOn);  }, [crtOn]);
  useEffect(() => { document.body.classList.toggle('crt-animations-off', !animOn); saveBool(ANIM_KEY, animOn); }, [animOn]);

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
          <Toggle label="CRT scanline overlay" checked={crtOn}  onChange={setCrtOn} />
          <Toggle label="Animations"           checked={animOn} onChange={setAnimOn} />
          <Button variant="ghost" onClick={() => { setCrtOn(true); setAnimOn(true); }}>RESET</Button>
        </div>
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

function loadBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return def;
    return v === '1';
  } catch { return def; }
}
function saveBool(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* noop */ }
}
