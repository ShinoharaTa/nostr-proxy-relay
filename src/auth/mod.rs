use anyhow::Context;
use axum::{
    extract::{Request, State},
    http::{header, HeaderValue, StatusCode},
    middleware::Next,
    response::Response,
};
use base64::Engine;
use sqlx::SqlitePool;

/// Ensure an admin user exists (idempotent).
pub async fn ensure_admin_user(
    pool: &SqlitePool,
    username: &str,
    password: &str,
) -> anyhow::Result<()> {
    let existing: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM auth_users WHERE username = ?")
        .bind(username)
        .fetch_optional(pool)
        .await?;
    if existing.is_some() {
        return Ok(());
    }

    let hash = bcrypt::hash(password, bcrypt::DEFAULT_COST).context("bcrypt hash")?;
    sqlx::query("INSERT INTO auth_users (username, password_hash) VALUES (?, ?)")
        .bind(username)
        .bind(hash)
        .execute(pool)
        .await?;
    Ok(())
}

/// Basic auth middleware for admin endpoints.
pub async fn basic_auth(
    State(pool): State<SqlitePool>,
    req: Request,
    next: Next,
) -> Response {
    let auth = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let Some((username, password)) = parse_basic_auth(auth) else {
        return unauthorized();
    };

    let row: Option<(String,)> =
        sqlx::query_as("SELECT password_hash FROM auth_users WHERE username = ?")
            .bind(&username)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();

    let Some((hash,)) = row else {
        return unauthorized();
    };
    let ok = bcrypt::verify(&password, &hash).unwrap_or(false);
    if !ok {
        return unauthorized();
    }

    next.run(req).await
}

fn parse_basic_auth(auth_header: &str) -> Option<(String, String)> {
    let auth_header = auth_header.trim();
    let b64 = auth_header.strip_prefix("Basic ")?;
    let raw = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    let s = std::str::from_utf8(&raw).ok()?;
    let (user, pass) = s.split_once(':')?;
    Some((user.to_string(), pass.to_string()))
}

pub fn www_authenticate_value() -> HeaderValue {
    HeaderValue::from_static("Basic realm=\"config\"")
}

fn unauthorized() -> Response {
    let mut resp = Response::new(axum::body::Body::empty());
    *resp.status_mut() = StatusCode::UNAUTHORIZED;
    resp.headers_mut()
        .insert(header::WWW_AUTHENTICATE, www_authenticate_value());
    resp
}

