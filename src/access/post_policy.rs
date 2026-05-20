//! POST 受理判定。
//!
//! 仕様 5.1:
//!   - グローバル post_policy が allowlist の場合: safelist に存在し flag&1=1 のみ受理
//!   - グローバル post_policy が denylist の場合: 原則受理。safelist の banned=1 だけ拒否
//!   - 共通: safelist.banned=1 は最強の deny（policy 無関係）

use sqlx::SqlitePool;

use crate::access::npub_key::pubkey_hex_to_npub;
use crate::config::PostPolicy;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PostDecision {
    Allow,
    Deny(&'static str),
}

pub async fn evaluate_post(
    pool: &SqlitePool,
    pubkey_hex: &str,
    policy: &PostPolicy,
) -> anyhow::Result<PostDecision> {
    let npub = match pubkey_hex_to_npub(pubkey_hex) {
        Ok(n) => n,
        Err(e) => {
            tracing::warn!(pubkey_hex = %pubkey_hex, error = %e, "evaluate_post: invalid pubkey");
            return Ok(PostDecision::Deny("invalid_pubkey"));
        }
    };

    let row: Option<(i64, i64)> = sqlx::query_as(
        "SELECT flags, banned FROM safelist WHERE npub = ?",
    )
    .bind(&npub)
    .fetch_optional(pool)
    .await?;

    match (policy, row) {
        (_, Some((_flags, 1))) => Ok(PostDecision::Deny("banned_npub")),
        (PostPolicy::Allowlist, Some((flags, _))) if (flags & 1) == 1 => Ok(PostDecision::Allow),
        (PostPolicy::Allowlist, _) => Ok(PostDecision::Deny("not_in_allowlist")),
        (PostPolicy::Denylist, _) => Ok(PostDecision::Allow),
    }
}
