-- Minimal initial schema for proxy-nostr-relay
-- Note: We do not persist the kind1 created_at cache; it stays in-memory.

CREATE TABLE IF NOT EXISTS relay_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS filter_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  nl_text TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  rule_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- safelist: allow posting and/or bypassing filters.
-- flags: 1=post_allowed, 2=filter_bypass
CREATE TABLE IF NOT EXISTS safelist (
  npub TEXT PRIMARY KEY,
  flags INTEGER NOT NULL DEFAULT 1,
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

