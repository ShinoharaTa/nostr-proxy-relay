use axum::body::Body;
use axum::http::{Request, StatusCode};
use base64::Engine;
use sqlx::SqlitePool;
use tower::ServiceExt;

use proxy_nostr_relay::{api, auth, db, filter::engine::FilterEngine};

fn basic_header(user: &str, pass: &str) -> String {
    let raw = format!("{user}:{pass}");
    let b64 = base64::engine::general_purpose::STANDARD.encode(raw.as_bytes());
    format!("Basic {b64}")
}

async fn setup_pool() -> SqlitePool {
    let pool = db::connect("sqlite::memory:").await.unwrap();
    db::migrate::migrate(&pool).await.unwrap();
    pool
}

#[tokio::test]
async fn api_requires_basic_auth() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    let app = api::routes::router(pool.clone());

    // without auth
    let resp = app
        .clone()
        .oneshot(Request::builder().uri("/safelist").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);

    // with auth
    let resp = app
        .oneshot(
            Request::builder()
                .uri("/safelist")
                .header("authorization", basic_header("admin", "admin"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn filter_drops_kind7_same_created_at_as_cached_kind1() {
    let pool = setup_pool().await;

    // Prepare a "filter bypass" whitelist entry
    let pubkey_hex = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    let hrp = bech32::Hrp::parse("npub").unwrap();
    let npub = bech32::encode::<bech32::Bech32>(hrp, &hex::decode(pubkey_hex).unwrap()).unwrap();
    sqlx::query("INSERT INTO safelist (npub, flags, memo) VALUES (?, 2, 'bypass')")
        .bind(&npub)
        .execute(&pool)
        .await
        .unwrap();

    let mut engine = FilterEngine::new();

    // cache kind1
    let kind1 = serde_json::json!(["EVENT", "sub", {
        "id": "kind1id",
        "pubkey": pubkey_hex,
        "created_at": 123,
        "kind": 1,
        "tags": [],
        "content": "hello",
        "sig": "sig"
    }])
    .to_string();
    assert!(!engine.should_drop_backend_text(&pool, &kind1).await.unwrap());

    // kind7 referencing kind1 with same created_at BUT pubkey is bypassed => should not drop
    let kind7_bypass = serde_json::json!(["EVENT", "sub", {
        "id": "kind7id",
        "pubkey": pubkey_hex,
        "created_at": 123,
        "kind": 7,
        "tags": [["e", "kind1id"]],
        "content": "👁️",
        "sig": "sig"
    }])
    .to_string();
    assert!(!engine.should_drop_backend_text(&pool, &kind7_bypass).await.unwrap());

    // non-bypassed pubkey: should drop when created_at equals cached kind1
    let pubkey_hex2 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    let kind7_drop = serde_json::json!(["EVENT", "sub", {
        "id": "kind7id2",
        "pubkey": pubkey_hex2,
        "created_at": 123,
        "kind": 7,
        "tags": [["e", "kind1id"]],
        "content": "👁️",
        "sig": "sig"
    }])
    .to_string();
    assert!(engine.should_drop_backend_text(&pool, &kind7_drop).await.unwrap());
}

