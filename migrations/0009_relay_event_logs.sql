-- 上流リレー接続イベントの永続ログ
CREATE TABLE IF NOT EXISTS relay_event_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relay_url TEXT NOT NULL,
  event_type TEXT NOT NULL,  -- 'connected','disconnected','reconnect_failed','auth_required','error','ping_timeout'
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rel_url_time ON relay_event_logs(relay_url, created_at);
CREATE INDEX IF NOT EXISTS idx_rel_type_time ON relay_event_logs(event_type, created_at);
