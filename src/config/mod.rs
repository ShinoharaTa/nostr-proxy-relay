//! ランタイム設定のキャッシュと変更通知。
//!
//! POST policy / EOSE auto-close kinds などの「リクエストごとに DB を引かなくていい」値を
//! ここに集約する。`bump()` を叩くと watch チャンネル経由で各サブシステムが再読込する。

use sqlx::SqlitePool;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{watch, RwLock};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PostPolicy {
    Allowlist,
    Denylist,
}

impl PostPolicy {
    pub fn from_str(s: &str) -> Self {
        match s {
            "denylist" => Self::Denylist,
            _ => Self::Allowlist,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Allowlist => "allowlist",
            Self::Denylist => "denylist",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BackendStrategy {
    Failover,
    FanOutEvent,
    FanInReq,
    Sharded,
}

impl BackendStrategy {
    pub fn from_str(s: &str) -> Self {
        match s {
            "fan_out_event" => Self::FanOutEvent,
            "fan_in_req" => Self::FanInReq,
            "sharded" => Self::Sharded,
            _ => Self::Failover,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Failover => "failover",
            Self::FanOutEvent => "fan_out_event",
            Self::FanInReq => "fan_in_req",
            Self::Sharded => "sharded",
        }
    }
}

#[derive(Debug, Clone)]
pub struct RuntimeSettings {
    pub post_policy: PostPolicy,
    pub backend_strategy: BackendStrategy,
    pub eose_autoclose_kinds: HashSet<i64>,
}

impl RuntimeSettings {
    pub fn default_with_env() -> Self {
        Self {
            post_policy: PostPolicy::Allowlist,
            backend_strategy: BackendStrategy::Failover,
            eose_autoclose_kinds: parse_eose_autoclose_kinds_from_env(),
        }
    }
}

pub struct SettingsCache {
    inner: RwLock<RuntimeSettings>,
    bump_tx: watch::Sender<u64>,
    bump_rx: watch::Receiver<u64>,
    pool: SqlitePool,
}

impl SettingsCache {
    pub async fn load(pool: SqlitePool) -> anyhow::Result<Arc<Self>> {
        let initial = Self::load_from_db(&pool).await.unwrap_or_else(|e| {
            tracing::warn!(error = %e, "failed to load relay_settings, using defaults");
            RuntimeSettings::default_with_env()
        });
        let (bump_tx, bump_rx) = watch::channel(0u64);
        Ok(Arc::new(Self {
            inner: RwLock::new(initial),
            bump_tx,
            bump_rx,
            pool,
        }))
    }

    async fn load_from_db(pool: &SqlitePool) -> anyhow::Result<RuntimeSettings> {
        let row: Option<(String, String, String)> = sqlx::query_as(
            "SELECT post_policy, backend_strategy, eose_autoclose_kinds FROM relay_settings WHERE id = 1",
        )
        .fetch_optional(pool)
        .await?;

        let env_kinds = parse_eose_autoclose_kinds_from_env();
        if let Some((policy, strategy, kinds_csv)) = row {
            let mut kinds: HashSet<i64> = kinds_csv
                .split(',')
                .filter_map(|s| s.trim().parse::<i64>().ok())
                .collect();
            // env を後勝ちで union（後方互換: env にあるものは必ず効かせる）
            for k in env_kinds {
                kinds.insert(k);
            }
            Ok(RuntimeSettings {
                post_policy: PostPolicy::from_str(&policy),
                backend_strategy: BackendStrategy::from_str(&strategy),
                eose_autoclose_kinds: kinds,
            })
        } else {
            Ok(RuntimeSettings {
                post_policy: PostPolicy::Allowlist,
                backend_strategy: BackendStrategy::Failover,
                eose_autoclose_kinds: env_kinds,
            })
        }
    }

    /// 強制再読込し、watch を bump する。
    pub async fn refresh(&self) -> anyhow::Result<()> {
        let new = Self::load_from_db(&self.pool).await?;
        {
            let mut inner = self.inner.write().await;
            *inner = new;
        }
        let _ = self.bump_tx.send(self.bump_tx.borrow().wrapping_add(1));
        Ok(())
    }

    /// DB を再読込せずに変更通知だけ発火する。
    /// relay_config / relay_info など SettingsCache 管理外の設定が変わったときに、
    /// live な接続へ再読込（バックエンド再構築・limit 反映）を促すために使う。
    pub fn notify(&self) {
        let _ = self.bump_tx.send(self.bump_tx.borrow().wrapping_add(1));
    }

    /// 設定変更通知を受け取る。
    pub fn watch(&self) -> watch::Receiver<u64> {
        self.bump_rx.clone()
    }

    pub async fn snapshot(&self) -> RuntimeSettings {
        self.inner.read().await.clone()
    }

    pub async fn post_policy(&self) -> PostPolicy {
        self.inner.read().await.post_policy.clone()
    }

    pub async fn eose_autoclose_kinds(&self) -> HashSet<i64> {
        self.inner.read().await.eose_autoclose_kinds.clone()
    }
}

fn parse_eose_autoclose_kinds_from_env() -> HashSet<i64> {
    let raw = std::env::var("EOSE_AUTOCLOSE_KINDS").unwrap_or_default();
    raw.split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect()
}
