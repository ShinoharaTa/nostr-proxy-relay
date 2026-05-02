import { useState, useEffect } from 'react';
import { api } from '../api';
import type { IpAccessControl, IpMode } from '../types';

interface ModeOption {
  value: IpMode;
  label: string;
  hint: string;
  badge: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { value: 'normal', label: 'Normal', hint: '無効化（ルール解除）', badge: 'badge-secondary' },
  { value: 'whitelist', label: 'Whitelist', hint: '他 BAN を上書きして必ず通す', badge: 'badge-info' },
  { value: 'shadow_ban', label: 'Shadow BAN', hint: '接続は許すが REQ/EVENT を黙殺', badge: 'badge-warning' },
  { value: 'hard_ban', label: 'Hard BAN', hint: '接続を拒否。追加直後に既存接続も強制切断', badge: 'badge-danger' },
];

function badgeFor(mode: IpMode): string {
  return MODE_OPTIONS.find(o => o.value === mode)?.badge ?? 'badge-secondary';
}

export function IpSection() {
  const [ipList, setIpList] = useState<IpAccessControl[]>([]);
  const [newIp, setNewIp] = useState<{ ip_address: string; mode: IpMode; memo: string }>({
    ip_address: '',
    mode: 'hard_ban',
    memo: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIpList = () => {
    api.getIpAccessControl().then(data => {
      setIpList(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchIpList();
  }, []);

  const addIp = async () => {
    if (!newIp.ip_address.trim()) return;
    setError(null);
    const res = await fetch('/api/ip-access-control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newIp, ip_address: newIp.ip_address.trim() }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    fetchIpList();
    setNewIp({ ip_address: '', mode: 'hard_ban', memo: '' });
  };

  const updateMode = async (entry: IpAccessControl, mode: IpMode) => {
    if (entry.id == null) return;
    const res = await fetch(`/api/ip-access-control/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address: entry.ip_address, mode, memo: entry.memo }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    fetchIpList();
  };

  const deleteIp = (id: number) => {
    if (!confirm('Delete this rule?')) return;
    api.deleteIpAccessControl(id).then(fetchIpList);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>IP Access Control</h2>
      <div className="info-box" style={{ marginBottom: '1rem' }}>
        <p>
          <b>Hard BAN</b>：接続を即時拒否。追加直後に該当 IP の既存セッションも強制切断します。<br />
          <b>Shadow BAN</b>：接続は受理しますが REQ には空 EOSE を返し、EVENT は <code>OK true</code> を装って破棄します。<br />
          <b>Whitelist</b>：他のルールに優先し必ず通します。誤爆防止 / VPN / 自宅 IP 用。<br />
          IP 単体 (<code>192.0.2.10</code>) または CIDR (<code>192.0.2.0/24</code>, <code>2001:db8::/32</code>) を受け付けます。
        </p>
      </div>

      <div className="form-row">
        <input
          placeholder="IP / CIDR"
          value={newIp.ip_address}
          onChange={e => setNewIp({ ...newIp, ip_address: e.target.value })}
          className="wide"
        />
        <select
          value={newIp.mode}
          onChange={e => setNewIp({ ...newIp, mode: e.target.value as IpMode })}
        >
          {MODE_OPTIONS.filter(o => o.value !== 'normal').map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          placeholder="Memo"
          value={newIp.memo}
          onChange={e => setNewIp({ ...newIp, memo: e.target.value })}
        />
        <button onClick={addIp}>Add</button>
      </div>
      {error != null && (
        <div className="alert alert-warning" style={{ marginTop: '0.5rem' }}>
          {error}
        </div>
      )}

      <div className="table-container" style={{ marginTop: '1rem' }}>
        <table>
          <thead>
            <tr>
              <th>IP / CIDR</th>
              <th>Mode</th>
              <th>Memo</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ipList.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">No IP rules</td>
              </tr>
            ) : (
              ipList.map(ip => (
                <tr key={ip.id}>
                  <td style={{ fontFamily: 'monospace' }}>
                    {ip.ip_address}
                    {ip.is_cidr && (
                      <span className="badge badge-secondary" style={{ marginLeft: 6 }}>
                        CIDR
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${badgeFor(ip.mode)}`}>{ip.mode.toUpperCase()}</span>
                    <select
                      style={{ marginLeft: 8 }}
                      value={ip.mode}
                      onChange={e => updateMode(ip, e.target.value as IpMode)}
                    >
                      {MODE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{ip.memo || '—'}</td>
                  <td>
                    <button className="btn-small btn-secondary" onClick={() => deleteIp(ip.id!)}>
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
