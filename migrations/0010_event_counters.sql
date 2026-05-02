-- イベント数の時系列。1分単位で UPSERT する。
-- 集計キー: (bucket_minute, kind, action)
CREATE TABLE IF NOT EXISTS event_counters (
  bucket_minute INTEGER NOT NULL,        -- UNIX time / 60
  kind INTEGER NOT NULL,
  action TEXT NOT NULL,                  -- 'posted','delivered','rejected'
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_minute, kind, action)
);

CREATE INDEX IF NOT EXISTS idx_evt_counters_bucket ON event_counters(bucket_minute);
