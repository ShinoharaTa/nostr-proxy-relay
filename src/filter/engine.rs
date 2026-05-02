use anyhow::Context;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::access::npub_key::pubkey_hex_to_npub;
use crate::nostr::event::Event;
use crate::parser::filter_query::{self, CompiledFilter};

/// 評価方向: バックエンド由来 EVENT に適用するか、クライアント送信 EVENT (POST) に適用するか。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterDirection {
    /// バックエンドから受信した EVENT を REQ レスポンスとして返すか
    Backend,
    /// クライアントから受信した EVENT を上流に POST するか
    Post,
}

/// DSL ルールのキャッシュ。
struct CachedRule {
    id: i64,
    name: String,
    filter: CompiledFilter,
    apply_to_backend: bool,
    apply_to_post: bool,
}

/// Simple BAN ルール（テーブル simple_ban_rules）の評価可能形式。
#[derive(Clone)]
struct SimpleRule {
    id: i64,
    rule_type: SimpleRuleType,
    npubs: Option<Vec<String>>,
    kinds: Option<Vec<i64>>,
    tag_name: Option<String>,
    tag_pattern: Option<String>,
    apply_to_backend: bool,
    apply_to_post: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SimpleRuleType {
    Npub,
    Kind,
    NpubKind,
    TagContains,
}

impl SimpleRuleType {
    fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "npub" => Self::Npub,
            "kind" => Self::Kind,
            "npub_kind" => Self::NpubKind,
            "tag_contains" => Self::TagContains,
            _ => return None,
        })
    }
}

pub struct FilterEngine {
    kind1_created_at_by_id: HashMap<String, i64>,
    compiled_rules: Arc<RwLock<Vec<CachedRule>>>,
    simple_rules: Arc<RwLock<Vec<SimpleRule>>>,
    rules_loaded_at: Arc<RwLock<Option<std::time::Instant>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterMatch {
    pub kind: MatchKind,
    pub rule_id: i64,
    pub rule_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MatchKind {
    Dsl,
    Simple,
}

impl FilterEngine {
    pub fn new() -> Self {
        Self {
            kind1_created_at_by_id: HashMap::new(),
            compiled_rules: Arc::new(RwLock::new(Vec::new())),
            simple_rules: Arc::new(RwLock::new(Vec::new())),
            rules_loaded_at: Arc::new(RwLock::new(None)),
        }
    }

    async fn reload_if_needed(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        const TTL: Duration = Duration::from_secs(30);
        let need = {
            let g = self.rules_loaded_at.read().await;
            g.map(|t| t.elapsed() > TTL).unwrap_or(true)
        };
        if need {
            self.reload(pool).await?;
        }
        Ok(())
    }

    pub async fn force_reload(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        self.reload(pool).await
    }

    async fn reload(&self, pool: &SqlitePool) -> anyhow::Result<()> {
        // DSL ルール
        let rows: Vec<(i64, String, String, i64, i64)> = sqlx::query_as(
            "SELECT id, name, parsed_json, apply_to_post, apply_to_backend \
             FROM filter_rules WHERE enabled = 1 ORDER BY rule_order ASC, id ASC",
        )
        .fetch_all(pool)
        .await?;
        let mut compiled = Vec::with_capacity(rows.len());
        for (id, name, parsed_json, apply_to_post, apply_to_backend) in rows {
            match filter_query::compile(&parsed_json) {
                Ok(filter) => compiled.push(CachedRule {
                    id,
                    name,
                    filter,
                    apply_to_post: apply_to_post != 0,
                    apply_to_backend: apply_to_backend != 0,
                }),
                Err(e) => tracing::warn!(rule_id = id, name = %name, error = %e, "skip invalid filter rule"),
            }
        }
        {
            let mut g = self.compiled_rules.write().await;
            *g = compiled;
        }

        // Simple BAN ルール
        let srows: Vec<(i64, String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64)> = sqlx::query_as(
            "SELECT id, rule_type, npub_list, kind_list, tag_name, tag_value_pattern, apply_to_post, apply_to_backend \
             FROM simple_ban_rules WHERE enabled = 1 ORDER BY id ASC",
        )
        .fetch_all(pool)
        .await?;
        let mut simples = Vec::with_capacity(srows.len());
        for (id, rule_type, npub_list, kind_list, tag_name, tag_value_pattern, apply_to_post, apply_to_backend) in srows {
            let Some(rt) = SimpleRuleType::from_str(&rule_type) else {
                tracing::warn!(rule_id = id, rule_type = %rule_type, "unknown simple_ban rule_type");
                continue;
            };
            let npubs = npub_list.as_deref().map(parse_csv);
            let kinds = kind_list
                .as_deref()
                .map(|s| s.split(',').filter_map(|x| x.trim().parse::<i64>().ok()).collect::<Vec<_>>());
            simples.push(SimpleRule {
                id,
                rule_type: rt,
                npubs,
                kinds,
                tag_name,
                tag_pattern: tag_value_pattern,
                apply_to_post: apply_to_post != 0,
                apply_to_backend: apply_to_backend != 0,
            });
        }
        {
            let mut g = self.simple_rules.write().await;
            *g = simples;
        }

        let mut g = self.rules_loaded_at.write().await;
        *g = Some(std::time::Instant::now());
        Ok(())
    }

    /// Backend から流れてきた `EVENT` フレームを drop すべきか判定する。
    /// Filter / Quarantine / npub-banned / kind-blacklist いずれかに該当すれば true。
    pub async fn should_drop_backend_text_with_ip(
        &mut self,
        pool: &SqlitePool,
        text: &str,
        ip_address: Option<&str>,
    ) -> anyhow::Result<DropOutcome> {
        let v: serde_json::Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(_) => return Ok(DropOutcome::pass()),
        };
        let Some(arr) = v.as_array() else {
            return Ok(DropOutcome::pass());
        };
        if arr.first().and_then(|v| v.as_str()) != Some("EVENT") {
            return Ok(DropOutcome::pass());
        }
        let ev_v = arr.get(2).context("EVENT missing event")?;
        let event: Event = serde_json::from_value(ev_v.clone()).context("parse event")?;

        // kind1 cache（速いので常に）
        if event.kind == 1 {
            self.kind1_created_at_by_id.insert(event.id.clone(), event.created_at);
        }

        if is_npub_banned(pool, &event.pubkey).await? {
            log_rejection(pool, &event, "banned_npub", ip_address).await?;
            return Ok(DropOutcome::dropped("banned_npub", event));
        }
        if is_kind_blacklisted(pool, event.kind).await? {
            log_rejection(pool, &event, "kind_blacklist", ip_address).await?;
            return Ok(DropOutcome::dropped("kind_blacklist", event));
        }

        if let Some(reason) = self.evaluate_filters(pool, &event, FilterDirection::Backend).await? {
            log_rejection(pool, &event, &reason, ip_address).await?;
            return Ok(DropOutcome::dropped(&reason, event));
        }

        if event.kind == 6 || event.kind == 7 {
            if !is_filter_bypass(pool, &event.pubkey).await? {
                if let Some(target_id) = event.first_e_tag_event_id() {
                    if let Some(target_created_at) = self.kind1_created_at_by_id.get(target_id) {
                        if *target_created_at == event.created_at {
                            log_rejection(pool, &event, "bot_filter", ip_address).await?;
                            return Ok(DropOutcome::dropped("bot_filter", event));
                        }
                    }
                }
            }
        }

        Ok(DropOutcome::pass_with_event(event))
    }

    /// POST されてきた EVENT に対して、追加で DSL / Simple BAN を評価する。
    /// マッチした場合は理由文字列を返す（呼び出し側でログ＆応答する）。
    pub async fn evaluate_post_extra(
        &self,
        pool: &SqlitePool,
        event: &Event,
    ) -> anyhow::Result<Option<String>> {
        self.evaluate_filters(pool, event, FilterDirection::Post).await
    }

    async fn evaluate_filters(
        &self,
        pool: &SqlitePool,
        event: &Event,
        direction: FilterDirection,
    ) -> anyhow::Result<Option<String>> {
        self.reload_if_needed(pool).await?;
        if is_filter_bypass(pool, &event.pubkey).await? {
            return Ok(None);
        }

        // DSL
        {
            let rules = self.compiled_rules.read().await;
            for rule in rules.iter() {
                let active = match direction {
                    FilterDirection::Backend => rule.apply_to_backend,
                    FilterDirection::Post => rule.apply_to_post,
                };
                if !active {
                    continue;
                }
                if rule.filter.matches(event, &self.kind1_created_at_by_id) {
                    let npub = pubkey_hex_to_npub(&event.pubkey).unwrap_or_else(|_| "unknown".into());
                    tracing::info!(
                        event_id = %event.id,
                        npub = %npub,
                        rule_id = rule.id,
                        rule_name = %rule.name,
                        kind = event.kind,
                        direction = ?direction,
                        "Event blocked by DSL rule"
                    );
                    return Ok(Some(format!("filter_rule:{}", rule.id)));
                }
            }
        }

        // Simple BAN
        {
            let rules = self.simple_rules.read().await;
            let npub = pubkey_hex_to_npub(&event.pubkey).ok();
            for rule in rules.iter() {
                let active = match direction {
                    FilterDirection::Backend => rule.apply_to_backend,
                    FilterDirection::Post => rule.apply_to_post,
                };
                if !active {
                    continue;
                }
                if simple_match(rule, event, npub.as_deref()) {
                    tracing::info!(
                        event_id = %event.id,
                        rule_id = rule.id,
                        kind = event.kind,
                        direction = ?direction,
                        "Event blocked by simple_ban rule"
                    );
                    return Ok(Some(format!("simple_ban:{}", rule.id)));
                }
            }
        }

        Ok(None)
    }
}

#[derive(Debug)]
pub struct DropOutcome {
    pub dropped: bool,
    pub reason: Option<String>,
    pub event: Option<Event>,
}

impl DropOutcome {
    pub fn pass() -> Self {
        Self { dropped: false, reason: None, event: None }
    }
    pub fn pass_with_event(ev: Event) -> Self {
        Self { dropped: false, reason: None, event: Some(ev) }
    }
    pub fn dropped(reason: &str, ev: Event) -> Self {
        Self { dropped: true, reason: Some(reason.to_string()), event: Some(ev) }
    }
}

fn simple_match(rule: &SimpleRule, event: &Event, npub: Option<&str>) -> bool {
    match rule.rule_type {
        SimpleRuleType::Npub => match (&rule.npubs, npub) {
            (Some(list), Some(n)) => list.iter().any(|x| x == n),
            _ => false,
        },
        SimpleRuleType::Kind => match &rule.kinds {
            Some(list) => list.contains(&event.kind),
            None => false,
        },
        SimpleRuleType::NpubKind => match (&rule.npubs, &rule.kinds, npub) {
            (Some(npubs), Some(kinds), Some(n)) => {
                npubs.iter().any(|x| x == n) && kinds.contains(&event.kind)
            }
            _ => false,
        },
        SimpleRuleType::TagContains => {
            let Some(name) = &rule.tag_name else { return false };
            let Some(pat) = &rule.tag_pattern else { return false };
            event
                .tags
                .iter()
                .any(|tag| tag.first().map(|s| s == name).unwrap_or(false)
                    && tag.iter().skip(1).any(|v| v.contains(pat)))
        }
    }
}

fn parse_csv(s: &str) -> Vec<String> {
    s.split(',')
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

async fn log_rejection(
    pool: &SqlitePool,
    event: &Event,
    reason: &str,
    ip_address: Option<&str>,
) -> anyhow::Result<()> {
    let npub = pubkey_hex_to_npub(&event.pubkey).unwrap_or_else(|_| "unknown".into());
    if let Err(e) = sqlx::query(
        "INSERT INTO event_rejection_logs (event_id, pubkey_hex, npub, ip_address, kind, reason) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&event.id)
    .bind(&event.pubkey)
    .bind(&npub)
    .bind(ip_address)
    .bind(event.kind)
    .bind(reason)
    .execute(pool)
    .await
    {
        tracing::error!(event_id = %event.id, npub = %npub, reason = %reason, error = %e, "log rejection failed");
        return Err(anyhow::anyhow!("log rejection: {}", e));
    }
    Ok(())
}

async fn is_filter_bypass(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = pubkey_hex_to_npub(pubkey_hex)?;
    let row: Option<(i64,)> = sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
        .bind(npub)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(flags,)| (flags & 2) == 2).unwrap_or(false))
}

async fn is_npub_banned(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = pubkey_hex_to_npub(pubkey_hex)?;
    let row: Option<(i64,)> = sqlx::query_as("SELECT banned FROM safelist WHERE npub = ?")
        .bind(npub)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(banned,)| banned == 1).unwrap_or(false))
}

async fn is_kind_blacklisted(pool: &SqlitePool, kind: i64) -> anyhow::Result<bool> {
    let single: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM req_kind_blacklist WHERE enabled = 1 AND kind_value = ?",
    )
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    if single.is_some() {
        return Ok(true);
    }
    let range: Option<(i64,)> = sqlx::query_as(
        "SELECT 1 FROM req_kind_blacklist WHERE enabled = 1 AND kind_min IS NOT NULL AND kind_max IS NOT NULL AND ? BETWEEN kind_min AND kind_max",
    )
    .bind(kind)
    .fetch_optional(pool)
    .await?;
    Ok(range.is_some())
}
