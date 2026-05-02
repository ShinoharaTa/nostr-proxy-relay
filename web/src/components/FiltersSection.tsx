import { useState, useEffect } from 'react';
import { api } from '../api';
import type { FilterRule } from '../types';

const SAMPLE_EVENT = `{
  "id": "abcd...",
  "pubkey": "a1b2...",
  "created_at": ${Math.floor(Date.now() / 1000)},
  "kind": 1,
  "tags": [["t", "spam"]],
  "content": "hello"
}`;

export function FiltersSection() {
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [newFilter, setNewFilter] = useState({
    name: '',
    nl_text: '',
    apply_to_post: false,
    apply_to_backend: true,
  });
  const [loading, setLoading] = useState(true);
  const [dryRunOpen, setDryRunOpen] = useState(false);
  const [dryRunDsl, setDryRunDsl] = useState('');
  const [dryRunEvent, setDryRunEvent] = useState(SAMPLE_EVENT);
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  const fetchFilters = () => {
    api.getFilters().then(data => {
      setFilters(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const addFilter = () => {
    if (!newFilter.name || !newFilter.nl_text) return;
    api
      .postFilters({
        name: newFilter.name,
        nl_text: newFilter.nl_text,
        apply_to_post: newFilter.apply_to_post,
        apply_to_backend: newFilter.apply_to_backend,
      })
      .then(() => {
        fetchFilters();
        setNewFilter({ name: '', nl_text: '', apply_to_post: false, apply_to_backend: true });
      });
  };

  const updateFilter = (filter: FilterRule, patch: Partial<FilterRule>) => {
    api.putFilters(filter.id, { ...filter, ...patch }).then(fetchFilters);
  };

  const deleteFilter = (id: number) => {
    if (!confirm('Delete this filter?')) return;
    api.deleteFilters(id).then(fetchFilters);
  };

  const runDryRun = async () => {
    try {
      const event = JSON.parse(dryRunEvent);
      const res = await api.dryRunFilter(dryRunDsl, event);
      if (!res.ok) {
        setDryRunResult(`ERROR: ${res.error ?? 'unknown'}`);
      } else {
        setDryRunResult(res.matched ? 'MATCHED — このイベントは破棄されます' : 'NOT MATCHED — このイベントは通過します');
      }
    } catch (e) {
      setDryRunResult(`PARSE ERROR: ${String(e)}`);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Filter Rules (DSL)</h2>
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          自然言語をそのまま DSL として書けます（例: <code>kind == 1 and content contains "spam"</code>）。
          <b>Backend に適用</b>＝バックエンドリレーから流れてきた EVENT をクライアントへ返す前にフィルタ。
          <b>POST に適用</b>＝クライアントからの EVENT 投稿を受信した時点でフィルタ。
        </p>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label>Rule Name</label>
          <input
            placeholder="my_rule"
            value={newFilter.name}
            onChange={e => setNewFilter({ ...newFilter, name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>DSL</label>
          <input
            placeholder='kind == 1 and content contains "spam"'
            value={newFilter.nl_text}
            onChange={e => setNewFilter({ ...newFilter, nl_text: e.target.value })}
            className="wide"
          />
        </div>
        <div className="form-group checkbox-group" style={{ alignSelf: 'end' }}>
          <label>
            <input
              type="checkbox"
              checked={newFilter.apply_to_backend}
              onChange={e => setNewFilter({ ...newFilter, apply_to_backend: e.target.checked })}
            />
            Backend に適用
          </label>
          <label>
            <input
              type="checkbox"
              checked={newFilter.apply_to_post}
              onChange={e => setNewFilter({ ...newFilter, apply_to_post: e.target.checked })}
            />
            POST に適用
          </label>
        </div>
      </div>
      <div className="form-row" style={{ marginTop: '0.5rem' }}>
        <button onClick={addFilter}>Add Rule</button>
        <button className="btn-secondary" onClick={() => setDryRunOpen(o => !o)}>
          {dryRunOpen ? 'Dry-run を閉じる' : 'Dry-run'}
        </button>
      </div>

      {dryRunOpen && (
        <div className="info-box" style={{ marginTop: '1rem' }}>
          <h4>DSL Dry-run</h4>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            DSL とサンプル EVENT (JSON) を入力して、マッチするか試せます。
          </p>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <div className="form-group">
              <label>DSL</label>
              <input
                placeholder='kind == 1 and content contains "spam"'
                value={dryRunDsl}
                onChange={e => setDryRunDsl(e.target.value)}
                className="wide"
              />
            </div>
            <div className="form-group">
              <label>Event JSON</label>
              <textarea
                rows={6}
                value={dryRunEvent}
                onChange={e => setDryRunEvent(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <button onClick={runDryRun}>Run</button>
          </div>
          {dryRunResult && (
            <div
              className={`alert ${dryRunResult.startsWith('MATCH') ? 'alert-warning' : 'alert-success'}`}
              style={{ marginTop: '0.5rem' }}
            >
              {dryRunResult}
            </div>
          )}
        </div>
      )}

      <div className="table-container" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Condition</th>
              <th>Apply to</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filters.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">No filters configured</td>
              </tr>
            ) : (
              filters.map(filter => (
                <tr key={filter.id}>
                  <td style={{ fontWeight: 500 }}>{filter.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{filter.nl_text}</td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 8 }}>
                      <input
                        type="checkbox"
                        checked={filter.apply_to_backend}
                        onChange={e => updateFilter(filter, { apply_to_backend: e.target.checked })}
                      />
                      Backend
                    </label>
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={filter.apply_to_post}
                        onChange={e => updateFilter(filter, { apply_to_post: e.target.checked })}
                      />
                      POST
                    </label>
                  </td>
                  <td>
                    <div
                      className={`toggle ${filter.enabled ? 'active' : ''}`}
                      onClick={() => updateFilter(filter, { enabled: !filter.enabled })}
                    />
                  </td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteFilter(filter.id)}>
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
