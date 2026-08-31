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

/// 書き込みルーティングモード（spec §5.15）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WriteRouting {
    /// 全 write_enabled リレーへ送信（従来互換）
    All,
    /// broadcast フラグ持ち npub のみ全リレーへ、他は primary のみへ
    PrimaryDefault,
}

impl WriteRouting {
    pub fn from_str(s: &str) -> Self {
        match s {
            "primary_default" => Self::PrimaryDefault,
            _ => Self::All,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::PrimaryDefault => "primary_default",
        }
    }
}

/// 自動ガード設定（spec §5.14）。既定 OFF の opt-in。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutoGuardSettings {
    pub enabled: bool,
    pub burst_window_secs: u64,
    pub burst_max_events: u64,
    /// バースト検知から除外する kind（ephemeral / replaceable はコード側で常に除外）
    pub exclude_kinds: HashSet<i64>,
    pub duplicate_threshold: u64,
    pub duplicate_window_secs: u64,
    pub quarantine_secs: u64,
}

impl Default for AutoGuardSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            burst_window_secs: 60,
            burst_max_events: 30,
            exclude_kinds: HashSet::from([7]),
            duplicate_threshold: 3,
            duplicate_window_secs: 300,
            quarantine_secs: 600,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RuntimeSettings {
    pub post_policy: PostPolicy,
    pub backend_strategy: BackendStrategy,
    pub eose_autoclose_kinds: HashSet<i64>,
    pub write_routing: WriteRouting,
    pub auto_guard: AutoGuardSettings,
}

impl RuntimeSettings {
    pub fn default_with_env() -> Self {
        Self {
            post_policy: PostPolicy::Allowlist,
            backend_strategy: BackendStrategy::Failover,
            eose_autoclose_kinds: parse_eose_autoclose_kinds_from_env(),
            write_routing: WriteRouting::All,
            auto_guard: AutoGuardSettings::default(),
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
        type Row = (
            String, // post_policy
            String, // backend_strategy
            String, // eose_autoclose_kinds
            String, // write_routing
            i64,    // auto_guard_enabled
            i64,    // guard_burst_window_secs
            i64,    // guard_burst_max_events
            String, // guard_exclude_kinds
            i64,    // guard_duplicate_threshold
            i64,    // guard_duplicate_window_secs
            i64,    // guard_quarantine_secs
        );
        let row: Option<Row> = sqlx::query_as(
            "SELECT post_policy, backend_strategy, eose_autoclose_kinds, write_routing,                     auto_guard_enabled, guard_burst_window_secs, guard_burst_max_events,                     guard_exclude_kinds, guard_duplicate_threshold, guard_duplicate_window_secs,                     guard_quarantine_secs              FROM relay_settings WHERE id = 1",
        )
        .fetch_optional(pool)
        .await?;

        let env_kinds = parse_eose_autoclose_kinds_from_env();
        if let Some((
            policy,
            strategy,
            kinds_csv,
            write_routing,
            guard_enabled,
            burst_window,
            burst_max,
            exclude_csv,
            dup_threshold,
            dup_window,
            quarantine_secs,
        )) = row
        {
            let mut kinds: HashSet<i64> = parse_kind_csv(&kinds_csv);
            // env を後勝ちで union（後方互換: env にあるものは必ず効かせる）
            for k in env_kinds {
                kinds.insert(k);
            }
            let defaults = AutoGuardSettings::default();
            Ok(RuntimeSettings {
                post_policy: PostPolicy::from_str(&policy),
                backend_strategy: BackendStrategy::from_str(&strategy),
                eose_autoclose_kinds: kinds,
                write_routing: WriteRouting::from_str(&write_routing),
                auto_guard: AutoGuardSettings {
                    enabled: guard_enabled != 0,
                    burst_window_secs: u64::try_from(burst_window).ok().filter(|n| *n > 0).unwrap_or(defaults.burst_window_secs),
                    burst_max_events: u64::try_from(burst_max).ok().filter(|n| *n > 0).unwrap_or(defaults.burst_max_events),
                    exclude_kinds: parse_kind_csv(&exclude_csv),
                    duplicate_threshold: u64::try_from(dup_threshold).ok().filter(|n| *n > 1).unwrap_or(defaults.duplicate_threshold),
                    duplicate_window_secs: u64::try_from(dup_window).ok().filter(|n| *n > 0).unwrap_or(defaults.duplicate_window_secs),
                    quarantine_secs: u64::try_from(quarantine_secs).ok().filter(|n| *n > 0).unwrap_or(defaults.quarantine_secs),
                },
            })
        } else {
            Ok(RuntimeSettings {
                post_policy: PostPolicy::Allowlist,
                backend_strategy: BackendStrategy::Failover,
                eose_autoclose_kinds: env_kinds,
                write_routing: WriteRouting::All,
                auto_guard: AutoGuardSettings::default(),
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
        // NOTE: `send(self.bump_tx.borrow() + 1)` は borrow の read ガードが式末尾まで
        // 生存したまま send が write ロックを取るため同一スレッドでデッドロックする。
        self.bump_tx.send_modify(|v| *v = v.wrapping_add(1));
        Ok(())
    }

    /// DB を再読込せずに変更通知だけ発火する。
    /// relay_config / relay_info など SettingsCache 管理外の設定が変わったときに、
    /// live な接続へ再読込（バックエンド再構築・limit 反映）を促すために使う。
    pub fn notify(&self) {
        self.bump_tx.send_modify(|v| *v = v.wrapping_add(1));
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

    pub async fn write_routing(&self) -> WriteRouting {
        self.inner.read().await.write_routing
    }

    pub async fn auto_guard(&self) -> AutoGuardSettings {
        self.inner.read().await.auto_guard.clone()
    }
}

fn parse_kind_csv(csv: &str) -> HashSet<i64> {
    csv.split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect()
}

fn parse_eose_autoclose_kinds_from_env() -> HashSet<i64> {
    let raw = std::env::var("EOSE_AUTOCLOSE_KINDS").unwrap_or_default();
    raw.split(',')
        .filter_map(|s| s.trim().parse::<i64>().ok())
        .collect()
}
