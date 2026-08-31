use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::sse::{Event as SseEvent, KeepAlive, Sse},
    routing::{delete, get, post, put},
    Json, Router,
};
use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::convert::Infallible;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::Arc;
use tokio_stream::{wrappers::BroadcastStream, StreamExt as _};

use crate::access::IpAclCache;
use crate::auth_throttle::AuthThrottle;
use crate::config::SettingsCache;
use crate::event_stream::LiveEventBus;
use crate::guard::AutoGuard;
use crate::nostr::event::Event as NostrEvent;
use crate::parser::filter_query;
use crate::parser::translate;
use crate::relay_pool::RelayPool;
use crate::session_registry::SessionRegistry;
use crate::{auth, auth::AuthState};

#[derive(Clone)]
pub struct ApiState {
    pub pool: SqlitePool,
    pub relay_pool: Arc<RelayPool>,
    pub settings: Arc<SettingsCache>,
    pub ip_acl: Arc<IpAclCache>,
    pub session_registry: Arc<SessionRegistry>,
    pub event_bus: Arc<LiveEventBus>,
    pub auto_guard: Arc<AutoGuard>,
}

pub fn router(state: ApiState, throttle: AuthThrottle) -> Router {
    let auth_state = AuthState {
        pool: state.pool.clone(),
        throttle,
    };

    Router::new()
        .route("/relay", get(get_relays).put(put_relays))
        .route("/relay-status", get(get_relay_status))
        .route("/relay-nip11", get(get_relay_nip11))
        .route("/safelist", get(list_safelist).post(upsert_safelist))
        .route("/safelist/:npub", delete(delete_safelist))
        .route("/safelist/:npub/ban", put(ban_npub))
        .route("/safelist/:npub/unban", put(unban_npub))
        .route("/filters", get(list_filters).post(create_filter))
        .route("/filters/:id", put(update_filter).delete(delete_filter))
        .route("/filters/validate", post(validate_filter))
        .route(
            "/ip-access-control",
            get(list_ip_access_control).post(create_ip_access_control),
        )
        .route(
            "/ip-access-control/:id",
            put(update_ip_access_control).delete(delete_ip_access_control),
        )
        .route(
            "/req-kind-blacklist",
            get(list_req_kind_blacklist).post(create_req_kind_blacklist),
        )
        .route(
            "/req-kind-blacklist/:id",
            put(update_req_kind_blacklist).delete(delete_req_kind_blacklist),
        )
        .route("/connection-logs", get(get_connection_logs))
        .route("/event-rejection-logs", get(get_event_rejection_logs))
        .route("/relay-event-logs", get(get_relay_event_logs))
        .route("/stats", get(get_stats))
        .route("/stats/timeseries", get(get_stats_timeseries))
        .route("/relay-info", get(get_relay_info).put(put_relay_info))
        .route("/app-version", get(get_app_version))
        .route(
            "/simple-ban-rules",
            get(list_simple_ban_rules).post(create_simple_ban_rule),
        )
        .route(
            "/simple-ban-rules/:id",
            put(update_simple_ban_rule).delete(delete_simple_ban_rule),
        )
        .route("/quarantine", get(list_quarantine).post(create_quarantine))
        .route("/quarantine/:id", delete(delete_quarantine))
        .route(
            "/post-policy",
            get(get_post_policy).put(put_post_policy),
        )
        .route("/auto-guard", get(get_auto_guard).put(put_auto_guard))
        .route("/auto-guard/content-mutes", delete(clear_auto_guard_content_mutes))
        .route("/translate/simple-to-dsl", post(translate_simple_to_dsl))
        .route("/translate/dsl-to-simple", post(translate_dsl_to_simple))
        .route("/translate/dry-run", post(dry_run_filter))
        .route("/events/stream", get(sse_event_stream))
        .merge(super::system::routes())
        .merge(super::actors::routes())
        .with_state(state)
        .layer(axum::middleware::from_fn_with_state(
            auth_state,
            auth::basic_auth,
        ))
}

// ── 共通: api state extractor を State<ApiState> として使う ──

async fn get_relay_status(State(s): State<ApiState>) -> Json<serde_json::Value> {
    let relays = s.relay_pool.status_snapshot().await;
    Json(serde_json::json!({ "relays": relays }))
}

#[derive(Serialize)]
struct AppVersionResponse {
    version: &'static str,
}

async fn get_app_version() -> Json<AppVersionResponse> {
    Json(AppVersionResponse {
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Debug, serde::Deserialize)]
pub struct RelayNip11Query {
    pub url: String,
}

async fn get_relay_nip11(
    Query(q): Query<RelayNip11Query>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let url = q.url.trim();
    if url.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "missing url".into()));
    }
    let parsed = url::Url::parse(url)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid url: {e}")))?;
    match parsed.scheme() {
        "ws" | "wss" | "http" | "https" => {}
        other => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("unsupported scheme: {other}"),
            ))
        }
    }
    if let Some(host) = parsed.host_str() {
        if is_blocked_host(host) {
            return Err((
                StatusCode::FORBIDDEN,
                format!("relay host is blocked: {host}"),
            ));
        }
    } else {
        return Err((StatusCode::BAD_REQUEST, "missing host".into()));
    }

    let http_url = url
        .replace("wss://", "https://")
        .replace("ws://", "http://");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let resp = client
        .get(&http_url)
        .header("Accept", "application/nostr+json")
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    if !resp.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            format!("relay returned {}", resp.status()),
        ));
    }
    let body = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;
    Ok(Json(body))
}

fn is_blocked_host(host: &str) -> bool {
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return ip.is_loopback() || is_private_ip(&ip) || is_link_local(&ip);
    }
    false
}

fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private(),
        IpAddr::V6(_) => false,
    }
}

fn is_link_local(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_link_local(),
        IpAddr::V6(v6) => v6.segments().first().copied() == Some(0xfe80),
    }
}

// ── relays ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayConfigRow {
    pub url: String,
    pub enabled: bool,
    #[serde(default = "default_role")]
    pub role: String,
    #[serde(default = "default_weight")]
    pub weight: i64,
    #[serde(default = "default_true")]
    pub read_enabled: bool,
    #[serde(default = "default_true")]
    pub write_enabled: bool,
}

fn default_role() -> String { "primary".to_string() }
fn default_weight() -> i64 { 1 }
fn default_true() -> bool { true }

async fn get_relays(State(s): State<ApiState>) -> Json<Vec<RelayConfigRow>> {
    let rows = sqlx::query_as::<_, (String, i64, String, i64, i64, i64)>(
        "SELECT url, enabled, role, weight, read_enabled, write_enabled FROM relay_config ORDER BY id ASC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(url, enabled, role, weight, read_enabled, write_enabled)| RelayConfigRow {
                url,
                enabled: enabled != 0,
                role,
                weight,
                read_enabled: read_enabled != 0,
                write_enabled: write_enabled != 0,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PutRelaysBody {
    pub relays: Vec<RelayConfigRow>,
}

async fn put_relays(State(s): State<ApiState>, Json(body): Json<PutRelaysBody>) -> Json<()> {
    let submitted_urls: Vec<&str> = body.relays.iter().map(|r| r.url.as_str()).collect();

    if submitted_urls.is_empty() {
        let _ = sqlx::query("DELETE FROM relay_config").execute(&s.pool).await;
    } else {
        let placeholders: Vec<String> = (0..submitted_urls.len()).map(|_| "?".into()).collect();
        let q = format!(
            "DELETE FROM relay_config WHERE url NOT IN ({})",
            placeholders.join(", ")
        );
        let mut query = sqlx::query(&q);
        for url in &submitted_urls {
            query = query.bind(url);
        }
        let _ = query.execute(&s.pool).await;
    }

    for r in body.relays {
        let enabled = if r.enabled { 1i64 } else { 0i64 };
        let read_enabled = if r.read_enabled { 1i64 } else { 0i64 };
        let write_enabled = if r.write_enabled { 1i64 } else { 0i64 };
        let _ = sqlx::query(
            "INSERT INTO relay_config (url, enabled, role, weight, read_enabled, write_enabled) VALUES (?, ?, ?, ?, ?, ?) \
             ON CONFLICT(url) DO UPDATE SET \
               enabled = excluded.enabled, \
               role = excluded.role, \
               weight = excluded.weight, \
               read_enabled = excluded.read_enabled, \
               write_enabled = excluded.write_enabled, \
               updated_at = datetime('now')",
        )
        .bind(r.url)
        .bind(enabled)
        .bind(r.role)
        .bind(r.weight)
        .bind(read_enabled)
        .bind(write_enabled)
        .execute(&s.pool)
        .await;
    }
    // live な fanout 接続にバックエンドリレーの変更を再起動なしで反映させる。
    s.settings.notify();
    Json(())
}

// ── safelist ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafelistRow {
    pub npub: String,
    pub flags: i64,
    pub memo: String,
    #[serde(default)]
    pub banned: bool,
}

async fn list_safelist(State(s): State<ApiState>) -> Json<Vec<SafelistRow>> {
    let rows = sqlx::query_as::<_, (String, i64, String, i64)>(
        "SELECT npub, flags, memo, banned FROM safelist ORDER BY created_at ASC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(npub, flags, memo, banned)| SafelistRow {
                npub,
                flags,
                memo,
                banned: banned != 0,
            })
            .collect(),
    )
}

async fn upsert_safelist(State(s): State<ApiState>, Json(body): Json<SafelistRow>) -> Json<()> {
    let _ = sqlx::query(
        "INSERT INTO safelist (npub, flags, memo) VALUES (?, ?, ?) \
         ON CONFLICT(npub) DO UPDATE SET flags = excluded.flags, memo = excluded.memo",
    )
    .bind(&body.npub)
    .bind(body.flags)
    .bind(&body.memo)
    .execute(&s.pool)
    .await;
    Json(())
}

async fn delete_safelist(State(s): State<ApiState>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM safelist WHERE npub = ?")
        .bind(npub)
        .execute(&s.pool)
        .await;
    Json(())
}

async fn ban_npub(State(s): State<ApiState>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("UPDATE safelist SET banned = 1 WHERE npub = ?")
        .bind(npub)
        .execute(&s.pool)
        .await;
    Json(())
}

async fn unban_npub(State(s): State<ApiState>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("UPDATE safelist SET banned = 0 WHERE npub = ?")
        .bind(npub)
        .execute(&s.pool)
        .await;
    Json(())
}

// ── filter rules (DSL) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterRow {
    pub id: i64,
    pub name: String,
    pub nl_text: String,
    pub parsed_json: String,
    pub enabled: bool,
    pub rule_order: i64,
    pub apply_to_post: bool,
    pub apply_to_backend: bool,
}

async fn list_filters(State(s): State<ApiState>) -> Json<Vec<FilterRow>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, nl_text, parsed_json, enabled, rule_order, apply_to_post, apply_to_backend \
         FROM filter_rules ORDER BY rule_order ASC, id ASC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, name, nl_text, parsed_json, enabled, rule_order, apply_to_post, apply_to_backend)| FilterRow {
                id,
                name,
                nl_text,
                parsed_json,
                enabled: enabled != 0,
                rule_order,
                apply_to_post: apply_to_post != 0,
                apply_to_backend: apply_to_backend != 0,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFilterBody {
    pub name: String,
    pub nl_text: String,
    #[serde(default)]
    pub apply_to_post: Option<bool>,
    #[serde(default)]
    pub apply_to_backend: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
}

async fn create_filter(
    State(s): State<ApiState>,
    Json(body): Json<CreateFilterBody>,
) -> Json<FilterResponse> {
    let validation = filter_query::validate(&body.nl_text);
    if !validation.valid {
        return Json(FilterResponse {
            success: false,
            error: validation.error,
            id: None,
        });
    }
    let apply_post = if body.apply_to_post.unwrap_or(false) { 1i64 } else { 0i64 };
    let apply_backend = if body.apply_to_backend.unwrap_or(true) { 1i64 } else { 0i64 };
    match sqlx::query(
        "INSERT INTO filter_rules (name, nl_text, parsed_json, enabled, rule_order, apply_to_post, apply_to_backend) \
         VALUES (?, ?, ?, 1, 0, ?, ?)",
    )
    .bind(&body.name)
    .bind(&body.nl_text)
    .bind(&body.nl_text)
    .bind(apply_post)
    .bind(apply_backend)
    .execute(&s.pool)
    .await
    {
        Ok(result) => Json(FilterResponse {
            success: true,
            error: None,
            id: Some(result.last_insert_rowid()),
        }),
        Err(e) => Json(FilterResponse {
            success: false,
            error: Some(format!("Database error: {}", e)),
            id: None,
        }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFilterBody {
    pub name: String,
    pub nl_text: String,
    pub enabled: bool,
    pub rule_order: i64,
    #[serde(default)]
    pub apply_to_post: Option<bool>,
    #[serde(default)]
    pub apply_to_backend: Option<bool>,
}

async fn update_filter(
    State(s): State<ApiState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateFilterBody>,
) -> Json<FilterResponse> {
    let validation = filter_query::validate(&body.nl_text);
    if !validation.valid {
        return Json(FilterResponse {
            success: false,
            error: validation.error,
            id: Some(id),
        });
    }
    let enabled = if body.enabled { 1i64 } else { 0i64 };
    let apply_post = if body.apply_to_post.unwrap_or(false) { 1i64 } else { 0i64 };
    let apply_backend = if body.apply_to_backend.unwrap_or(true) { 1i64 } else { 0i64 };
    match sqlx::query(
        "UPDATE filter_rules SET name = ?, nl_text = ?, parsed_json = ?, enabled = ?, rule_order = ?, \
            apply_to_post = ?, apply_to_backend = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.nl_text)
    .bind(&body.nl_text)
    .bind(enabled)
    .bind(body.rule_order)
    .bind(apply_post)
    .bind(apply_backend)
    .bind(id)
    .execute(&s.pool)
    .await
    {
        Ok(_) => Json(FilterResponse {
            success: true,
            error: None,
            id: Some(id),
        }),
        Err(e) => Json(FilterResponse {
            success: false,
            error: Some(format!("Database error: {}", e)),
            id: Some(id),
        }),
    }
}

async fn delete_filter(State(s): State<ApiState>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM filter_rules WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await;
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateFilterBody {
    pub query: String,
}

async fn validate_filter(
    Json(body): Json<ValidateFilterBody>,
) -> Json<filter_query::ValidationResult> {
    Json(filter_query::validate(&body.query))
}

// ── IP access control ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpAccessControlRow {
    pub id: Option<i64>,
    pub ip_address: String,
    pub mode: String,
    pub is_cidr: bool,
    pub memo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIpAccessControlBody {
    pub ip_address: String,
    pub mode: String,
    pub memo: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIpAccessControlBody {
    pub ip_address: String,
    pub mode: String,
    pub memo: String,
}

async fn list_ip_access_control(State(s): State<ApiState>) -> Json<Vec<IpAccessControlRow>> {
    let rows = sqlx::query_as::<_, (i64, String, String, i64, String)>(
        "SELECT id, ip_address, mode, is_cidr, memo FROM ip_access_control ORDER BY created_at DESC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, ip_address, mode, is_cidr, memo)| IpAccessControlRow {
                id: Some(id),
                ip_address,
                mode,
                is_cidr: is_cidr != 0,
                memo,
            })
            .collect(),
    )
}

async fn create_ip_access_control(
    State(s): State<ApiState>,
    Json(body): Json<CreateIpAccessControlBody>,
) -> Result<Json<()>, (StatusCode, String)> {
    let mode = validate_ip_mode(&body.mode)?;
    let is_cidr = parse_ip_or_cidr(&body.ip_address)?;
    let _ = sqlx::query(
        "INSERT INTO ip_access_control (ip_address, mode, is_cidr, memo) VALUES (?, ?, ?, ?) \
         ON CONFLICT(ip_address) DO UPDATE SET mode = excluded.mode, is_cidr = excluded.is_cidr, memo = excluded.memo, updated_at = datetime('now')",
    )
    .bind(&body.ip_address)
    .bind(mode)
    .bind(if is_cidr { 1i64 } else { 0i64 })
    .bind(&body.memo)
    .execute(&s.pool)
    .await;
    s.ip_acl.invalidate().await;
    if mode == "hard_ban" {
        force_disconnect(&s, &body.ip_address, is_cidr).await;
    }
    Ok(Json(()))
}

async fn update_ip_access_control(
    State(s): State<ApiState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateIpAccessControlBody>,
) -> Result<Json<()>, (StatusCode, String)> {
    let mode = validate_ip_mode(&body.mode)?;
    let is_cidr = parse_ip_or_cidr(&body.ip_address)?;
    let _ = sqlx::query(
        "UPDATE ip_access_control SET ip_address = ?, mode = ?, is_cidr = ?, memo = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.ip_address)
    .bind(mode)
    .bind(if is_cidr { 1i64 } else { 0i64 })
    .bind(&body.memo)
    .bind(id)
    .execute(&s.pool)
    .await;
    s.ip_acl.invalidate().await;
    if mode == "hard_ban" {
        force_disconnect(&s, &body.ip_address, is_cidr).await;
    }
    Ok(Json(()))
}

async fn delete_ip_access_control(State(s): State<ApiState>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM ip_access_control WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await;
    s.ip_acl.invalidate().await;
    Json(())
}

fn validate_ip_mode(mode: &str) -> Result<&'static str, (StatusCode, String)> {
    Ok(match mode {
        "hard_ban" => "hard_ban",
        "shadow_ban" => "shadow_ban",
        "whitelist" => "whitelist",
        "normal" => "normal",
        other => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("invalid mode: {other}"),
            ))
        }
    })
}

fn parse_ip_or_cidr(s: &str) -> Result<bool, (StatusCode, String)> {
    if s.contains('/') {
        IpNet::from_str(s).map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid CIDR: {e}")))?;
        Ok(true)
    } else {
        IpAddr::from_str(s).map_err(|e| (StatusCode::BAD_REQUEST, format!("invalid IP: {e}")))?;
        Ok(false)
    }
}

async fn force_disconnect(state: &ApiState, ip_or_cidr: &str, is_cidr: bool) {
    if is_cidr {
        let net = IpNet::from_str(ip_or_cidr).ok();
        if let Some(net) = net {
            let n = state
                .session_registry
                .force_disconnect_where(|ip| net.contains(ip))
                .await;
            tracing::info!(cidr = %ip_or_cidr, count = n, "Forced disconnect for CIDR");
        }
    } else {
        let n = state.session_registry.force_disconnect_exact(ip_or_cidr).await;
        tracing::info!(ip = %ip_or_cidr, count = n, "Forced disconnect for IP");
    }
}

// ── REQ kind blacklist ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReqKindBlacklistRow {
    pub id: i64,
    pub kind_value: Option<i64>,
    pub kind_min: Option<i64>,
    pub kind_max: Option<i64>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReqKindBlacklistBody {
    pub kind_value: Option<i64>,
    pub kind_min: Option<i64>,
    pub kind_max: Option<i64>,
    pub enabled: bool,
}

async fn list_req_kind_blacklist(State(s): State<ApiState>) -> Json<Vec<ReqKindBlacklistRow>> {
    let rows = sqlx::query_as::<_, (i64, Option<i64>, Option<i64>, Option<i64>, i64)>(
        "SELECT id, kind_value, kind_min, kind_max, enabled FROM req_kind_blacklist ORDER BY created_at DESC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, kind_value, kind_min, kind_max, enabled)| ReqKindBlacklistRow {
                id,
                kind_value,
                kind_min,
                kind_max,
                enabled: enabled != 0,
            })
            .collect(),
    )
}

async fn create_req_kind_blacklist(
    State(s): State<ApiState>,
    Json(body): Json<CreateReqKindBlacklistBody>,
) -> Json<()> {
    let _ = sqlx::query(
        "INSERT INTO req_kind_blacklist (kind_value, kind_min, kind_max, enabled) VALUES (?, ?, ?, ?)",
    )
    .bind(body.kind_value)
    .bind(body.kind_min)
    .bind(body.kind_max)
    .bind(if body.enabled { 1i64 } else { 0i64 })
    .execute(&s.pool)
    .await;
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateReqKindBlacklistBody {
    pub kind_value: Option<i64>,
    pub kind_min: Option<i64>,
    pub kind_max: Option<i64>,
    pub enabled: bool,
}

async fn update_req_kind_blacklist(
    State(s): State<ApiState>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateReqKindBlacklistBody>,
) -> Json<()> {
    let _ = sqlx::query(
        "UPDATE req_kind_blacklist SET kind_value = ?, kind_min = ?, kind_max = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.kind_value)
    .bind(body.kind_min)
    .bind(body.kind_max)
    .bind(if body.enabled { 1i64 } else { 0i64 })
    .bind(id)
    .execute(&s.pool)
    .await;
    Json(())
}

async fn delete_req_kind_blacklist(State(s): State<ApiState>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM req_kind_blacklist WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await;
    Json(())
}

// ── ログ・統計 ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionLogRow {
    pub id: i64,
    pub ip_address: String,
    pub connected_at: String,
    pub disconnected_at: Option<String>,
    pub event_count: i64,
    pub rejected_event_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetConnectionLogsQuery {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub ip_address: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

async fn get_connection_logs(
    State(s): State<ApiState>,
    Query(params): Query<GetConnectionLogsQuery>,
) -> Json<Vec<ConnectionLogRow>> {
    let limit = params.limit.unwrap_or(100).min(500);
    let offset = params.offset.unwrap_or(0);
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, i64, i64)>(
        "SELECT id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count \
         FROM connection_logs \
         WHERE (? IS NULL OR ip_address LIKE '%' || ? || '%') \
           AND (connected_at >= ? OR ? IS NULL) \
           AND (connected_at <= ? OR ? IS NULL) \
         ORDER BY connected_at DESC LIMIT ? OFFSET ?",
    )
    .bind(params.ip_address.as_deref())
    .bind(params.ip_address.as_deref().unwrap_or(""))
    .bind(params.from.as_deref())
    .bind(params.from.as_deref())
    .bind(params.to.as_deref())
    .bind(params.to.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count)| ConnectionLogRow {
                id,
                ip_address,
                connected_at,
                disconnected_at,
                event_count,
                rejected_event_count,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRejectionLogRow {
    pub id: i64,
    pub event_id: String,
    pub pubkey_hex: String,
    pub npub: String,
    pub ip_address: Option<String>,
    pub kind: i64,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetEventRejectionLogsQuery {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub npub: Option<String>,
    #[serde(default)]
    pub kind: Option<i64>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

async fn get_event_rejection_logs(
    State(s): State<ApiState>,
    Query(params): Query<GetEventRejectionLogsQuery>,
) -> Json<Vec<EventRejectionLogRow>> {
    let limit = params.limit.unwrap_or(100).min(500);
    let offset = params.offset.unwrap_or(0);
    let rows = sqlx::query_as::<_, (i64, String, String, String, Option<String>, i64, String, String)>(
        "SELECT id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at \
         FROM event_rejection_logs \
         WHERE (? IS NULL OR npub LIKE '%' || ? || '%') \
           AND (kind = ? OR ? IS NULL) \
           AND (? IS NULL OR reason LIKE '%' || ? || '%') \
           AND (created_at >= ? OR ? IS NULL) \
           AND (created_at <= ? OR ? IS NULL) \
         ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(params.npub.as_deref())
    .bind(params.npub.as_deref().unwrap_or(""))
    .bind(params.kind)
    .bind(params.kind)
    .bind(params.reason.as_deref())
    .bind(params.reason.as_deref().unwrap_or(""))
    .bind(params.from.as_deref())
    .bind(params.from.as_deref())
    .bind(params.to.as_deref())
    .bind(params.to.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at)| EventRejectionLogRow {
                id,
                event_id,
                pubkey_hex,
                npub,
                ip_address,
                kind,
                reason,
                created_at,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayEventLogRow {
    pub id: i64,
    pub relay_url: String,
    pub event_type: String,
    pub detail: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetRelayEventLogsQuery {
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub relay_url: Option<String>,
    #[serde(default)]
    pub event_type: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

async fn get_relay_event_logs(
    State(s): State<ApiState>,
    Query(params): Query<GetRelayEventLogsQuery>,
) -> Json<Vec<RelayEventLogRow>> {
    let limit = params.limit.unwrap_or(100).min(500);
    let rows = sqlx::query_as::<_, (i64, String, String, String, String)>(
        "SELECT id, relay_url, event_type, detail, created_at FROM relay_event_logs \
         WHERE (? IS NULL OR relay_url LIKE '%' || ? || '%') \
           AND (? IS NULL OR event_type = ?) \
           AND (created_at >= ? OR ? IS NULL) \
           AND (created_at <= ? OR ? IS NULL) \
         ORDER BY created_at DESC LIMIT ?",
    )
    .bind(params.relay_url.as_deref())
    .bind(params.relay_url.as_deref().unwrap_or(""))
    .bind(params.event_type.as_deref())
    .bind(params.event_type.as_deref().unwrap_or(""))
    .bind(params.from.as_deref())
    .bind(params.from.as_deref())
    .bind(params.to.as_deref())
    .bind(params.to.as_deref())
    .bind(limit)
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, relay_url, event_type, detail, created_at)| RelayEventLogRow {
                id,
                relay_url,
                event_type,
                detail,
                created_at,
            })
            .collect(),
    )
}

// ── stats ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsResponse {
    pub total_connections: i64,
    pub active_connections: i64,
    pub total_rejections: i64,
    pub rejections_by_reason: Vec<RejectionReasonCount>,
    pub top_npubs_by_rejections: Vec<NpubRejectionCount>,
    pub top_ips_by_rejections: Vec<IpRejectionCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectionReasonCount {
    pub reason: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpubRejectionCount {
    pub npub: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpRejectionCount {
    pub ip_address: String,
    pub count: i64,
}

async fn get_stats(State(s): State<ApiState>) -> Json<StatsResponse> {
    let total_connections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM connection_logs")
        .fetch_one(&s.pool)
        .await
        .unwrap_or((0,));
    let active_connections: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM connection_logs WHERE disconnected_at IS NULL",
    )
    .fetch_one(&s.pool)
    .await
    .unwrap_or((0,));
    let total_rejections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM event_rejection_logs")
        .fetch_one(&s.pool)
        .await
        .unwrap_or((0,));
    let rejections_by_reason_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT reason, COUNT(*) FROM event_rejection_logs GROUP BY reason ORDER BY 2 DESC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    let top_npubs_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT npub, COUNT(*) FROM event_rejection_logs GROUP BY npub ORDER BY 2 DESC LIMIT 10",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    let top_ips_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT ip_address, COUNT(*) FROM event_rejection_logs WHERE ip_address IS NOT NULL GROUP BY ip_address ORDER BY 2 DESC LIMIT 10",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(StatsResponse {
        total_connections: total_connections.0,
        active_connections: active_connections.0,
        total_rejections: total_rejections.0,
        rejections_by_reason: rejections_by_reason_rows
            .into_iter()
            .map(|(reason, count)| RejectionReasonCount { reason, count })
            .collect(),
        top_npubs_by_rejections: top_npubs_rows
            .into_iter()
            .map(|(npub, count)| NpubRejectionCount { npub, count })
            .collect(),
        top_ips_by_rejections: top_ips_rows
            .into_iter()
            .map(|(ip_address, count)| IpRejectionCount { ip_address, count })
            .collect(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetStatsTimeseriesQuery {
    #[serde(default)]
    pub period: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsTimeseriesBucket {
    pub time: String,
    pub posted: i64,
    pub delivered: i64,
    pub rejections: i64,
}

async fn get_stats_timeseries(
    State(s): State<ApiState>,
    Query(params): Query<GetStatsTimeseriesQuery>,
) -> Json<Vec<StatsTimeseriesBucket>> {
    // 期間: '1h' (60min, 1分粒度), '24h' (1440min, 5分粒度), '1d' (1440min, 60分粒度)
    let (window_min, granularity) = match params.period.as_deref() {
        Some("15m") => (15, 1),
        Some("6h") => (6 * 60, 5),
        Some("24h") => (24 * 60, 5),
        Some("1d") => (24 * 60, 60),
        Some("7d") => (7 * 24 * 60, 60),
        _ => (60, 1), // default = 1h
    };
    let now_min = chrono::Utc::now().timestamp() / 60;
    let from_min = now_min - window_min as i64;

    let rows = sqlx::query_as::<_, (i64, String, i64)>(
        "SELECT (bucket_minute / ?) * ? AS bucket, action, SUM(count) \
         FROM event_counters \
         WHERE bucket_minute >= ? \
         GROUP BY bucket, action \
         ORDER BY bucket ASC",
    )
    .bind(granularity)
    .bind(granularity)
    .bind(from_min)
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();

    use std::collections::BTreeMap;
    let mut map: BTreeMap<i64, StatsTimeseriesBucket> = BTreeMap::new();
    for (bucket, action, count) in rows {
        let entry = map.entry(bucket).or_insert_with(|| {
            let dt = chrono::DateTime::<chrono::Utc>::from_timestamp(bucket * 60, 0)
                .unwrap_or_default();
            StatsTimeseriesBucket {
                time: dt.format("%Y-%m-%d %H:%M").to_string(),
                posted: 0,
                delivered: 0,
                rejections: 0,
            }
        });
        match action.as_str() {
            "posted" => entry.posted = count,
            "delivered" => entry.delivered = count,
            "rejected" => entry.rejections = count,
            _ => {}
        }
    }
    Json(map.into_values().collect())
}

// ── Simple BAN rules ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleBanRuleRow {
    pub id: i64,
    pub rule_type: String,
    pub npub_list: Option<String>,
    pub kind_list: Option<String>,
    pub tag_name: Option<String>,
    pub tag_value_pattern: Option<String>,
    pub enabled: bool,
    pub apply_to_post: bool,
    pub apply_to_backend: bool,
    pub memo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSimpleBanRuleBody {
    pub rule_type: String,
    pub npub_list: Option<String>,
    pub kind_list: Option<String>,
    pub tag_name: Option<String>,
    pub tag_value_pattern: Option<String>,
    pub enabled: Option<bool>,
    #[serde(default)]
    pub apply_to_post: Option<bool>,
    #[serde(default)]
    pub apply_to_backend: Option<bool>,
    pub memo: Option<String>,
}

async fn list_simple_ban_rules(State(s): State<ApiState>) -> Json<Vec<SimpleBanRuleRow>> {
    let rows = sqlx::query_as::<_, (i64, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64, Option<String>, String, String)>(
        "SELECT id, rule_type, npub_list, kind_list, tag_name, tag_value_pattern, enabled, apply_to_post, apply_to_backend, memo, created_at, updated_at \
         FROM simple_ban_rules ORDER BY id ASC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, rule_type, npub_list, kind_list, tag_name, tag_value_pattern, enabled, apply_to_post, apply_to_backend, memo, created_at, updated_at)| SimpleBanRuleRow {
                id,
                rule_type,
                npub_list,
                kind_list,
                tag_name,
                tag_value_pattern,
                enabled: enabled != 0,
                apply_to_post: apply_to_post != 0,
                apply_to_backend: apply_to_backend != 0,
                memo,
                created_at,
                updated_at,
            })
            .collect(),
    )
}

async fn create_simple_ban_rule(
    State(s): State<ApiState>,
    Json(body): Json<CreateSimpleBanRuleBody>,
) -> Json<SimpleBanRuleRow> {
    let enabled = body.enabled.unwrap_or(true);
    let apply_post = body.apply_to_post.unwrap_or(false);
    let apply_backend = body.apply_to_backend.unwrap_or(true);
    let _ = sqlx::query(
        "INSERT INTO simple_ban_rules (rule_type, npub_list, kind_list, tag_name, tag_value_pattern, enabled, apply_to_post, apply_to_backend, memo) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&body.rule_type)
    .bind(body.npub_list.as_deref())
    .bind(body.kind_list.as_deref())
    .bind(body.tag_name.as_deref())
    .bind(body.tag_value_pattern.as_deref())
    .bind(if enabled { 1i64 } else { 0i64 })
    .bind(if apply_post { 1i64 } else { 0i64 })
    .bind(if apply_backend { 1i64 } else { 0i64 })
    .bind(body.memo.as_deref())
    .execute(&s.pool)
    .await;
    let row: (i64, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64, Option<String>, String, String) = sqlx::query_as(
        "SELECT id, rule_type, npub_list, kind_list, tag_name, tag_value_pattern, enabled, apply_to_post, apply_to_backend, memo, created_at, updated_at \
         FROM simple_ban_rules ORDER BY id DESC LIMIT 1",
    )
    .fetch_one(&s.pool)
    .await
    .unwrap_or((0, String::new(), None, None, None, None, 0, 0, 0, None, String::new(), String::new()));
    Json(SimpleBanRuleRow {
        id: row.0,
        rule_type: row.1,
        npub_list: row.2,
        kind_list: row.3,
        tag_name: row.4,
        tag_value_pattern: row.5,
        enabled: row.6 != 0,
        apply_to_post: row.7 != 0,
        apply_to_backend: row.8 != 0,
        memo: row.9,
        created_at: row.10,
        updated_at: row.11,
    })
}

async fn update_simple_ban_rule(
    State(s): State<ApiState>,
    Path(id): Path<i64>,
    Json(body): Json<CreateSimpleBanRuleBody>,
) -> Json<()> {
    let enabled = body.enabled.unwrap_or(true);
    let apply_post = body.apply_to_post.unwrap_or(false);
    let apply_backend = body.apply_to_backend.unwrap_or(true);
    let _ = sqlx::query(
        "UPDATE simple_ban_rules SET rule_type = ?, npub_list = ?, kind_list = ?, tag_name = ?, tag_value_pattern = ?, enabled = ?, apply_to_post = ?, apply_to_backend = ?, memo = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.rule_type)
    .bind(body.npub_list.as_deref())
    .bind(body.kind_list.as_deref())
    .bind(body.tag_name.as_deref())
    .bind(body.tag_value_pattern.as_deref())
    .bind(if enabled { 1i64 } else { 0i64 })
    .bind(if apply_post { 1i64 } else { 0i64 })
    .bind(if apply_backend { 1i64 } else { 0i64 })
    .bind(body.memo.as_deref())
    .bind(id)
    .execute(&s.pool)
    .await;
    Json(())
}

async fn delete_simple_ban_rule(State(s): State<ApiState>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM simple_ban_rules WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await;
    Json(())
}

// ── Quarantine ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantineRow {
    pub id: i64,
    pub npub: String,
    pub scope: String,
    pub reason: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateQuarantineBody {
    pub npub: String,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    /// 期限（秒）。None = 無期限。
    #[serde(default)]
    pub duration_secs: Option<i64>,
}

async fn list_quarantine(State(s): State<ApiState>) -> Json<Vec<QuarantineRow>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, String, Option<String>, i64)>(
        "SELECT id, npub, scope, reason, created_at, expires_at, active FROM quarantine_entries ORDER BY id DESC",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, npub, scope, reason, created_at, expires_at, active)| QuarantineRow {
                id,
                npub,
                scope,
                reason,
                created_at,
                expires_at,
                active: active != 0,
            })
            .collect(),
    )
}

async fn create_quarantine(
    State(s): State<ApiState>,
    Json(body): Json<CreateQuarantineBody>,
) -> Result<Json<QuarantineRow>, (StatusCode, String)> {
    let scope = match body.scope.as_deref().unwrap_or("all") {
        "post" => "post",
        "req" => "req",
        "all" => "all",
        other => return Err((StatusCode::BAD_REQUEST, format!("invalid scope: {other}"))),
    };
    let expires_at = body.duration_secs.map(|d| {
        (chrono::Utc::now() + chrono::Duration::seconds(d))
            .format("%Y-%m-%d %H:%M:%S")
            .to_string()
    });
    let result = sqlx::query(
        "INSERT INTO quarantine_entries (npub, scope, reason, expires_at) VALUES (?, ?, ?, ?) RETURNING id",
    )
    .bind(&body.npub)
    .bind(scope)
    .bind(body.reason.unwrap_or_default())
    .bind(expires_at.clone())
    .fetch_one(&s.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    use sqlx::Row;
    let id: i64 = result.get(0);
    Ok(Json(QuarantineRow {
        id,
        npub: body.npub,
        scope: scope.to_string(),
        reason: String::new(),
        created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        expires_at,
        active: true,
    }))
}

async fn delete_quarantine(State(s): State<ApiState>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("UPDATE quarantine_entries SET active = 0 WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await;
    Json(())
}

// ── POST policy ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PostPolicyResponse {
    pub policy: String,
    pub backend_strategy: String,
    pub write_routing: String,
}

async fn get_post_policy(State(s): State<ApiState>) -> Json<PostPolicyResponse> {
    let snap = s.settings.snapshot().await;
    Json(PostPolicyResponse {
        policy: snap.post_policy.as_str().to_string(),
        backend_strategy: snap.backend_strategy.as_str().to_string(),
        write_routing: snap.write_routing.as_str().to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PutPostPolicyBody {
    pub policy: String,
    #[serde(default)]
    pub backend_strategy: Option<String>,
    #[serde(default)]
    pub write_routing: Option<String>,
}

async fn put_post_policy(
    State(s): State<ApiState>,
    Json(body): Json<PutPostPolicyBody>,
) -> Result<Json<PostPolicyResponse>, (StatusCode, String)> {
    if body.policy != "allowlist" && body.policy != "denylist" {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("invalid policy: {}", body.policy),
        ));
    }
    let strategy = body.backend_strategy.as_deref().unwrap_or("failover");
    if !["failover", "fan_out_event", "fan_in_req", "sharded"].contains(&strategy) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("invalid backend_strategy: {strategy}"),
        ));
    }
    // write_routing 未指定なら現状維持（spec §5.15）
    let current_routing = s.settings.snapshot().await.write_routing.as_str().to_string();
    let routing = body.write_routing.as_deref().unwrap_or(&current_routing);
    if !["all", "primary_default"].contains(&routing) {
        return Err((
            StatusCode::BAD_REQUEST,
            format!("invalid write_routing: {routing}"),
        ));
    }
    let _ = sqlx::query(
        "INSERT INTO relay_settings (id, post_policy, backend_strategy, write_routing) VALUES (1, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET post_policy = excluded.post_policy, backend_strategy = excluded.backend_strategy, write_routing = excluded.write_routing, updated_at = datetime('now')",
    )
    .bind(&body.policy)
    .bind(strategy)
    .bind(routing)
    .execute(&s.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if let Err(e) = s.settings.refresh().await {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }
    let snap = s.settings.snapshot().await;
    Ok(Json(PostPolicyResponse {
        policy: snap.post_policy.as_str().to_string(),
        backend_strategy: snap.backend_strategy.as_str().to_string(),
        write_routing: snap.write_routing.as_str().to_string(),
    }))
}

// ── 自動ガード（spec §5.14） ──

#[derive(Debug, Serialize)]
struct AutoGuardResponse {
    enabled: bool,
    burst_window_secs: u64,
    burst_max_events: u64,
    exclude_kinds: String,
    duplicate_threshold: u64,
    duplicate_window_secs: u64,
    quarantine_secs: u64,
    /// アクティブな content mute（hash, 失効 unix 秒）。先頭 100 件。
    content_mutes: Vec<AutoGuardMute>,
    content_mute_total: usize,
}

#[derive(Debug, Serialize)]
struct AutoGuardMute {
    content_hash: String,
    expires_at: u64,
}

fn auto_guard_response(
    cfg: &crate::config::AutoGuardSettings,
    guard: &AutoGuard,
) -> AutoGuardResponse {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mutes = guard.active_mutes(now);
    let total = mutes.len();
    let mut kinds: Vec<i64> = cfg.exclude_kinds.iter().copied().collect();
    kinds.sort();
    AutoGuardResponse {
        enabled: cfg.enabled,
        burst_window_secs: cfg.burst_window_secs,
        burst_max_events: cfg.burst_max_events,
        exclude_kinds: kinds
            .iter()
            .map(|k| k.to_string())
            .collect::<Vec<_>>()
            .join(","),
        duplicate_threshold: cfg.duplicate_threshold,
        duplicate_window_secs: cfg.duplicate_window_secs,
        quarantine_secs: cfg.quarantine_secs,
        content_mutes: mutes
            .into_iter()
            .take(100)
            .map(|(content_hash, expires_at)| AutoGuardMute {
                content_hash,
                expires_at,
            })
            .collect(),
        content_mute_total: total,
    }
}

async fn get_auto_guard(State(s): State<ApiState>) -> Json<AutoGuardResponse> {
    let cfg = s.settings.snapshot().await.auto_guard;
    Json(auto_guard_response(&cfg, &s.auto_guard))
}

#[derive(Debug, Deserialize)]
struct PutAutoGuardBody {
    enabled: bool,
    burst_window_secs: u64,
    burst_max_events: u64,
    /// CSV（例: "7" / "6,7"）。空文字は除外なし。
    #[serde(default)]
    exclude_kinds: String,
    duplicate_threshold: u64,
    duplicate_window_secs: u64,
    quarantine_secs: u64,
}

async fn put_auto_guard(
    State(s): State<ApiState>,
    Json(body): Json<PutAutoGuardBody>,
) -> Result<Json<AutoGuardResponse>, (StatusCode, String)> {
    if body.burst_window_secs == 0 || body.burst_max_events == 0 || body.quarantine_secs == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "burst_window_secs / burst_max_events / quarantine_secs must be positive".to_string(),
        ));
    }
    if body.duplicate_threshold < 2 || body.duplicate_window_secs == 0 {
        return Err((
            StatusCode::BAD_REQUEST,
            "duplicate_threshold must be >= 2 and duplicate_window_secs positive".to_string(),
        ));
    }
    // CSV の妥当性チェック（数値以外が混ざっていたら弾く）
    let normalized_kinds: Vec<String> = body
        .exclude_kinds
        .split(',')
        .map(|t| t.trim())
        .filter(|t| !t.is_empty())
        .map(|t| {
            t.parse::<i64>()
                .map(|k| k.to_string())
                .map_err(|_| format!("invalid kind in exclude_kinds: {t}"))
        })
        .collect::<Result<_, _>>()
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let _ = sqlx::query(
        "UPDATE relay_settings SET \
           auto_guard_enabled = ?, guard_burst_window_secs = ?, guard_burst_max_events = ?, \
           guard_exclude_kinds = ?, guard_duplicate_threshold = ?, guard_duplicate_window_secs = ?, \
           guard_quarantine_secs = ?, updated_at = datetime('now') \
         WHERE id = 1",
    )
    .bind(if body.enabled { 1i64 } else { 0i64 })
    .bind(body.burst_window_secs as i64)
    .bind(body.burst_max_events as i64)
    .bind(normalized_kinds.join(","))
    .bind(body.duplicate_threshold as i64)
    .bind(body.duplicate_window_secs as i64)
    .bind(body.quarantine_secs as i64)
    .execute(&s.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if let Err(e) = s.settings.refresh().await {
        return Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()));
    }
    let cfg = s.settings.snapshot().await.auto_guard;
    Ok(Json(auto_guard_response(&cfg, &s.auto_guard)))
}

async fn clear_auto_guard_content_mutes(State(s): State<ApiState>) -> Json<serde_json::Value> {
    let cleared = s.auto_guard.clear_mutes();
    Json(serde_json::json!({ "cleared": cleared }))
}

// ── DSL ↔ Simple translate / dry-run ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslateSimpleBody {
    pub rule: translate::SimpleRule,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslateDslBody {
    pub dsl: String,
}

async fn translate_simple_to_dsl(
    Json(body): Json<TranslateSimpleBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let dsl = translate::simple_to_dsl(&body.rule).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    Ok(Json(serde_json::json!({ "dsl": dsl })))
}

async fn translate_dsl_to_simple(Json(body): Json<TranslateDslBody>) -> Json<serde_json::Value> {
    match translate::dsl_to_simple(&body.dsl) {
        Some(rule) => Json(serde_json::json!({ "ok": true, "rule": rule })),
        None => Json(serde_json::json!({
            "ok": false,
            "error": "DSL は Simple BAN に変換できません（npub/kind/tag の単純条件のみ対応）"
        })),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunBody {
    pub dsl: String,
    pub event: NostrEvent,
}

async fn dry_run_filter(Json(body): Json<DryRunBody>) -> Json<translate::DryRunResult> {
    Json(translate::dry_run(&body.dsl, &body.event))
}

// ── SSE event stream ──

async fn sse_event_stream(
    State(s): State<ApiState>,
) -> Sse<impl tokio_stream::Stream<Item = Result<SseEvent, Infallible>>> {
    let rx = s.event_bus.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| match res {
        Ok(ev) => match serde_json::to_string(&ev) {
            Ok(payload) => Some(Ok(SseEvent::default().data(payload))),
            Err(_) => None,
        },
        Err(_) => None,
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── NIP-11 ──

#[derive(Debug, Clone, sqlx::FromRow)]
struct RelayInfoRowDb {
    pub name: Option<String>,
    pub description: Option<String>,
    pub pubkey: Option<String>,
    pub contact: Option<String>,
    pub supported_nips: Option<String>,
    pub software: Option<String>,
    pub version: Option<String>,
    pub limitation_max_limit: Option<i64>,
    pub limitation_max_message_length: Option<i64>,
    pub limitation_max_subscriptions: Option<i64>,
    pub limitation_max_filters: Option<i64>,
    pub limitation_max_event_tags: Option<i64>,
    pub limitation_max_content_length: Option<i64>,
    pub limitation_auth_required: i64,
    pub limitation_payment_required: i64,
    pub icon: Option<String>,
    pub negentropy: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayInfoRow {
    pub name: Option<String>,
    pub description: Option<String>,
    pub pubkey: Option<String>,
    pub contact: Option<String>,
    pub supported_nips: Option<String>,
    pub software: Option<String>,
    pub version: Option<String>,
    pub limitation_max_limit: Option<i64>,
    pub limitation_max_message_length: Option<i64>,
    pub limitation_max_subscriptions: Option<i64>,
    pub limitation_max_filters: Option<i64>,
    pub limitation_max_event_tags: Option<i64>,
    pub limitation_max_content_length: Option<i64>,
    pub limitation_auth_required: bool,
    pub limitation_payment_required: bool,
    pub icon: Option<String>,
    pub negentropy: Option<i64>,
}

async fn get_relay_info(State(s): State<ApiState>) -> Json<RelayInfoRow> {
    let row = sqlx::query_as::<_, RelayInfoRowDb>(
        "SELECT name, description, pubkey, contact, supported_nips, software, version, \
         limitation_max_limit, limitation_max_message_length, limitation_max_subscriptions, limitation_max_filters, \
         limitation_max_event_tags, limitation_max_content_length, limitation_auth_required, \
         limitation_payment_required, icon, negentropy \
         FROM relay_info WHERE id = 1",
    )
    .fetch_optional(&s.pool)
    .await
    .unwrap_or(None);

    match row {
        Some(row) => Json(RelayInfoRow {
            name: row.name,
            description: row.description,
            pubkey: row.pubkey,
            contact: row.contact,
            supported_nips: row.supported_nips,
            software: row.software,
            version: row.version,
            limitation_max_limit: row.limitation_max_limit,
            limitation_max_message_length: row.limitation_max_message_length,
            limitation_max_subscriptions: row.limitation_max_subscriptions,
            limitation_max_filters: row.limitation_max_filters,
            limitation_max_event_tags: row.limitation_max_event_tags,
            limitation_max_content_length: row.limitation_max_content_length,
            limitation_auth_required: row.limitation_auth_required != 0,
            limitation_payment_required: row.limitation_payment_required != 0,
            icon: row.icon,
            negentropy: if row.negentropy != 0 { Some(row.negentropy) } else { None },
        }),
        None => Json(RelayInfoRow {
            name: Some("Proxy Nostr Relay".into()),
            description: Some("A proxy relay with bot filtering capabilities".into()),
            pubkey: None,
            contact: None,
            supported_nips: Some("[1, 11]".into()),
            software: Some("https://github.com/ShinoharaTa/nostr-proxy-relay".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            limitation_max_limit: None,
            limitation_max_message_length: None,
            limitation_max_subscriptions: None,
            limitation_max_filters: None,
            limitation_max_event_tags: None,
            limitation_max_content_length: None,
            limitation_auth_required: false,
            limitation_payment_required: false,
            icon: None,
            negentropy: None,
        }),
    }
}

async fn put_relay_info(State(s): State<ApiState>, Json(body): Json<RelayInfoRow>) -> Json<()> {
    let auth_required = if body.limitation_auth_required { 1i64 } else { 0i64 };
    let payment_required = if body.limitation_payment_required { 1i64 } else { 0i64 };
    let negentropy = body.negentropy.unwrap_or(0i64);

    let _ = sqlx::query(
        "INSERT INTO relay_info (id, name, description, pubkey, contact, supported_nips, software, version, \
         limitation_max_limit, limitation_max_message_length, limitation_max_subscriptions, limitation_max_filters, \
         limitation_max_event_tags, limitation_max_content_length, limitation_auth_required, \
         limitation_payment_required, icon, negentropy) \
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET \
         name = excluded.name, description = excluded.description, pubkey = excluded.pubkey, \
         contact = excluded.contact, supported_nips = excluded.supported_nips, software = excluded.software, \
         version = excluded.version, limitation_max_limit = excluded.limitation_max_limit, \
         limitation_max_message_length = excluded.limitation_max_message_length, \
         limitation_max_subscriptions = excluded.limitation_max_subscriptions, \
         limitation_max_filters = excluded.limitation_max_filters, \
         limitation_max_event_tags = excluded.limitation_max_event_tags, \
         limitation_max_content_length = excluded.limitation_max_content_length, \
         limitation_auth_required = excluded.limitation_auth_required, \
         limitation_payment_required = excluded.limitation_payment_required, \
         icon = excluded.icon, negentropy = excluded.negentropy, updated_at = datetime('now')",
    )
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.pubkey)
    .bind(&body.contact)
    .bind(&body.supported_nips)
    .bind(&body.software)
    .bind(&body.version)
    .bind(body.limitation_max_limit)
    .bind(body.limitation_max_message_length)
    .bind(body.limitation_max_subscriptions)
    .bind(body.limitation_max_filters)
    .bind(body.limitation_max_event_tags)
    .bind(body.limitation_max_content_length)
    .bind(auth_required)
    .bind(payment_required)
    .bind(&body.icon)
    .bind(negentropy)
    .execute(&s.pool)
    .await;

    // NIP-11 limitation（max_message_length / max_subscriptions など）の変更を
    // live な接続にも再起動なしで反映させる。
    s.settings.notify();
    Json(())
}

// 既存の Extension 互換用（旧コードからの参照を残す保険）
#[allow(dead_code)]
type _RelayPoolExtension = Extension<Arc<RelayPool>>;
