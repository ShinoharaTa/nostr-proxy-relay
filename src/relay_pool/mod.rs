//! Persistent relay connection pool with health monitoring and auto-reconnect.

mod connection;
mod health;

pub use connection::{ConnectionState, RelayConnection};
pub use health::{StatusHistory, StatusPoint};

use health::StatusHistory as StatusHistoryType;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

pub struct RelayPool {
    /// url -> (connection handle, status_history). Connection handle has send_tx and recv subscription.
    connections: Arc<RwLock<HashMap<String, RelayConnectionHandle>>>,
    pool: sqlx::SqlitePool,
}

struct RelayConnectionHandle {
    conn: RelayConnection,
    _recv_rx: broadcast::Receiver<String>,
}

impl RelayPool {
    pub fn new(pool: sqlx::SqlitePool) -> Arc<Self> {
        let inner = Arc::new(Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
            pool,
        });
        let clone = Arc::clone(&inner);
        tokio::spawn(async move {
            if let Err(e) = clone.sync_from_db().await {
                tracing::warn!(error = %e, "RelayPool initial sync error");
            }
            clone.sync_loop().await;
        });
        inner
    }

    /// Background: periodically sync relay_config from DB and ensure we have a connection for each enabled relay.
    async fn sync_loop(self: Arc<Self>) {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            if let Err(e) = self.sync_from_db().await {
                tracing::warn!(error = %e, "RelayPool sync_from_db error");
            }
        }
    }

    async fn sync_from_db(&self) -> anyhow::Result<()> {
        let rows: Vec<(String, i64)> = sqlx::query_as(
            "SELECT url, enabled FROM relay_config ORDER BY id ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        let enabled: Vec<String> = rows
            .into_iter()
            .filter(|(_, enabled)| *enabled != 0)
            .map(|(url, _)| url)
            .collect();
        let mut conns = self.connections.write().await;
        let current: Vec<String> = conns.keys().cloned().collect();
        for url in &current {
            if !enabled.contains(url) {
                conns.remove(url);
                tracing::info!(url = %url, "Removed relay from pool (disabled or deleted)");
            }
        }
        for url in enabled {
            if !conns.contains_key(&url) {
                let history = Arc::new(StatusHistoryType::new());
                let (conn, send_rx, recv_rx) = RelayConnection::new(url.clone(), Arc::clone(&history));
                RelayConnection::run(
                    conn.url.clone(),
                    send_rx,
                    Arc::clone(&history),
                    Arc::clone(&conn.state),
                    conn.recv_broadcast_tx.clone(),
                    Arc::clone(&conn.last_error),
                    Arc::clone(&conn.connected_since),
                );
                conns.insert(
                    url.clone(),
                    RelayConnectionHandle {
                        conn,
                        _recv_rx: recv_rx,
                    },
                );
                tracing::info!(url = %url, "Added relay to pool");
            }
        }
        Ok(())
    }

    /// Get the first enabled relay URL from DB (for backward compatibility).
    pub async fn get_first_enabled_url(&self) -> Option<String> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT url FROM relay_config WHERE enabled = 1 ORDER BY id ASC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .ok()?;
        row.map(|(u,)| u)
    }

    /// Send a text message to the given relay. No-op if relay not in pool.
    pub async fn send(&self, url: &str, text: String) {
        let conns = self.connections.read().await;
        if let Some(h) = conns.get(url) {
            let _ = h.conn.send_tx.send(text);
        }
    }

    /// Subscribe to messages from a relay. Returns None if relay not in pool.
    pub async fn subscribe(&self, url: &str) -> Option<broadcast::Receiver<String>> {
        let conns = self.connections.read().await;
        conns.get(url).map(|h| h.conn.recv_broadcast_tx.subscribe())
    }

    /// Snapshot of all relay statuses for the API.
    pub async fn status_snapshot(&self) -> Vec<RelayStatusSnapshot> {
        let conns = self.connections.read().await;
        let mut out = Vec::with_capacity(conns.len());
        for (url, h) in conns.iter() {
            let state = *h.conn.state.read().unwrap();
            let status = match state {
                connection::ConnectionState::Connected => "connected",
                connection::ConnectionState::Connecting => "connecting",
                connection::ConnectionState::Disconnected => "disconnected",
            };
            let uptime_history = h.conn.status_history.snapshot();
            let last_error = h.conn.last_error.read().unwrap().clone();
            let connected_since = h.conn.connected_since.read().unwrap().map(|dt| dt.to_rfc3339());
            out.push(RelayStatusSnapshot {
                url: url.clone(),
                status: status.to_string(),
                uptime_history,
                last_error,
                connected_since,
            });
        }
        out
    }
}

#[derive(Debug, serde::Serialize)]
pub struct RelayStatusSnapshot {
    pub url: String,
    pub status: String,
    pub uptime_history: Vec<StatusPoint>,
    pub last_error: Option<String>,
    pub connected_since: Option<String>,
}
