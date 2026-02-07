import { useState, useEffect } from 'react';
import { api } from '../api';
import type { ReqKindBlacklist } from '../types';

export function KindBlacklistSection() {
  const [blacklist, setBlacklist] = useState<ReqKindBlacklist[]>([]);
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [newKind, setNewKind] = useState({ kind_value: '', kind_min: '', kind_max: '' });
  const [loading, setLoading] = useState(true);

  const fetchBlacklist = () => {
    api.getReqKindBlacklist()
      .then(data => { setBlacklist(data); setLoading(false); });
  };

  useEffect(() => { fetchBlacklist(); }, []);

  const addKind = () => {
    const body = mode === 'single'
      ? { kind_value: parseInt(newKind.kind_value), kind_min: null, kind_max: null, enabled: true }
      : { kind_value: null, kind_min: parseInt(newKind.kind_min), kind_max: parseInt(newKind.kind_max), enabled: true };

    if (mode === 'single' && (isNaN(body.kind_value as number))) return;
    if (mode === 'range' && (isNaN(body.kind_min as number) || isNaN(body.kind_max as number))) return;

    api.postReqKindBlacklist(body).then(() => {
      fetchBlacklist();
      setNewKind({ kind_value: '', kind_min: '', kind_max: '' });
    });
  };

  const toggleEnabled = (item: ReqKindBlacklist) => {
    api.putReqKindBlacklist(item.id, { ...item, enabled: !item.enabled }).then(fetchBlacklist);
  };

  const deleteKind = (id: number) => {
    if (!confirm('Delete this rule?')) return;
    api.deleteReqKindBlacklist(id).then(fetchBlacklist);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Kind Blacklist</h2>
      <div className="form-row">
        <button className={mode === 'single' ? 'active' : 'btn-secondary'} onClick={() => setMode('single')}>
          Single Value
        </button>
        <button className={mode === 'range' ? 'active' : 'btn-secondary'} onClick={() => setMode('range')}>
          Range
        </button>
        <span style={{ width: '1rem' }}></span>
        {mode === 'single' ? (
          <input
            type="number"
            placeholder="Kind (e.g., 7)"
            value={newKind.kind_value}
            onChange={e => setNewKind({ ...newKind, kind_value: e.target.value })}
          />
        ) : (
          <>
            <input
              type="number"
              placeholder="Min"
              value={newKind.kind_min}
              onChange={e => setNewKind({ ...newKind, kind_min: e.target.value })}
              style={{ width: '80px' }}
            />
            <span>→</span>
            <input
              type="number"
              placeholder="Max"
              value={newKind.kind_max}
              onChange={e => setNewKind({ ...newKind, kind_max: e.target.value })}
              style={{ width: '80px' }}
            />
          </>
        )}
        <button onClick={addKind}>Add Rule</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>Kind</th><th>Type</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {blacklist.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No rules configured</td></tr>
            ) : (
              blacklist.map(item => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {item.kind_value != null ? item.kind_value : `${item.kind_min} → ${item.kind_max}`}
                  </td>
                  <td>
                    <span className={`badge ${item.kind_value != null ? 'badge-info' : 'badge-warning'}`}>
                      {item.kind_value != null ? 'SINGLE' : 'RANGE'}
                    </span>
                  </td>
                  <td>
                    <div
                      className={`toggle ${item.enabled ? 'active' : ''}`}
                      onClick={() => toggleEnabled(item)}
                    ></div>
                  </td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteKind(item.id)}>Delete</button>
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
