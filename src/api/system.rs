//! 認証必須 (BasicAuth) の運用情報・テレメトリ確認 API。
//!
//! - `/api/system/info`        : ビルド情報・auth_throttle 設定 (env)・retention・disk usage
//! - `/api/telemetry/status`   : InfluxDB 設定 (env から取得、token は last4 のみ)
//! - `/api/telemetry/test`     : InfluxDB に 1 行 test write を試みる
//!
//! 仕様: docs/ui_redesign_ja.md §5.10

use axum::{extract::State, routing::{get, post}, Json, Router};
use serde::Serialize;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use super::routes::ApiState;

/// プロセス起動時刻 (uptime 計算用)。`init_started_at()` で 1 度だけセット。
static STARTED_AT: OnceLock<Instant> = OnceLock::new();

pub fn init_started_at() -> Instant {
    *STARTED_AT.get_or_init(Instant::now)
}

fn uptime_sec() -> u64 {
    init_started_at().elapsed().as_secs()
}

#[derive(Serialize)]
pub struct SystemInfoResponse {
    pub version: &'static str,
    pub uptime_sec: u64,
    pub auth_throttle: AuthThrottleInfo,
    pub retention: RetentionInfo,
    pub disk: DiskInfo,
    pub env_overrides: Vec<String>,
}

#[derive(Serialize)]
pub struct AuthThrottleInfo {
    pub threshold: u32,
    pub window_secs: u64,
    pub lock_duration_secs: u64,
    /// この値はプロセス内で別管理しているのでここでは 0 固定。
    /// (将来的に DashMap の locked 件数を返す)
    pub locked_ips_count: usize,
}

#[derive(Serialize)]
pub struct RetentionInfo {
    pub log_retention_days: Option<u64>,
    pub overrides: std::collections::HashMap<String, String>,
}

#[derive(Serialize)]
pub struct DiskInfo {
    pub db_path: String,
    pub db_size_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct TelemetryStatusResponse {
    pub configured: bool,
    pub url: Option<String>,
    pub bucket: Option<String>,
    pub org: Option<String>,
    /// token のヒント。完全な token は返さず last4 のみ。
    pub token_hint: Option<String>,
}

#[derive(Serialize)]
pub struct TelemetryTestResponse {
    pub ok: bool,
    pub status_code: Option<u16>,
    pub message: String,
}

/// `routes::router` 内に merge して使うサブルーター。auth は親で適用する。
pub fn routes() -> Router<ApiState> {
    Router::new()
        .route("/system/info", get(get_system_info))
        .route("/telemetry/status", get(get_telemetry_status))
        .route("/telemetry/test", post(post_telemetry_test))
}

async fn get_system_info(State(s): State<ApiState>) -> Json<SystemInfoResponse> {
    let threshold: u32 = env_u32("ADMIN_LOCKOUT_THRESHOLD", 10);
    let window_secs: u64 = env_u64("ADMIN_LOCKOUT_WINDOW_SECS", 300);
    let lock_secs: u64 = env_u64("ADMIN_LOCKOUT_DURATION_SECS", 900);

    let log_retention_days = std::env::var("LOG_RETENTION_DAYS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok());

    let mut overrides = std::collections::HashMap::new();
    for k in [
        "ADMIN_LOCKOUT_THRESHOLD",
        "ADMIN_LOCKOUT_WINDOW_SECS",
        "ADMIN_LOCKOUT_DURATION_SECS",
        "LOG_RETENTION_DAYS",
        "DATABASE_URL",
        "INFLUXDB_URL",
        "INFLUXDB_BUCKET",
        "INFLUXDB_ORG",
        "BIND_ADDR",
    ] {
        if let Ok(v) = std::env::var(k) {
            overrides.insert(k.to_string(), if k.contains("TOKEN") { mask(&v) } else { v });
        }
    }

    let env_overrides: Vec<String> = overrides.keys().cloned().collect();

    let db_path = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://relay.db".into());
    let db_size_bytes = sqlite_path_from_url(&db_path)
        .and_then(|p| std::fs::metadata(&p).ok())
        .map(|m| m.len());

    let _ = s; // ApiState は将来拡張用に残す（現状は env / disk のみ）
    Json(SystemInfoResponse {
        version: env!("CARGO_PKG_VERSION"),
        uptime_sec: uptime_sec(),
        auth_throttle: AuthThrottleInfo {
            threshold,
            window_secs,
            lock_duration_secs: lock_secs,
            locked_ips_count: 0,
        },
        retention: RetentionInfo {
            log_retention_days,
            overrides,
        },
        disk: DiskInfo { db_path, db_size_bytes },
        env_overrides,
    })
}

async fn get_telemetry_status(State(_): State<ApiState>) -> Json<TelemetryStatusResponse> {
    let url = std::env::var("INFLUXDB_URL").ok();
    let bucket = std::env::var("INFLUXDB_BUCKET").ok();
    let org = std::env::var("INFLUXDB_ORG").ok();
    let token = std::env::var("INFLUXDB_TOKEN").ok();
    let configured = url.is_some() && bucket.is_some() && org.is_some() && token.is_some();
    Json(TelemetryStatusResponse {
        configured,
        url: url.clone(),
        bucket,
        org,
        token_hint: token.as_deref().map(mask),
    })
}

async fn post_telemetry_test(State(_): State<ApiState>) -> Json<TelemetryTestResponse> {
    let url = match std::env::var("INFLUXDB_URL") {
        Ok(v) => v,
        Err(_) => {
            return Json(TelemetryTestResponse {
                ok: false,
                status_code: None,
                message: "INFLUXDB_URL is not set".into(),
            })
        }
    };
    let bucket = match std::env::var("INFLUXDB_BUCKET") {
        Ok(v) => v,
        Err(_) => {
            return Json(TelemetryTestResponse {
                ok: false,
                status_code: None,
                message: "INFLUXDB_BUCKET is not set".into(),
            })
        }
    };
    let org = match std::env::var("INFLUXDB_ORG") {
        Ok(v) => v,
        Err(_) => {
            return Json(TelemetryTestResponse {
                ok: false,
                status_code: None,
                message: "INFLUXDB_ORG is not set".into(),
            })
        }
    };
    let token = match std::env::var("INFLUXDB_TOKEN") {
        Ok(v) => v,
        Err(_) => {
            return Json(TelemetryTestResponse {
                ok: false,
                status_code: None,
                message: "INFLUXDB_TOKEN is not set".into(),
            })
        }
    };

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return Json(TelemetryTestResponse {
                ok: false,
                status_code: None,
                message: format!("client build failed: {e}"),
            })
        }
    };

    let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    let line = format!("relay_telemetry_test,host=proxy value=1 {now}");

    let write_url = format!(
        "{}/api/v2/write?bucket={}&org={}",
        url.trim_end_matches('/'),
        bucket,
        org
    );

    let res = client
        .post(&write_url)
        .header("Authorization", format!("Token {}", token))
        .header("Content-Type", "application/vnd.influxdb; charset=utf-8")
        .body(line)
        .send()
        .await;

    match res {
        Ok(resp) => {
            let status = resp.status();
            let ok = status.is_success();
            let body = resp.text().await.unwrap_or_default();
            Json(TelemetryTestResponse {
                ok,
                status_code: Some(status.as_u16()),
                message: if ok {
                    format!("ok: wrote 1 line to bucket={bucket}")
                } else {
                    format!("influx returned {status}: {body}")
                },
            })
        }
        Err(e) => Json(TelemetryTestResponse {
            ok: false,
            status_code: None,
            message: format!("request failed: {e}"),
        }),
    }
}

fn env_u32(k: &str, default: u32) -> u32 {
    std::env::var(k).ok().and_then(|s| s.parse().ok()).unwrap_or(default)
}

fn env_u64(k: &str, default: u64) -> u64 {
    std::env::var(k).ok().and_then(|s| s.parse().ok()).unwrap_or(default)
}

/// `sqlite:` または `sqlite://` 形式の URL からファイルパスを取り出す。
fn sqlite_path_from_url(s: &str) -> Option<String> {
    if let Some(rest) = s.strip_prefix("sqlite://") {
        Some(rest.to_string())
    } else if let Some(rest) = s.strip_prefix("sqlite:") {
        Some(rest.to_string())
    } else {
        Some(s.to_string())
    }
}

/// シークレットを伏字: `…last4`。空文字も空のまま返す。
fn mask(s: &str) -> String {
    let n = s.chars().count();
    if n <= 4 {
        "*".repeat(n)
    } else {
        let last4: String = s.chars().skip(n - 4).collect();
        format!("…{}", last4)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_short_string_becomes_stars() {
        assert_eq!(mask(""), "");
        assert_eq!(mask("a"), "*");
        assert_eq!(mask("abcd"), "****");
    }

    #[test]
    fn mask_long_string_keeps_last4() {
        assert_eq!(mask("abcde"), "…bcde");
        assert_eq!(mask("super-secret-token-XYZ9"), "…XYZ9");
    }

    #[test]
    fn mask_does_not_leak_any_full_secret() {
        let secret = "0123456789abcdef";
        let out = mask(secret);
        assert!(!out.contains("0123456789ab"));
        assert!(out.ends_with("cdef"));
    }

    #[test]
    fn sqlite_path_from_url_handles_all_forms() {
        assert_eq!(
            sqlite_path_from_url("sqlite://relay.db"),
            Some("relay.db".to_string())
        );
        assert_eq!(
            sqlite_path_from_url("sqlite:data/app.sqlite"),
            Some("data/app.sqlite".to_string())
        );
        assert_eq!(
            sqlite_path_from_url("/abs/path/foo.sqlite"),
            Some("/abs/path/foo.sqlite".to_string())
        );
        // Non-sqlite URL は素通し (現状仕様)
        assert_eq!(
            sqlite_path_from_url("postgres://x/y"),
            Some("postgres://x/y".to_string())
        );
    }

    #[test]
    fn env_u32_falls_back_on_missing_or_invalid() {
        // 名前が衝突しない適当なキーを使う。
        let key = "PROXY_TEST_ENV_U32_NONEXISTENT_999";
        std::env::remove_var(key);
        assert_eq!(env_u32(key, 42), 42);

        std::env::set_var(key, "not-a-number");
        assert_eq!(env_u32(key, 42), 42);

        std::env::set_var(key, "7");
        assert_eq!(env_u32(key, 42), 7);

        std::env::remove_var(key);
    }

    #[test]
    fn env_u64_parses_large_values() {
        let key = "PROXY_TEST_ENV_U64_NONEXISTENT_999";
        std::env::remove_var(key);
        assert_eq!(env_u64(key, 100), 100);

        std::env::set_var(key, "9999999999");
        assert_eq!(env_u64(key, 100), 9_999_999_999);

        std::env::remove_var(key);
    }

    #[test]
    fn init_started_at_is_idempotent() {
        let first = init_started_at();
        let second = init_started_at();
        assert_eq!(first, second);
        assert!(uptime_sec() < 60 * 60 * 24 * 365); // sanity
    }
}
