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
use axum::{extract::ws::WebSocketUpgrade, routing::get, Router};
use std::net::SocketAddr;

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

    let protected = Router::new()
        .route(
            "/config",
            get(|| async { "config ui (placeholder)" }),
        )
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
                move |ws: WebSocketUpgrade| async move {
                    ws.on_upgrade(move |socket| async move {
                        if let Err(e) =
                            crate::proxy::ws_proxy::proxy_ws_with_pool(socket, backend_url, Some(pool)).await
                        {
                            tracing::warn!(error = %e, "ws proxy ended with error");
                        }
                    })
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
    axum::serve(listener, app).await?;
    Ok(())
}

