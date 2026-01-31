-- NIP-11 Relay Information Document
CREATE TABLE IF NOT EXISTS relay_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton table
    name TEXT,
    description TEXT,
    pubkey TEXT,  -- Admin's public key (hex format)
    contact TEXT,  -- Contact info (email, nostr npub, etc.)
    supported_nips TEXT,  -- JSON array of supported NIP numbers, e.g. "[1, 11, 50]"
    software TEXT DEFAULT 'https://github.com/ShinoharaTa/nostr-proxy-relay',
    version TEXT DEFAULT '0.1.0',
    limitation_max_message_length INTEGER,
    limitation_max_subscriptions INTEGER,
    limitation_max_filters INTEGER,
    limitation_max_event_tags INTEGER,
    limitation_max_content_length INTEGER,
    limitation_auth_required INTEGER DEFAULT 0,  -- Boolean: 0 = false, 1 = true
    limitation_payment_required INTEGER DEFAULT 0,  -- Boolean
    icon TEXT,  -- URL to relay icon
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default row
INSERT OR IGNORE INTO relay_info (id, name, description, supported_nips)
VALUES (1, 'Proxy Nostr Relay', 'A proxy relay with bot filtering capabilities', '[1, 11]');
