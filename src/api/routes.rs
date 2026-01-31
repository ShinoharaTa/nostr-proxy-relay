use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{auth, parser::filter_query};

pub fn router(pool: SqlitePool) -> Router {
    Router::new()
        .route("/relay", get(get_relays).put(put_relays))
        .route("/safelist", get(list_safelist).post(upsert_safelist))
        .route("/safelist/:npub", delete(delete_safelist))
        .route("/safelist/:npub/ban", put(ban_npub))
        .route("/safelist/:npub/unban", put(unban_npub))
        .route("/filters", get(list_filters).post(create_filter))
        .route("/filters/:id", put(update_filter).delete(delete_filter))
        .route("/filters/validate", post(validate_filter))
        .route("/ip-access-control", get(list_ip_access_control).post(create_ip_access_control))
        .route("/ip-access-control/:id", put(update_ip_access_control).delete(delete_ip_access_control))
        .route("/req-kind-blacklist", get(list_req_kind_blacklist).post(create_req_kind_blacklist))
        .route("/req-kind-blacklist/:id", put(update_req_kind_blacklist).delete(delete_req_kind_blacklist))
        .route("/connection-logs", get(get_connection_logs))
        .route("/event-rejection-logs", get(get_event_rejection_logs))
        .route("/stats", get(get_stats))
        .route("/relay-info", get(get_relay_info).put(put_relay_info))
        .with_state(pool.clone())
        .layer(axum::middleware::from_fn_with_state(pool, auth::basic_auth))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayConfigRow {
    pub url: String,
    pub enabled: bool,
}

async fn get_relays(State(pool): State<SqlitePool>) -> Json<Vec<RelayConfigRow>> {
    let rows = sqlx::query_as::<_, (String, i64)>("SELECT url, enabled FROM relay_config ORDER BY id ASC")
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(url, enabled)| RelayConfigRow {
                url,
                enabled: enabled != 0,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PutRelaysBody {
    pub relays: Vec<RelayConfigRow>,
}

async fn put_relays(State(pool): State<SqlitePool>, Json(body): Json<PutRelaysBody>) -> Json<()> {
    // Simple approach: upsert by url.
    for r in body.relays {
        let enabled = if r.enabled { 1i64 } else { 0i64 };
        let _ = sqlx::query(
            "INSERT INTO relay_config (url, enabled) VALUES (?, ?) \
             ON CONFLICT(url) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')",
        )
        .bind(r.url)
        .bind(enabled)
        .execute(&pool)
        .await;
    }
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafelistRow {
    pub npub: String,
    pub flags: i64,
    pub memo: String,
}

async fn list_safelist(State(pool): State<SqlitePool>) -> Json<Vec<SafelistRow>> {
    let rows = sqlx::query_as::<_, (String, i64, String)>(
        "SELECT npub, flags, memo FROM safelist ORDER BY created_at ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(npub, flags, memo)| SafelistRow { npub, flags, memo })
            .collect(),
    )
}

async fn upsert_safelist(State(pool): State<SqlitePool>, Json(body): Json<SafelistRow>) -> Json<()> {
    match sqlx::query(
        "INSERT INTO safelist (npub, flags, memo) VALUES (?, ?, ?) \
         ON CONFLICT(npub) DO UPDATE SET flags = excluded.flags, memo = excluded.memo",
    )
    .bind(&body.npub)
    .bind(body.flags)
    .bind(&body.memo)
    .execute(&pool)
    .await {
        Ok(_) => {
            tracing::info!(npub = %body.npub, flags = body.flags, "Upserted safelist entry");
        }
        Err(e) => {
            tracing::error!(npub = %body.npub, error = %e, "Failed to upsert safelist entry");
        }
    }
    Json(())
}

async fn delete_safelist(State(pool): State<SqlitePool>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM safelist WHERE npub = ?")
        .bind(npub)
        .execute(&pool)
        .await;
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterRow {
    pub id: i64,
    pub name: String,
    pub nl_text: String,
    pub parsed_json: String,
    pub enabled: bool,
    pub rule_order: i64,
}

async fn list_filters(State(pool): State<SqlitePool>) -> Json<Vec<FilterRow>> {
    let rows = sqlx::query_as::<_, (i64, String, String, String, i64, i64)>(
        "SELECT id, name, nl_text, parsed_json, enabled, rule_order FROM filter_rules ORDER BY rule_order ASC, id ASC",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, name, nl_text, parsed_json, enabled, rule_order)| FilterRow {
                id,
                name,
                nl_text,
                parsed_json,
                enabled: enabled != 0,
                rule_order,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFilterBody {
    pub name: String,
    pub nl_text: String,
}

/// Response for filter creation/update operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
}

async fn create_filter(State(pool): State<SqlitePool>, Json(body): Json<CreateFilterBody>) -> Json<FilterResponse> {
    // Validate DSL query
    let validation = filter_query::validate(&body.nl_text);
    if !validation.valid {
        return Json(FilterResponse {
            success: false,
            error: validation.error,
            id: None,
        });
    }
    
    // Store DSL query directly (nl_text contains the DSL query, parsed_json also stores it for filtering)
    match sqlx::query(
        "INSERT INTO filter_rules (name, nl_text, parsed_json, enabled, rule_order) VALUES (?, ?, ?, 1, 0)",
    )
    .bind(&body.name)
    .bind(&body.nl_text)  // DSL query
    .bind(&body.nl_text)  // Store same DSL query in parsed_json for FilterEngine
    .execute(&pool)
    .await {
        Ok(result) => {
            let id = result.last_insert_rowid();
            tracing::info!(name = %body.name, id = id, "Created filter rule");
            Json(FilterResponse {
                success: true,
                error: None,
                id: Some(id),
            })
        }
        Err(e) => {
            tracing::error!(error = %e, "Failed to create filter rule");
            Json(FilterResponse {
                success: false,
                error: Some(format!("Database error: {}", e)),
                id: None,
            })
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFilterBody {
    pub name: String,
    pub nl_text: String,
    pub enabled: bool,
    pub rule_order: i64,
}

async fn update_filter(
    State(pool): State<SqlitePool>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateFilterBody>,
) -> Json<FilterResponse> {
    // Validate DSL query
    let validation = filter_query::validate(&body.nl_text);
    if !validation.valid {
        return Json(FilterResponse {
            success: false,
            error: validation.error,
            id: Some(id),
        });
    }
    
    let enabled = if body.enabled { 1i64 } else { 0i64 };
    match sqlx::query(
        "UPDATE filter_rules SET name = ?, nl_text = ?, parsed_json = ?, enabled = ?, rule_order = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.nl_text)  // DSL query
    .bind(&body.nl_text)  // Store same DSL query in parsed_json
    .bind(enabled)
    .bind(body.rule_order)
    .bind(id)
    .execute(&pool)
    .await {
        Ok(_) => {
            tracing::info!(name = %body.name, id = id, "Updated filter rule");
            Json(FilterResponse {
                success: true,
                error: None,
                id: Some(id),
            })
        }
        Err(e) => {
            tracing::error!(error = %e, id = id, "Failed to update filter rule");
            Json(FilterResponse {
                success: false,
                error: Some(format!("Database error: {}", e)),
                id: Some(id),
            })
        }
    }
}

async fn delete_filter(State(pool): State<SqlitePool>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM filter_rules WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await;
    Json(())
}

// Filter Query Validation

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateFilterBody {
    pub query: String,
}

async fn validate_filter(Json(body): Json<ValidateFilterBody>) -> Json<filter_query::ValidationResult> {
    Json(filter_query::validate(&body.query))
}

// IP管理エンドポイント

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpAccessControlRow {
    pub id: Option<i64>,
    pub ip_address: String,
    pub banned: bool,
    pub whitelisted: bool,
    pub memo: String,
}

async fn list_ip_access_control(State(pool): State<SqlitePool>) -> Json<Vec<IpAccessControlRow>> {
    let rows = sqlx::query_as::<_, (i64, String, i64, i64, String)>(
        "SELECT id, ip_address, banned, whitelisted, memo FROM ip_access_control ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, ip_address, banned, whitelisted, memo)| IpAccessControlRow {
                id: Some(id),
                ip_address,
                banned: banned != 0,
                whitelisted: whitelisted != 0,
                memo,
            })
            .collect(),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIpAccessControlBody {
    pub ip_address: String,
    pub banned: bool,
    pub whitelisted: bool,
    pub memo: String,
}

async fn create_ip_access_control(
    State(pool): State<SqlitePool>,
    Json(body): Json<CreateIpAccessControlBody>,
) -> Json<()> {
    let banned = if body.banned { 1i64 } else { 0i64 };
    let whitelisted = if body.whitelisted { 1i64 } else { 0i64 };
    let _ = sqlx::query(
        "INSERT INTO ip_access_control (ip_address, banned, whitelisted, memo) VALUES (?, ?, ?, ?)
         ON CONFLICT(ip_address) DO UPDATE SET banned = excluded.banned, whitelisted = excluded.whitelisted, memo = excluded.memo, updated_at = datetime('now')",
    )
    .bind(body.ip_address)
    .bind(banned)
    .bind(whitelisted)
    .bind(body.memo)
    .execute(&pool)
    .await;
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateIpAccessControlBody {
    pub ip_address: String,
    pub banned: bool,
    pub whitelisted: bool,
    pub memo: String,
}

async fn update_ip_access_control(
    State(pool): State<SqlitePool>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateIpAccessControlBody>,
) -> Json<()> {
    let banned = if body.banned { 1i64 } else { 0i64 };
    let whitelisted = if body.whitelisted { 1i64 } else { 0i64 };
    let _ = sqlx::query(
        "UPDATE ip_access_control SET ip_address = ?, banned = ?, whitelisted = ?, memo = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.ip_address)
    .bind(banned)
    .bind(whitelisted)
    .bind(body.memo)
    .bind(id)
    .execute(&pool)
    .await;
    Json(())
}

async fn delete_ip_access_control(State(pool): State<SqlitePool>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM ip_access_control WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await;
    Json(())
}

// Npub BAN管理エンドポイント

async fn ban_npub(State(pool): State<SqlitePool>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("UPDATE safelist SET banned = 1 WHERE npub = ?")
        .bind(npub)
        .execute(&pool)
        .await;
    Json(())
}

async fn unban_npub(State(pool): State<SqlitePool>, Path(npub): Path<String>) -> Json<()> {
    let _ = sqlx::query("UPDATE safelist SET banned = 0 WHERE npub = ?")
        .bind(npub)
        .execute(&pool)
        .await;
    Json(())
}

// REQ Kindブラックリストエンドポイント

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReqKindBlacklistRow {
    pub id: i64,
    pub kind_value: Option<i64>,
    pub kind_min: Option<i64>,
    pub kind_max: Option<i64>,
    pub enabled: bool,
}

async fn list_req_kind_blacklist(State(pool): State<SqlitePool>) -> Json<Vec<ReqKindBlacklistRow>> {
    let rows = sqlx::query_as::<_, (i64, Option<i64>, Option<i64>, Option<i64>, i64)>(
        "SELECT id, kind_value, kind_min, kind_max, enabled FROM req_kind_blacklist ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateReqKindBlacklistBody {
    pub kind_value: Option<i64>,
    pub kind_min: Option<i64>,
    pub kind_max: Option<i64>,
    pub enabled: bool,
}

async fn create_req_kind_blacklist(
    State(pool): State<SqlitePool>,
    Json(body): Json<CreateReqKindBlacklistBody>,
) -> Json<()> {
    let enabled = if body.enabled { 1i64 } else { 0i64 };
    let _ = sqlx::query(
        "INSERT INTO req_kind_blacklist (kind_value, kind_min, kind_max, enabled) VALUES (?, ?, ?, ?)",
    )
    .bind(body.kind_value)
    .bind(body.kind_min)
    .bind(body.kind_max)
    .bind(enabled)
    .execute(&pool)
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
    State(pool): State<SqlitePool>,
    Path(id): Path<i64>,
    Json(body): Json<UpdateReqKindBlacklistBody>,
) -> Json<()> {
    let enabled = if body.enabled { 1i64 } else { 0i64 };
    let _ = sqlx::query(
        "UPDATE req_kind_blacklist SET kind_value = ?, kind_min = ?, kind_max = ?, enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.kind_value)
    .bind(body.kind_min)
    .bind(body.kind_max)
    .bind(enabled)
    .bind(id)
    .execute(&pool)
    .await;
    Json(())
}

async fn delete_req_kind_blacklist(State(pool): State<SqlitePool>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM req_kind_blacklist WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await;
    Json(())
}

// ログ・統計エンドポイント

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
}

async fn get_connection_logs(
    State(pool): State<SqlitePool>,
    axum::extract::Query(params): axum::extract::Query<GetConnectionLogsQuery>,
) -> Json<Vec<ConnectionLogRow>> {
    let limit = params.limit.unwrap_or(100);
    let offset = params.offset.unwrap_or(0);
    let rows = sqlx::query_as::<_, (i64, String, String, Option<String>, i64, i64)>(
        "SELECT id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count 
         FROM connection_logs 
         ORDER BY connected_at DESC 
         LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, ip_address, connected_at, disconnected_at, event_count, rejected_event_count)| {
                ConnectionLogRow {
                    id,
                    ip_address,
                    connected_at,
                    disconnected_at,
                    event_count,
                    rejected_event_count,
                }
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
}

async fn get_event_rejection_logs(
    State(pool): State<SqlitePool>,
    axum::extract::Query(params): axum::extract::Query<GetEventRejectionLogsQuery>,
) -> Json<Vec<EventRejectionLogRow>> {
    let limit = params.limit.unwrap_or(100);
    let offset = params.offset.unwrap_or(0);
    let rows = sqlx::query_as::<_, (i64, String, String, String, Option<String>, i64, String, String)>(
        "SELECT id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at 
         FROM event_rejection_logs 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    Json(
        rows.into_iter()
            .map(|(id, event_id, pubkey_hex, npub, ip_address, kind, reason, created_at)| {
                EventRejectionLogRow {
                    id,
                    event_id,
                    pubkey_hex,
                    npub,
                    ip_address,
                    kind,
                    reason,
                    created_at,
                }
            })
            .collect(),
    )
}

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

async fn get_stats(State(pool): State<SqlitePool>) -> Json<StatsResponse> {
    // 総接続数
    let total_connections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM connection_logs")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    // アクティブ接続数（切断時刻がNULL）
    let active_connections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM connection_logs WHERE disconnected_at IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    // 総拒否数
    let total_rejections: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM event_rejection_logs")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    // 拒否理由別の内訳
    let rejections_by_reason_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT reason, COUNT(*) as count FROM event_rejection_logs GROUP BY reason ORDER BY count DESC",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    let rejections_by_reason: Vec<RejectionReasonCount> = rejections_by_reason_rows
        .into_iter()
        .map(|(reason, count)| RejectionReasonCount { reason, count })
        .collect();

    // トップNpub（拒否数順）
    let top_npubs_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT npub, COUNT(*) as count FROM event_rejection_logs GROUP BY npub ORDER BY count DESC LIMIT 10",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    let top_npubs_by_rejections: Vec<NpubRejectionCount> = top_npubs_rows
        .into_iter()
        .map(|(npub, count)| NpubRejectionCount { npub, count })
        .collect();

    // トップIP（拒否数順）
    let top_ips_rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT ip_address, COUNT(*) as count FROM event_rejection_logs WHERE ip_address IS NOT NULL GROUP BY ip_address ORDER BY count DESC LIMIT 10",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    let top_ips_by_rejections: Vec<IpRejectionCount> = top_ips_rows
        .into_iter()
        .map(|(ip_address, count)| IpRejectionCount { ip_address, count })
        .collect();

    Json(StatsResponse {
        total_connections: total_connections.0,
        active_connections: active_connections.0,
        total_rejections: total_rejections.0,
        rejections_by_reason,
        top_npubs_by_rejections,
        top_ips_by_rejections,
    })
}

// NIP-11 Relay Information

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelayInfoRow {
    pub name: Option<String>,
    pub description: Option<String>,
    pub pubkey: Option<String>,
    pub contact: Option<String>,
    pub supported_nips: Option<String>,
    pub software: Option<String>,
    pub version: Option<String>,
    pub limitation_max_message_length: Option<i64>,
    pub limitation_max_subscriptions: Option<i64>,
    pub limitation_max_filters: Option<i64>,
    pub limitation_max_event_tags: Option<i64>,
    pub limitation_max_content_length: Option<i64>,
    pub limitation_auth_required: bool,
    pub limitation_payment_required: bool,
    pub icon: Option<String>,
}

async fn get_relay_info(State(pool): State<SqlitePool>) -> Json<RelayInfoRow> {
    let row = sqlx::query_as::<_, (
        Option<String>, Option<String>, Option<String>, Option<String>, Option<String>,
        Option<String>, Option<String>, Option<i64>, Option<i64>, Option<i64>,
        Option<i64>, Option<i64>, i64, i64, Option<String>,
    )>(
        "SELECT name, description, pubkey, contact, supported_nips, software, version, 
         limitation_max_message_length, limitation_max_subscriptions, limitation_max_filters,
         limitation_max_event_tags, limitation_max_content_length, limitation_auth_required,
         limitation_payment_required, icon
         FROM relay_info WHERE id = 1",
    )
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    match row {
        Some((
            name, description, pubkey, contact, supported_nips,
            software, version, max_msg_len, max_subs, max_filters,
            max_event_tags, max_content_len, auth_required, payment_required, icon,
        )) => Json(RelayInfoRow {
            name,
            description,
            pubkey,
            contact,
            supported_nips,
            software,
            version,
            limitation_max_message_length: max_msg_len,
            limitation_max_subscriptions: max_subs,
            limitation_max_filters: max_filters,
            limitation_max_event_tags: max_event_tags,
            limitation_max_content_length: max_content_len,
            limitation_auth_required: auth_required != 0,
            limitation_payment_required: payment_required != 0,
            icon,
        }),
        None => Json(RelayInfoRow {
            name: Some("Proxy Nostr Relay".to_string()),
            description: Some("A proxy relay with bot filtering capabilities".to_string()),
            pubkey: None,
            contact: None,
            supported_nips: Some("[1, 11]".to_string()),
            software: Some("https://github.com/ShinoharaTa/nostr-proxy-relay".to_string()),
            version: Some("0.1.0".to_string()),
            limitation_max_message_length: None,
            limitation_max_subscriptions: None,
            limitation_max_filters: None,
            limitation_max_event_tags: None,
            limitation_max_content_length: None,
            limitation_auth_required: false,
            limitation_payment_required: false,
            icon: None,
        }),
    }
}

async fn put_relay_info(State(pool): State<SqlitePool>, Json(body): Json<RelayInfoRow>) -> Json<()> {
    let auth_required = if body.limitation_auth_required { 1i64 } else { 0i64 };
    let payment_required = if body.limitation_payment_required { 1i64 } else { 0i64 };
    
    let _ = sqlx::query(
        "INSERT INTO relay_info (id, name, description, pubkey, contact, supported_nips, software, version,
         limitation_max_message_length, limitation_max_subscriptions, limitation_max_filters,
         limitation_max_event_tags, limitation_max_content_length, limitation_auth_required,
         limitation_payment_required, icon)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, description = excluded.description, pubkey = excluded.pubkey,
         contact = excluded.contact, supported_nips = excluded.supported_nips, software = excluded.software,
         version = excluded.version, limitation_max_message_length = excluded.limitation_max_message_length,
         limitation_max_subscriptions = excluded.limitation_max_subscriptions,
         limitation_max_filters = excluded.limitation_max_filters,
         limitation_max_event_tags = excluded.limitation_max_event_tags,
         limitation_max_content_length = excluded.limitation_max_content_length,
         limitation_auth_required = excluded.limitation_auth_required,
         limitation_payment_required = excluded.limitation_payment_required,
         icon = excluded.icon,
         updated_at = datetime('now')",
    )
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.pubkey)
    .bind(&body.contact)
    .bind(&body.supported_nips)
    .bind(&body.software)
    .bind(&body.version)
    .bind(body.limitation_max_message_length)
    .bind(body.limitation_max_subscriptions)
    .bind(body.limitation_max_filters)
    .bind(body.limitation_max_event_tags)
    .bind(body.limitation_max_content_length)
    .bind(auth_required)
    .bind(payment_required)
    .bind(&body.icon)
    .execute(&pool)
    .await;
    
    Json(())
}
