-- 自動ガード（spec §5.14）と書き込みルーティング（spec §5.15）の設定列を追加

-- 書き込みルーティング: 'all' = 全 write_enabled リレーへ（従来互換）
-- 'primary_default' = broadcast フラグ（safelist.flags & 8）持ち npub のみ全リレーへ、
--                     それ以外は role='primary' の write_enabled リレーのみへ
ALTER TABLE relay_settings ADD COLUMN write_routing TEXT NOT NULL DEFAULT 'all'
  CHECK (write_routing IN ('all', 'primary_default'));

-- 自動ガード（既定 OFF の opt-in）
ALTER TABLE relay_settings ADD COLUMN auto_guard_enabled INTEGER NOT NULL DEFAULT 0;
-- バースト検知: sliding window（秒）と窓内の許容 EVENT 数
ALTER TABLE relay_settings ADD COLUMN guard_burst_window_secs INTEGER NOT NULL DEFAULT 60;
ALTER TABLE relay_settings ADD COLUMN guard_burst_max_events INTEGER NOT NULL DEFAULT 30;
-- バースト検知から除外する kind（CSV）。ephemeral / replaceable はコード側で常に除外。
ALTER TABLE relay_settings ADD COLUMN guard_exclude_kinds TEXT NOT NULL DEFAULT '7';
-- 同一イベント検知: 異なる接続（IP）数の閾値と観測窓（秒）
ALTER TABLE relay_settings ADD COLUMN guard_duplicate_threshold INTEGER NOT NULL DEFAULT 3;
ALTER TABLE relay_settings ADD COLUMN guard_duplicate_window_secs INTEGER NOT NULL DEFAULT 300;
-- 発火時に自動発行する Quarantine / content mute の有効期間（秒）
ALTER TABLE relay_settings ADD COLUMN guard_quarantine_secs INTEGER NOT NULL DEFAULT 600;
