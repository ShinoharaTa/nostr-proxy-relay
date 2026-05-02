-- Quarantine: 時限付きの一時制限。Discord のミュートに近い。
-- scope:
--   'post'      ... POST を黙って drop（OK true 偽装）
--   'req'       ... REQ を空 EOSE で返す
--   'all'       ... POST/REQ ともに上記
CREATE TABLE IF NOT EXISTS quarantine_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('post','req','all')),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT, -- NULL = 無期限（手動解除まで）
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_quarantine_npub ON quarantine_entries(npub, active);
CREATE INDEX IF NOT EXISTS idx_quarantine_expires ON quarantine_entries(active, expires_at);
