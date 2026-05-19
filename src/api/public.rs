//! 認証不要の公開 API。
//!
//! - LP (`/`) や status バッジ用に提供する読み取り専用エンドポイント
//! - 個人情報 (npub / IP) は出さない
//! - 1 秒のメモリキャッシュで DB 負荷を抑える
//!
//! 仕様: docs/ui_redesign_ja.md §5.1

use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use super::routes::ApiState;

const CACHE_TTL: Duration = Duration::from_secs(1);
const RECENT_INCIDENTS: i64 = 10;
const BUCKET_COUNT_1H: usize = 60;

#[derive(Clone, Serialize)]
pub struct PublicStatusResponse {
    /// "operational" | "degraded" | "down"
    pub status: String,
    pub uptime_sec: u64,
    pub connections_active: i64,
    pub events: PublicEventsBuckets,
    pub backends: Vec<PublicBackend>,
    pub incidents: Vec<PublicIncident>,
    pub generated_at: String,
}

#[derive(Clone, Serialize)]
pub struct PublicEventsBuckets {
    /// 直近 60 分、1 分粒度。長さは常に 60。
    pub posted_1h: Vec<i64>,
    pub delivered_1h: Vec<i64>,
    pub rejected_1h: Vec<i64>,
}

#[derive(Clone, Serialize)]
pub struct PublicBackend {
    pub url: String,
    /// "connected" | "connecting" | "disconnected" | "disabled"
    pub status: String,
    pub connected_since: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct PublicIncident {
    pub ts: String,
    pub event_type: String,
    /// host + 短縮 detail。生 URL や IP / npub は含めない。
    pub summary: String,
}

/// `/api/public/*` 用の State。`ApiState` を再利用しつつ、起動時刻と
/// レスポンスキャッシュを保持する。
#[derive(Clone)]
pub struct PublicCacheState {
    pub api: ApiState,
    cache: Arc<Mutex<Option<(Instant, PublicStatusResponse)>>>,
    started_at: Instant,
}

impl PublicCacheState {
    pub fn new(api: ApiState) -> Self {
        Self {
            api,
            cache: Arc::new(Mutex::new(None)),
            started_at: Instant::now(),
        }
    }
}

pub fn router(state: PublicCacheState) -> Router {
    Router::new()
        .route("/status", get(get_public_status))
        .with_state(state)
}

async fn get_public_status(State(s): State<PublicCacheState>) -> Json<PublicStatusResponse> {
    if let Some(cached) = read_cache(&s.cache) {
        return Json(cached);
    }

    let resp = build_response(&s).await;

    if let Ok(mut guard) = s.cache.lock() {
        *guard = Some((Instant::now(), resp.clone()));
    }
    Json(resp)
}

fn read_cache(
    cache: &Arc<Mutex<Option<(Instant, PublicStatusResponse)>>>,
) -> Option<PublicStatusResponse> {
    let guard = cache.lock().ok()?;
    let (t, ref resp) = guard.as_ref()?.clone();
    if t.elapsed() < CACHE_TTL {
        Some(resp.clone())
    } else {
        None
    }
}

async fn build_response(s: &PublicCacheState) -> PublicStatusResponse {
    let snap = s.api.relay_pool.status_snapshot().await;
    let backends: Vec<PublicBackend> = snap
        .into_iter()
        .map(|r| PublicBackend {
            url: r.url,
            status: r.status,
            connected_since: r.connected_since,
        })
        .collect();

    let status = compute_status(&backends);

    let connections_active: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM connection_logs WHERE disconnected_at IS NULL")
            .fetch_one(&s.api.pool)
            .await
            .unwrap_or((0,));

    let events = load_event_buckets_1h(&s.api.pool).await;
    let incidents = load_recent_incidents(&s.api.pool).await;

    PublicStatusResponse {
        status,
        uptime_sec: s.started_at.elapsed().as_secs(),
        connections_active: connections_active.0,
        events,
        backends,
        incidents,
        generated_at: chrono::Utc::now().to_rfc3339(),
    }
}

async fn load_event_buckets_1h(pool: &sqlx::SqlitePool) -> PublicEventsBuckets {
    let now_min = chrono::Utc::now().timestamp() / 60;
    let from_min = now_min - BUCKET_COUNT_1H as i64;

    let rows = sqlx::query_as::<_, (i64, String, i64)>(
        "SELECT bucket_minute, action, SUM(count) FROM event_counters \
         WHERE bucket_minute >= ? GROUP BY bucket_minute, action",
    )
    .bind(from_min)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut posted = vec![0i64; BUCKET_COUNT_1H];
    let mut delivered = vec![0i64; BUCKET_COUNT_1H];
    let mut rejected = vec![0i64; BUCKET_COUNT_1H];
    for (bucket, action, cnt) in rows {
        let idx_signed = bucket - from_min;
        if !(0..BUCKET_COUNT_1H as i64).contains(&idx_signed) {
            continue;
        }
        let idx = idx_signed as usize;
        match action.as_str() {
            "posted" => posted[idx] = cnt,
            "delivered" => delivered[idx] = cnt,
            "rejected" => rejected[idx] = cnt,
            _ => {}
        }
    }
    PublicEventsBuckets {
        posted_1h: posted,
        delivered_1h: delivered,
        rejected_1h: rejected,
    }
}

async fn load_recent_incidents(pool: &sqlx::SqlitePool) -> Vec<PublicIncident> {
    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT created_at, event_type, relay_url, detail FROM relay_event_logs \
         ORDER BY created_at DESC LIMIT ?",
    )
    .bind(RECENT_INCIDENTS)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    rows.into_iter()
        .map(|(ts, event_type, relay_url, detail)| {
            let summary = format!(
                "{} {}",
                sanitized_host(&relay_url),
                short_detail(&detail)
            );
            PublicIncident {
                ts,
                event_type,
                summary,
            }
        })
        .collect()
}

/// URL から host だけ抽出。失敗したら空文字 (生 URL を漏らさない)。
fn sanitized_host(s: &str) -> String {
    url::Url::parse(s)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_default()
}

fn short_detail(s: &str) -> String {
    let mut t = s.replace('\n', " ");
    if t.chars().count() > 80 {
        t = t.chars().take(80).collect::<String>();
        t.push('…');
    }
    t
}

/// `operational` / `degraded` / `down` の三状態を、バックエンド一覧から判定する。
///
/// - configured (= 状態が `disabled` 以外) が 0 → `down`
/// - configured > 0 で active (= `connected`) が 0 → `down`
/// - active < configured → `degraded`
/// - active == configured → `operational`
fn compute_status(backends: &[PublicBackend]) -> String {
    let active = backends.iter().filter(|b| b.status == "connected").count();
    let configured = backends.iter().filter(|b| b.status != "disabled").count();
    if configured == 0 || active == 0 {
        "down".into()
    } else if active < configured {
        "degraded".into()
    } else {
        "operational".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(url: &str, status: &str) -> PublicBackend {
        PublicBackend {
            url: url.into(),
            status: status.into(),
            connected_since: None,
        }
    }

    #[test]
    fn sanitized_host_strips_path_and_scheme() {
        assert_eq!(sanitized_host("wss://yabu.me/relay"), "yabu.me");
        assert_eq!(sanitized_host("ws://example.test:7777/x?y=1"), "example.test");
        assert_eq!(sanitized_host("https://relay-jp.shino3.net"), "relay-jp.shino3.net");
    }

    #[test]
    fn sanitized_host_returns_empty_on_invalid() {
        assert_eq!(sanitized_host("not a url"), "");
        assert_eq!(sanitized_host(""), "");
    }

    #[test]
    fn short_detail_truncates_at_80_chars_and_adds_ellipsis() {
        let long: String = "a".repeat(120);
        let out = short_detail(&long);
        let chars: Vec<char> = out.chars().collect();
        assert_eq!(chars.len(), 81); // 80 + ellipsis
        assert_eq!(*chars.last().unwrap(), '…');
    }

    #[test]
    fn short_detail_replaces_newlines() {
        let s = "line1\nline2\nline3";
        assert_eq!(short_detail(s), "line1 line2 line3");
    }

    #[test]
    fn short_detail_preserves_short_strings() {
        assert_eq!(short_detail("ok"), "ok");
        assert_eq!(short_detail(""), "");
    }

    #[test]
    fn compute_status_empty_is_down() {
        assert_eq!(compute_status(&[]), "down");
    }

    #[test]
    fn compute_status_all_disabled_is_down() {
        assert_eq!(
            compute_status(&[b("wss://a", "disabled"), b("wss://b", "disabled")]),
            "down"
        );
    }

    #[test]
    fn compute_status_none_connected_is_down() {
        assert_eq!(
            compute_status(&[b("wss://a", "connecting"), b("wss://b", "disconnected")]),
            "down"
        );
    }

    #[test]
    fn compute_status_partial_connected_is_degraded() {
        assert_eq!(
            compute_status(&[
                b("wss://a", "connected"),
                b("wss://b", "disconnected"),
                b("wss://c", "connected"),
            ]),
            "degraded"
        );
    }

    #[test]
    fn compute_status_all_connected_is_operational() {
        assert_eq!(
            compute_status(&[b("wss://a", "connected"), b("wss://b", "connected")]),
            "operational"
        );
    }

    #[test]
    fn compute_status_ignores_disabled_in_denominator() {
        // disabled は configured に数えない → connected:1, configured:1 で operational
        assert_eq!(
            compute_status(&[b("wss://a", "connected"), b("wss://b", "disabled")]),
            "operational"
        );
    }
}
