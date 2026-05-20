import { useState } from 'react';
import { Drawer } from '../primitives/Drawer';
import { Button } from '../primitives/Button';
import { useToast } from '../primitives/Toast';
import { Icon } from '../icons/Icon';
import { IpAcl, PostPolicy, Quarantine, Safelist } from '../api';
import { recordQuickActionUsed, type QuickActionKind } from '../utils/uiPrefs';

type Action = QuickActionKind | null;

/**
 * docs/ui_redesign_ja.md §6.4 の緊急アクション 4 種を 1 タップで起動するパレット。
 * - Quarantine npub (時限ミュート)
 * - Hard BAN ip
 * - POST policy 切替 (allow ⇆ deny)
 * - 接続中クライアント IP を強制切断
 */
export function EmergencyActionFab() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>(null);

  const fire = async (kind: QuickActionKind, fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      recordQuickActionUsed(kind);
      toast.push({ variant: 'ok', message: ok });
      setAction(null);
      setOpen(false);
    } catch (e) {
      toast.push({ variant: 'alert', message: `${(e as Error).message}` });
    }
  };

  return (
    <>
      <button
        className="crt-fab"
        aria-label="emergency actions"
        onClick={() => setOpen(true)}
        title="Emergency actions"
      >
        <Icon name="disconnect" size={20} />
      </button>
      <Drawer open={open} onClose={() => { setOpen(false); setAction(null); }} title="EMERGENCY ACTIONS">
        {action == null ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <Button variant="danger" onClick={() => setAction('quarantine_npub')}>
              <Icon name="clock" /> Quarantine npub
            </Button>
            <Button variant="danger" onClick={() => setAction('hard_ban_ip')}>
              <Icon name="ban" /> Hard BAN ip
            </Button>
            <Button variant="danger" onClick={() => setAction('toggle_post_policy')}>
              <Icon name="eye-off" /> Toggle POST policy
            </Button>
            <Button variant="danger" onClick={() => setAction('disconnect_ip')}>
              <Icon name="disconnect" /> Disconnect ip (via Hard BAN)
            </Button>
          </div>
        ) : action === 'quarantine_npub' ? (
          <NpubQuarantineForm onCancel={() => setAction(null)} onSubmit={(npub, secs) =>
            fire('quarantine_npub',
              () => Quarantine.create({ npub, scope: 'all', duration_secs: secs }).then(() => undefined),
              `quarantined ${npub} for ${secs}s`)} />
        ) : action === 'hard_ban_ip' ? (
          <IpHardBanForm
            onCancel={() => setAction(null)}
            onSubmit={(ip, memo) =>
              fire('hard_ban_ip',
                () => IpAcl.create({ ip_address: ip, mode: 'hard_ban', memo }),
                `hard-banned ${ip}`)}
          />
        ) : action === 'toggle_post_policy' ? (
          <PolicyToggleForm onCancel={() => setAction(null)} onSubmit={(p) =>
            fire('toggle_post_policy',
              () => PostPolicy.put({ policy: p }).then(() => undefined),
              `POST policy = ${p}`)} />
        ) : action === 'disconnect_ip' ? (
          <IpHardBanForm
            onCancel={() => setAction(null)}
            heading="Hard BAN は既存接続を強制切断します。同等扱いとして実行します。"
            onSubmit={(ip, memo) =>
              fire('disconnect_ip',
                () => IpAcl.create({ ip_address: ip, mode: 'hard_ban', memo: memo || 'fab disconnect' }),
                `disconnected ${ip}`)}
          />
        ) : null}

        {/* prevent unused-import warning of Safelist (緊急 npub BAN を将来拡張する用) */}
        <span style={{ display: 'none' }}>{Safelist ? '' : ''}</span>
      </Drawer>
    </>
  );
}

function NpubQuarantineForm({ onSubmit, onCancel }: { onSubmit: (npub: string, secs: number) => void; onCancel: () => void }) {
  const [npub, setNpub] = useState('');
  const [secs, setSecs] = useState(60 * 60);
  return (
    <div className="form-grid">
      <label><span>npub</span><input className="crt-input" value={npub} onChange={(e) => setNpub(e.target.value)} placeholder="npub1..." /></label>
      <label>
        <span>duration</span>
        <select className="crt-input" value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
          <option value={15 * 60}>15 min</option>
          <option value={60 * 60}>1 hr</option>
          <option value={6 * 60 * 60}>6 hr</option>
          <option value={24 * 60 * 60}>24 hr</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>BACK</Button>
        <Button variant="danger" disabled={!npub.startsWith('npub')} onClick={() => onSubmit(npub, secs)}>QUARANTINE</Button>
      </div>
    </div>
  );
}

function IpHardBanForm({ onSubmit, onCancel, heading }: { onSubmit: (ip: string, memo: string) => void; onCancel: () => void; heading?: string }) {
  const [ip, setIp] = useState('');
  const [memo, setMemo] = useState('');
  return (
    <div className="form-grid">
      {heading && <p className="muted">{heading}</p>}
      <label><span>IP / CIDR</span><input className="crt-input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.10" /></label>
      <label><span>memo</span><input className="crt-input" value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>BACK</Button>
        <Button variant="danger" disabled={!ip} onClick={() => onSubmit(ip, memo)}>HARD BAN</Button>
      </div>
    </div>
  );
}

function PolicyToggleForm({ onSubmit, onCancel }: { onSubmit: (p: 'allowlist' | 'denylist') => void; onCancel: () => void }) {
  const [p, setP] = useState<'allowlist' | 'denylist'>('denylist');
  return (
    <div className="form-grid">
      <p className="muted">POST policy を切り替えます。allowlist は閉じた運用 (allow リストのみ)、denylist は広く公開で deny だけ拒否です。</p>
      <label>
        <span>policy</span>
        <select className="crt-input" value={p} onChange={(e) => setP(e.target.value as 'allowlist' | 'denylist')}>
          <option value="allowlist">allowlist</option>
          <option value="denylist">denylist</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>BACK</Button>
        <Button variant="danger" onClick={() => onSubmit(p)}>APPLY</Button>
      </div>
    </div>
  );
}
