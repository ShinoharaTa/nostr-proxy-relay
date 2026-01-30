mod db;
mod nostr;
mod proxy;
mod filter;
mod parser;
mod auth;
mod api;

use db::{connect, migrate::migrate};
use anyhow::Context;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use axum::{
    extract::{ws::WebSocketUpgrade, ConnectInfo},
    routing::get,
    Router,
    response::{Html, IntoResponse},
};
use std::net::SocketAddr;
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    // default: local sqlite file in workspace
    let db_url =
        std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:data/app.sqlite".to_string());

    std::fs::create_dir_all("data")?;
    // ensure file exists for sqlite file-mode urls
    let _ = std::fs::File::create("data/app.sqlite");
    let pool = connect(&db_url).await?;
    migrate(&pool).await?;

    let admin_user = std::env::var("ADMIN_USER").context("ADMIN_USER is required")?;
    let admin_pass = std::env::var("ADMIN_PASS").context("ADMIN_PASS is required")?;
    auth::ensure_admin_user(&pool, &admin_user, &admin_pass).await?;

    tracing::info!("db migrated ok");

    let backend_url = std::env::var("BACKEND_RELAY_URL")
        .unwrap_or_else(|_| "wss://relay.damus.io".to_string());

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
        .route(
            "/",
            get({
                let backend_url = backend_url.clone();
                let pool = pool.clone();
                move |ws: WebSocketUpgrade, ConnectInfo(addr): ConnectInfo<SocketAddr>| {
                    let backend_url = backend_url.clone();
                    let pool = pool.clone();
                    let client_ip = addr.ip().to_string();
                    async move {
                        ws.on_upgrade(move |socket| async move {
                            if let Err(e) =
                                crate::proxy::ws_proxy::proxy_ws_with_pool(socket, backend_url, Some(pool), Some(client_ip)).await
                            {
                                tracing::warn!(error = %e, "ws proxy ended with error");
                            }
                        })
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

