use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::{auth, parser::rule::parse_natural_language_rule};

pub fn router(pool: SqlitePool) -> Router {
    Router::new()
        .route("/relay", get(get_relays).put(put_relays))
        .route("/safelist", get(list_safelist).post(upsert_safelist))
        .route("/safelist/:npub", delete(delete_safelist))
        .route("/filters", get(list_filters).post(create_filter))
        .route("/filters/:id", put(update_filter).delete(delete_filter))
        .route("/filters/parse", post(parse_filter))
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
    let _ = sqlx::query(
        "INSERT INTO safelist (npub, flags, memo) VALUES (?, ?, ?) \
         ON CONFLICT(npub) DO UPDATE SET flags = excluded.flags, memo = excluded.memo",
    )
    .bind(body.npub)
    .bind(body.flags)
    .bind(body.memo)
    .execute(&pool)
    .await;
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

async fn create_filter(State(pool): State<SqlitePool>, Json(body): Json<CreateFilterBody>) -> Json<()> {
    let rule = parse_natural_language_rule(&body.nl_text)
        .map(|r| serde_json::to_string(&r).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|_| "{}".to_string());
    let _ = sqlx::query(
        "INSERT INTO filter_rules (name, nl_text, parsed_json, enabled, rule_order) VALUES (?, ?, ?, 1, 0)",
    )
    .bind(body.name)
    .bind(body.nl_text)
    .bind(rule)
    .execute(&pool)
    .await;
    Json(())
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
) -> Json<()> {
    let rule = parse_natural_language_rule(&body.nl_text)
        .map(|r| serde_json::to_string(&r).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|_| "{}".to_string());
    let enabled = if body.enabled { 1i64 } else { 0i64 };
    let _ = sqlx::query(
        "UPDATE filter_rules SET name = ?, nl_text = ?, parsed_json = ?, enabled = ?, rule_order = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.name)
    .bind(body.nl_text)
    .bind(rule)
    .bind(enabled)
    .bind(body.rule_order)
    .bind(id)
    .execute(&pool)
    .await;
    Json(())
}

async fn delete_filter(State(pool): State<SqlitePool>, Path(id): Path<i64>) -> Json<()> {
    let _ = sqlx::query("DELETE FROM filter_rules WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await;
    Json(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFilterBody {
    pub nl_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseFilterResp {
    pub parsed_json: String,
}

async fn parse_filter(Json(body): Json<ParseFilterBody>) -> Json<ParseFilterResp> {
    let parsed_json = parse_natural_language_rule(&body.nl_text)
        .map(|r| serde_json::to_string(&r).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|_| "{}".to_string());
    Json(ParseFilterResp { parsed_json })
}

