//! InfluxDB 2.x Line Protocol over HTTP.
//! Configure via env: INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_BUCKET, INFLUXDB_ORG.
//! If any is missing, no metrics are sent.

use std::sync::Arc;
use std::time::Duration;

use crate::event_counter::EventCounter;

pub struct InfluxExporter {
    client: Option<reqwest::Client>,
    url: String,
    bucket: String,
    org: String,
    token: String,
}

impl InfluxExporter {
    pub fn from_env() -> Option<Arc<Self>> {
        let url = std::env::var("INFLUXDB_URL").ok()?;
        let token = std::env::var("INFLUXDB_TOKEN").ok()?;
        let bucket = std::env::var("INFLUXDB_BUCKET").ok()?;
        let org = std::env::var("INFLUXDB_ORG").ok()?;
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .ok()?;
        Some(Arc::new(Self {
            client: Some(client),
            url: url.trim_end_matches('/').to_string(),
            bucket,
            org,
            token,
        }))
    }

    pub fn run(
        self: Arc<Self>,
        pool: sqlx::SqlitePool,
        relay_pool: Option<Arc<crate::relay_pool::RelayPool>>,
        _event_counter: Option<Arc<EventCounter>>,
    ) {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            loop {
                interval.tick().await;
                if let Err(e) = self.send_batch(&pool, relay_pool.as_deref()).await {
                    tracing::debug!(error = %e, "InfluxDB send skipped");
                }
            }
        });
    }

    async fn send_batch(
        &self,
        pool: &sqlx::SqlitePool,
        relay_pool: Option<&crate::relay_pool::RelayPool>,
    ) -> anyhow::Result<()> {
        let client = match &self.client {
            Some(c) => c,
            None => return Ok(()),
        };
        let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let mut lines = Vec::new();

        let total_connections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM connection_logs")
            .fetch_one(pool)
            .await
            .unwrap_or((0,));
        let active: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM connection_logs WHERE disconnected_at IS NULL")
                .fetch_one(pool)
                .await
                .unwrap_or((0,));
        let total_rejections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM event_rejection_logs")
            .fetch_one(pool)
            .await
            .unwrap_or((0,));

        lines.push(format!(
            "relay_connections_total,host=proxy value={} {}",
            total_connections.0, now
        ));
        lines.push(format!(
            "relay_connections_active,host=proxy value={} {}",
            active.0, now
        ));
        lines.push(format!(
            "relay_rejections_total,host=proxy value={} {}",
            total_rejections.0, now
        ));

        // 直近 5 分の event_counters を action ごとに合算して送る
        let cutoff = chrono::Utc::now().timestamp() / 60 - 5;
        let counter_rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT action, SUM(count) FROM event_counters WHERE bucket_minute >= ? GROUP BY action",
        )
        .bind(cutoff)
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        for (action, count) in counter_rows {
            lines.push(format!(
                "relay_event_counts,action={} value={} {}",
                action, count, now
            ));
        }

        if let Some(rp) = relay_pool {
            let status = rp.status_snapshot().await;
            for s in status {
                let status_val = if s.status == "connected" { 1i64 } else { 0i64 };
                let url_tag = s.url.replace(',', "\\,").replace(' ', "\\ ");
                lines.push(format!(
                    "relay_pool_status,url=\"{}\" status={} {}",
                    url_tag, status_val, now
                ));
            }
        }

        let body = lines.join("\n");
        let write_url = format!(
            "{}/api/v2/write?bucket={}&org={}",
            self.url, self.bucket, self.org
        );
        let resp = client
            .post(&write_url)
            .header("Authorization", format!("Token {}", self.token))
            .header("Content-Type", "application/vnd.influxdb; charset=utf-8")
            .body(body)
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let t = resp.text().await.unwrap_or_default();
            anyhow::bail!("InfluxDB write failed: {} {}", status, t);
        }
        Ok(())
    }
}
