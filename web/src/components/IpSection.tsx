import { useState, useEffect } from 'react';
import { api } from '../api';
import type { IpAccessControl } from '../types';

export function IpSection() {
  const [ipList, setIpList] = useState<IpAccessControl[]>([]);
  const [newIp, setNewIp] = useState({ ip_address: '', banned: false, whitelisted: false, memo: '' });
  const [loading, setLoading] = useState(true);

  const fetchIpList = () => {
    api.getIpAccessControl()
      .then(data => { setIpList(data); setLoading(false); });
  };

  useEffect(() => { fetchIpList(); }, []);

  const addIp = () => {
    if (!newIp.ip_address) return;
    api.postIpAccessControl(newIp).then(() => {
      fetchIpList();
      setNewIp({ ip_address: '', banned: false, whitelisted: false, memo: '' });
    });
  };

  const deleteIp = (id: number) => {
    if (!confirm('Delete this IP?')) return;
    api.deleteIpAccessControl(id).then(fetchIpList);
  };

  const toggleBan = (ip: IpAccessControl) => {
    api.putIpAccessControl(ip.id!, { ...ip, banned: !ip.banned }).then(fetchIpList);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>IP Access Control</h2>
      <div className="form-row">
        <input
          placeholder="IP Address (e.g., 192.168.1.1)"
          value={newIp.ip_address}
          onChange={e => setNewIp({ ...newIp, ip_address: e.target.value })}
        />
        <label>
          <input type="checkbox" checked={newIp.banned} onChange={e => setNewIp({ ...newIp, banned: e.target.checked })} />
          Banned
        </label>
        <label>
          <input type="checkbox" checked={newIp.whitelisted} onChange={e => setNewIp({ ...newIp, whitelisted: e.target.checked })} />
          Whitelisted
        </label>
        <input placeholder="Memo" value={newIp.memo} onChange={e => setNewIp({ ...newIp, memo: e.target.value })} />
        <button onClick={addIp}>Add IP</button>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr><th>IP Address</th><th>Status</th><th>Whitelisted</th><th>Memo</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {ipList.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No IPs configured</td></tr>
            ) : (
              ipList.map(ip => (
                <tr key={ip.id} className={ip.banned ? 'banned' : ''}>
                  <td style={{ fontFamily: 'monospace' }}>{ip.ip_address}</td>
                  <td>
                    {ip.banned ? (
                      <span className="badge badge-danger">BANNED</span>
                    ) : (
                      <span className="badge badge-success">ALLOWED</span>
                    )}
                  </td>
                  <td>{ip.whitelisted ? <span className="badge badge-info">✓</span> : '—'}</td>
                  <td>{ip.memo || '—'}</td>
                  <td>
                    <button className={`btn-small ${ip.banned ? 'btn-success' : 'btn-danger'}`} onClick={() => toggleBan(ip)}>
                      {ip.banned ? 'Unban' : 'Ban'}
                    </button>
                    <button className="btn-small btn-secondary" onClick={() => deleteIp(ip.id!)}>Delete</button>
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
