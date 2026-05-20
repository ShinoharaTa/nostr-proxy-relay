import { useEffect, useState } from 'react';
import { Card, Button, Modal, Tag, useToast } from '../primitives';
import { PostPolicy as PostPolicyApi } from '../api';
import type { BackendStrategy, PostPolicyValue } from '../api';

const POLICY_INFO: Record<PostPolicyValue, { title: string; desc: string; tone: 'info' | 'warn' }> = {
  allowlist: {
    title: 'ALLOWLIST',
    desc: '原則 deny。allowlist にある npub からの POST のみ受け付ける。閉じた運用向き。',
    tone: 'info',
  },
  denylist: {
    title: 'DENYLIST',
    desc: '原則 allow。denylist にある npub だけ拒否。広く公開する一般運用向き。',
    tone: 'warn',
  },
};

const STRATEGIES: { id: BackendStrategy; label: string; desc: string }[] = [
  { id: 'failover',       label: 'FAILOVER',       desc: '優先度順に 1 つだけ送信、失敗時に次へ' },
  { id: 'fan_out_event',  label: 'FAN OUT (POST)', desc: '受け取った POST を複数 backend に同送' },
  { id: 'fan_in_req',     label: 'FAN IN (REQ)',   desc: '複数 backend からの REQ 結果を集約' },
  { id: 'sharded',        label: 'SHARDED',        desc: 'kind / pubkey で backend を振り分け' },
];

export function PostPolicyPage() {
  const toast = useToast();
  const [policy, setPolicy] = useState<PostPolicyValue>('denylist');
  const [strategy, setStrategy] = useState<BackendStrategy>('failover');
  const [orig, setOrig] = useState<{ policy: PostPolicyValue; strategy: BackendStrategy } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    PostPolicyApi.get().then((r) => {
      setPolicy(r.policy);
      setStrategy(r.backend_strategy);
      setOrig({ policy: r.policy, strategy: r.backend_strategy });
    }).catch(() => undefined);
  }, []);

  const dirty = !!orig && (orig.policy !== policy || orig.strategy !== strategy);
  const policyChanged = !!orig && orig.policy !== policy;

  const apply = async () => {
    setConfirmOpen(false);
    try {
      const res = await PostPolicyApi.put({ policy, backend_strategy: strategy });
      setPolicy(res.policy);
      setStrategy(res.backend_strategy);
      setOrig({ policy: res.policy, strategy: res.backend_strategy });
      toast.push({ variant: 'ok', message: `POST policy = ${res.policy}` });
    } catch (e) {
      toast.push({ variant: 'alert', message: `保存失敗: ${(e as Error).message}` });
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>POST POLICY <Tag variant={POLICY_INFO[policy].tone}>{POLICY_INFO[policy].title}</Tag></>}>
        <p className="muted">{POLICY_INFO[policy].desc}</p>
        <div className="radio-group">
          {(['allowlist', 'denylist'] as PostPolicyValue[]).map((p) => (
            <label key={p} className={`radio-card ${policy === p ? 'radio-card--active' : ''}`}>
              <input
                type="radio" name="policy" value={p}
                checked={policy === p} onChange={() => setPolicy(p)}
              />
              <div>
                <strong>{POLICY_INFO[p].title}</strong>
                <span>{POLICY_INFO[p].desc}</span>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card title={<>BACKEND STRATEGY <span className="crt-hud-tag">{strategy}</span></>}>
        <div className="radio-group">
          {STRATEGIES.map((s) => (
            <label key={s.id} className={`radio-card ${strategy === s.id ? 'radio-card--active' : ''}`}>
              <input
                type="radio" name="strategy" value={s.id}
                checked={strategy === s.id} onChange={() => setStrategy(s.id)}
              />
              <div>
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={!dirty} onClick={() => setConfirmOpen(true)}>APPLY</Button>
        <Button variant="ghost"   disabled={!dirty} onClick={() => orig && (setPolicy(orig.policy), setStrategy(orig.strategy))}>RESET</Button>
      </div>

      <Modal
        open={confirmOpen}
        title={policyChanged ? 'POST policy を切り替えますか？' : 'backend strategy を更新しますか？'}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>CANCEL</Button>
            <Button variant="primary" onClick={apply}>CONFIRM</Button>
          </>
        }
      >
        {policyChanged ? (
          <>
            <p>POST policy を <strong>{orig?.policy}</strong> から <strong>{policy}</strong> に切り替えます。</p>
            <p className="muted">この操作は通過するイベント全体に影響します。Npub allow/deny リストの整備状況を確認してください。</p>
          </>
        ) : (
          <p>backend strategy を <strong>{orig?.strategy}</strong> から <strong>{strategy}</strong> に変更します。</p>
        )}
      </Modal>
    </div>
  );
}
