-- 上流リレーの一時停止（Issue #33）
-- enabled = 0 かつ disabled_until が未来 → 期限が来たら自動で enabled = 1 に戻す。
-- NULL は「手動で無効にした」状態を意味し、自動復帰の対象外。
ALTER TABLE relay_config ADD COLUMN disabled_until TEXT;
