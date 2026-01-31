use anyhow::Context;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::nostr::event::Event;
use crate::parser::filter_query::{self, CompiledFilter};

/// Cached compiled filter rule
struct CachedRule {
    id: i64,
    name: String,
    filter: CompiledFilter,
}

pub struct FilterEngine {
    // Minimal cache: kind1 event_id -> created_at
    kind1_created_at_by_id: HashMap<String, i64>,
    // Cached compiled filter rules
    compiled_rules: Arc<RwLock<Vec<CachedRule>>>,
    // Last time rules were loaded
    rules_loaded_at: Arc<RwLock<Option<std::time::Instant>>>,
}

/// 拒否ログを記録する
async fn log_rejection(
    pool: &SqlitePool,
    event: &Event,
    reason: &str,
    ip_address: Option<&str>,
) -> anyhow::Result<()> {
    let npub = match pubkey_hex_to_npub(&event.pubkey) {
        Ok(n) => n,
        Err(e) => {
            tracing::warn!(pubkey_hex = %event.pubkey, error = %e, "Failed to convert pubkey_hex to npub in log_rejection");
            "unknown".to_string()
        }
    };
    match sqlx::query(
        "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&event.id)
    .bind(&event.pubkey)
    .bind(&npub)
    .bind(ip_address)
    .bind(event.kind)
    .bind(reason)
    .execute(pool)
    .await {
        Ok(_) => {
            tracing::debug!(event_id = %event.id, npub = %npub, reason = %reason, "Logged event rejection");
            Ok(())
        }
        Err(e) => {
            tracing::error!(event_id = %event.id, npub = %npub, reason = %reason, error = %e, "Failed to insert event rejection log");
            Err(anyhow::anyhow!("Failed to log rejection: {}", e))
        }
    }
}

impl FilterEngine {
    pub fn new() -> Self {
        Self {
            kind1_created_at_by_id: HashMap::new(),
            compiled_rules: Arc::new(RwLock::new(Vec::new())),
            rules_loaded_at: Arc::new(RwLock::new(None)),
        }
    }

    /// Reload filter rules from database if needed (cached for 30 seconds)
    async fn reload_rules_if_needed(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        const CACHE_DURATION: std::time::Duration = std::time::Duration::from_secs(30);
        
        let should_reload = {
            let loaded_at = self.rules_loaded_at.read().await;
            loaded_at.map(|t| t.elapsed() > CACHE_DURATION).unwrap_or(true)
        };
        
        if should_reload {
            self.reload_rules(pool).await?;
        }
        
        Ok(())
    }

    /// Force reload filter rules from database
    async fn reload_rules(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        let rows: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, name, parsed_json FROM filter_rules WHERE enabled = 1 ORDER BY rule_order ASC, id ASC"
        )
        .fetch_all(pool)
        .await?;
        
        let mut new_rules = Vec::new();
        
        for (id, name, parsed_json) in rows {
            // Try to compile as DSL query first, then fall back to legacy format
            match filter_query::compile(&parsed_json) {
                Ok(filter) => {
                    tracing::debug!(rule_id = id, name = %name, "Loaded filter rule (DSL)");
                    new_rules.push(CachedRule { id, name, filter });
                }
                Err(e) => {
                    // The parsed_json might contain the DSL query directly or legacy JSON
                    tracing::debug!(rule_id = id, name = %name, error = %e, "Skipping invalid filter rule");
                }
            }
        }
        
        {
            let mut rules = self.compiled_rules.write().await;
            *rules = new_rules;
        }
        
        {
            let mut loaded_at = self.rules_loaded_at.write().await;
            *loaded_at = Some(std::time::Instant::now());
        }
        
        tracing::debug!("Reloaded filter rules from database");
        Ok(())
    }

    /// Check event against compiled filter rules
    async fn check_filter_rules(
        &self,
        pool: &SqlitePool,
        event: &Event,
        ip_address: Option<&str>,
    ) -> anyhow::Result<bool> {
        // Reload rules if needed
        self.reload_rules_if_needed(pool).await?;
        
        // Check if user has filter bypass
        if is_filter_bypass(pool, &event.pubkey).await? {
            return Ok(false);
        }
        
        // Check against all compiled rules
        let rules = self.compiled_rules.read().await;
        for rule in rules.iter() {
            if rule.filter.matches(event, &self.kind1_created_at_by_id) {
                let reason = format!("filter_rule:{}", rule.id);
                tracing::info!(
                    event_id = %event.id,
                    rule_id = rule.id,
                    rule_name = %rule.name,
                    "Event blocked by filter rule"
                );
                log_rejection(pool, event, &reason, ip_address).await?;
                return Ok(true);
            }
        }
        
        Ok(false)
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
        }

        // Check custom filter rules from database
        if self.check_filter_rules(pool, &event, ip_address).await? {
            return Ok(true);
        }

        // Legacy bot filter rule (kind6/7) with whitelist bypass
        // This is kept for backward compatibility
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

