//! Quarantine（時限ミュート）。
//! - scope: post / req / all
//! - expires_at NULL は無期限（手動解除まで）

use sqlx::SqlitePool;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuarantineScope {
    Post,
    Req,
    All,
}

impl QuarantineScope {
    pub fn from_str(s: &str) -> Self {
        match s {
            "post" => Self::Post,
            "req" => Self::Req,
            _ => Self::All,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Post => "post",
            Self::Req => "req",
            Self::All => "all",
        }
    }

    pub fn covers_post(&self) -> bool {
        matches!(self, Self::Post | Self::All)
    }

    pub fn covers_req(&self) -> bool {
        matches!(self, Self::Req | Self::All)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuarantineDecision {
    None,
    Active(QuarantineScope),
}

/// 与えられた npub に対する現在のミュート状態を返す。
/// 期限切れエントリは active=0 へ自動更新する。
pub async fn evaluate_quarantine(pool: &SqlitePool, npub: &str) -> anyhow::Result<QuarantineDecision> {
    // 期限切れを deactivate（毎回でも軽量。ヒット時のみ書き込み）
    let _ = sqlx::query(
        "UPDATE quarantine_entries SET active = 0 \
         WHERE npub = ? AND active = 1 AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')",
    )
    .bind(npub)
    .execute(pool)
    .await;

    let row: Option<(String,)> = sqlx::query_as(
        "SELECT scope FROM quarantine_entries \
         WHERE npub = ? AND active = 1 \
           AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) \
         ORDER BY \
           CASE scope WHEN 'all' THEN 0 WHEN 'post' THEN 1 WHEN 'req' THEN 2 ELSE 3 END ASC \
         LIMIT 1",
    )
    .bind(npub)
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        Some((scope,)) => QuarantineDecision::Active(QuarantineScope::from_str(&scope)),
        None => QuarantineDecision::None,
    })
}

/// バックグラウンドで定期的に期限切れ Quarantine を deactivate する。
pub fn spawn_expiry_task(pool: SqlitePool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        interval.tick().await;
        loop {
            interval.tick().await;
            if let Err(e) = sqlx::query(
                "UPDATE quarantine_entries SET active = 0 \
                 WHERE active = 1 AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')",
            )
            .execute(&pool)
            .await
            {
                tracing::warn!(error = %e, "quarantine expiry sweep failed");
            }
        }
    });
}
