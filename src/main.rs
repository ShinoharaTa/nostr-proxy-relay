mod db;
mod nostr;
mod proxy;
mod filter;
mod parser;
mod auth;
mod api;
mod docs;

use db::{connect, migrate::migrate};
use anyhow::Context;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use axum::{
    extract::{ws::WebSocketUpgrade, ConnectInfo},
    http::header::ACCEPT,
    http::HeaderMap,
    routing::get,
    Router,
    response::{Html, IntoResponse, Json},
};
use std::net::SocketAddr;
use tower_http::services::{ServeDir, ServeFile};
use sqlx::SqlitePool;

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

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

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

    // Landing page configuration from environment variables
    let landing_config = docs::LandingPageConfig {
        relay_url: std::env::var("RELAY_URL").unwrap_or_else(|_| "wss://your-relay.example.com".to_string()),
        github_url: std::env::var("GITHUB_URL").unwrap_or_else(|_| "https://github.com/ShinoharaTa/nostr-proxy-relay".to_string()),
    };

    // Serve React admin UI from web/dist
    // For SPA: serve static files if they exist, otherwise serve index.html
    let index_html = std::fs::read_to_string("web/dist/index.html")
        .unwrap_or_else(|_| "<html><body>Admin UI not found. Please build the web app.</body></html>".to_string());
    
    // Serve static files from web/dist
    // Use fallback to serve index.html for SPA routing
    let static_dir = ServeDir::new("web/dist")
        .fallback(tower::service_fn({
            let html = index_html.clone();
            move |_req| {
                let html = html.clone();
                async move {
                    Ok::<_, std::convert::Infallible>(Html(html).into_response())
                }
            }
        }));
    
    let protected = Router::new()
        // index.html が `/assets/...` と `/vite.svg` を参照するため、/config だけでなくそれらも配信する
        // いずれも管理UIの一部なので Basic 認証で保護する
        .nest_service("/assets", ServeDir::new("web/dist/assets"))
        .route_service("/vite.svg", ServeFile::new("web/dist/vite.svg"))
        .nest_service("/config", static_dir)
        .layer(axum::middleware::from_fn_with_state(
            pool.clone(),
            auth::basic_auth,
        ));

    let app = Router::new()
        .merge(protected)
        .nest("/api", api::routes::router(pool.clone()))
        .nest("/docs", docs::router())
        .route(
            "/",
            get({
                let pool = pool.clone();
                let landing_config = landing_config.clone();
                move |ws: Option<WebSocketUpgrade>, headers: HeaderMap, ConnectInfo(addr): ConnectInfo<SocketAddr>| {
                    let pool = pool.clone();
                    let landing_config = landing_config.clone();
                    let client_ip = addr.ip().to_string();
                    async move {
                        // Check for NIP-11 request (Accept: application/nostr+json)
                        let accept_header = headers.get(ACCEPT)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("");
                        
                        if accept_header.contains("application/nostr+json") {
                            // NIP-11: Return relay information document
                            let info = get_nip11_info(&pool).await;
                            return (
                                [(axum::http::header::CONTENT_TYPE, "application/nostr+json")],
                                Json(info),
                            ).into_response();
                        }
                        
                        match ws {
                            Some(ws) => {
                                // WebSocket接続の場合
                                tracing::info!(ip = %client_ip, "WebSocket upgrade request received");
                                ws.on_upgrade(move |socket| async move {
                                    // DBから有効なリレーURLを取得
                                    let backend_url = get_backend_relay_url(&pool).await;
                                    if backend_url.is_empty() {
                                        tracing::warn!(ip = %client_ip, "No backend relay configured, closing connection");
                                        return;
                                    }
                                    tracing::info!(ip = %client_ip, backend_url = %backend_url, "Starting WebSocket proxy");
                                    if let Err(e) =
                                        crate::proxy::ws_proxy::proxy_ws_with_pool(socket, backend_url, Some(pool), Some(client_ip.clone())).await
                                    {
                                        tracing::warn!(ip = %client_ip, error = %e, "WebSocket proxy ended with error");
                                    } else {
                                        tracing::info!(ip = %client_ip, "WebSocket proxy ended normally");
                                    }
                                }).into_response()
                            }
                            None => {
                                // HTTP GETの場合はランディングページを表示
                                docs::serve_landing_page(&landing_config).into_response()
                            }
                        }
                    }
                }
            }),
        )
        .route(
            "/healthz",
            get(|| async { axum::http::StatusCode::OK }),
        );

    let addr: SocketAddr = "127.0.0.1:8080".parse()?;
    tracing::info!(%addr, "listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;
    Ok(())
}

