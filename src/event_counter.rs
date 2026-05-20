//! 1 分単位の event counter aggregator。
//!
//! ws_proxy / filter engine から `record(kind, action)` を呼び出すと、
//! メモリ上のバケットへ加算される。背景タスクが定期的に DB へ UPSERT する。
//!
//! action: "posted" / "delivered" / "rejected"

use dashmap::DashMap;
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    Posted,
    Delivered,
    Rejected,
}

impl Action {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Posted => "posted",
            Self::Delivered => "delivered",
            Self::Rejected => "rejected",
        }
    }
}

#[derive(Default)]
pub struct EventCounter {
    // (bucket_minute, kind, action) -> count
    buckets: DashMap<(i64, i64, &'static str), AtomicI64>,
}

impl EventCounter {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn record(&self, kind: i64, action: Action) {
        let bucket = current_bucket_minute();
        let key = (bucket, kind, action.as_str());
        let entry = self
            .buckets
            .entry(key)
            .or_insert_with(|| AtomicI64::new(0));
        entry.fetch_add(1, Ordering::Relaxed);
    }

    /// 現在のバケット集合を取り出してリセット。
    fn drain(&self) -> Vec<((i64, i64, &'static str), i64)> {
        let mut out = Vec::with_capacity(self.buckets.len());
        let keys: Vec<_> = self.buckets.iter().map(|e| *e.key()).collect();
        for key in keys {
            if let Some((_, atomic)) = self.buckets.remove(&key) {
                let count = atomic.load(Ordering::Relaxed);
                if count > 0 {
                    out.push((key, count));
                }
            }
        }
        out
    }

    pub fn spawn_flush_task(self: Arc<Self>, pool: SqlitePool) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            interval.tick().await;
            loop {
                interval.tick().await;
                let to_flush = self.drain();
                if to_flush.is_empty() {
                    continue;
                }
                if let Err(e) = flush(&pool, &to_flush).await {
                    tracing::warn!(error = %e, "event_counter flush failed");
                }
            }
        });
    }
}

fn current_bucket_minute() -> i64 {
    chrono::Utc::now().timestamp() / 60
}

async fn flush(pool: &SqlitePool, batch: &[((i64, i64, &'static str), i64)]) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;
    for ((bucket, kind, action), count) in batch {
        sqlx::query(
            "INSERT INTO event_counters (bucket_minute, kind, action, count) VALUES (?, ?, ?, ?) \
             ON CONFLICT(bucket_minute, kind, action) DO UPDATE SET count = count + excluded.count",
        )
        .bind(bucket)
        .bind(kind)
        .bind(*action)
        .bind(count)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// 古い event_counters を削除する背景タスク。
pub fn spawn_retention_task(pool: SqlitePool, retention_days: i64) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));
        interval.tick().await;
        loop {
            interval.tick().await;
            let cutoff = chrono::Utc::now().timestamp() / 60 - retention_days * 24 * 60;
            let _ = sqlx::query("DELETE FROM event_counters WHERE bucket_minute < ?")
                .bind(cutoff)
                .execute(&pool)
                .await;
        }
    });
}
