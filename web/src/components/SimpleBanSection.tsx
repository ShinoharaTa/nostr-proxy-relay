import { useState, useEffect } from 'react';
import { api } from '../api';
import type { SimpleBanRule } from '../types';

type RuleType = 'npub' | 'kind' | 'npub_kind' | 'tag_contains';

const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: 'npub', label: 'Npub BAN' },
  { value: 'kind', label: 'Kind BAN' },
  { value: 'npub_kind', label: 'Npub + Kind' },
  { value: 'tag_contains', label: 'Tag contains' },
];

interface FormState {
  rule_type: RuleType;
  npub_list: string;
  kind_list: string;
  tag_name: string;
  tag_value_pattern: string;
  memo: string;
  enabled: boolean;
  apply_to_post: boolean;
  apply_to_backend: boolean;
}

export function SimpleBanSection() {
  const [rules, setRules] = useState<SimpleBanRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>({
    rule_type: 'npub',
    npub_list: '',
    kind_list: '',
    tag_name: '',
    tag_value_pattern: '',
    memo: '',
    enabled: true,
    apply_to_post: false,
    apply_to_backend: true,
  });
  const [previewDsl, setPreviewDsl] = useState<string | null>(null);

  const fetchRules = () => {
    api.getSimpleBanRules().then(data => {
      setRules(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const toJsonList = (s: string): string | undefined => {
    const trimmed = s.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) return trimmed;
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    return parts.length ? JSON.stringify(parts.map(p => p.trim())) : undefined;
  };

  const toKindJsonList = (s: string): string | undefined => {
    const trimmed = s.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('[')) return trimmed;
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    const nums = parts.map(p => parseInt(p, 10)).filter(n => !isNaN(n));
    return nums.length ? JSON.stringify(nums) : undefined;
  };

  const buildBody = () => {
    const body: {
      rule_type: string;
      npub_list?: string;
      kind_list?: string;
      tag_name?: string;
      tag_value_pattern?: string;
      enabled: boolean;
      apply_to_post: boolean;
      apply_to_backend: boolean;
      memo?: string;
    } = {
      rule_type: form.rule_type,
      enabled: form.enabled,
      apply_to_post: form.apply_to_post,
      apply_to_backend: form.apply_to_backend,
    };
    if (form.npub_list.trim()) body.npub_list = toJsonList(form.npub_list);
    if (form.kind_list.trim()) body.kind_list = toKindJsonList(form.kind_list);
    if (form.tag_name.trim()) body.tag_name = form.tag_name.trim();
    if (form.tag_value_pattern.trim()) body.tag_value_pattern = form.tag_value_pattern.trim();
    if (form.memo.trim()) body.memo = form.memo.trim();
    return body;
  };

  const addRule = () => {
    api.postSimpleBanRule(buildBody()).then(() => {
      fetchRules();
      setForm({
        ...form,
        npub_list: '',
        kind_list: '',
        tag_name: '',
        tag_value_pattern: '',
        memo: '',
      });
      setPreviewDsl(null);
    });
  };

  const updateRule = (r: SimpleBanRule, patch: Partial<SimpleBanRule>) => {
    const merged = { ...r, ...patch };
    api
      .putSimpleBanRule(r.id, {
        rule_type: merged.rule_type,
        npub_list: merged.npub_list ?? undefined,
        kind_list: merged.kind_list ?? undefined,
        tag_name: merged.tag_name ?? undefined,
        tag_value_pattern: merged.tag_value_pattern ?? undefined,
        enabled: merged.enabled,
        apply_to_post: merged.apply_to_post,
        apply_to_backend: merged.apply_to_backend,
        memo: merged.memo ?? undefined,
      })
      .then(fetchRules);
  };

  const deleteRule = (id: number) => {
    if (!confirm('Delete this rule?')) return;
    api.deleteSimpleBanRule(id).then(fetchRules);
  };

  const previewAsDsl = async () => {
    try {
      const body = buildBody();
      const res = await api.translateSimpleToDsl({
        rule_type: body.rule_type,
        npub_list: body.npub_list ?? null,
        kind_list: body.kind_list ?? null,
        tag_name: body.tag_name ?? null,
        tag_value_pattern: body.tag_value_pattern ?? null,
      });
      setPreviewDsl(res.dsl);
    } catch (e) {
      setPreviewDsl(`ERROR: ${String(e)}`);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Simple BAN Rules</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        DSL を書かずに作れるパターンルール。Filter Rules と並列で評価されます。
        Backend / POST どちらに適用するかをスイッチ切替できます。
      </p>
      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label>Rule type</label>
          <select
            value={form.rule_type}
            onChange={e => setForm({ ...form, rule_type: e.target.value as RuleType })}
          >
            {RULE_TYPES.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {(form.rule_type === 'npub' || form.rule_type === 'npub_kind') && (
          <div className="form-group">
            <label>Npubs (comma or JSON array)</label>
            <input
              placeholder='npub1xxx, npub1yyy'
              value={form.npub_list}
              onChange={e => setForm({ ...form, npub_list: e.target.value })}
              className="wide"
            />
          </div>
        )}
        {(form.rule_type === 'kind' || form.rule_type === 'npub_kind') && (
          <div className="form-group">
            <label>Kinds (comma or JSON array)</label>
            <input
              placeholder="1, 5, 6, 7"
              value={form.kind_list}
              onChange={e => setForm({ ...form, kind_list: e.target.value })}
            />
          </div>
        )}
        {form.rule_type === 'tag_contains' && (
          <>
            <div className="form-group">
              <label>Tag name</label>
              <input
                placeholder="t / p / e ..."
                value={form.tag_name}
                onChange={e => setForm({ ...form, tag_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Tag value (substring)</label>
              <input
                placeholder="text to match"
                value={form.tag_value_pattern}
                onChange={e => setForm({ ...form, tag_value_pattern: e.target.value })}
              />
            </div>
          </>
        )}
        <div className="form-group">
          <label>Memo</label>
          <input
            placeholder="optional"
            value={form.memo}
            onChange={e => setForm({ ...form, memo: e.target.value })}
          />
        </div>
        <div className="form-group checkbox-group" style={{ alignSelf: 'end' }}>
          <label>
            <input
              type="checkbox"
              checked={form.apply_to_backend}
              onChange={e => setForm({ ...form, apply_to_backend: e.target.checked })}
            />
            Backend に適用
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.apply_to_post}
              onChange={e => setForm({ ...form, apply_to_post: e.target.checked })}
            />
            POST に適用
          </label>
        </div>
      </div>
      <div className="form-row">
        <button onClick={addRule}>Add Rule</button>
        <button className="btn-secondary" onClick={previewAsDsl}>
          DSL に変換してプレビュー
        </button>
      </div>
      {previewDsl != null && (
        <div className="info-box" style={{ marginTop: '0.75rem' }}>
          <h4>DSL Preview</h4>
          <pre className="nip11-json" style={{ marginTop: 4 }}>
            {previewDsl}
          </pre>
        </div>
      )}

      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Condition</th>
              <th>Apply to</th>
              <th>Status</th>
              <th>Memo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">No simple BAN rules</td>
              </tr>
            ) : (
              rules.map(r => (
                <tr key={r.id}>
                  <td>
                    <span className="badge badge-info">{r.rule_type}</span>
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {r.npub_list && (
                      <span>
                        npub: {r.npub_list.slice(0, 40)}
                        {r.npub_list.length > 40 ? '…' : ''}{' '}
                      </span>
                    )}
                    {r.kind_list && <span>kind: {r.kind_list} </span>}
                    {r.tag_name && (
                      <span>
                        tag {r.tag_name} ∋ {r.tag_value_pattern ?? ''}
                      </span>
                    )}
                  </td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 8 }}>
                      <input
                        type="checkbox"
                        checked={r.apply_to_backend}
                        onChange={e => updateRule(r, { apply_to_backend: e.target.checked })}
                      />
                      Backend
                    </label>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={r.apply_to_post}
                        onChange={e => updateRule(r, { apply_to_post: e.target.checked })}
                      />
                      POST
                    </label>
                  </td>
                  <td>
                    <div
                      className={`toggle ${r.enabled ? 'active' : ''}`}
                      onClick={() => updateRule(r, { enabled: !r.enabled })}
                      title={r.enabled ? 'Disable' : 'Enable'}
                    />
                  </td>
                  <td>{r.memo || '—'}</td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteRule(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
