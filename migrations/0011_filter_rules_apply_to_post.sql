-- DSL ルール / Simple BAN ルールに「POST に適用するか」のフラグを追加。
-- 既存ルールはバックエンド由来 EVENT のフィルタとしての挙動を維持するため apply_to_post=0。
ALTER TABLE simple_ban_rules ADD COLUMN apply_to_post INTEGER NOT NULL DEFAULT 0;
ALTER TABLE simple_ban_rules ADD COLUMN apply_to_backend INTEGER NOT NULL DEFAULT 1;

-- filter_rules も同様（既存テーブル想定）
ALTER TABLE filter_rules ADD COLUMN apply_to_post INTEGER NOT NULL DEFAULT 0;
ALTER TABLE filter_rules ADD COLUMN apply_to_backend INTEGER NOT NULL DEFAULT 1;
