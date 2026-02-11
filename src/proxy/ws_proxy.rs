use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{sink::SinkExt, stream::StreamExt};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::time::Instant;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message as TungMessage};

use crate::filter::engine::FilterEngine;
use crate::nostr::event::Event;
use crate::nostr::message::{parse_client_msg, ClientMsg};

/// Ping interval for keep-alive (seconds)
const PING_INTERVAL_SECS: u64 = 30;
/// Client timeout - close if no message received within this period (seconds)
const CLIENT_TIMEOUT_SECS: u64 = 120;
/// Backend relay timeout - close if no message received within this period (seconds)
const BACKEND_TIMEOUT_SECS: u64 = 90;

/// One backend relay connection per client websocket connection (initial implementation).
pub async fn proxy_ws(client_ws: WebSocket, backend_url: String) -> anyhow::Result<()> {
    proxy_ws_with_pool(client_ws, backend_url, None, None).await
}

pub async fn proxy_ws_with_pool(
    client_ws: WebSocket,
    backend_url: String,
    pool: Option<SqlitePool>,
    client_ip: Option<String>,
) -> anyhow::Result<()> {
    let ip_str = client_ip.as_deref().unwrap_or("unknown");
    tracing::info!(ip = %ip_str, backend_url = %backend_url, "WebSocket connection established");

    // IP BANチェック
    if let (Some(pool), Some(ip)) = (&pool, &client_ip) {
        if is_ip_banned(pool, ip).await? {
            tracing::warn!(ip = %ip, "IP banned, rejecting connection");
            return Ok(());
        }
    }

    // 接続ログ記録
    let connection_log_id: Option<i64> = if let (Some(pool), Some(ip)) = (&pool, &client_ip) {
        let result = sqlx::query(
            "INSERT INTO connection_logs (ip_address) VALUES (?) RETURNING id",
        )
        .bind(ip)
        .fetch_optional(pool)
        .await;
        match result {
            Ok(Some(row)) => {
                use sqlx::Row;
                let log_id = row.get::<i64, _>("id");
                tracing::info!(ip = %ip, connection_log_id = log_id, "Connection log created");
                Some(log_id)
            }
            Err(e) => {
                tracing::warn!(ip = %ip, error = %e, "Failed to create connection log");
                None
            }
            _ => None,
        }
    } else {
        None
    };

    let (mut client_tx, mut client_rx) = client_ws.split();

    let mut filter_engine = FilterEngine::new();

    // Multiplex all outbound-to-client messages through a single sender task
    let (client_out_tx, mut client_out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let client_sender = tokio::spawn(async move {
        while let Some(msg) = client_out_rx.recv().await {
            if client_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Keep-alive: track last activity from client
    let mut last_client_activity = Instant::now();

    // REQ cache for resubscription after backend reconnect (sub_id -> raw JSON text)
    let mut req_cache: HashMap<String, String> = HashMap::new();

    // Backend reconnection loop
    let mut is_first_connect = true;

    'reconnect: loop {
        // Connect to backend relay
        tracing::info!(backend_url = %backend_url, "Connecting to backend relay");
        let backend_ws = match connect_async(&backend_url).await {
            Ok((ws, resp)) => {
                tracing::info!(backend_url = %backend_url, status = ?resp.status(), "Backend relay connected successfully");
                ws
            }
            Err(e) => {
                if is_first_connect {
                    tracing::error!(backend_url = %backend_url, error = %e, "Failed to connect to backend relay");
                    break 'reconnect;
                }
                tracing::warn!(backend_url = %backend_url, error = %e, "Failed to reconnect to backend relay, retrying...");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue 'reconnect;
            }
        };
        is_first_connect = false;

        let (mut backend_tx, mut backend_rx) = backend_ws.split();
        let mut last_backend_activity = Instant::now();

        // Resend cached REQs after reconnect
        if !req_cache.is_empty() {
            tracing::info!(count = req_cache.len(), "Resending cached REQs after backend reconnect");
            for (sub_id, req_text) in &req_cache {
                tracing::info!(sub_id = %sub_id, "Resending REQ");
                if backend_tx
                    .send(TungMessage::Text(req_text.clone()))
                    .await
                    .is_err()
                {
                    tracing::warn!("Failed to resend REQ, will retry on next reconnect");
                    continue 'reconnect;
                }
            }
        }

        // Ping intervals
        let mut client_ping_interval =
            tokio::time::interval(std::time::Duration::from_secs(PING_INTERVAL_SECS));
        client_ping_interval.tick().await; // skip immediate first tick
        let mut backend_ping_interval =
            tokio::time::interval(std::time::Duration::from_secs(PING_INTERVAL_SECS));
        backend_ping_interval.tick().await;

        let mut backend_disconnected = false;

        // Main event loop
        loop {
            tokio::select! {
                // ── Client -> Backend ──
                msg = client_rx.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            last_client_activity = Instant::now();
                            match parse_client_msg(&text) {
                                Ok(ClientMsg::Event { event }) => {
                                    if let Some(pool) = &pool {
                                        let allowed = match is_post_allowed(pool, &event.pubkey).await {
                                            Ok(a) => a,
                                            Err(e) => {
                                                tracing::error!(error = %e, "Failed to check post_allowed");
                                                false
                                            }
                                        };
                                        if !allowed {
                                            tracing::warn!(event_id = %event.id, pubkey_hex = %event.pubkey, "EVENT blocked: not in safelist or post_allowed flag not set");
                                            if let Err(e) = log_rejection(pool, &event, "not_in_safelist", client_ip.as_deref()).await {
                                                tracing::error!(error = %e, "Failed to log rejection");
                                            }
                                            if let Some(log_id) = connection_log_id {
                                                let _ = sqlx::query(
                                                    "UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?"
                                                )
                                                .bind(log_id)
                                                .execute(pool)
                                                .await;
                                            }
                                            let notice = serde_json::json!(["NOTICE", "blocked: not in safelist"]);
                                            let _ = client_out_tx.send(Message::Text(notice.to_string()));
                                            continue;
                                        }
                                    } else {
                                        tracing::warn!("No pool available, forwarding EVENT without safelist check");
                                    }
                                }
                                Ok(ClientMsg::Req { ref sub_id, .. }) => {
                                    // Cache REQ for resubscription after backend reconnect
                                    req_cache.insert(sub_id.clone(), text.clone());
                                }
                                Ok(ClientMsg::Close { ref sub_id }) => {
                                    req_cache.remove(sub_id);
                                }
                                Err(_) => {}
                            }
                            if backend_tx.send(TungMessage::Text(text)).await.is_err() {
                                backend_disconnected = true;
                                break;
                            }
                        }
                        Some(Ok(Message::Binary(bin))) => {
                            last_client_activity = Instant::now();
                            if backend_tx.send(TungMessage::Binary(bin)).await.is_err() {
                                backend_disconnected = true;
                                break;
                            }
                        }
                        Some(Ok(Message::Ping(p))) => {
                            // Client is pinging us - reply with Pong
                            last_client_activity = Instant::now();
                            let _ = client_out_tx.send(Message::Pong(p));
                        }
                        Some(Ok(Message::Pong(_))) => {
                            // Pong from client (response to our keep-alive Ping)
                            last_client_activity = Instant::now();
                        }
                        Some(Ok(Message::Close(frame))) => {
                            let close_info = frame.as_ref().map(|f| (f.code, f.reason.clone()));
                            tracing::info!(close_code = ?close_info.as_ref().map(|(c, _)| c), close_reason = ?close_info.as_ref().map(|(_, r)| r.as_ref()), "Client closed connection");
                            let close = frame.map(|f| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: f.code.into(),
                                reason: f.reason,
                            });
                            let _ = backend_tx.send(TungMessage::Close(close)).await;
                            break; // Client closed, exit
                        }
                        Some(Err(e)) => {
                            tracing::warn!(ip = %ip_str, error = %e, "Client WebSocket error");
                            break;
                        }
                        None => {
                            tracing::info!(ip = %ip_str, "Client stream ended");
                            break;
                        }
                    }
                }

                // ── Backend -> Client ──
                msg = backend_rx.next() => {
                    match msg {
                        Some(Ok(TungMessage::Text(text))) => {
                            last_backend_activity = Instant::now();
                            if let Some(pool) = &pool {
                                match filter_engine.should_drop_backend_text_with_ip(pool, &text, client_ip.as_deref()).await {
                                    Ok(true) => {
                                        tracing::info!("Backend EVENT dropped by filter");
                                        continue;
                                    }
                                    Ok(false) => {}
                                    Err(e) => {
                                        tracing::error!(error = %e, "Error in filter check, passing through");
                                    }
                                }
                            }
                            // Check message type for stats
                            if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(&text) {
                                if arr.first().and_then(|v| v.as_str()) == Some("OK") {
                                    if let Some(_event_id) = arr.get(1).and_then(|v| v.as_str()) {
                                        let accepted = arr.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
                                        if let (Some(pool), Some(log_id)) = (&pool, connection_log_id) {
                                            if accepted {
                                                let _ = sqlx::query(
                                                    "UPDATE connection_logs SET event_count = event_count + 1 WHERE id = ?"
                                                )
                                                .bind(log_id)
                                                .execute(pool)
                                                .await;
                                            } else {
                                                let _ = sqlx::query(
                                                    "UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?"
                                                )
                                                .bind(log_id)
                                                .execute(pool)
                                                .await;
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = client_out_tx.send(Message::Text(text));
                        }
                        Some(Ok(TungMessage::Binary(bin))) => {
                            last_backend_activity = Instant::now();
                            let _ = client_out_tx.send(Message::Binary(bin));
                        }
                        Some(Ok(TungMessage::Ping(p))) => {
                            // Backend is pinging us - reply with Pong
                            last_backend_activity = Instant::now();
                            if backend_tx.send(TungMessage::Pong(p)).await.is_err() {
                                backend_disconnected = true;
                                break;
                            }
                        }
                        Some(Ok(TungMessage::Pong(_))) => {
                            // Pong from backend (response to our keep-alive Ping)
                            last_backend_activity = Instant::now();
                        }
                        Some(Ok(TungMessage::Close(frame))) => {
                            let close_info = frame.as_ref().map(|f| (f.code, f.reason.clone()));
                            tracing::info!(close_code = ?close_info.as_ref().map(|(c, _)| c), close_reason = ?close_info.as_ref().map(|(_, r)| r.as_ref()), "Backend closed connection");
                            backend_disconnected = true;
                            break;
                        }
                        Some(Err(e)) => {
                            tracing::warn!(backend_url = %backend_url, error = %e, "Backend WebSocket error");
                            backend_disconnected = true;
                            break;
                        }
                        None => {
                            tracing::info!(backend_url = %backend_url, "Backend stream ended");
                            backend_disconnected = true;
                            break;
                        }
                        _ => {
                            // Ignore frames we don't map
                        }
                    }
                }

                // ── Client keep-alive ──
                _ = client_ping_interval.tick() => {
                    let elapsed = last_client_activity.elapsed();
                    if elapsed > std::time::Duration::from_secs(CLIENT_TIMEOUT_SECS) {
                        tracing::warn!(ip = %ip_str, timeout_secs = CLIENT_TIMEOUT_SECS, "Client timed out, closing connection");
                        break;
                    }
                    if client_out_tx.send(Message::Ping(vec![])).is_err() {
                        break;
                    }
                }

                // ── Backend keep-alive ──
                _ = backend_ping_interval.tick() => {
                    let elapsed = last_backend_activity.elapsed();
                    if elapsed > std::time::Duration::from_secs(BACKEND_TIMEOUT_SECS) {
                        tracing::warn!(backend_url = %backend_url, timeout_secs = BACKEND_TIMEOUT_SECS, "Backend relay timed out");
                        backend_disconnected = true;
                        break;
                    }
                    if backend_tx.send(TungMessage::Ping(vec![])).await.is_err() {
                        tracing::warn!(backend_url = %backend_url, "Failed to send Ping to backend relay");
                        backend_disconnected = true;
                        break;
                    }
                }
            }
        }

        if !backend_disconnected {
            // Client disconnected - exit reconnection loop
            break 'reconnect;
        }

        // Backend disconnected - reconnect after short delay
        tracing::info!(
            backend_url = %backend_url,
            cached_reqs = req_cache.len(),
            "Backend disconnected, reconnecting..."
        );
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    drop(client_out_tx);
    let _ = client_sender.await;

    // 接続ログ更新（切断時刻）
    if let (Some(pool), Some(log_id)) = (&pool, connection_log_id) {
        let _ = sqlx::query(
            "UPDATE connection_logs SET disconnected_at = datetime('now') WHERE id = ?",
        )
        .bind(log_id)
        .execute(pool)
        .await;
    }

    Ok(())
}

// ── Helper functions ──

async fn is_post_allowed(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = match pubkey_hex_to_npub(pubkey_hex) {
        Ok(n) => n,
        Err(e) => {
            tracing::warn!(pubkey_hex = %pubkey_hex, error = %e, "Failed to convert pubkey_hex to npub");
            return Ok(false);
        }
    };
    let row: Option<(i64,)> = sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
        .bind(&npub)
        .fetch_optional(pool)
        .await?;
    let allowed = row.map(|(flags,)| (flags & 1) == 1).unwrap_or(false);
    Ok(allowed)
}

fn pubkey_hex_to_npub(pubkey_hex: &str) -> anyhow::Result<String> {
    let bytes = hex::decode(pubkey_hex).context("pubkey hex decode")?;
    let hrp = bech32::Hrp::parse("npub").context("invalid bech32 hrp")?;
    Ok(bech32::encode::<bech32::Bech32>(hrp, &bytes)?)
}

async fn log_rejection(
    pool: &SqlitePool,
    event: &Event,
    reason: &str,
    ip_address: Option<&str>,
) -> anyhow::Result<()> {
    let npub = match pubkey_hex_to_npub(&event.pubkey) {
        Ok(n) => n,
        Err(e) => {
            tracing::warn!(pubkey_hex = %event.pubkey, error = %e, "Failed to convert pubkey_hex to npub in log_rejection");
            "unknown".to_string()
        }
    };
    match sqlx::query(
        "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&event.id)
    .bind(&event.pubkey)
    .bind(&npub)
    .bind(ip_address)
    .bind(event.kind)
    .bind(reason)
    .execute(pool)
    .await {
        Ok(_) => Ok(()),
        Err(e) => {
            tracing::error!(event_id = %event.id, npub = %npub, reason = %reason, error = %e, "Failed to insert event rejection log");
            Err(anyhow::anyhow!("Failed to log rejection: {}", e))
        }
    }
}

/// IPアドレスがBANされているか確認
async fn is_ip_banned(pool: &SqlitePool, ip: &str) -> anyhow::Result<bool> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT banned FROM ip_access_control WHERE ip_address = ?")
            .bind(ip)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|(banned,)| banned == 1).unwrap_or(false))
}
