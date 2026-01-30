use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{sink::SinkExt, stream::StreamExt};
use sqlx::SqlitePool;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message as TungMessage};

use crate::nostr::message::{parse_client_msg, ClientMsg};
use crate::filter::engine::FilterEngine;

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
    // IP BANチェック
    if let (Some(pool), Some(ip)) = (&pool, &client_ip) {
        if is_ip_banned(pool, ip).await? {
            tracing::warn!(ip = %ip, "IP banned, rejecting connection");
            return Ok(());
        }
    }

    // 接続ログ記録
    let connection_log_id = if let (Some(pool), Some(ip)) = (&pool, &client_ip) {
        let result = sqlx::query(
            "INSERT INTO connection_logs (ip_address) VALUES (?) RETURNING id"
        )
        .bind(ip)
        .fetch_optional(pool)
        .await;
        match result {
            Ok(Some(row)) => {
                use sqlx::Row;
                Some(row.get::<i64, _>("id"))
            }
            _ => None,
        }
    } else {
        None
    };
    let (backend_ws, _resp) =
        connect_async(&backend_url).await.with_context(|| format!("connect {backend_url}"))?;

    let (mut client_tx, mut client_rx) = client_ws.split();
    let (mut backend_tx, mut backend_rx) = backend_ws.split();

    let mut filter_engine = FilterEngine::new();

    async fn is_post_allowed(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
        let npub = pubkey_hex_to_npub(pubkey_hex)?;
        let row: Option<(i64,)> =
            sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
                .bind(npub)
                .fetch_optional(pool)
                .await?;
        Ok(row.map(|(flags,)| (flags & 1) == 1).unwrap_or(false))
    }

    fn pubkey_hex_to_npub(pubkey_hex: &str) -> anyhow::Result<String> {
        let bytes = hex::decode(pubkey_hex).context("pubkey hex decode")?;
        let hrp = bech32::Hrp::parse("npub").context("invalid bech32 hrp")?;
        Ok(bech32::encode::<bech32::Bech32>(hrp, &bytes)?)
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
    let c2b = async {
        while let Some(msg) = client_rx.next().await {
            let msg = msg?;
            match msg {
                Message::Text(text) => {
                    // If it's an EVENT, enforce safelist when pool is available.
                    if let Ok(ClientMsg::Event { event }) = parse_client_msg(&text) {
                        if let Some(pool) = &pool {
                            let allowed = is_post_allowed(pool, &event.pubkey).await?;
                            if !allowed {
                                let notice = serde_json::json!(["NOTICE", "blocked: not in safelist"]);
                                let _ = client_out_tx.send(Message::Text(notice.to_string()));
                                continue;
                            }
                        }
                    }
                    backend_tx.send(TungMessage::Text(text)).await?
                }
                Message::Binary(bin) => backend_tx.send(TungMessage::Binary(bin)).await?,
                Message::Ping(p) => backend_tx.send(TungMessage::Ping(p)).await?,
                Message::Pong(p) => backend_tx.send(TungMessage::Pong(p)).await?,
                Message::Close(frame) => {
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
    let b2c = async {
        while let Some(msg) = backend_rx.next().await {
            let msg = msg?;
            match msg {
                TungMessage::Text(text) => {
                    if let Some(pool) = &pool {
                        if filter_engine
                            .should_drop_backend_text(pool, &text)
                            .await?
                        {
                            continue;
                        }
                    }
                    let _ = client_out_tx.send(Message::Text(text));
                }
                TungMessage::Binary(bin) => {
                    let _ = client_out_tx.send(Message::Binary(bin));
                }
                TungMessage::Ping(p) => {
                    let _ = client_out_tx.send(Message::Ping(p));
                }
                TungMessage::Pong(p) => {
                    let _ = client_out_tx.send(Message::Pong(p));
                }
                TungMessage::Close(frame) => {
                    let close = frame.map(|f| axum::extract::ws::CloseFrame {
                        code: f.code.into(),
                        reason: f.reason,
                    });
                    let _ = client_out_tx.send(Message::Close(close));
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
    if let (Some(pool), Some(log_id)) = (&pool, connection_log_id) {
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
