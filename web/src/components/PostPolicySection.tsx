import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PostPolicy } from '../types';

export function PostPolicySection() {
  const [policy, setPolicy] = useState<PostPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPostPolicy()
      .then(p => {
        setPolicy(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (policy == null) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.putPostPolicy(policy);
      setMessage('保存しました');
      setTimeout(() => setMessage(null), 3000);
    } catch {
      setMessage('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (policy == null) return <div className="empty-state">設定の読み込みに失敗しました</div>;

  return (
    <div className="section">
      <h2>POST Policy</h2>
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          クライアントから送られてくる <code>EVENT</code> (POST) の受け入れポリシーをグローバルに切り替えます。
          個別ユーザーの上書きは <b>Npub Management</b> から行ってください。
        </p>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>POST 受け入れ方式</label>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="policy"
                checked={policy.policy === 'allowlist'}
                onChange={() => setPolicy({ ...policy, policy: 'allowlist' })}
              />
              <span>
                <b>Allowlist</b>（Safelist 登録 npub のみ POST 可）
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name="policy"
                checked={policy.policy === 'denylist'}
                onChange={() => setPolicy({ ...policy, policy: 'denylist' })}
              />
              <span>
                <b>Denylist</b>（基本誰でも POST 可、BAN された npub のみ拒否）
              </span>
            </label>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            Allowlist は「自分専用リレー」用。Denylist は「公開リレーで荒らしだけ落としたい」用。
          </p>
        </div>

        <div className="form-group">
          <label>Backend Strategy（複数 Backend 時の戦略）</label>
          <select
            value={policy.backend_strategy}
            onChange={e => setPolicy({ ...policy, backend_strategy: e.target.value })}
          >
            <option value="failover">Failover（順番に最初の生きている1つへ）</option>
            <option value="fan_out_event" disabled>
              Fan-out EVENT（実装予定）
            </option>
            <option value="fan_in_req" disabled>
              Fan-in REQ（実装予定）
            </option>
            <option value="sharded" disabled>
              Sharded（実装予定）
            </option>
          </select>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
            現状は Failover のみ稼働します。今後の拡張に備えてスキーマだけ用意済みです。
          </p>
        </div>
      </div>

      <div className="form-actions" style={{ marginTop: '1.5rem' }}>
        <button onClick={save} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
        {message && <span className="success-msg">{message}</span>}
      </div>
    </div>
  );
}
