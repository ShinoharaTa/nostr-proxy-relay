import { useState, useEffect } from 'react';
import { api } from '../api';
import type { SafelistEntry } from '../types';

export function SafelistSection() {
  const [safelist, setSafelist] = useState<SafelistEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ npub: '', flags: 1, memo: '' });
  const [loading, setLoading] = useState(true);

  const fetchSafelist = () => {
    api.getSafelist()
      .then(data => { setSafelist(data); setLoading(false); });
  };

  useEffect(() => { fetchSafelist(); }, []);

  const addEntry = () => {
    if (!newEntry.npub) return;
    api.postSafelist(newEntry).then(() => { fetchSafelist(); setNewEntry({ npub: '', flags: 1, memo: '' }); });
  };

  const deleteEntry = (npub: string) => {
    if (!confirm('Delete this entry?')) return;
    api.deleteSafelist(npub).then(fetchSafelist);
  };

  const banNpub = (npub: string) => {
    api.banSafelist(npub).then(fetchSafelist);
  };

  const unbanNpub = (npub: string) => {
    api.unbanSafelist(npub).then(fetchSafelist);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Npub Management (Safelist)</h2>
      <div className="form-row">
        <input
          placeholder="npub1..."
          value={newEntry.npub}
          onChange={e => setNewEntry({ ...newEntry, npub: e.target.value })}
          className="wide"
        />
        <label>
          <input
            type="checkbox"
            checked={(newEntry.flags & 1) === 1}
            onChange={e => setNewEntry({ ...newEntry, flags: e.target.checked ? newEntry.flags | 1 : newEntry.flags & ~1 })}
          />
          Post Allowed
        </label>
        <label>
          <input
            type="checkbox"
            checked={(newEntry.flags & 2) === 2}
            onChange={e => setNewEntry({ ...newEntry, flags: e.target.checked ? newEntry.flags | 2 : newEntry.flags & ~2 })}
          />
          Filter Bypass
        </label>
        <input
          placeholder="Memo"
          value={newEntry.memo}
          onChange={e => setNewEntry({ ...newEntry, memo: e.target.value })}
        />
        <button onClick={addEntry}>Add Entry</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Npub</th>
              <th>Status</th>
              <th>Post</th>
              <th>Bypass</th>
              <th>Memo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {safelist.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No entries</td></tr>
            ) : (
              safelist.map(s => (
                <tr key={s.npub} className={s.banned ? 'banned' : ''}>
                  <td className="truncate">{s.npub}</td>
                  <td>
                    {s.banned ? (
                      <span className="badge badge-danger">BANNED</span>
                    ) : (
                      <span className="badge badge-success">ACTIVE</span>
                    )}
                  </td>
                  <td>{(s.flags & 1) === 1 ? <span className="badge badge-info">✓</span> : '—'}</td>
                  <td>{(s.flags & 2) === 2 ? <span className="badge badge-warning">✓</span> : '—'}</td>
                  <td>{s.memo || '—'}</td>
                  <td>
                    {s.banned ? (
                      <button className="btn-small btn-success" onClick={() => unbanNpub(s.npub)}>Unban</button>
                    ) : (
                      <button className="btn-small btn-danger" onClick={() => banNpub(s.npub)}>Ban</button>
                    )}
                    <button className="btn-small btn-secondary" onClick={() => deleteEntry(s.npub)}>Delete</button>
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
