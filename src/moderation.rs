//! 措置の履歴（Issue #53）。
//!
//! 対象カードの「履歴」表示と、受信箱で「発火後に人が処置したか」を判定するために記録する。
//! 記録の失敗で本来の措置を失敗させないよう、書き込みはベストエフォート。

use sqlx::SqlitePool;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetType {
    Npub,
    Ip,
    Relay,
}

impl TargetType {
    fn as_str(self) -> &'static str {
        match self {
            TargetType::Npub => "npub",
            TargetType::Ip => "ip",
            TargetType::Relay => "relay",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Actor {
    Manual,
    Auto,
}

impl Actor {
    fn as_str(self) -> &'static str {
        match self {
            Actor::Manual => "manual",
            Actor::Auto => "auto",
        }
    }
}

/// 措置を 1 件記録する。`action` は `allow` / `deny` / `quarantine` などの短い識別子。
pub async fn log_action(
    pool: &SqlitePool,
    target_type: TargetType,
    target: &str,
    action: &str,
    detail: &str,
    actor: Actor,
) {
    if let Err(e) = sqlx::query(
        "INSERT INTO moderation_log (target_type, target, action, detail, actor) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(target_type.as_str())
    .bind(target)
    .bind(action)
    .bind(detail)
    .bind(actor.as_str())
    .execute(pool)
    .await
    {
        tracing::warn!(target = %target, action = %action, error = %e, "failed to write moderation_log");
    }
}

/// safelist の flags から、記録用の措置名を決める。
pub fn safelist_action(flags: i64) -> &'static str {
    if flags & 1 == 1 {
        "allow"
    } else if flags & 2 == 2 {
        "bypass"
    } else {
        "safelist_update"
    }
}
