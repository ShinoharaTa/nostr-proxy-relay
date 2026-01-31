use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{sink::SinkExt, stream::StreamExt};
use sqlx::SqlitePool;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message as TungMessage};
use std::sync::Arc;

use crate::nostr::message::{parse_client_msg, ClientMsg};
use crate::filter::engine::FilterEngine;
use crate::nostr::event::Event;

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
    let connection_log_id = Arc::new(if let (Some(pool), Some(ip)) = (&pool, &client_ip) {
        let result = sqlx::query(
            "INSERT INTO connection_logs (ip_address) VALUES (?) RETURNING id"
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
    });
    let connection_log_id_c2b = Arc::clone(&connection_log_id);
    let connection_log_id_b2c = Arc::clone(&connection_log_id);
    
    tracing::info!(backend_url = %backend_url, "Connecting to backend relay");
    let (backend_ws, resp) = match connect_async(&backend_url).await {
        Ok((ws, resp)) => {
            tracing::info!(backend_url = %backend_url, status = ?resp.status(), "Backend relay connected successfully");
            (ws, resp)
        }
        Err(e) => {
            tracing::error!(backend_url = %backend_url, error = %e, "Failed to connect to backend relay");
            return Err(anyhow::anyhow!("Failed to connect to backend relay {}: {}", backend_url, e));
        }
    };

    let (mut client_tx, mut client_rx) = client_ws.split();
    let (mut backend_tx, mut backend_rx) = backend_ws.split();

    let mut filter_engine = FilterEngine::new();

    async fn is_post_allowed(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
        let npub = match pubkey_hex_to_npub(pubkey_hex) {
            Ok(n) => n,
            Err(e) => {
                tracing::warn!(pubkey_hex = %pubkey_hex, error = %e, "Failed to convert pubkey_hex to npub");
                return Ok(false);
            }
        };
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
                .bind(&npub)
                .fetch_optional(pool)
                .await?;
        let allowed = row.map(|(flags,)| (flags & 1) == 1).unwrap_or(false);
        tracing::debug!(npub = %npub, pubkey_hex = %pubkey_hex, flags = ?row.map(|(f,)| f), allowed = %allowed, "is_post_allowed check");
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
            Ok(_) => {
                tracing::debug!(event_id = %event.id, npub = %npub, reason = %reason, "Logged event rejection");
                Ok(())
            }
            Err(e) => {
                tracing::error!(event_id = %event.id, npub = %npub, reason = %reason, error = %e, "Failed to insert event rejection log");
                Err(anyhow::anyhow!("Failed to log rejection: {}", e))
            }
        }
    }

    // multiplex all outbound-to-client messages through a single sender task
    let (client_out_tx, mut client_out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let client_sender = tokio::spawn(async move {
        while let Some(msg) = client_out_rx.recv().await {
            if client_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // client -> backend
    let pool_c2b = pool.clone();
    let client_ip_c2b = client_ip.clone();
    let connection_log_id_c2b_clone = Arc::clone(&connection_log_id_c2b);
    let client_out_tx_c2b = client_out_tx.clone();
    let c2b = async move {
        while let Some(msg) = client_rx.next().await {
            let msg = msg?;
            match msg {
                Message::Text(text) => {
                    // If it's an EVENT, enforce safelist when pool is available.
                    match parse_client_msg(&text) {
                        Ok(ClientMsg::Event { event }) => {
                            tracing::info!(event_id = %event.id, pubkey_hex = %event.pubkey, kind = event.kind, "Received EVENT from client");
                            if let Some(pool) = &pool_c2b {
                                let allowed = match is_post_allowed(pool, &event.pubkey).await {
                                    Ok(a) => a,
                                    Err(e) => {
                                        tracing::error!(error = %e, "Failed to check post_allowed");
                                        false
                                    }
                                };
                                if !allowed {
                                    tracing::warn!(event_id = %event.id, pubkey_hex = %event.pubkey, "EVENT blocked: not in safelist or post_allowed flag not set");
                                    // 拒否ログを記録
                                    if let Err(e) = log_rejection(pool, &event, "not_in_safelist", client_ip_c2b.as_deref()).await {
                                        tracing::error!(error = %e, "Failed to log rejection");
                                    }
                                    // 統計情報を更新
                                    if let Some(log_id) = *connection_log_id_c2b_clone {
                                        let _ = sqlx::query(
                                            "UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?"
                                        )
                                        .bind(log_id)
                                        .execute(pool)
                                        .await;
                                    }
                                    let notice = serde_json::json!(["NOTICE", "blocked: not in safelist"]);
                                    let _ = client_out_tx_c2b.send(Message::Text(notice.to_string()));
                                    continue;
                                }
                                tracing::info!(event_id = %event.id, pubkey_hex = %event.pubkey, "EVENT allowed, forwarding to backend");
                            } else {
                                tracing::warn!("No pool available, forwarding EVENT without safelist check");
                            }
                        }
                        Ok(ClientMsg::Req { sub_id, filters }) => {
                            tracing::info!(sub_id = %sub_id, filter_count = filters.len(), ip = ?client_ip_c2b, "Received REQ from client");
                            tracing::debug!(sub_id = %sub_id, filters = ?filters, "REQ filters detail");
                        }
                        Ok(ClientMsg::Close { sub_id }) => {
                            tracing::info!(sub_id = %sub_id, ip = ?client_ip_c2b, "Received CLOSE from client");
                        }
                        Err(e) => {
                            tracing::debug!(error = %e, "Failed to parse client message (may not be a Nostr message)");
                        }
                    }
                    tracing::debug!(message_len = text.len(), "Forwarding text message to backend");
                    backend_tx.send(TungMessage::Text(text)).await?
                }
                Message::Binary(bin) => {
                    tracing::debug!(binary_len = bin.len(), "Forwarding binary message to backend");
                    backend_tx.send(TungMessage::Binary(bin)).await?
                }
                Message::Ping(p) => {
                    tracing::debug!("Received PING from client, forwarding to backend");
                    backend_tx.send(TungMessage::Ping(p)).await?
                }
                Message::Pong(p) => {
                    tracing::debug!("Received PONG from client, forwarding to backend");
                    backend_tx.send(TungMessage::Pong(p)).await?
                }
                Message::Close(frame) => {
                    let close_info = frame.as_ref().map(|f| (f.code, f.reason.clone()));
                    tracing::info!(close_code = ?close_info.as_ref().map(|(c, _)| c), close_reason = ?close_info.as_ref().map(|(_, r)| r.as_ref()), "Client closed connection");
                    let close = frame.map(|f| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                        code: f.code.into(),
                        reason: f.reason,
                    });
                    backend_tx.send(TungMessage::Close(close)).await?;
                    break;
                }
            }
        }
        anyhow::Ok(())
    };

    // backend -> client
    let pool_b2c = pool.clone();
    let client_ip_b2c = client_ip.clone();
    let connection_log_id_b2c_clone = Arc::clone(&connection_log_id_b2c);
    let client_out_tx_b2c = client_out_tx.clone();
    let b2c = async move {
        while let Some(msg) = backend_rx.next().await {
            let msg = msg?;
            match msg {
                TungMessage::Text(text) => {
                    if let Some(pool) = &pool_b2c {
                        match filter_engine.should_drop_backend_text_with_ip(pool, &text, client_ip_b2c.as_deref()).await {
                            Ok(true) => {
                                tracing::debug!("Backend EVENT dropped by filter");
                                continue;
                            }
                            Ok(false) => {
                                // Event passed filter
                            }
                            Err(e) => {
                                tracing::error!(error = %e, "Error in filter check, passing through");
                            }
                        }
                    }
                    // Check if this is an EVENT response from backend
                    if let Ok(serde_json::Value::Array(arr)) = serde_json::from_str::<serde_json::Value>(&text) {
                        if arr.first().and_then(|v| v.as_str()) == Some("EVENT") {
                            if let Some(sub_id) = arr.get(1).and_then(|v| v.as_str()) {
                                if let Some(ev_v) = arr.get(2) {
                                    if let Ok(event) = serde_json::from_value::<crate::nostr::event::Event>(ev_v.clone()) {
                                        tracing::info!(sub_id = %sub_id, event_id = %event.id, pubkey_hex = %event.pubkey, kind = event.kind, "Forwarding EVENT from backend to client");
                                    }
                                }
                            }
                        } else if arr.first().and_then(|v| v.as_str()) == Some("EOSE") {
                            if let Some(sub_id) = arr.get(1).and_then(|v| v.as_str()) {
                                tracing::info!(sub_id = %sub_id, "Received EOSE from backend, forwarding to client");
                            }
                        } else if arr.first().and_then(|v| v.as_str()) == Some("OK") {
                            if let Some(event_id) = arr.get(1).and_then(|v| v.as_str()) {
                                // OKメッセージの形式: ["OK", <event_id>, <accepted>, <message>]
                                let accepted = arr.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
                                let message = arr.get(3).and_then(|v| v.as_str());
                                tracing::info!(event_id = %event_id, accepted = %accepted, message = ?message, "Backend OK response");
                                // 統計情報を更新
                                if let (Some(pool), Some(log_id)) = (&pool_b2c, connection_log_id_b2c_clone.as_ref()) {
                                    if accepted {
                                        // 投稿が成功した場合
                                        let _ = sqlx::query(
                                            "UPDATE connection_logs SET event_count = event_count + 1 WHERE id = ?"
                                        )
                                        .bind(log_id)
                                        .execute(pool)
                                        .await;
                                    } else {
                                        // 投稿が拒否された場合（バックエンド側で拒否）
                                        let _ = sqlx::query(
                                            "UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?"
                                        )
                                        .bind(log_id)
                                        .execute(pool)
                                        .await;
                                    }
                                }
                            }
                        } else if arr.first().and_then(|v| v.as_str()) == Some("NOTICE") {
                            if let Some(notice_msg) = arr.get(1).and_then(|v| v.as_str()) {
                                tracing::info!(notice = %notice_msg, "Received NOTICE from backend, forwarding to client");
                            }
                        } else {
                            tracing::debug!(message_type = ?arr.first().and_then(|v| v.as_str()), "Received unknown message type from backend");
                        }
                    }
                    tracing::debug!(message_len = text.len(), "Forwarding text message from backend to client");
                    let _ = client_out_tx_b2c.send(Message::Text(text));
                }
                TungMessage::Binary(bin) => {
                    tracing::debug!(binary_len = bin.len(), "Forwarding binary message from backend to client");
                    let _ = client_out_tx_b2c.send(Message::Binary(bin));
                }
                TungMessage::Ping(p) => {
                    tracing::debug!("Received PING from backend, forwarding to client");
                    let _ = client_out_tx_b2c.send(Message::Ping(p));
                }
                TungMessage::Pong(p) => {
                    tracing::debug!("Received PONG from backend, forwarding to client");
                    let _ = client_out_tx_b2c.send(Message::Pong(p));
                }
                TungMessage::Close(frame) => {
                    let close_info = frame.as_ref().map(|f| (f.code, f.reason.clone()));
                    tracing::info!(close_code = ?close_info.as_ref().map(|(c, _)| c), close_reason = ?close_info.as_ref().map(|(_, r)| r.as_ref()), "Backend closed connection");
                    let close = frame.map(|f| axum::extract::ws::CloseFrame {
                        code: f.code.into(),
                        reason: f.reason,
                    });
                    let _ = client_out_tx_b2c.send(Message::Close(close));
                    break;
                }
                // ignore frames we don't map yet
                _ => {}
            }
        }
        anyhow::Ok(())
    };

    tokio::select! {
        r = c2b => r?,
        r = b2c => r?,
    }

    drop(client_out_tx);
    let _ = client_sender.await;

    // 接続ログ更新（切断時刻）
    if let (Some(pool), Some(log_id)) = (&pool, connection_log_id.as_ref()) {
        let _ = sqlx::query(
            "UPDATE connection_logs SET disconnected_at = datetime('now') WHERE id = ?"
        )
        .bind(log_id)
        .execute(pool)
        .await;
    }

    Ok(())
}

/// IPアドレスがBANされているか確認
async fn is_ip_banned(pool: &SqlitePool, ip: &str) -> anyhow::Result<bool> {
    let row: Option<(i64,)> = sqlx::query_as(
        "SELECT banned FROM ip_access_control WHERE ip_address = ?"
    )
    .bind(ip)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(banned,)| banned == 1).unwrap_or(false))
}
