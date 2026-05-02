use anyhow::Context;
use axum::extract::ws::{Message, WebSocket};
use futures_util::{sink::SinkExt, stream::StreamExt};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message as TungMessage};

use crate::access::{
    evaluate_post, evaluate_quarantine, pubkey_hex_to_npub, IpAclCache, IpDecision, PostDecision,
    QuarantineDecision,
};
use crate::config::{PostPolicy, SettingsCache};
use crate::event_counter::{Action as CounterAction, EventCounter};
use crate::event_stream::{LiveEvent, LiveEventBus};
use crate::filter::engine::FilterEngine;
use crate::nostr::event::Event;
use crate::nostr::message::{parse_client_msg, ClientMsg, ParseClientMsgError};
use crate::session_registry::SessionRegistry;

const PING_INTERVAL_SECS: u64 = 30;
const CLIENT_TIMEOUT_SECS: u64 = 120;
const BACKEND_TIMEOUT_SECS: u64 = 90;

#[derive(Debug, Clone)]
struct ReqCacheEntry {
    req_text: String,
    eose_autoclose: bool,
}

#[derive(Clone)]
pub struct ProxyContext {
    pub pool: SqlitePool,
    pub settings: Arc<SettingsCache>,
    pub ip_acl: Arc<IpAclCache>,
    pub session_registry: Arc<SessionRegistry>,
    pub event_counter: Arc<EventCounter>,
    pub event_bus: Arc<LiveEventBus>,
}

pub async fn proxy_ws_with_ctx(
    client_ws: WebSocket,
    backend_url: String,
    ctx: ProxyContext,
    client_ip: String,
) -> anyhow::Result<()> {
    tracing::info!(ip = %client_ip, backend_url = %backend_url, "WebSocket connection established");

    // ── IP ACL 判定 ──
    let ip_decision = ctx.ip_acl.evaluate(&client_ip).await;
    match &ip_decision {
        IpDecision::HardBan => {
            tracing::warn!(ip = %client_ip, "IP hard_ban: rejecting connection");
            return Ok(());
        }
        IpDecision::ShadowBan => {
            tracing::warn!(ip = %client_ip, "IP shadow_ban: connection accepted but silenced");
        }
        _ => {}
    }
    let is_shadow = matches!(ip_decision, IpDecision::ShadowBan);
    let is_whitelisted = matches!(ip_decision, IpDecision::Whitelist);

    // 接続ログ
    let connection_log_id: Option<i64> = match sqlx::query(
        "INSERT INTO connection_logs (ip_address) VALUES (?) RETURNING id",
    )
    .bind(&client_ip)
    .fetch_optional(&ctx.pool)
    .await
    {
        Ok(Some(row)) => {
            use sqlx::Row;
            Some(row.get::<i64, _>("id"))
        }
        Ok(None) => None,
        Err(e) => {
            tracing::warn!(ip = %client_ip, error = %e, "Failed to create connection log");
            None
        }
    };

    ctx.event_bus.publish(LiveEvent::ConnectionOpened {
        ts: chrono::Utc::now().to_rfc3339(),
        ip: client_ip.clone(),
    });

    // 強制切断シグナル
    let (close_tx, mut close_rx) = tokio::sync::oneshot::channel::<()>();
    let session_id = ctx.session_registry.register(client_ip.clone(), close_tx);

    let (mut client_tx, mut client_rx) = client_ws.split();
    let mut filter_engine = FilterEngine::new();

    let (client_out_tx, mut client_out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let client_sender = tokio::spawn(async move {
        while let Some(msg) = client_out_rx.recv().await {
            if client_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    let mut last_client_activity = Instant::now();
    let mut req_cache: HashMap<String, ReqCacheEntry> = HashMap::new();
    let mut is_first_connect = true;
    let mut settings_watch = ctx.settings.watch();

    'reconnect: loop {
        tracing::info!(backend_url = %backend_url, "Connecting to backend relay");
        let backend_ws = match connect_async(&backend_url).await {
            Ok((ws, resp)) => {
                tracing::info!(backend_url = %backend_url, status = ?resp.status(), "Backend relay connected");
                ws
            }
            Err(e) => {
                if is_first_connect {
                    tracing::error!(backend_url = %backend_url, error = %e, "Failed to connect to backend");
                    break 'reconnect;
                }
                tracing::warn!(backend_url = %backend_url, error = %e, "reconnect failed, retrying");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue 'reconnect;
            }
        };
        is_first_connect = false;

        let (mut backend_tx, mut backend_rx) = backend_ws.split();
        let mut last_backend_activity = Instant::now();

        if !req_cache.is_empty() {
            for (sub_id, entry) in &req_cache {
                tracing::info!(sub_id = %sub_id, "Resending cached REQ");
                if backend_tx.send(TungMessage::Text(entry.req_text.clone())).await.is_err() {
                    continue 'reconnect;
                }
            }
        }

        let mut client_ping = tokio::time::interval(std::time::Duration::from_secs(PING_INTERVAL_SECS));
        client_ping.tick().await;
        let mut backend_ping = tokio::time::interval(std::time::Duration::from_secs(PING_INTERVAL_SECS));
        backend_ping.tick().await;
        let mut backend_disconnected = false;

        loop {
            tokio::select! {
                // 強制切断
                _ = &mut close_rx => {
                    tracing::info!(ip = %client_ip, "Force disconnect signal received");
                    return cleanup(client_out_tx, client_sender, &ctx, session_id, &client_ip, connection_log_id).await;
                }

                // 設定変更
                _ = settings_watch.changed() => {
                    tracing::debug!(ip = %client_ip, "settings reloaded");
                }

                // ── Client -> Backend ──
                msg = client_rx.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            last_client_activity = Instant::now();
                            match parse_client_msg(&text) {
                                Ok(ClientMsg::Event { event }) => {
                                    if !handle_post_event(
                                        &ctx,
                                        &mut filter_engine,
                                        &client_ip,
                                        is_shadow,
                                        is_whitelisted,
                                        &event,
                                        &client_out_tx,
                                        connection_log_id,
                                    ).await {
                                        // 拒否（または shadow drop）。バックエンドへは送らない。
                                        continue;
                                    }
                                    // 通過: そのまま転送
                                    if backend_tx.send(TungMessage::Text(text.clone())).await.is_err() {
                                        backend_disconnected = true;
                                        break;
                                    }
                                }
                                Ok(ClientMsg::Req { ref sub_id, .. }) => {
                                    // REQ 段の遮断: shadow_ban / quarantine(req)
                                    if is_shadow {
                                        let _ = client_out_tx.send(Message::Text(serde_json::json!(["EOSE", sub_id]).to_string()));
                                        continue;
                                    }
                                    let kinds = ctx.settings.eose_autoclose_kinds().await;
                                    let eose_autoclose = should_autoclose_on_eose(&text, &kinds);
                                    req_cache.insert(sub_id.clone(), ReqCacheEntry { req_text: text.clone(), eose_autoclose });
                                    if backend_tx.send(TungMessage::Text(text)).await.is_err() {
                                        backend_disconnected = true;
                                        break;
                                    }
                                }
                                Ok(ClientMsg::Close { ref sub_id }) => {
                                    req_cache.remove(sub_id);
                                    if backend_tx.send(TungMessage::Text(text)).await.is_err() {
                                        backend_disconnected = true;
                                        break;
                                    }
                                }
                                Err(ParseClientMsgError::UnsupportedCommand(_)) => {
                                    // 知らないコマンドはそのまま転送
                                    if backend_tx.send(TungMessage::Text(text)).await.is_err() {
                                        backend_disconnected = true;
                                        break;
                                    }
                                }
                                Err(_) => {
                                    // パース不能は black-hole
                                }
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
                            last_client_activity = Instant::now();
                            let _ = client_out_tx.send(Message::Pong(p));
                        }
                        Some(Ok(Message::Pong(_))) => {
                            last_client_activity = Instant::now();
                        }
                        Some(Ok(Message::Close(frame))) => {
                            tracing::info!(ip = %client_ip, "Client closed connection");
                            let close = frame.map(|f| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                                code: f.code.into(),
                                reason: f.reason,
                            });
                            let _ = backend_tx.send(TungMessage::Close(close)).await;
                            break;
                        }
                        Some(Err(e)) => { tracing::warn!(ip = %client_ip, error = %e, "client ws error"); break; }
                        None => { tracing::info!(ip = %client_ip, "client stream ended"); break; }
                    }
                }

                // ── Backend -> Client ──
                msg = backend_rx.next() => {
                    match msg {
                        Some(Ok(TungMessage::Text(text))) => {
                            last_backend_activity = Instant::now();

                            let outcome = filter_engine
                                .should_drop_backend_text_with_ip(&ctx.pool, &text, Some(&client_ip))
                                .await
                                .unwrap_or_else(|e| {
                                    tracing::error!(error = %e, "filter check error");
                                    crate::filter::engine::DropOutcome::pass()
                                });
                            if outcome.dropped {
                                if let Some(ev) = &outcome.event {
                                    ctx.event_counter.record(ev.kind, CounterAction::Rejected);
                                    ctx.event_bus.publish(LiveEvent::EventDropped {
                                        ts: chrono::Utc::now().to_rfc3339(),
                                        kind: ev.kind,
                                        npub: pubkey_hex_to_npub(&ev.pubkey).unwrap_or_default(),
                                        sub_id: text_sub_id(&text).unwrap_or_default(),
                                        reason: outcome.reason.clone().unwrap_or_default(),
                                    });
                                }
                                continue;
                            }

                            // OK / EOSE / CLOSED の追跡 + Quarantine(req) チェック
                            if let Some(action) = handle_backend_text(&ctx, &text, &mut req_cache, &client_ip, &client_out_tx, connection_log_id, is_shadow, is_whitelisted).await {
                                match action {
                                    BackendTextAction::SendCloseToBackend(sub_id) => {
                                        let close_msg = serde_json::json!(["CLOSE", sub_id]).to_string();
                                        if backend_tx.send(TungMessage::Text(close_msg)).await.is_err() {
                                            backend_disconnected = true;
                                            break;
                                        }
                                    }
                                    BackendTextAction::Drop => continue,
                                }
                            }

                            // shadow_ban: REQ レスポンスを送らない
                            if is_shadow {
                                continue;
                            }

                            if let Some(event) = outcome.event {
                                ctx.event_counter.record(event.kind, CounterAction::Delivered);
                                ctx.event_bus.publish(LiveEvent::EventDelivered {
                                    ts: chrono::Utc::now().to_rfc3339(),
                                    kind: event.kind,
                                    npub: pubkey_hex_to_npub(&event.pubkey).unwrap_or_default(),
                                    sub_id: text_sub_id(&text).unwrap_or_default(),
                                });
                            }
                            let _ = client_out_tx.send(Message::Text(text));
                        }
                        Some(Ok(TungMessage::Binary(bin))) => {
                            last_backend_activity = Instant::now();
                            if !is_shadow {
                                let _ = client_out_tx.send(Message::Binary(bin));
                            }
                        }
                        Some(Ok(TungMessage::Ping(p))) => {
                            last_backend_activity = Instant::now();
                            if backend_tx.send(TungMessage::Pong(p)).await.is_err() { backend_disconnected = true; break; }
                        }
                        Some(Ok(TungMessage::Pong(_))) => { last_backend_activity = Instant::now(); }
                        Some(Ok(TungMessage::Close(_))) => { backend_disconnected = true; break; }
                        Some(Err(e)) => { tracing::warn!(backend_url = %backend_url, error = %e, "backend ws error"); backend_disconnected = true; break; }
                        None => { backend_disconnected = true; break; }
                        _ => {}
                    }
                }

                _ = client_ping.tick() => {
                    if last_client_activity.elapsed() > std::time::Duration::from_secs(CLIENT_TIMEOUT_SECS) {
                        tracing::warn!(ip = %client_ip, "client timeout");
                        break;
                    }
                    if client_out_tx.send(Message::Ping(vec![])).is_err() { break; }
                }
                _ = backend_ping.tick() => {
                    if last_backend_activity.elapsed() > std::time::Duration::from_secs(BACKEND_TIMEOUT_SECS) {
                        tracing::warn!(backend_url = %backend_url, "backend timeout");
                        backend_disconnected = true;
                        break;
                    }
                    if backend_tx.send(TungMessage::Ping(vec![])).await.is_err() { backend_disconnected = true; break; }
                }
            }
        }

        if !backend_disconnected {
            break 'reconnect;
        }
        tracing::info!(backend_url = %backend_url, "backend disconnected, reconnecting");
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    cleanup(client_out_tx, client_sender, &ctx, session_id, &client_ip, connection_log_id).await
}

async fn cleanup(
    client_out_tx: tokio::sync::mpsc::UnboundedSender<Message>,
    client_sender: tokio::task::JoinHandle<()>,
    ctx: &ProxyContext,
    session_id: u64,
    client_ip: &str,
    connection_log_id: Option<i64>,
) -> anyhow::Result<()> {
    drop(client_out_tx);
    let _ = client_sender.await;
    ctx.session_registry.unregister(session_id);
    if let Some(log_id) = connection_log_id {
        let _ = sqlx::query("UPDATE connection_logs SET disconnected_at = datetime('now') WHERE id = ?")
            .bind(log_id)
            .execute(&ctx.pool)
            .await;
    }
    ctx.event_bus.publish(LiveEvent::ConnectionClosed {
        ts: chrono::Utc::now().to_rfc3339(),
        ip: client_ip.to_string(),
    });
    Ok(())
}

/// 戻り値 false = drop（バックエンド転送しない）, true = 通過。
async fn handle_post_event(
    ctx: &ProxyContext,
    filter_engine: &mut FilterEngine,
    client_ip: &str,
    is_shadow: bool,
    is_whitelisted: bool,
    event: &Event,
    client_out_tx: &tokio::sync::mpsc::UnboundedSender<Message>,
    connection_log_id: Option<i64>,
) -> bool {
    // shadow_ban: OK true で偽装し、転送しない
    if is_shadow {
        let _ = client_out_tx.send(Message::Text(
            serde_json::json!(["OK", event.id, true, ""]).to_string(),
        ));
        ctx.event_counter.record(event.kind, CounterAction::Rejected);
        return false;
    }

    // POST policy
    let policy = ctx.settings.post_policy().await;
    let post_decision = match evaluate_post(&ctx.pool, &event.pubkey, &policy).await {
        Ok(d) => d,
        Err(e) => {
            tracing::error!(error = %e, "evaluate_post failed");
            PostDecision::Deny("evaluate_error")
        }
    };

    if let PostDecision::Deny(reason) = post_decision {
        if !is_whitelisted {
            reject_post(ctx, event, client_ip, reason, client_out_tx, connection_log_id).await;
            return false;
        }
    }

    // Quarantine
    let npub = pubkey_hex_to_npub(&event.pubkey).unwrap_or_default();
    if !is_whitelisted {
        if let Ok(QuarantineDecision::Active(scope)) = evaluate_quarantine(&ctx.pool, &npub).await {
            if scope.covers_post() {
                let _ = client_out_tx.send(Message::Text(
                    serde_json::json!(["OK", event.id, true, ""]).to_string(),
                ));
                ctx.event_counter.record(event.kind, CounterAction::Rejected);
                ctx.event_bus.publish(LiveEvent::EventRejected {
                    ts: chrono::Utc::now().to_rfc3339(),
                    kind: event.kind,
                    npub,
                    ip: Some(client_ip.to_string()),
                    reason: "quarantine".into(),
                });
                if let Some(log_id) = connection_log_id {
                    let _ = sqlx::query("UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?")
                        .bind(log_id)
                        .execute(&ctx.pool)
                        .await;
                }
                return false;
            }
        }
    }

    // DSL / Simple BAN: POST 適用ルール
    if !is_whitelisted {
        match filter_engine.evaluate_post_extra(&ctx.pool, event).await {
            Ok(Some(reason)) => {
                let static_reason: &'static str = if reason.starts_with("filter_rule:") {
                    "filter_rule_post"
                } else {
                    "simple_ban_post"
                };
                reject_post(ctx, event, client_ip, static_reason, client_out_tx, connection_log_id).await;
                return false;
            }
            Ok(None) => {}
            Err(e) => tracing::warn!(error = %e, "evaluate_post_extra error"),
        }
    }

    // accepted
    ctx.event_counter.record(event.kind, CounterAction::Posted);
    ctx.event_bus.publish(LiveEvent::EventAccepted {
        ts: chrono::Utc::now().to_rfc3339(),
        kind: event.kind,
        npub,
        ip: Some(client_ip.to_string()),
    });
    true
}

async fn reject_post(
    ctx: &ProxyContext,
    event: &Event,
    client_ip: &str,
    reason: &str,
    client_out_tx: &tokio::sync::mpsc::UnboundedSender<Message>,
    connection_log_id: Option<i64>,
) {
    let npub = pubkey_hex_to_npub(&event.pubkey).unwrap_or_default();
    let _ = sqlx::query(
        "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&event.id)
    .bind(&event.pubkey)
    .bind(&npub)
    .bind(client_ip)
    .bind(event.kind)
    .bind(reason)
    .execute(&ctx.pool)
    .await;
    if let Some(log_id) = connection_log_id {
        let _ = sqlx::query("UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?")
            .bind(log_id)
            .execute(&ctx.pool)
            .await;
    }
    ctx.event_counter.record(event.kind, CounterAction::Rejected);
    ctx.event_bus.publish(LiveEvent::EventRejected {
        ts: chrono::Utc::now().to_rfc3339(),
        kind: event.kind,
        npub,
        ip: Some(client_ip.to_string()),
        reason: reason.to_string(),
    });
    let _ = client_out_tx.send(Message::Text(
        serde_json::json!(["OK", event.id, false, format!("blocked: {}", reason)]).to_string(),
    ));
}

enum BackendTextAction {
    SendCloseToBackend(String),
    Drop,
}

#[allow(clippy::too_many_arguments)]
async fn handle_backend_text(
    ctx: &ProxyContext,
    text: &str,
    req_cache: &mut HashMap<String, ReqCacheEntry>,
    client_ip: &str,
    _client_out_tx: &tokio::sync::mpsc::UnboundedSender<Message>,
    connection_log_id: Option<i64>,
    _is_shadow: bool,
    _is_whitelisted: bool,
) -> Option<BackendTextAction> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let arr = v.as_array()?;
    let msg_type = arr.first()?.as_str()?;
    match msg_type {
        "OK" => {
            let accepted = arr.get(2).and_then(|v| v.as_bool()).unwrap_or(false);
            if let Some(log_id) = connection_log_id {
                let q = if accepted {
                    "UPDATE connection_logs SET event_count = event_count + 1 WHERE id = ?"
                } else {
                    "UPDATE connection_logs SET rejected_event_count = rejected_event_count + 1 WHERE id = ?"
                };
                let _ = sqlx::query(q).bind(log_id).execute(&ctx.pool).await;
            }
            None
        }
        "EOSE" => {
            let sub_id = arr.get(1)?.as_str()?;
            if let Some(entry) = req_cache.get(sub_id).cloned() {
                if entry.eose_autoclose {
                    req_cache.remove(sub_id);
                    return Some(BackendTextAction::SendCloseToBackend(sub_id.to_string()));
                }
            }
            None
        }
        "CLOSED" => {
            if let Some(sub_id) = arr.get(1).and_then(|v| v.as_str()) {
                req_cache.remove(sub_id);
            }
            None
        }
        _ => {
            // event の sub_id を眺めて quarantine(req) なら drop
            if msg_type == "EVENT" {
                let _ = (ctx, client_ip);
            }
            None
        }
    }
}

fn text_sub_id(text: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    let arr = v.as_array()?;
    arr.get(1)?.as_str().map(|s| s.to_string())
}

fn should_autoclose_on_eose(req_text: &str, target_kinds: &std::collections::HashSet<i64>) -> bool {
    if target_kinds.is_empty() {
        return false;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(req_text) else {
        return false;
    };
    let Some(arr) = v.as_array() else { return false };
    if arr.first().and_then(|x| x.as_str()) != Some("REQ") {
        return false;
    }
    let filters: Vec<&serde_json::Value> = arr.iter().skip(2).collect();
    if filters.is_empty() {
        return false;
    }
    filters.into_iter().all(|filter| {
        let Some(obj) = filter.as_object() else { return false };
        let Some(kinds_val) = obj.get("kinds") else { return false };
        let Some(kinds) = kinds_val.as_array() else { return false };
        !kinds.is_empty()
            && kinds
                .iter()
                .filter_map(|k| k.as_i64())
                .all(|k| target_kinds.contains(&k))
    })
}

/// 互換 API: 旧シグネチャ。新規呼び出しは `proxy_ws_with_ctx` を使うこと。
pub async fn proxy_ws(_client_ws: WebSocket, _backend_url: String) -> anyhow::Result<()> {
    anyhow::bail!("proxy_ws is deprecated; use proxy_ws_with_ctx")
}

/// レガシー互換: 旧 `proxy_ws_with_pool` のシグネチャを残しておく。
/// 新しい呼び出し元には `proxy_ws_with_ctx` を使うことを推奨。
#[deprecated(note = "use proxy_ws_with_ctx")]
pub async fn proxy_ws_with_pool(
    _client_ws: WebSocket,
    _backend_url: String,
    _pool: Option<SqlitePool>,
    _client_ip: Option<String>,
) -> anyhow::Result<()> {
    anyhow::bail!("proxy_ws_with_pool is removed; use proxy_ws_with_ctx")
}
