-- IP アクセス制御の刷新: mode 列を追加して CIDR 対応にする
ALTER TABLE ip_access_control ADD COLUMN mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (mode IN ('normal','hard_ban','shadow_ban','whitelist'));
ALTER TABLE ip_access_control ADD COLUMN is_cidr INTEGER NOT NULL DEFAULT 0;

-- 既存の banned/whitelisted を mode に移行
UPDATE ip_access_control SET mode = 'hard_ban'  WHERE mode = 'normal' AND banned = 1;
UPDATE ip_access_control SET mode = 'whitelist' WHERE mode = 'normal' AND whitelisted = 1;

-- ip_address に CIDR っぽい記法が来ている場合は is_cidr を立てる（実装側が parse 時に上書きするので保険）
UPDATE ip_access_control SET is_cidr = 1 WHERE ip_address LIKE '%/%';

CREATE INDEX IF NOT EXISTS idx_iac_mode ON ip_access_control(mode);
