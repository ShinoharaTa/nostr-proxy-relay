-- Bot対策・マネジメント機能のためのテーブル追加

-- safelistテーブルの拡張（BANフラグ追加）
-- flags: 1=post_allowed, 2=filter_bypass, 4=banned
ALTER TABLE safelist ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;

-- IPアクセス制御テーブル
CREATE TABLE IF NOT EXISTS ip_access_control (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL UNIQUE,
  banned INTEGER NOT NULL DEFAULT 0,  -- 0=allowed, 1=banned
  whitelisted INTEGER NOT NULL DEFAULT 0,  -- 0=normal, 1=whitelisted
  memo TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 接続ログテーブル
CREATE TABLE IF NOT EXISTS connection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  disconnected_at TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  rejected_event_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ip_connected ON connection_logs(ip_address, connected_at);

-- イベント拒否ログテーブル
CREATE TABLE IF NOT EXISTS event_rejection_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  pubkey_hex TEXT NOT NULL,
  npub TEXT NOT NULL,
  ip_address TEXT,
  kind INTEGER NOT NULL,
  reason TEXT NOT NULL,  -- 'not_in_safelist', 'banned_npub', 'banned_ip', 'kind_blacklist', 'filter_rule', etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pubkey_created ON event_rejection_logs(pubkey_hex, created_at);
CREATE INDEX IF NOT EXISTS idx_ip_created ON event_rejection_logs(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_reason_created ON event_rejection_logs(reason, created_at);

-- REQ Kindブラックリストテーブル
CREATE TABLE IF NOT EXISTS req_kind_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind_value INTEGER,  -- 単一のKind値（NULLの場合は範囲指定）
  kind_min INTEGER,    -- 範囲指定の最小値
  kind_max INTEGER,    -- 範囲指定の最大値
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((kind_value IS NOT NULL AND kind_min IS NULL AND kind_max IS NULL) OR 
        (kind_value IS NULL AND kind_min IS NOT NULL AND kind_max IS NOT NULL))
);
