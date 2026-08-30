import { useEffect, useState } from 'react';
import { Card, Button, Modal, Tag, useToast } from '../primitives';
import { PostPolicy as PostPolicyApi } from '../api';
import type { BackendStrategy, PostPolicyValue, WriteRouting } from '../api';
import { useI18n } from '../i18n';

const POLICY_INFO: Record<PostPolicyValue, { title: string; tone: 'info' | 'warn' }> = {
  allowlist: { title: 'ALLOWLIST', tone: 'info' },
  denylist:  { title: 'DENYLIST',  tone: 'warn' },
};

const STRATEGIES: { id: BackendStrategy; label: string }[] = [
  { id: 'failover',       label: 'FAILOVER' },
  { id: 'fan_out_event',  label: 'FAN OUT (POST)' },
  { id: 'fan_in_req',     label: 'FAN IN (REQ)' },
  { id: 'sharded',        label: 'SHARDED' },
];

export function PostPolicyPage() {
  const { t } = useI18n();
  const toast = useToast();
  const policyDesc = (p: PostPolicyValue) =>
    p === 'allowlist' ? t.postPolicy.allowlistDesc : t.postPolicy.denylistDesc;
  const [policy, setPolicy] = useState<PostPolicyValue>('denylist');
  const [strategy, setStrategy] = useState<BackendStrategy>('failover');
  const [routing, setRouting] = useState<WriteRouting>('all');
  const [orig, setOrig] = useState<{ policy: PostPolicyValue; strategy: BackendStrategy; routing: WriteRouting } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    PostPolicyApi.get().then((r) => {
      setPolicy(r.policy);
      setStrategy(r.backend_strategy);
      setRouting(r.write_routing);
      setOrig({ policy: r.policy, strategy: r.backend_strategy, routing: r.write_routing });
    }).catch(() => undefined);
  }, []);

  const dirty = !!orig && (orig.policy !== policy || orig.strategy !== strategy || orig.routing !== routing);
  const policyChanged = !!orig && orig.policy !== policy;

  const apply = async () => {
    setConfirmOpen(false);
    try {
      const res = await PostPolicyApi.put({ policy, backend_strategy: strategy, write_routing: routing });
      setPolicy(res.policy);
      setStrategy(res.backend_strategy);
      setRouting(res.write_routing);
      setOrig({ policy: res.policy, strategy: res.backend_strategy, routing: res.write_routing });
      toast.push({ variant: 'ok', message: `POST policy = ${res.policy}` });
    } catch (e) {
      toast.push({ variant: 'alert', message: t.common.saveFailed((e as Error).message) });
    }
  };

  const routingDesc = (r: WriteRouting) =>
    r === 'all' ? t.postPolicy.routingAllDesc : t.postPolicy.routingPrimaryDesc;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title={<>POST POLICY <Tag variant={POLICY_INFO[policy].tone}>{POLICY_INFO[policy].title}</Tag></>}>
        <p className="muted">{policyDesc(policy)}</p>
        <div className="radio-group">
          {(['allowlist', 'denylist'] as PostPolicyValue[]).map((p) => (
            <label key={p} className={`radio-card ${policy === p ? 'radio-card--active' : ''}`}>
              <input
                type="radio" name="policy" value={p}
                checked={policy === p} onChange={() => setPolicy(p)}
              />
              <div>
                <strong>{POLICY_INFO[p].title}</strong>
                <span>{policyDesc(p)}</span>
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
                <span>{t.postPolicy.strategyDescs[s.id]}</span>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card title={<>WRITE ROUTING <span className="crt-hud-tag">{routing}</span></>}>
        <p className="muted">{t.postPolicy.routingNote}</p>
        <div className="radio-group">
          {(['all', 'primary_default'] as WriteRouting[]).map((r) => (
            <label key={r} className={`radio-card ${routing === r ? 'radio-card--active' : ''}`}>
              <input
                type="radio" name="write_routing" value={r}
                checked={routing === r} onChange={() => setRouting(r)}
              />
              <div>
                <strong>{r === 'all' ? 'ALL RELAYS' : 'PRIMARY DEFAULT'}</strong>
                <span>{routingDesc(r)}</span>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={!dirty} onClick={() => setConfirmOpen(true)}>APPLY</Button>
        <Button variant="ghost"   disabled={!dirty} onClick={() => orig && (setPolicy(orig.policy), setStrategy(orig.strategy), setRouting(orig.routing))}>RESET</Button>
      </div>

      <Modal
        open={confirmOpen}
        title={policyChanged ? t.postPolicy.confirmPolicyTitle : t.postPolicy.confirmStrategyTitle}
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
            {t.postPolicy.policyBody(orig?.policy ?? '', policy)}
            <p className="muted">{t.postPolicy.policyNote}</p>
          </>
        ) : (
          t.postPolicy.strategyBody(orig?.strategy ?? '', strategy)
        )}
      </Modal>
    </div>
  );
}
