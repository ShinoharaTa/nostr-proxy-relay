//! DB ログ TTL クリーナ。
//! 環境変数 `LOG_RETENTION_DAYS`（既定 30 日）に従い、古い行を定期削除する。

use sqlx::SqlitePool;
use std::time::Duration;

pub fn spawn(pool: SqlitePool) {
    let retention_days: i64 = std::env::var("LOG_RETENTION_DAYS")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|d: &i64| *d > 0)
        .unwrap_or(30);

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));
        interval.tick().await;
        loop {
            interval.tick().await;
            let cutoff = chrono::Utc::now() - chrono::Duration::days(retention_days);
            let cutoff_str = cutoff.format("%Y-%m-%d %H:%M:%S").to_string();
            for table in ["event_rejection_logs", "connection_logs", "relay_event_logs"] {
                let column = if table == "connection_logs" {
                    "connected_at"
                } else {
                    "created_at"
                };
                let q = format!("DELETE FROM {} WHERE {} < ?", table, column);
                if let Err(e) = sqlx::query(&q).bind(&cutoff_str).execute(&pool).await {
                    tracing::warn!(error = %e, table = table, "log_cleaner delete failed");
                }
            }
        }
    });
}
