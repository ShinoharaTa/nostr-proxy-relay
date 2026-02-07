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

export function SimpleBanSection() {
  const [rules, setRules] = useState<SimpleBanRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    rule_type: 'npub' as RuleType,
    npub_list: '',
    kind_list: '',
    tag_name: '',
    tag_value_pattern: '',
    memo: '',
    enabled: true,
  });

  const fetchRules = () => {
    api.getSimpleBanRules()
      .then(data => { setRules(data); setLoading(false); });
  };

  useEffect(() => { fetchRules(); }, []);

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

  const addRule = () => {
    const body: { rule_type: string; npub_list?: string; kind_list?: string; tag_name?: string; tag_value_pattern?: string; enabled: boolean; memo?: string } = {
      rule_type: form.rule_type,
      enabled: form.enabled,
    };
    if (form.npub_list.trim()) body.npub_list = toJsonList(form.npub_list);
    if (form.kind_list.trim()) body.kind_list = toKindJsonList(form.kind_list);
    if (form.tag_name.trim()) body.tag_name = form.tag_name.trim();
    if (form.tag_value_pattern.trim()) body.tag_value_pattern = form.tag_value_pattern.trim();
    if (form.memo.trim()) body.memo = form.memo.trim();
    api.postSimpleBanRule(body).then(() => {
      fetchRules();
      setForm({ ...form, npub_list: '', kind_list: '', tag_name: '', tag_value_pattern: '', memo: '' });
    });
  };

  const updateRule = (r: SimpleBanRule, enabled: boolean) => {
    api.putSimpleBanRule(r.id, {
      rule_type: r.rule_type,
      npub_list: r.npub_list ?? undefined,
      kind_list: r.kind_list ?? undefined,
      tag_name: r.tag_name ?? undefined,
      tag_value_pattern: r.tag_value_pattern ?? undefined,
      enabled,
      memo: r.memo ?? undefined,
    }).then(fetchRules);
  };

  const deleteRule = (id: number) => {
    if (!confirm('Delete this rule?')) return;
    api.deleteSimpleBanRule(id).then(fetchRules);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Simple BAN Rules</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Pattern-based block rules without writing DSL. These are applied to incoming events (REQ responses) together with Filter Rules.
      </p>
      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label>Rule type</label>
          <select
            value={form.rule_type}
            onChange={e => setForm({ ...form, rule_type: e.target.value as RuleType })}
          >
            {RULE_TYPES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {(form.rule_type === 'npub' || form.rule_type === 'npub_kind') && (
          <div className="form-group">
            <label>Npubs (comma or JSON array)</label>
            <input
              placeholder='npub1xxx, npub1yyy or ["npub1xxx"]'
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
              placeholder="1, 5, 6, 7 or [1,5,6,7]"
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
                placeholder="e.g. t, p"
                value={form.tag_name}
                onChange={e => setForm({ ...form, tag_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Tag value pattern (substring)</label>
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
            placeholder="Optional"
            value={form.memo}
            onChange={e => setForm({ ...form, memo: e.target.value })}
          />
        </div>
      </div>
      <div className="form-row">
        <button onClick={addRule}>Add Rule</button>
      </div>
      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Condition</th>
              <th>Status</th>
              <th>Memo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No simple BAN rules</td></tr>
            ) : (
              rules.map(r => (
                <tr key={r.id}>
                  <td><span className="badge badge-info">{r.rule_type}</span></td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {r.npub_list && <span>npub: {r.npub_list.slice(0, 40)}{r.npub_list.length > 40 ? '…' : ''} </span>}
                    {r.kind_list && <span>kind: {r.kind_list} </span>}
                    {r.tag_name && <span>tag {r.tag_name} ∋ {r.tag_value_pattern ?? ''}</span>}
                  </td>
                  <td>
                    <div
                      className={`toggle ${r.enabled ? 'active' : ''}`}
                      onClick={() => updateRule(r, !r.enabled)}
                      title={r.enabled ? 'Disable' : 'Enable'}
                    />
                  </td>
                  <td>{r.memo || '—'}</td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteRule(r.id)}>Delete</button>
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
