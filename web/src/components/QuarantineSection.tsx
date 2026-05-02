import { useEffect, useState } from 'react';
import { api } from '../api';
import type { QuarantineEntry } from '../types';

type Scope = 'post' | 'req' | 'all';

const SCOPE_LABEL: Record<Scope, string> = {
  post: 'POST のみ',
  req: 'REQ のみ',
  all: 'POST + REQ',
};

const PRESET_DURATIONS: { label: string; seconds: number | null }[] = [
  { label: '5分', seconds: 5 * 60 },
  { label: '15分', seconds: 15 * 60 },
  { label: '1時間', seconds: 60 * 60 },
  { label: '6時間', seconds: 6 * 60 * 60 },
  { label: '24時間', seconds: 24 * 60 * 60 },
  { label: '7日', seconds: 7 * 24 * 60 * 60 },
  { label: '無期限', seconds: null },
];

function remaining(entry: QuarantineEntry): string {
  if (entry.expires_at == null) return '無期限';
  const ms = new Date(entry.expires_at).getTime() - Date.now();
  if (ms <= 0) return '失効済';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export function QuarantineSection() {
  const [entries, setEntries] = useState<QuarantineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{
    npub: string;
    scope: Scope;
    reason: string;
    duration_secs: number | null;
  }>({
    npub: '',
    scope: 'all',
    reason: '',
    duration_secs: 60 * 60,
  });
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = () => {
    api.getQuarantine().then(data => {
      setEntries(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchEntries();
    const id = setInterval(fetchEntries, 30_000);
    return () => clearInterval(id);
  }, []);

  const addEntry = async () => {
    if (!form.npub.trim()) return;
    setError(null);
    try {
      await api.postQuarantine({
        npub: form.npub.trim(),
        scope: form.scope,
        reason: form.reason.trim() || undefined,
        duration_secs: form.duration_secs,
      });
      setForm({ ...form, npub: '', reason: '' });
      fetchEntries();
    } catch (e) {
      setError(String(e));
    }
  };

  const removeEntry = (id: number) => {
    if (!confirm('この Quarantine を解除しますか?')) return;
    api.deleteQuarantine(id).then(fetchEntries);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>Quarantine（時限ミュート）</h2>
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          特定 <code>npub</code> を <b>POST のみ</b> / <b>REQ のみ</b> / <b>POST+REQ</b> のいずれかで
          一定時間ミュートします。期限切れになると自動で解除されます。
          BAN まで踏み込むほどではない 1 度きりの過熱発言の鎮静用途を想定しています。
        </p>
      </div>

      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <div className="form-group">
          <label>Npub</label>
          <input
            placeholder="npub1..."
            value={form.npub}
            onChange={e => setForm({ ...form, npub: e.target.value })}
            className="wide"
          />
        </div>
        <div className="form-group">
          <label>Scope</label>
          <select value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value as Scope })}>
            <option value="all">POST + REQ</option>
            <option value="post">POST のみ</option>
            <option value="req">REQ のみ</option>
          </select>
        </div>
        <div className="form-group">
          <label>Duration</label>
          <select
            value={form.duration_secs == null ? 'null' : String(form.duration_secs)}
            onChange={e => {
              const v = e.target.value;
              setForm({ ...form, duration_secs: v === 'null' ? null : Number(v) });
            }}
          >
            {PRESET_DURATIONS.map(p => (
              <option key={p.label} value={p.seconds == null ? 'null' : String(p.seconds)}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>Reason</label>
          <input
            placeholder="optional"
            value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })}
          />
        </div>
      </div>
      <div className="form-row">
        <button onClick={addEntry}>Quarantine する</button>
      </div>
      {error != null && (
        <div className="alert alert-warning" style={{ marginTop: '0.5rem' }}>
          {error}
        </div>
      )}

      <div className="table-container" style={{ marginTop: '1.5rem' }}>
        <table>
          <thead>
            <tr>
              <th>Npub</th>
              <th>Scope</th>
              <th>Reason</th>
              <th>Created</th>
              <th>Remaining</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">No quarantine entries</td>
              </tr>
            ) : (
              entries.map(e => (
                <tr key={e.id}>
                  <td className="truncate" style={{ maxWidth: 220 }}>
                    {e.npub}
                  </td>
                  <td>
                    <span className="badge badge-warning">{SCOPE_LABEL[e.scope]}</span>
                  </td>
                  <td>{e.reason || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{remaining(e)}</td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => removeEntry(e.id)}>
                      解除
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
