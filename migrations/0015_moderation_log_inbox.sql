-- 措置の履歴（Issue #53）。対象カードの「履歴」と、受信箱の「処置済み」判定に使う。
-- actor: 'manual' = コンソール / API からの操作、'auto' = 自動ガード等
CREATE TABLE IF NOT EXISTS moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('npub', 'ip', 'relay')),
  target TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'manual' CHECK (actor IN ('manual', 'auto')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_modlog_target ON moderation_log(target_type, target, created_at);

-- 受信箱の「様子見」。項目自体は都度計算するので、ここには期限だけを持つ。
CREATE TABLE IF NOT EXISTS inbox_snoozes (
  item_key TEXT PRIMARY KEY,
  until TEXT NOT NULL
);
