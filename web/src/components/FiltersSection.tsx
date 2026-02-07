import { useState, useEffect } from 'react';
import { api } from '../api';
import type { FilterRule } from '../types';

export function FiltersSection() {
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [newFilter, setNewFilter] = useState({ name: '', nl_text: '' });
  const [loading, setLoading] = useState(true);

  const fetchFilters = () => {
    api.getFilters()
      .then(data => { setFilters(data); setLoading(false); });
  };

  useEffect(() => { fetchFilters(); }, []);

  const addFilter = () => {
    if (!newFilter.name || !newFilter.nl_text) return;
    api.postFilters(newFilter).then(() => {
      fetchFilters();
      setNewFilter({ name: '', nl_text: '' });
    });
  };

  const toggleEnabled = (filter: FilterRule) => {
    api.putFilters(filter.id, { ...filter, enabled: !filter.enabled }).then(fetchFilters);
  };

  const deleteFilter = (id: number) => {
    if (!confirm('Delete this filter?')) return;
    api.deleteFilters(id).then(fetchFilters);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Filter Rules</h2>
      <div className="form-row">
        <input
          placeholder="Rule Name"
          value={newFilter.name}
          onChange={e => setNewFilter({ ...newFilter, name: e.target.value })}
        />
        <input
          placeholder="Natural language condition..."
          value={newFilter.nl_text}
          onChange={e => setNewFilter({ ...newFilter, nl_text: e.target.value })}
          className="wide"
        />
        <button onClick={addFilter}>Add Rule</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Name</th><th>Condition</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filters.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No filters configured</td></tr>
            ) : (
              filters.map(filter => (
                <tr key={filter.id}>
                  <td style={{ fontWeight: 500 }}>{filter.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{filter.nl_text}</td>
                  <td>
                    <div
                      className={`toggle ${filter.enabled ? 'active' : ''}`}
                      onClick={() => toggleEnabled(filter)}
                    ></div>
                  </td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteFilter(filter.id)}>Delete</button>
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
