use axum::body::Body;
use axum::http::{Request, StatusCode};
use base64::Engine;
use sqlx::SqlitePool;
use tower::ServiceExt;

use proxy_nostr_relay::{
    access::IpAclCache,
    api,
    auth,
    auth_throttle::AuthThrottle,
    config::SettingsCache,
    db,
    event_stream::LiveEventBus,
    filter::engine::FilterEngine,
    guard::AutoGuard,
    relay_pool::RelayPool,
    session_registry::SessionRegistry,
};

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

/// 管理 API ルータをテスト用に組み立てる。main.rs の配線と同じ依存を最小構成で用意する。
async fn setup_api_router(pool: &SqlitePool) -> axum::Router {
    let state = api::routes::ApiState {
        pool: pool.clone(),
        relay_pool: RelayPool::new(pool.clone()),
        settings: SettingsCache::load(pool.clone()).await.unwrap(),
        ip_acl: IpAclCache::new(pool.clone()),
        session_registry: SessionRegistry::new(),
        event_bus: LiveEventBus::new(16),
        auto_guard: AutoGuard::new(),
    };
    api::routes::router(state, AuthThrottle::from_env())
}

#[tokio::test]
async fn api_requires_basic_auth() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    let app = setup_api_router(&pool).await;

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
    let outcome = engine
        .should_drop_backend_text_with_ip(&pool, &kind1, None)
        .await
        .unwrap();
    assert!(!outcome.dropped);

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
    let outcome = engine
        .should_drop_backend_text_with_ip(&pool, &kind7_bypass, None)
        .await
        .unwrap();
    assert!(!outcome.dropped);

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
    let outcome = engine
        .should_drop_backend_text_with_ip(&pool, &kind7_drop, None)
        .await
        .unwrap();
    assert!(outcome.dropped);
    assert_eq!(outcome.reason.as_deref(), Some("bot_filter"));
}

#[tokio::test]
async fn auto_guard_api_roundtrip() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    let app = setup_api_router(&pool).await;
    let auth_header = basic_header("admin", "admin");

    // 既定値の取得（既定 OFF）
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/auto-guard")
                .header("authorization", &auth_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["enabled"], false);
    assert_eq!(v["burst_window_secs"], 60);
    assert_eq!(v["burst_max_events"], 30);

    // 設定を更新して有効化
    let put_body = serde_json::json!({
        "enabled": true,
        "burst_window_secs": 120,
        "burst_max_events": 50,
        "exclude_kinds": "6, 7",
        "duplicate_threshold": 4,
        "duplicate_window_secs": 600,
        "quarantine_secs": 300
    });
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/auto-guard")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(put_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["enabled"], true);
    assert_eq!(v["burst_window_secs"], 120);
    assert_eq!(v["exclude_kinds"], "6,7");
    assert_eq!(v["duplicate_threshold"], 4);

    // 不正値は 400
    let bad = serde_json::json!({
        "enabled": true,
        "burst_window_secs": 0,
        "burst_max_events": 10,
        "exclude_kinds": "",
        "duplicate_threshold": 3,
        "duplicate_window_secs": 300,
        "quarantine_secs": 600
    });
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/auto-guard")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(bad.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // content mute クリア
    let resp = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri("/auto-guard/content-mutes")
                .header("authorization", &auth_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn post_policy_api_includes_write_routing() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    let app = setup_api_router(&pool).await;
    let auth_header = basic_header("admin", "admin");

    // 既定は 'all'
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/post-policy")
                .header("authorization", &auth_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["write_routing"], "all");

    // primary_default へ切替
    let put_body = serde_json::json!({
        "policy": "denylist",
        "write_routing": "primary_default"
    });
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/post-policy")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(put_body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let v: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(v["policy"], "denylist");
    assert_eq!(v["write_routing"], "primary_default");

    // 不正な write_routing は 400
    let bad = serde_json::json!({ "policy": "denylist", "write_routing": "bogus" });
    let resp = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/post-policy")
                .header("authorization", &auth_header)
                .header("content-type", "application/json")
                .body(Body::from(bad.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

async fn get_json(
    app: &axum::Router,
    auth_header: &str,
    uri: &str,
) -> (StatusCode, serde_json::Value) {
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(uri)
                .header("authorization", auth_header)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = resp.status();
    let body = axum::body::to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let v: serde_json::Value = if body.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null)
    };
    (status, v)
}

#[tokio::test]
async fn actors_api_aggregates_and_joins_status() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();

    // 接続ログ: ip-a は 3 接続 / 30 イベント、ip-b は 1 接続 / 5 イベント
    for (ip, events, rejected) in [
        ("10.0.0.1", 10, 2),
        ("10.0.0.1", 10, 0),
        ("10.0.0.1", 10, 1),
        ("10.0.0.2", 5, 0),
    ] {
        sqlx::query(
            "INSERT INTO connection_logs (ip_address, event_count, rejected_event_count) VALUES (?, ?, ?)",
        )
        .bind(ip)
        .bind(events)
        .bind(rejected)
        .execute(&pool)
        .await
        .unwrap();
    }
    // ip-a は shadow_ban 済み
    sqlx::query(
        "INSERT INTO ip_access_control (ip_address, mode, memo) VALUES ('10.0.0.1', 'shadow_ban', '')",
    )
    .execute(&pool)
    .await
    .unwrap();

    // 拒否ログ: npub-x が 2 件、npub-y が 1 件。npub-x は quarantine 中
    for (npub, kind, reason) in [
        ("npub1xxxx", 1, "bot_filter"),
        ("npub1xxxx", 7, "bot_filter"),
        ("npub1yyyy", 1, "kind_blacklist"),
    ] {
        sqlx::query(
            "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason)              VALUES ('ev', 'pk', ?, '10.0.0.1', ?, ?)",
        )
        .bind(npub)
        .bind(kind)
        .bind(reason)
        .execute(&pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO quarantine_entries (npub, scope, reason, expires_at)          VALUES ('npub1xxxx', 'post', 'auto_guard:burst', datetime('now', '+10 minutes'))",
    )
    .execute(&pool)
    .await
    .unwrap();

    let app = setup_api_router(&pool).await;
    let auth_header = basic_header("admin", "admin");

    // by=ip: 接続数の多い順 + mode JOIN
    let (status, v) = get_json(&app, &auth_header, "/stats/actors?by=ip&window=all").await;
    assert_eq!(status, StatusCode::OK);
    let actors = v["actors"].as_array().unwrap();
    assert_eq!(actors.len(), 2);
    assert_eq!(actors[0]["ip"], "10.0.0.1");
    assert_eq!(actors[0]["connections"], 3);
    assert_eq!(actors[0]["events"], 30);
    assert_eq!(actors[0]["rejections"], 3);
    assert_eq!(actors[0]["mode"], "shadow_ban");
    assert_eq!(actors[1]["ip"], "10.0.0.2");
    assert_eq!(actors[1]["mode"], "normal");

    // by=npub: 拒否数の多い順 + quarantine JOIN
    let (status, v) = get_json(&app, &auth_header, "/stats/actors?by=npub&window=all").await;
    assert_eq!(status, StatusCode::OK);
    let actors = v["actors"].as_array().unwrap();
    assert_eq!(actors[0]["npub"], "npub1xxxx");
    assert_eq!(actors[0]["rejections"], 2);
    assert_eq!(actors[0]["quarantined"], true);
    assert_eq!(actors[1]["npub"], "npub1yyyy");
    assert_eq!(actors[1]["quarantined"], false);

    // 不正パラメータは 400
    let (status, _) = get_json(&app, &auth_header, "/stats/actors?by=bogus").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = get_json(&app, &auth_header, "/stats/actors?by=ip&window=3y").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // 詳細: ip
    let (status, v) = get_json(&app, &auth_header, "/actors/ip/10.0.0.1").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["connections"], 3);
    assert_eq!(v["mode"], "shadow_ban");
    assert_eq!(v["recent_rejections"].as_array().unwrap().len(), 3);
    assert_eq!(v["acl_entries"].as_array().unwrap().len(), 1);

    // 詳細: npub
    let (status, v) = get_json(&app, &auth_header, "/actors/npub/npub1xxxx").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["rejections"], 2);
    assert_eq!(v["quarantine_entries"].as_array().unwrap().len(), 1);
    assert!(v["safelist"].is_null());
}

#[tokio::test]
async fn investigate_api_validates_and_reports_no_relay() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    let app = setup_api_router(&pool).await;
    let auth_header = basic_header("admin", "admin");

    let post = |body: serde_json::Value| {
        let app = app.clone();
        let auth_header = auth_header.clone();
        async move {
            let resp = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri("/investigate")
                        .header("authorization", auth_header)
                        .header("content-type", "application/json")
                        .body(Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            resp.status()
        }
    };

    // 条件が空なら 400
    assert_eq!(post(serde_json::json!({})).await, StatusCode::BAD_REQUEST);

    // 条件はあるがバックエンドリレー未設定なら 503（保存も副作用も無い）
    // hex 64 桁は正規化を通過する
    let hex_id = "aebe917a224983504fd0f54a71cbb0b3ba62e8f83b87c9e17dfa2c04a2d4b4f1";
    assert_eq!(
        post(serde_json::json!({ "ids": [hex_id] })).await,
        StatusCode::SERVICE_UNAVAILABLE
    );

    // NIP-19 正規化: nsec は接続確認より前に 400 で拒否される（#35 P1）
    assert_eq!(
        post(serde_json::json!({
            "authors": ["nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"]
        })).await,
        StatusCode::BAD_REQUEST
    );
    // npub は authors として通る（リレー無しなので 503 まで到達 = 正規化成功）
    assert_eq!(
        post(serde_json::json!({
            "authors": ["npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"]
        })).await,
        StatusCode::SERVICE_UNAVAILABLE
    );
    // 型違い（authors に note1）は 400
    let hrp = bech32::Hrp::parse("note").unwrap();
    let note = bech32::encode::<bech32::Bech32>(hrp, &hex::decode(hex_id).unwrap()).unwrap();
    assert_eq!(
        post(serde_json::json!({ "authors": [note.clone()] })).await,
        StatusCode::BAD_REQUEST
    );
    // refs に note1 は通る
    assert_eq!(
        post(serde_json::json!({ "refs": [note] })).await,
        StatusCode::SERVICE_UNAVAILABLE
    );
}

#[tokio::test]
async fn relay_suspend_resume_lifecycle() {
    let pool = setup_pool().await;
    auth::ensure_admin_user(&pool, "admin", "admin").await.unwrap();
    for url in ["wss://a.example", "wss://b.example"] {
        sqlx::query("INSERT INTO relay_config (url, enabled) VALUES (?, 1)")
            .bind(url)
            .execute(&pool)
            .await
            .unwrap();
    }
    let app = setup_api_router(&pool).await;
    let auth_header = basic_header("admin", "admin");

    let post = |uri: &'static str, body: serde_json::Value| {
        let app = app.clone();
        let auth_header = auth_header.clone();
        async move {
            let resp = app
                .oneshot(
                    Request::builder()
                        .method("POST")
                        .uri(uri)
                        .header("authorization", auth_header)
                        .header("content-type", "application/json")
                        .body(Body::from(body.to_string()))
                        .unwrap(),
                )
                .await
                .unwrap();
            resp.status()
        }
    };

    // 一時停止 → enabled=0 かつ disabled_until が入る
    assert_eq!(
        post("/relay/suspend", serde_json::json!({ "url": "wss://a.example", "duration_secs": 600 })).await,
        StatusCode::OK
    );
    let row: (i64, Option<String>) =
        sqlx::query_as("SELECT enabled, disabled_until FROM relay_config WHERE url = 'wss://a.example'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.0, 0);
    assert!(row.1.is_some(), "disabled_until must be set");

    // 残り 1 本になったので、それ以上は止めさせない
    assert_eq!(
        post("/relay/suspend", serde_json::json!({ "url": "wss://b.example" })).await,
        StatusCode::CONFLICT
    );

    // 存在しない URL は 404
    assert_eq!(
        post("/relay/suspend", serde_json::json!({ "url": "wss://nope.example" })).await,
        StatusCode::NOT_FOUND
    );

    // 復帰 → enabled=1 かつ disabled_until が NULL に戻る
    assert_eq!(
        post("/relay/resume", serde_json::json!({ "url": "wss://a.example" })).await,
        StatusCode::OK
    );
    let row: (i64, Option<String>) =
        sqlx::query_as("SELECT enabled, disabled_until FROM relay_config WHERE url = 'wss://a.example'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(row.0, 1);
    assert!(row.1.is_none(), "disabled_until must be cleared");
}
