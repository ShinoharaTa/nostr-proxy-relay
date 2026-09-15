//! アクター（IP / npub）集約 API（docs/ui_redesign_ja.md §14.2）。
//!
//! 「見つける → 1 クリックで制裁」の動線のためのデータ供給層。
//! - `GET /stats/actors` … 多い順の集約一覧 + 対処状態（ACL / safelist / quarantine）JOIN
//! - `GET /actors/:type/:id` … アクターインスペクタ用の単一詳細

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use crate::access::IpDecision;

use super::routes::ApiState;

pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/stats/actors", get(get_actors))
        .route("/actors/:actor_type/:id", get(get_actor_detail))
        .route("/investigate", axum::routing::post(post_investigate))
}

/// イベント調査（Issue #31 / #35 P1）。上流リレーへ問い合わせて集め、その場で解析して返す。
/// **何も保存しない**（ストレージレス設計を崩さない）。
///
/// 入力は hex / NIP-19（npub, note1, nevent1, nprofile1）の両対応。
/// nsec は明示的に拒否する。nevent / nprofile のリレーヒントは問い合わせ先に自動追加する。
async fn post_investigate(
    State(s): State<ApiState>,
    Json(mut req): Json<crate::investigate::InvestigateRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    use crate::nostr::nip19;

    // ── NIP-19 正規化（nsec はここで 400 になる） ──
    let mut hint_relays: Vec<String> = Vec::new();
    let mut norm = |items: &[String], is_pubkey: bool| -> Result<Vec<String>, (StatusCode, String)> {
        let mut out = Vec::with_capacity(items.len());
        for raw in items {
            let r = if is_pubkey {
                nip19::normalize_pubkey(raw)
            } else {
                nip19::normalize_event_id(raw)
            };
            match r {
                Ok((hex, relays)) => {
                    out.push(hex);
                    hint_relays.extend(relays);
                }
                Err(e) => return Err((StatusCode::BAD_REQUEST, format!("入力を解釈できません: {e:#}"))),
            }
        }
        Ok(out)
    };
    req.ids = norm(&req.ids, false)?;
    req.refs = norm(&req.refs, false)?;
    req.authors = norm(&req.authors, true)?;

    if req.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "ids / authors / refs / kinds のいずれかを指定してください".to_string(),
        ));
    }

    // 対象リレー: 未指定なら接続中のもの全部 + NIP-19 のリレーヒント
    let mut urls: Vec<String> = if req.relays.is_empty() {
        s.relay_pool
            .status_snapshot()
            .await
            .into_iter()
            .filter(|r| r.enabled && r.status == "connected")
            .map(|r| r.url)
            .collect()
    } else {
        req.relays.clone()
    };
    // ヒント先は RelayPool に接続が無いと subscribe できないため、既知のプールに
    // 含まれるものだけ有効。未接続ヒントは結果に注記として返す。
    let pool_urls: std::collections::HashSet<String> = urls.iter().cloned().collect();
    let unusable_hints: Vec<String> = hint_relays
        .iter()
        .filter(|h| !pool_urls.contains(*h))
        .cloned()
        .collect();
    for h in hint_relays {
        if pool_urls.contains(&h) && !urls.contains(&h) {
            urls.push(h);
        }
    }
    if urls.is_empty() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "接続中のバックエンドリレーがありません".to_string(),
        ));
    }

    let timeout_ms = req.timeout_ms.unwrap_or(5000);

    // refs 指定時は root イベント本体を先に取得する。
    // 「何への反応か」の表示に加え、root 投稿者の pubkey を構造タグ除外
    // （リプライ爆撃で「p=被害者」を誤ってブロック提案しないため）に使う。
    let mut structural_values = req.refs.clone();
    let roots: Vec<serde_json::Value> = if req.refs.is_empty() {
        Vec::new()
    } else {
        let root_filter = vec![serde_json::json!({ "ids": req.refs, "limit": req.refs.len() })];
        let (root_events, _) =
            crate::investigate::collect(&s.relay_pool, &urls, root_filter, timeout_ms.min(4000)).await;
        root_events
            .into_iter()
            .map(|c| {
                structural_values.push(c.event.pubkey.clone());
                let content: String = c.event.content.chars().take(300).collect();
                serde_json::json!({
                    "id": c.event.id,
                    "pubkey": c.event.pubkey,
                    "kind": c.event.kind,
                    "created_at": c.event.created_at,
                    "content": content,
                })
            })
            .collect()
    };

    let (collected, stats) =
        crate::investigate::collect(&s.relay_pool, &urls, req.to_filters(), timeout_ms).await;

    let analysis = crate::investigate::analyze(&collected, stats, &structural_values);

    // ローカル相関: リレー応答に IP は含まれないので、自分の拒否ログと突き合わせて補う
    let local = local_correlation(&s, &collected).await;

    Ok(Json(serde_json::json!({
        "analysis": analysis,
        "local": local,
        "relays_queried": urls,
        "roots": roots,
        "unusable_relay_hints": unusable_hints,
    })))
}

/// 収集したイベント ID / pubkey を自分の拒否ログと突き合わせ、IP と拒否理由を補完する。
async fn local_correlation(
    s: &ApiState,
    collected: &[crate::investigate::CollectedEvent],
) -> serde_json::Value {
    if collected.is_empty() {
        return serde_json::json!({ "matched": 0, "ips": [], "reasons": [] });
    }
    // SQLite のバインド数上限を避けるため件数を絞る
    let ids: Vec<String> = collected.iter().take(500).map(|c| c.event.id.clone()).collect();
    let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT ip_address, reason, COUNT(*) FROM event_rejection_logs          WHERE event_id IN ({placeholders}) GROUP BY ip_address, reason"
    );
    let mut q = sqlx::query_as::<_, (Option<String>, String, i64)>(&sql);
    for id in &ids {
        q = q.bind(id);
    }
    let rows = q.fetch_all(&s.pool).await.unwrap_or_default();

    let mut ips: HashMap<String, i64> = HashMap::new();
    let mut reasons: HashMap<String, i64> = HashMap::new();
    let mut matched = 0i64;
    for (ip, reason, count) in rows {
        matched += count;
        if let Some(ip) = ip {
            *ips.entry(ip).or_default() += count;
        }
        *reasons.entry(reason).or_default() += count;
    }

    let mut ip_list: Vec<serde_json::Value> = ips
        .into_iter()
        .map(|(ip, count)| serde_json::json!({ "ip": ip, "count": count }))
        .collect();
    ip_list.sort_by_key(|v| -(v["count"].as_i64().unwrap_or(0)));
    let mut reason_list: Vec<serde_json::Value> = reasons
        .into_iter()
        .map(|(reason, count)| serde_json::json!({ "reason": reason, "count": count }))
        .collect();
    reason_list.sort_by_key(|v| -(v["count"].as_i64().unwrap_or(0)));

    // 単一 IP に集中していれば IP BAN を提案（ここだけはリレー応答からは絶対に出せない情報）
    let single_ip = if ip_list.len() == 1 && matched >= 3 {
        Some(ip_list[0]["ip"].clone())
    } else {
        None
    };

    serde_json::json!({
        "matched": matched,
        "ips": ip_list,
        "reasons": reason_list,
        "suggested_ip_ban": single_ip,
    })
}

#[derive(Debug, Deserialize)]
struct ActorsQuery {
    by: String,
    #[serde(default = "default_window")]
    window: String,
    #[serde(default)]
    sort: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

fn default_window() -> String {
    "24h".to_string()
}

/// window パラメータを SQLite の datetime modifier へ。None = 全期間。
fn window_modifier(window: &str) -> Result<Option<&'static str>, ()> {
    match window {
        "1h" => Ok(Some("-1 hour")),
        "24h" => Ok(Some("-24 hours")),
        "7d" => Ok(Some("-7 days")),
        "all" => Ok(None),
        _ => Err(()),
    }
}

fn ip_mode_str(decision: &IpDecision) -> &'static str {
    match decision {
        IpDecision::HardBan => "hard_ban",
        IpDecision::ShadowBan => "shadow_ban",
        IpDecision::Whitelist => "whitelist",
        IpDecision::Allow => "normal",
    }
}

#[derive(Debug, Serialize)]
struct IpActor {
    ip: String,
    connections: i64,
    events: i64,
    rejections: i64,
    last_seen: String,
    /// ip_access_control の評価結果（CIDR 含む）: hard_ban / shadow_ban / whitelist / normal
    mode: &'static str,
    active_connections: usize,
}

#[derive(Debug, Serialize)]
struct NpubActor {
    npub: String,
    rejections: i64,
    /// 窓内で拒否された kind（distinct, CSV）
    kinds: String,
    last_seen: String,
    safelist_flags: Option<i64>,
    banned: bool,
    quarantined: bool,
}

async fn aggregate_ips(s: &ApiState, modifier: Option<&str>) -> Vec<IpActor> {
    // window は connected_at 基準。modifier が None なら全期間。
    let rows: Vec<(String, i64, i64, i64, String)> = sqlx::query_as(
        "SELECT ip_address, COUNT(*), COALESCE(SUM(event_count), 0), \
                COALESCE(SUM(rejected_event_count), 0), MAX(connected_at) \
         FROM connection_logs \
         WHERE (? IS NULL OR connected_at >= datetime('now', ?)) \
         GROUP BY ip_address",
    )
    .bind(modifier)
    .bind(modifier.unwrap_or(""))
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();

    let active = s.session_registry.active_counts();
    let mut out = Vec::with_capacity(rows.len());
    for (ip, connections, events, rejections, last_seen) in rows {
        let mode = ip_mode_str(&s.ip_acl.evaluate(&ip).await);
        let active_connections = active.get(&ip).copied().unwrap_or(0);
        out.push(IpActor {
            ip,
            connections,
            events,
            rejections,
            last_seen,
            mode,
            active_connections,
        });
    }
    out
}

async fn aggregate_npubs(s: &ApiState, modifier: Option<&str>) -> Vec<NpubActor> {
    let rows: Vec<(String, i64, String, String)> = sqlx::query_as(
        "SELECT npub, COUNT(*), COALESCE(GROUP_CONCAT(DISTINCT kind), ''), MAX(created_at) \
         FROM event_rejection_logs \
         WHERE npub != '' AND (? IS NULL OR created_at >= datetime('now', ?)) \
         GROUP BY npub",
    )
    .bind(modifier)
    .bind(modifier.unwrap_or(""))
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default();

    // 状態 JOIN: safelist / quarantine は小さいテーブルなので全読みして map 化する
    let safelist: HashMap<String, (i64, i64)> =
        sqlx::query_as::<_, (String, i64, i64)>("SELECT npub, flags, banned FROM safelist")
            .fetch_all(&s.pool)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|(npub, flags, banned)| (npub, (flags, banned)))
            .collect();
    let quarantined: HashSet<String> = sqlx::query_as::<_, (String,)>(
        "SELECT DISTINCT npub FROM quarantine_entries \
         WHERE active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))",
    )
    .fetch_all(&s.pool)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(npub,)| npub)
    .collect();

    rows.into_iter()
        .map(|(npub, rejections, kinds, last_seen)| {
            let sl = safelist.get(&npub);
            NpubActor {
                rejections,
                kinds,
                last_seen,
                safelist_flags: sl.map(|(flags, _)| *flags),
                banned: sl.map(|(_, banned)| *banned != 0).unwrap_or(false),
                quarantined: quarantined.contains(&npub),
                npub,
            }
        })
        .collect()
}

async fn get_actors(
    State(s): State<ApiState>,
    Query(q): Query<ActorsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let modifier = window_modifier(&q.window)
        .map_err(|_| (StatusCode::BAD_REQUEST, format!("invalid window: {}", q.window)))?;
    let limit = q.limit.unwrap_or(50).min(200);

    let actors = match q.by.as_str() {
        "ip" => {
            let sort = q.sort.as_deref().unwrap_or("connections");
            let mut list = aggregate_ips(&s, modifier).await;
            match sort {
                "connections" => list.sort_by(|a, b| b.connections.cmp(&a.connections)),
                "events" => list.sort_by(|a, b| b.events.cmp(&a.events)),
                "rejections" => list.sort_by(|a, b| b.rejections.cmp(&a.rejections)),
                other => {
                    return Err((StatusCode::BAD_REQUEST, format!("invalid sort: {other}")));
                }
            }
            list.truncate(limit);
            serde_json::to_value(list)
        }
        "npub" => {
            let sort = q.sort.as_deref().unwrap_or("rejections");
            if sort != "rejections" {
                return Err((
                    StatusCode::BAD_REQUEST,
                    format!("invalid sort for npub: {sort}"),
                ));
            }
            let mut list = aggregate_npubs(&s, modifier).await;
            list.sort_by(|a, b| b.rejections.cmp(&a.rejections));
            list.truncate(limit);
            serde_json::to_value(list)
        }
        other => return Err((StatusCode::BAD_REQUEST, format!("invalid by: {other}"))),
    }
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "by": q.by,
        "window": q.window,
        "actors": actors,
    })))
}

/// インスペクタ用: 単一アクターの詳細（全期間集約 + 直近拒否ログ + 関連エントリ）。
async fn get_actor_detail(
    State(s): State<ApiState>,
    Path((actor_type, id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match actor_type.as_str() {
        "ip" => {
            let summary: Option<(i64, i64, i64, Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT COUNT(*), COALESCE(SUM(event_count), 0), COALESCE(SUM(rejected_event_count), 0), \
                        MIN(connected_at), MAX(connected_at) \
                 FROM connection_logs WHERE ip_address = ?",
            )
            .bind(&id)
            .fetch_optional(&s.pool)
            .await
            .unwrap_or_default();
            let (connections, events, rejections, first_seen, last_seen) =
                summary.unwrap_or((0, 0, 0, None, None));

            let recent = recent_rejections(&s, "ip_address", &id).await;
            let acl_rows: Vec<(i64, String, String, String)> = sqlx::query_as(
                "SELECT id, ip_address, mode, memo FROM ip_access_control WHERE ip_address = ?",
            )
            .bind(&id)
            .fetch_all(&s.pool)
            .await
            .unwrap_or_default();

            Ok(Json(serde_json::json!({
                "type": "ip",
                "id": id,
                "mode": ip_mode_str(&s.ip_acl.evaluate(&id).await),
                "active_connections": s.session_registry.active_counts().get(&id).copied().unwrap_or(0),
                "connections": connections,
                "events": events,
                "rejections": rejections,
                "first_seen": first_seen,
                "last_seen": last_seen,
                "recent_rejections": recent,
                "acl_entries": acl_rows.into_iter().map(|(id, ip, mode, memo)| serde_json::json!({
                    "id": id, "ip_address": ip, "mode": mode, "memo": memo,
                })).collect::<Vec<_>>(),
            })))
        }
        "npub" => {
            let summary: Option<(i64, Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT COUNT(*), MIN(created_at), MAX(created_at) \
                 FROM event_rejection_logs WHERE npub = ?",
            )
            .bind(&id)
            .fetch_optional(&s.pool)
            .await
            .unwrap_or_default();
            let (rejections, first_seen, last_seen) = summary.unwrap_or((0, None, None));

            let recent = recent_rejections(&s, "npub", &id).await;
            let safelist: Option<(i64, i64, String)> =
                sqlx::query_as("SELECT flags, banned, memo FROM safelist WHERE npub = ?")
                    .bind(&id)
                    .fetch_optional(&s.pool)
                    .await
                    .unwrap_or_default();
            let quarantine: Vec<(i64, String, String, Option<String>)> = sqlx::query_as(
                "SELECT id, scope, reason, expires_at FROM quarantine_entries \
                 WHERE npub = ? AND active = 1 \
                   AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) \
                 ORDER BY id DESC",
            )
            .bind(&id)
            .fetch_all(&s.pool)
            .await
            .unwrap_or_default();

            Ok(Json(serde_json::json!({
                "type": "npub",
                "id": id,
                "rejections": rejections,
                "first_seen": first_seen,
                "last_seen": last_seen,
                "recent_rejections": recent,
                "safelist": safelist.map(|(flags, banned, memo)| serde_json::json!({
                    "flags": flags, "banned": banned != 0, "memo": memo,
                })),
                "quarantine_entries": quarantine.into_iter().map(|(id, scope, reason, expires_at)| serde_json::json!({
                    "id": id, "scope": scope, "reason": reason, "expires_at": expires_at,
                })).collect::<Vec<_>>(),
            })))
        }
        other => Err((StatusCode::BAD_REQUEST, format!("invalid actor type: {other}"))),
    }
}

/// 直近の拒否ログ 5 件。`column` は "ip_address" か "npub"（呼び出し側固定値のみ）。
async fn recent_rejections(s: &ApiState, column: &str, id: &str) -> Vec<serde_json::Value> {
    // column は本モジュール内の固定文字列のみ（SQL インジェクション面の外部入力ではない）
    let sql = format!(
        "SELECT event_id, npub, ip_address, kind, reason, created_at \
         FROM event_rejection_logs WHERE {column} = ? ORDER BY created_at DESC LIMIT 5"
    );
    sqlx::query_as::<_, (String, String, Option<String>, i64, String, String)>(&sql)
        .bind(id)
        .fetch_all(&s.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(event_id, npub, ip_address, kind, reason, created_at)| {
            serde_json::json!({
                "event_id": event_id,
                "npub": npub,
                "ip_address": ip_address,
                "kind": kind,
                "reason": reason,
                "created_at": created_at,
            })
        })
        .collect()
}
