//! 受信箱（Issue #53）。
//!
//! 「人の判断が要るもの」を 1 か所に並べる。項目は呼ばれるたびに既存のテーブルから計算し、
//! 受信箱専用の状態は「様子見」の期限（`inbox_snoozes`）だけを持つ。
//! 措置をすれば元データ側の条件から外れるので、項目は自然に消える。
//!
//! - `guard`      : 自動ガードが発行した有効な時限措置のうち、発行後に人が何も処置していないもの
//! - `npub_surge` : 直近 10 分の拒否が閾値以上で、まだ拒否・時限措置をしていない npub
//! - `ip_surge`   : 同じく IP（HARD / SHADOW BAN 済みは除く）
//! - `relay_down` : 有効なのに接続できていない上流リレー

use axum::{extract::State, http::StatusCode, routing::{get, post}, Json, Router};
use serde::{Deserialize, Serialize};

use super::routes::ApiState;

/// 急増とみなす拒否件数（直近 `SURGE_WINDOW_MIN` 分）
const SURGE_MIN_REJECTIONS: i64 = 20;
const SURGE_WINDOW_MIN: i64 = 10;
/// 様子見の既定と上限
const SNOOZE_DEFAULT_HOURS: i64 = 24;
const SNOOZE_MAX_HOURS: i64 = 24 * 7;

pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/inbox", get(get_inbox))
        .route("/inbox/snooze", post(post_snooze))
}

#[derive(Debug, Serialize, PartialEq)]
pub struct InboxItem {
    /// 様子見に使う安定キー
    pub key: String,
    pub kind: &'static str,
    pub target_type: &'static str,
    pub target: String,
    /// 項目が発生した時刻（UTC, `YYYY-MM-DD HH:MM:SS`）
    pub at: String,
    pub detail: serde_json::Value,
}

async fn get_inbox(State(s): State<ApiState>) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let items = collect(&s).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(serde_json::json!({ "count": items.len(), "items": items })))
}

pub async fn collect(s: &ApiState) -> anyhow::Result<Vec<InboxItem>> {
    let pool = &s.pool;
    let snoozed: std::collections::HashSet<String> = sqlx::query_as::<_, (String,)>(
        "SELECT item_key FROM inbox_snoozes WHERE datetime(until) > datetime('now')",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(k,)| k)
    .collect();

    let mut items = Vec::new();

    // 自動ガード発火: 発行後に manual の措置が記録されていないもの
    let guards: Vec<(i64, String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT q.id, q.npub, q.reason, q.created_at, q.expires_at FROM quarantine_entries q \
         WHERE q.active = 1 AND q.reason LIKE 'auto_guard:%' \
           AND (q.expires_at IS NULL OR datetime(q.expires_at) > datetime('now')) \
           AND NOT EXISTS (SELECT 1 FROM moderation_log m \
                           WHERE m.target_type = 'npub' AND m.target = q.npub AND m.actor = 'manual' \
                             AND datetime(m.created_at) >= datetime(q.created_at)) \
         ORDER BY q.id DESC LIMIT 50",
    )
    .fetch_all(pool)
    .await?;
    for (id, npub, reason, created_at, expires_at) in guards {
        let key = format!("guard:{id}");
        if snoozed.contains(&key) {
            continue;
        }
        let rejections = recent_rejections_for(pool, "npub", &npub).await;
        items.push(InboxItem {
            key,
            kind: "guard",
            target_type: "npub",
            target: npub,
            at: created_at,
            detail: serde_json::json!({
                "quarantine_id": id,
                "reason": reason.trim_start_matches("auto_guard:"),
                "expires_at": expires_at,
                "rejections_10m": rejections,
            }),
        });
    }

    // npub の拒否急増: 既に拒否・有効な時限措置があるものは除く
    let window = format!("-{SURGE_WINDOW_MIN} minutes");
    let npubs: Vec<(String, i64, String, String, String)> = sqlx::query_as(
        "SELECT r.npub, COUNT(*), MAX(r.created_at), GROUP_CONCAT(DISTINCT r.kind), \
                (SELECT reason FROM event_rejection_logs x WHERE x.npub = r.npub \
                   AND datetime(x.created_at) >= datetime('now', ?1) \
                   GROUP BY reason ORDER BY COUNT(*) DESC LIMIT 1) \
         FROM event_rejection_logs r \
         WHERE datetime(r.created_at) >= datetime('now', ?1) \
           AND NOT EXISTS (SELECT 1 FROM safelist sl WHERE sl.npub = r.npub AND sl.banned = 1) \
           AND NOT EXISTS (SELECT 1 FROM quarantine_entries q WHERE q.npub = r.npub AND q.active = 1 \
                             AND (q.expires_at IS NULL OR datetime(q.expires_at) > datetime('now'))) \
         GROUP BY r.npub HAVING COUNT(*) >= ?2 ORDER BY COUNT(*) DESC LIMIT 20",
    )
    .bind(&window)
    .bind(SURGE_MIN_REJECTIONS)
    .fetch_all(pool)
    .await?;
    for (npub, count, last, kinds, top_reason) in npubs {
        let key = format!("npub_surge:{npub}");
        if snoozed.contains(&key) {
            continue;
        }
        items.push(InboxItem {
            key,
            kind: "npub_surge",
            target_type: "npub",
            target: npub,
            at: last,
            detail: serde_json::json!({
                "rejections": count, "window_min": SURGE_WINDOW_MIN, "kinds": kinds, "top_reason": top_reason,
            }),
        });
    }

    // IP の拒否急増: HARD / SHADOW BAN 済みは除く
    let ips: Vec<(String, i64, String, i64)> = sqlx::query_as(
        "SELECT ip_address, COUNT(*), MAX(created_at), COUNT(DISTINCT npub) FROM event_rejection_logs \
         WHERE ip_address IS NOT NULL AND datetime(created_at) >= datetime('now', ?1) \
         GROUP BY ip_address HAVING COUNT(*) >= ?2 ORDER BY COUNT(*) DESC LIMIT 20",
    )
    .bind(&window)
    .bind(SURGE_MIN_REJECTIONS)
    .fetch_all(pool)
    .await?;
    for (ip, count, last, npubs) in ips {
        let key = format!("ip_surge:{ip}");
        if snoozed.contains(&key) {
            continue;
        }
        let mode = super::actors::ip_mode_str(&s.ip_acl.evaluate(&ip).await);
        if mode == "hard_ban" || mode == "shadow_ban" {
            continue;
        }
        items.push(InboxItem {
            key,
            kind: "ip_surge",
            target_type: "ip",
            target: ip,
            at: last,
            detail: serde_json::json!({ "rejections": count, "window_min": SURGE_WINDOW_MIN, "npubs": npubs }),
        });
    }

    // 上流リレーの不調: 有効なのに未接続
    for r in s.relay_pool.status_snapshot().await {
        if !r.enabled || r.status == "connected" {
            continue;
        }
        let key = format!("relay_down:{}", r.url);
        if snoozed.contains(&key) {
            continue;
        }
        items.push(InboxItem {
            key,
            kind: "relay_down",
            target_type: "relay",
            target: r.url,
            at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            detail: serde_json::json!({ "status": r.status, "last_error": r.last_error }),
        });
    }

    // 新しいものが上
    items.sort_by(|a, b| b.at.cmp(&a.at));
    Ok(items)
}

async fn recent_rejections_for(pool: &sqlx::SqlitePool, column: &str, id: &str) -> i64 {
    // column は呼び出し側の固定値のみ
    let sql = format!(
        "SELECT COUNT(*) FROM event_rejection_logs WHERE {column} = ? AND datetime(created_at) >= datetime('now', '-{SURGE_WINDOW_MIN} minutes')"
    );
    sqlx::query_as::<_, (i64,)>(&sql).bind(id).fetch_one(pool).await.map(|r| r.0).unwrap_or(0)
}

#[derive(Debug, Deserialize)]
pub struct SnoozeBody {
    pub key: String,
    #[serde(default)]
    pub hours: Option<i64>,
}

/// 項目を一定時間受信箱から外す（様子見）。期限が来れば条件を満たす限り再び現れる。
async fn post_snooze(
    State(s): State<ApiState>,
    Json(body): Json<SnoozeBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let valid_prefix = ["guard:", "npub_surge:", "ip_surge:", "relay_down:"];
    if !valid_prefix.iter().any(|p| body.key.starts_with(p)) || body.key.len() > 512 {
        return Err((StatusCode::BAD_REQUEST, "invalid inbox key".to_string()));
    }
    let hours = body.hours.unwrap_or(SNOOZE_DEFAULT_HOURS).clamp(1, SNOOZE_MAX_HOURS);
    let until: (String,) = sqlx::query_as("SELECT datetime('now', ?)")
        .bind(format!("+{hours} hours"))
        .fetch_one(&s.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    sqlx::query("INSERT INTO inbox_snoozes (item_key, until) VALUES (?, ?) ON CONFLICT(item_key) DO UPDATE SET until = excluded.until")
        .bind(&body.key)
        .bind(&until.0)
        .execute(&s.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    // 期限切れの様子見は掃除しておく（件数は小さい）
    let _ = sqlx::query("DELETE FROM inbox_snoozes WHERE datetime(until) <= datetime('now')")
        .execute(&s.pool)
        .await;
    Ok(Json(serde_json::json!({ "key": body.key, "until": until.0 })))
}
