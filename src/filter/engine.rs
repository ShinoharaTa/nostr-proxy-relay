use anyhow::Context;
use sqlx::SqlitePool;

use crate::nostr::event::Event;

pub struct FilterEngine {
    // Minimal cache: kind1 event_id -> created_at
    kind1_created_at_by_id: std::collections::HashMap<String, i64>,
}

/// 拒否ログを記録する
async fn log_rejection(
    pool: &SqlitePool,
    event: &Event,
    reason: &str,
    ip_address: Option<&str>,
) -> anyhow::Result<()> {
    let npub = pubkey_hex_to_npub(&event.pubkey).unwrap_or_else(|_| "unknown".to_string());
    let _ = sqlx::query(
        "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&event.id)
    .bind(&event.pubkey)
    .bind(&npub)
    .bind(ip_address)
    .bind(event.kind)
    .bind(reason)
    .execute(pool)
    .await;
    Ok(())
}

impl FilterEngine {
    pub fn new() -> Self {
        Self {
            kind1_created_at_by_id: std::collections::HashMap::new(),
        }
    }

    pub async fn should_drop_backend_text(
        &mut self,
        pool: &SqlitePool,
        text: &str,
    ) -> anyhow::Result<bool> {
        self.should_drop_backend_text_with_ip(pool, text, None).await
    }

    pub async fn should_drop_backend_text_with_ip(
        &mut self,
        pool: &SqlitePool,
        text: &str,
        ip_address: Option<&str>,
    ) -> anyhow::Result<bool> {
        let v: serde_json::Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(_) => return Ok(false), // non-json: ignore
        };
        let Some(arr) = v.as_array() else {
            return Ok(false);
        };
        if arr.first().and_then(|v| v.as_str()) != Some("EVENT") {
            return Ok(false);
        }

        // ["EVENT", <sub_id>, <event>]
        let ev_v = arr.get(2).context("EVENT missing event")?;
        let event: Event = serde_json::from_value(ev_v.clone()).context("parse event")?;

        // Npub BANチェック
        if is_npub_banned(pool, &event.pubkey).await? {
            log_rejection(pool, &event, "banned_npub", ip_address).await?;
            return Ok(true);
        }

        // Kindブラックリストチェック
        if is_kind_blacklisted(pool, event.kind).await? {
            log_rejection(pool, &event, "kind_blacklist", ip_address).await?;
            return Ok(true);
        }

        // cache kind1
        if event.kind == 1 {
            self.kind1_created_at_by_id
                .insert(event.id.clone(), event.created_at);
            return Ok(false);
        }

        // bot filter rule (kind6/7) with whitelist bypass
        if event.kind == 6 || event.kind == 7 {
            if is_filter_bypass(pool, &event.pubkey).await? {
                return Ok(false);
            }
            let Some(target_id) = event.first_e_tag_event_id() else {
                return Ok(false);
            };
            let Some(target_created_at) = self.kind1_created_at_by_id.get(target_id) else {
                return Ok(false); // cache miss => pass
            };
            if *target_created_at == event.created_at {
                log_rejection(pool, &event, "bot_filter", ip_address).await?;
                return Ok(true); // drop
            }
        }

        Ok(false)
    }
}

async fn is_filter_bypass(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = pubkey_hex_to_npub(pubkey_hex)?;
    let row: Option<(i64,)> = sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
        .bind(npub)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(flags,)| (flags & 2) == 2).unwrap_or(false))
}

/// NpubがBANされているか確認
async fn is_npub_banned(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = pubkey_hex_to_npub(pubkey_hex)?;
    let row: Option<(i64,)> = sqlx::query_as("SELECT banned FROM safelist WHERE npub = ?")
        .bind(npub)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(banned,)| banned == 1).unwrap_or(false))
}

/// Kindがブラックリストに登録されているか確認
async fn is_kind_blacklisted(pool: &SqlitePool, kind: i64) -> anyhow::Result<bool> {
    // 単一指定のチェック
    let single: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM req_kind_blacklist WHERE enabled = 1 AND kind_value = ?"
    )
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    if single.is_some() {
        return Ok(true);
    }

    // 範囲指定のチェック
    let range: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM req_kind_blacklist WHERE enabled = 1 AND kind_min IS NOT NULL AND kind_max IS NOT NULL AND ? BETWEEN kind_min AND kind_max"
    )
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    Ok(range.is_some())
}

fn pubkey_hex_to_npub(pubkey_hex: &str) -> anyhow::Result<String> {
    let bytes = hex::decode(pubkey_hex).context("pubkey hex decode")?;
    let hrp = bech32::Hrp::parse("npub").context("invalid bech32 hrp")?;
    Ok(bech32::encode::<bech32::Bech32>(hrp, &bytes)?)
}

