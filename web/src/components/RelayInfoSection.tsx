import { useState, useEffect } from 'react';
import { api } from '../api';
import type { RelayInfo } from '../types';

const NIP_LIST = [
  { number: 1, name: 'Basic protocol flow' },
  { number: 2, name: 'Follow List' },
  { number: 4, name: 'Encrypted Direct Message' },
  { number: 9, name: 'Event Deletion' },
  { number: 11, name: 'Relay Information Metadata' },
  { number: 12, name: 'Generic Tag Queries' },
  { number: 15, name: 'Nostr Marketplace' },
  { number: 16, name: 'Event Treatment' },
  { number: 20, name: 'Command Results' },
  { number: 22, name: 'Event created_at Limits' },
  { number: 26, name: 'Delegated Event Signing' },
  { number: 28, name: 'Public Chat' },
  { number: 33, name: 'Parameterized Replaceable Events' },
  { number: 40, name: 'Expirable Events' },
  { number: 42, name: 'Authentication of clients to relays' },
  { number: 45, name: 'Counting results' },
  { number: 50, name: 'Keywords filter' },
  { number: 62, name: 'Rendezvous protocol' },
  { number: 65, name: 'Relay List Metadata' },
  { number: 70, name: 'Zap' },
  { number: 77, name: 'Relay Auth' },
];

export function RelayInfoSection() {
  const [info, setInfo] = useState<RelayInfo>({
    name: '',
    description: '',
    pubkey: '',
    contact: '',
    supported_nips: '[1, 11]',
    software: 'https://github.com/ShinoharaTa/nostr-proxy-relay',
    version: '0.1.0',
    limitation_auth_required: false,
    limitation_payment_required: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedNips, setSelectedNips] = useState<number[]>([1, 11]);

  useEffect(() => {
    api.getRelayInfo()
      .then(data => { setInfo(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (info.supported_nips) {
      try {
        const parsed = JSON.parse(info.supported_nips);
        if (Array.isArray(parsed)) {
          setSelectedNips(parsed.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n)));
        }
      } catch {
        // keep current
      }
    }
  }, [info.supported_nips]);

  const saveInfo = () => {
    setSaving(true);
    setMessage('');
    api.putRelayInfo(info)
      .then(() => {
        setMessage('Saved successfully!');
        setSaving(false);
        setTimeout(() => setMessage(''), 3000);
      })
      .catch(() => {
        setMessage('Failed to save');
        setSaving(false);
      });
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="section">
      <h2>NIP-11 Relay Information</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Configure the relay information document returned when clients request <code>Accept: application/nostr+json</code>
      </p>

      <div className="form-grid">
        <div className="form-group">
          <label>Relay Name</label>
          <input
            value={info.name || ''}
            onChange={e => setInfo({ ...info, name: e.target.value })}
            placeholder="My Proxy Relay"
          />
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea
            value={info.description || ''}
            onChange={e => setInfo({ ...info, description: e.target.value })}
            placeholder="A proxy relay with bot filtering capabilities"
            rows={3}
          />
        </div>
        <div className="form-group">
          <label>Admin Pubkey (hex)</label>
          <input
            value={info.pubkey || ''}
            onChange={e => setInfo({ ...info, pubkey: e.target.value })}
            placeholder="32-byte hex public key"
            style={{ fontFamily: 'monospace' }}
          />
        </div>
        <div className="form-group">
          <label>Contact</label>
          <input
            value={info.contact || ''}
            onChange={e => setInfo({ ...info, contact: e.target.value })}
            placeholder="nostr:npub1... or admin@example.com"
          />
        </div>
        <div className="form-group">
          <label>Software URL</label>
          <input
            value={info.software || ''}
            onChange={e => setInfo({ ...info, software: e.target.value })}
            placeholder="https://github.com/..."
          />
        </div>
        <div className="form-group">
          <label>Version</label>
          <input
            value={info.version || ''}
            onChange={e => setInfo({ ...info, version: e.target.value })}
            placeholder="0.1.0"
          />
        </div>
        <div className="form-group">
          <label>Icon URL</label>
          <input
            value={info.icon || ''}
            onChange={e => setInfo({ ...info, icon: e.target.value })}
            placeholder="https://example.com/icon.png"
          />
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Supported NIPs</h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '12px' }}>
        Select the NIPs that this relay supports. NIP-01 (Basic protocol) and NIP-11 (Relay Information) are recommended as minimum.
      </p>
      <div className="nip-checkbox-grid">
        {NIP_LIST.map(nip => (
          <label key={nip.number} className="nip-checkbox-item">
            <input
              type="checkbox"
              checked={selectedNips.includes(nip.number)}
              onChange={(e) => {
                const newNips = e.target.checked
                  ? [...selectedNips, nip.number].sort((a, b) => a - b)
                  : selectedNips.filter(n => n !== nip.number);
                setSelectedNips(newNips);
                setInfo({ ...info, supported_nips: JSON.stringify(newNips) });
              }}
            />
            <span className="nip-label">
              <strong>NIP-{String(nip.number).padStart(2, '0')}</strong>
              <span className="nip-name">{nip.name}</span>
            </span>
          </label>
        ))}
      </div>

      <h3 style={{ marginTop: '2rem' }}>Limitations (Optional)</h3>
      <div className="form-grid">
        <div className="form-group">
          <label>Max Limit (REQ messages)</label>
          <input
            type="number"
            value={info.limitation_max_limit ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_limit: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="500"
          />
        </div>
        <div className="form-group">
          <label>Max Message Length</label>
          <input
            type="number"
            value={info.limitation_max_message_length ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_message_length: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="16384"
          />
        </div>
        <div className="form-group">
          <label>Max Subscriptions</label>
          <input
            type="number"
            value={info.limitation_max_subscriptions ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_subscriptions: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="20"
          />
        </div>
        <div className="form-group">
          <label>Max Filters</label>
          <input
            type="number"
            value={info.limitation_max_filters ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_filters: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="10"
          />
        </div>
        <div className="form-group">
          <label>Max Event Tags</label>
          <input
            type="number"
            value={info.limitation_max_event_tags ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_event_tags: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="100"
          />
        </div>
        <div className="form-group">
          <label>Max Content Length</label>
          <input
            type="number"
            value={info.limitation_max_content_length ?? ''}
            onChange={e => setInfo({ ...info, limitation_max_content_length: e.target.value ? parseInt(e.target.value) : undefined })}
            placeholder="8196"
          />
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={info.limitation_auth_required}
              onChange={e => setInfo({ ...info, limitation_auth_required: e.target.checked })}
            />
            Auth Required
          </label>
          <label>
            <input
              type="checkbox"
              checked={info.limitation_payment_required}
              onChange={e => setInfo({ ...info, limitation_payment_required: e.target.checked })}
            />
            Payment Required
          </label>
        </div>
      </div>

      <h3 style={{ marginTop: '2rem' }}>Features</h3>
      <div className="form-grid">
        <div className="form-group">
          <label>Negentropy Support</label>
          <select
            value={info.negentropy ?? 0}
            onChange={e => setInfo({ ...info, negentropy: parseInt(e.target.value) })}
          >
            <option value={0}>Not Supported</option>
            <option value={1}>Supported</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button onClick={saveInfo} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && <span className={message.includes('success') ? 'success-msg' : 'error-msg'}>{message}</span>}
      </div>

      <div className="info-box" style={{ marginTop: '2rem' }}>
        <h4>NIP-11</h4>
        <p>This information is returned when clients request the relay with <code>Accept: application/nostr+json</code> header.</p>
        <p>Test it: <code>curl -H &quot;Accept: application/nostr+json&quot; https://your-relay.example.com</code></p>
      </div>
    </div>
  );
}
