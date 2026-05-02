mod access;
mod api;
mod auth;
mod auth_throttle;
mod config;
mod db;
mod docs;
mod event_counter;
mod event_stream;
mod filter;
mod log_cleaner;
mod metrics;
mod nostr;
mod parser;
mod proxy;
mod relay_pool;
mod session_registry;

use db::{connect, migrate::migrate};
use anyhow::Context;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use tracing_appender::non_blocking::WorkerGuard;
use axum::{
    extract::{ws::WebSocketUpgrade, ConnectInfo},
    http::header::ACCEPT,
    http::HeaderMap,
    routing::get,
    Router,
    response::{Html, IntoResponse, Json},
};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use sqlx::SqlitePool;
use rust_embed::Embed;
use crate::access::IpAclCache;
use crate::config::SettingsCache;
use crate::event_counter::EventCounter;
use crate::event_stream::LiveEventBus;
use crate::proxy::ws_proxy::ProxyContext;
use crate::relay_pool::RelayPool;
use crate::session_registry::SessionRegistry;

#[derive(Embed)]
#[folder = "web/dist"]
struct Asset;

const LOG_FILE_PREFIX: &str = "proxy-nostr-relay.log.";
const LOG_RETENTION_HOURS: u64 = 72;

fn setup_logging() -> anyhow::Result<WorkerGuard> {
    let log_dir = std::env::var("LOG_DIR").unwrap_or_else(|_| "logs".to_string());
    std::fs::create_dir_all(&log_dir)?;

    let file_appender = tracing_appender::rolling::hourly(&log_dir, "proxy-nostr-relay.log");
    let (file_writer, file_guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(file_writer),
        )
        .init();

    spawn_log_cleanup_task(
        PathBuf::from(log_dir),
        Duration::from_secs(LOG_RETENTION_HOURS * 60 * 60),
    );

    Ok(file_guard)
}

fn spawn_log_cleanup_task(log_dir: PathBuf, retention: Duration) {
    tokio::spawn(async move {
        if let Err(e) = cleanup_old_log_files(&log_dir, retention) {
            tracing::warn!(error = %e, "Failed to clean up old log files");
        }

        let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));
        interval.tick().await; // skip immediate first tick
        loop {
            interval.tick().await;
            if let Err(e) = cleanup_old_log_files(&log_dir, retention) {
                tracing::warn!(error = %e, "Failed to clean up old log files");
            }
        }
    });
}

fn cleanup_old_log_files(log_dir: &Path, retention: Duration) -> anyhow::Result<()> {
    let now = SystemTime::now();
    for entry in std::fs::read_dir(log_dir)? {
        let entry = match entry {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, "Failed to read an entry in log directory");
                continue;
            }
        };
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !file_name.starts_with(LOG_FILE_PREFIX) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, path = %path.display(), "Failed to read log file metadata");
                continue;
            }
        };
        let modified = match metadata.modified() {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, path = %path.display(), "Failed to read log file modified time");
                continue;
            }
        };
        let age = match now.duration_since(modified) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if age > retention {
            match std::fs::remove_file(&path) {
                Ok(_) => tracing::info!(path = %path.display(), "Removed expired log file"),
                Err(e) => tracing::warn!(error = %e, path = %path.display(), "Failed to remove expired log file"),
            }
        }
    }
    Ok(())
}

/// DBから有効なバックエンドリレーURLを取得
async fn get_backend_relay_url(pool: &SqlitePool) -> String {
    let result: Option<(String,)> = sqlx::query_as(
        "SELECT url FROM relay_config WHERE enabled = 1 ORDER BY id ASC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    
    result.map(|(url,)| url).unwrap_or_default()
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct RelayInfoDb {
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
    pub limitation_auth_required: i64,
    pub limitation_payment_required: i64,
    pub icon: Option<String>,
    pub limitation_max_limit: Option<i64>,
    pub negentropy: i64,
}

/// NIP-11 Relay Information Document
async fn get_nip11_info(pool: &SqlitePool) -> serde_json::Value {
    let row = sqlx::query_as::<_, RelayInfoDb>(
        "SELECT name, description, pubkey, contact, supported_nips, software, version, 
         limitation_max_message_length, limitation_max_subscriptions, limitation_max_filters,
         limitation_max_event_tags, limitation_max_content_length, limitation_auth_required,
         limitation_payment_required, icon, limitation_max_limit, negentropy
         FROM relay_info WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let row = row.unwrap_or(RelayInfoDb {
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
        limitation_auth_required: 0,
        limitation_payment_required: 0,
        icon: None,
        limitation_max_limit: None,
        negentropy: 0,
    });

    let name = row.name;
    let description = row.description;
    let pubkey = row.pubkey;
    let contact = row.contact;
    let supported_nips_str = row.supported_nips;
    let software = row.software;
    let version = row.version;
    let max_msg_len = row.limitation_max_message_length;
    let max_subs = row.limitation_max_subscriptions;
    let max_filters = row.limitation_max_filters;
    let max_event_tags = row.limitation_max_event_tags;
    let max_content_len = row.limitation_max_content_length;
    let auth_required = row.limitation_auth_required;
    let payment_required = row.limitation_payment_required;
    let icon = row.icon;
    let max_limit = row.limitation_max_limit;
    let negentropy = row.negentropy;

    // Parse supported_nips from JSON string to array
    let supported_nips: Vec<i64> = supported_nips_str
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| vec![1, 11]);

    // Build limitation object if any limits are set
    let mut limitation = serde_json::Map::new();
    if let Some(v) = max_limit { limitation.insert("max_limit".to_string(), serde_json::json!(v)); }
    if let Some(v) = max_msg_len { limitation.insert("max_message_length".to_string(), serde_json::json!(v)); }
    if let Some(v) = max_subs { limitation.insert("max_subscriptions".to_string(), serde_json::json!(v)); }
    if let Some(v) = max_filters { limitation.insert("max_filters".to_string(), serde_json::json!(v)); }
    if let Some(v) = max_event_tags { limitation.insert("max_event_tags".to_string(), serde_json::json!(v)); }
    if let Some(v) = max_content_len { limitation.insert("max_content_length".to_string(), serde_json::json!(v)); }
    if auth_required != 0 { limitation.insert("auth_required".to_string(), serde_json::json!(true)); }
    if payment_required != 0 { limitation.insert("payment_required".to_string(), serde_json::json!(true)); }

    let mut info = serde_json::Map::new();
    if let Some(v) = name { info.insert("name".to_string(), serde_json::json!(v)); }
    if let Some(v) = description { info.insert("description".to_string(), serde_json::json!(v)); }
    if let Some(v) = pubkey { info.insert("pubkey".to_string(), serde_json::json!(v)); }
    if let Some(v) = contact { info.insert("contact".to_string(), serde_json::json!(v)); }
    info.insert("supported_nips".to_string(), serde_json::json!(supported_nips));
    if let Some(v) = software { info.insert("software".to_string(), serde_json::json!(v)); }
    if let Some(v) = version { info.insert("version".to_string(), serde_json::json!(v)); }
    if !limitation.is_empty() { info.insert("limitation".to_string(), serde_json::Value::Object(limitation)); }
    if let Some(v) = icon { info.insert("icon".to_string(), serde_json::json!(v)); }
    if negentropy != 0 { info.insert("negentropy".to_string(), serde_json::json!(negentropy)); }

    serde_json::Value::Object(info)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // .envファイルを読み込む（存在しなくてもエラーにならない）
    let _ = dotenvy::dotenv();

    let _log_guard = setup_logging()?;

    // default: local sqlite file in workspace
    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data/app.sqlite".to_string());

    std::fs::create_dir_all("data")?;
    // SQLiteは自動的にファイルを作成するため、既存ファイルを空にしないように注意
    // ファイルが存在しない場合のみ作成する
    let db_path = "data/app.sqlite";
    if !std::path::Path::new(db_path).exists() {
        let _ = std::fs::File::create(db_path);
    }
    let pool = connect(&db_url).await?;
    migrate(&pool).await?;

    let admin_user = std::env::var("ADMIN_USER").context("ADMIN_USER is required")?;
    let admin_pass = std::env::var("ADMIN_PASS").context("ADMIN_PASS is required")?;
    auth::ensure_admin_user(&pool, &admin_user, &admin_pass).await?;

    tracing::info!("db migrated ok");

    let relay_pool = RelayPool::new(pool.clone());
    let settings = SettingsCache::load(pool.clone()).await?;
    let ip_acl = IpAclCache::new(pool.clone());
    let session_registry = SessionRegistry::new();
    let event_counter = EventCounter::new();
    let event_bus = LiveEventBus::new(1024);
    let auth_throttle = crate::auth_throttle::AuthThrottle::from_env();

    event_counter.clone().spawn_flush_task(pool.clone());
    crate::event_counter::spawn_retention_task(pool.clone(), 30);
    crate::access::quarantine::spawn_expiry_task(pool.clone());
    crate::log_cleaner::spawn(pool.clone());

    if let Some(influx) = metrics::InfluxExporter::from_env() {
        influx
            .clone()
            .run(pool.clone(), Some(relay_pool.clone()), Some(event_counter.clone()));
        tracing::info!("InfluxDB metrics exporter started");
    }

    let proxy_ctx = ProxyContext {
        pool: pool.clone(),
        settings: settings.clone(),
        ip_acl: ip_acl.clone(),
        session_registry: session_registry.clone(),
        event_counter: event_counter.clone(),
        event_bus: event_bus.clone(),
    };

    // Landing page configuration from environment variables
    let landing_config = docs::LandingPageConfig {
        relay_url: std::env::var("RELAY_URL").unwrap_or_else(|_| "wss://your-relay.example.com".to_string()),
        github_url: std::env::var("GITHUB_URL").unwrap_or_else(|_| "https://github.com/ShinoharaTa/nostr-proxy-relay".to_string()),
    };

    // Serve React admin UI from embedded assets
    // For SPA: serve static files if they exist, otherwise serve index.html
    let static_dir = tower::service_fn({
        move |req: axum::http::Request<axum::body::Body>| {
            let path = req.uri().path().to_string();
            async move {
                let path = path.trim_start_matches("/config").trim_start_matches('/');
                let path = if path.is_empty() { "index.html" } else { path };
                
                // index.html is always read fresh and never browser-cached.
                // Hashed assets (JS/CSS) can be cached long-term.
                if path == "index.html" {
                    let html = Asset::get("index.html")
                        .map(|c| String::from_utf8_lossy(&c.data).to_string())
                        .unwrap_or_else(|| "<html><body>Admin UI not found.</body></html>".to_string());
                    return Ok::<_, std::convert::Infallible>(
                        axum::response::Response::builder()
                            .header(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
                            .header(axum::http::header::CACHE_CONTROL, "no-cache")
                            .body(axum::body::Body::from(html))
                            .unwrap()
                    );
                }

                match Asset::get(path) {
                    Some(content) => {
                        let mime = mime_guess::from_path(path).first_or_octet_stream();
                        let mut builder = axum::response::Response::builder()
                            .header(axum::http::header::CONTENT_TYPE, mime.as_ref());
                        // Hashed assets get long-term cache; others get no-cache
                        if path.starts_with("assets/") {
                            builder = builder.header(axum::http::header::CACHE_CONTROL, "public, max-age=31536000, immutable");
                        }
                        Ok::<_, std::convert::Infallible>(
                            builder.body(axum::body::Body::from(content.data)).unwrap()
                        )
                    }
                    None => {
                        // SPA fallback: return index.html for page routes only.
                        // Static assets (paths with file extensions) get 404 instead.
                        let has_extension = path.rsplit('/').next().map_or(false, |s| s.contains('.'));
                        if has_extension {
                            Ok::<_, std::convert::Infallible>(
                                axum::http::StatusCode::NOT_FOUND.into_response()
                            )
                        } else {
                            // Read index.html fresh (not cached) so it stays in sync with assets
                            let html = Asset::get("index.html")
                                .map(|c| String::from_utf8_lossy(&c.data).to_string())
                                .unwrap_or_else(|| "<html><body>Admin UI not found.</body></html>".to_string());
                            Ok::<_, std::convert::Infallible>(
                                axum::response::Response::builder()
                                    .header(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
                                    .header(axum::http::header::CACHE_CONTROL, "no-cache")
                                    .body(axum::body::Body::from(html))
                                    .unwrap()
                            )
                        }
                    }
                }
            }
        }
    });
    
    let protected = Router::new()
        // index.html が `/assets/...` と `/vite.svg` を参照するため、それらも埋め込み資産から配信する
        .route("/vite.svg", get(|| async {
            match Asset::get("vite.svg") {
                Some(content) => {
                    let mut res = axum::body::Body::from(content.data).into_response();
                    res.headers_mut().insert(axum::http::header::CONTENT_TYPE, axum::http::HeaderValue::from_static("image/svg+xml"));
                    res
                }
                None => axum::http::StatusCode::NOT_FOUND.into_response(),
            }
        }))
        .nest_service("/assets", tower::service_fn(|req: axum::http::Request<axum::body::Body>| async move {
            // `nest_service("/assets", ...)` はリクエストパスから `/assets` プレフィックスを取り除いて
            // サービスに渡すため、ここで埋め込み資産の実パス `assets/...` に正規化する。
            let mut path = req.uri().path().trim_start_matches('/').to_string();
            if !path.starts_with("assets/") {
                path = format!("assets/{}", path);
            }
            match Asset::get(&path) {
                Some(content) => {
                    let mime = mime_guess::from_path(&path).first_or_octet_stream();
                    Ok::<_, std::convert::Infallible>(
                        axum::response::Response::builder()
                            .header(axum::http::header::CONTENT_TYPE, mime.as_ref())
                            .body(axum::body::Body::from(content.data))
                            .unwrap()
                    )
                }
                None => Ok::<_, std::convert::Infallible>(axum::http::StatusCode::NOT_FOUND.into_response()),
            }
        }))
        .nest_service("/config", static_dir)
        .layer(axum::middleware::from_fn_with_state(
            pool.clone(),
            auth::basic_auth_legacy,
        ));

    let api_state = api::routes::ApiState {
        pool: pool.clone(),
        relay_pool: relay_pool.clone(),
        settings: settings.clone(),
        ip_acl: ip_acl.clone(),
        session_registry: session_registry.clone(),
        event_bus: event_bus.clone(),
    };

    let app = Router::new()
        .merge(protected)
        .nest("/api", api::routes::router(api_state, auth_throttle.clone()))
        .nest("/docs", docs::router())
        .route(
            "/",
            get({
                let pool = pool.clone();
                let landing_config = landing_config.clone();
                let proxy_ctx = proxy_ctx.clone();
                move |ws: Option<WebSocketUpgrade>, headers: HeaderMap, ConnectInfo(addr): ConnectInfo<SocketAddr>| {
                    let pool = pool.clone();
                    let landing_config = landing_config.clone();
                    let proxy_ctx = proxy_ctx.clone();
                    let client_ip = addr.ip().to_string();
                    async move {
                        let accept_header = headers
                            .get(ACCEPT)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("");

                        if accept_header.contains("application/nostr+json") {
                            let info = get_nip11_info(&pool).await;
                            return (
                                [(axum::http::header::CONTENT_TYPE, "application/nostr+json")],
                                Json(info),
                            )
                                .into_response();
                        }

                        match ws {
                            Some(ws) => {
                                tracing::info!(ip = %client_ip, "WebSocket upgrade request received");
                                ws.on_upgrade(move |socket| async move {
                                    let backend_url = get_backend_relay_url(&pool).await;
                                    if backend_url.is_empty() {
                                        tracing::warn!(ip = %client_ip, "No backend relay configured");
                                        return;
                                    }
                                    if let Err(e) = crate::proxy::ws_proxy::proxy_ws_with_ctx(
                                        socket,
                                        backend_url,
                                        proxy_ctx,
                                        client_ip.clone(),
                                    )
                                    .await
                                    {
                                        tracing::warn!(ip = %client_ip, error = %e, "WebSocket proxy ended with error");
                                    }
                                })
                                .into_response()
                            }
                            None => docs::serve_landing_page(&landing_config).into_response(),
                        }
                    }
                }
            }),
        )
        .route("/healthz", get(|| async { axum::http::StatusCode::OK }));

    let addr: SocketAddr = "127.0.0.1:8080".parse()?;
    tracing::info!(%addr, "listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

