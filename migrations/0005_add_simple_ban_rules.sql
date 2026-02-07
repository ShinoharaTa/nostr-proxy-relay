-- Simple BAN rules: pattern-based rules without DSL.
-- rule_type: 'npub' | 'kind' | 'npub_kind' | 'tag_contains'
CREATE TABLE IF NOT EXISTS simple_ban_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL,
  npub_list TEXT,
  kind_list TEXT,
  tag_name TEXT,
  tag_value_pattern TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
