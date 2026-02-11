//! Single persistent WebSocket connection to one relay with auto-reconnect.

use crate::relay_pool::health::StatusHistory;
use futures_util::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message as TungMessage;
use tokio_tungstenite::connect_async;

const RECONNECT_BACKOFF_MIN_MS: u64 = 2000;
const RECONNECT_BACKOFF_MAX_MS: u64 = 60000;
/// Ping interval for keep-alive (seconds)
const PING_INTERVAL_SECS: u64 = 30;
/// Timeout - consider connection dead if no message received within this period (seconds)
const RELAY_TIMEOUT_SECS: u64 = 90;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ConnectionState {
    Connecting,
    Connected,
    Disconnected,
}

pub struct RelayConnection {
    pub url: String,
    pub state: Arc<std::sync::RwLock<ConnectionState>>,
    pub send_tx: mpsc::UnboundedSender<String>,
    pub recv_broadcast_tx: broadcast::Sender<String>,
    pub status_history: Arc<StatusHistory>,
    pub last_error: Arc<std::sync::RwLock<Option<String>>>,
    pub connected_since: Arc<std::sync::RwLock<Option<chrono::DateTime<chrono::Utc>>>>,
}

impl RelayConnection {
    pub fn new(
        url: String,
        status_history: Arc<StatusHistory>,
    ) -> (Self, mpsc::UnboundedReceiver<String>, broadcast::Receiver<String>) {
        let (send_tx, send_rx) = mpsc::unbounded_channel();
        let (recv_broadcast_tx, recv_rx) = broadcast::channel(256);
        let state = Arc::new(std::sync::RwLock::new(ConnectionState::Disconnected));
        let last_error = Arc::new(std::sync::RwLock::new(None));
        let connected_since = Arc::new(std::sync::RwLock::new(None));
        let conn = Self {
            url: url.clone(),
            state: Arc::clone(&state),
            send_tx: send_tx.clone(),
            recv_broadcast_tx,
            status_history,
            last_error,
            connected_since,
        };
        (conn, send_rx, recv_rx)
    }

    /// Spawn the connection task: connect, run forward loop, on disconnect backoff and reconnect.
    pub fn run(
        url: String,
        mut send_rx: mpsc::UnboundedReceiver<String>,
        status_history: Arc<StatusHistory>,
        state: Arc<std::sync::RwLock<ConnectionState>>,
        recv_broadcast_tx: broadcast::Sender<String>,
        last_error: Arc<std::sync::RwLock<Option<String>>>,
        connected_since: Arc<std::sync::RwLock<Option<chrono::DateTime<chrono::Utc>>>>,
    ) {
        tokio::spawn(async move {
            let mut backoff_ms = RECONNECT_BACKOFF_MIN_MS;
            loop {
                *state.write().unwrap() = ConnectionState::Connecting;
                tracing::info!(url = %url, "Relay connection connecting");
                match connect_async(&url).await {
                    Ok((ws, _)) => {
                        backoff_ms = RECONNECT_BACKOFF_MIN_MS;
                        *state.write().unwrap() = ConnectionState::Connected;
                        *last_error.write().unwrap() = None;
                        *connected_since.write().unwrap() = Some(chrono::Utc::now());
                        status_history.record("up", None);
                        tracing::info!(url = %url, "Relay connected");
                        let (mut ws_tx, mut ws_rx) = ws.split();
                        let mut connection_dropped = false;
                        let mut last_activity = std::time::Instant::now();
                        let mut ping_interval = tokio::time::interval(Duration::from_secs(PING_INTERVAL_SECS));
                        ping_interval.tick().await; // skip immediate first tick
                        while !connection_dropped {
                            tokio::select! {
                                Some(text) = send_rx.recv() => {
                                    if ws_tx.send(TungMessage::Text(text)).await.is_err() {
                                        connection_dropped = true;
                                    }
                                }
                                msg = ws_rx.next() => {
                                    match msg {
                                        Some(Ok(TungMessage::Text(text))) => {
                                            last_activity = std::time::Instant::now();
                                            let _ = recv_broadcast_tx.send(text);
                                        }
                                        Some(Ok(TungMessage::Ping(p))) => {
                                            last_activity = std::time::Instant::now();
                                            // Reply with Pong
                                            if ws_tx.send(TungMessage::Pong(p)).await.is_err() {
                                                connection_dropped = true;
                                            }
                                        }
                                        Some(Ok(TungMessage::Pong(_))) => {
                                            last_activity = std::time::Instant::now();
                                        }
                                        Some(Ok(TungMessage::Close(_))) | Some(Err(_)) => {
                                            connection_dropped = true;
                                        }
                                        _ => {}
                                    }
                                }
                                _ = ping_interval.tick() => {
                                    // Check relay timeout
                                    let elapsed = last_activity.elapsed();
                                    if elapsed > Duration::from_secs(RELAY_TIMEOUT_SECS) {
                                        tracing::warn!(url = %url, timeout_secs = RELAY_TIMEOUT_SECS, "Relay connection timed out");
                                        connection_dropped = true;
                                    } else if ws_tx.send(TungMessage::Ping(vec![])).await.is_err() {
                                        tracing::warn!(url = %url, "Failed to send Ping to relay");
                                        connection_dropped = true;
                                    }
                                }
                            }
                        }
                        *state.write().unwrap() = ConnectionState::Disconnected;
                        status_history.record("down", None);
                        tracing::info!(url = %url, "Relay connection closed, reconnecting after backoff");
                    }
                    Err(e) => {
                        *state.write().unwrap() = ConnectionState::Disconnected;
                        let err_str = e.to_string();
                        *last_error.write().unwrap() = Some(err_str.clone());
                        status_history.record("down", None);
                        tracing::warn!(url = %url, error = %e, "Relay connect failed, backing off");
                    }
                }
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
                backoff_ms = (backoff_ms * 2).min(RECONNECT_BACKOFF_MAX_MS);
            }
        });
    }
}
