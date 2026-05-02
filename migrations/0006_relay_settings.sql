-- リレー全体設定（singleton）
CREATE TABLE IF NOT EXISTS relay_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  post_policy TEXT NOT NULL DEFAULT 'allowlist'
    CHECK (post_policy IN ('allowlist', 'denylist')),
  backend_strategy TEXT NOT NULL DEFAULT 'failover'
    CHECK (backend_strategy IN ('failover','fan_out_event','fan_in_req','sharded')),
  -- カンマ区切り。env と同じ意味で、env が優先（実装側で merge）。
  eose_autoclose_kinds TEXT NOT NULL DEFAULT '0',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO relay_settings (id) VALUES (1);
