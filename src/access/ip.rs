//! IP アクセス制御。CIDR 対応 + mode（hard_ban / shadow_ban / whitelist）評価。
//!
//! 評価優先順位は仕様 5.3 に準拠:
//!   1. whitelist （マッチした時点で通す）
//!   2. hard_ban  （即時切断対象）
//!   3. shadow_ban（接続は許すが REQ/EVENT を黙って drop）
//!
//! アクセスは数秒～数十秒キャッシュする想定（接続毎に DB を引かない）。

use ipnet::IpNet;
use sqlx::SqlitePool;
use std::net::IpAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IpDecision {
    Allow,
    Whitelist,
    HardBan,
    ShadowBan,
}

#[derive(Clone)]
struct Rule {
    matcher: Matcher,
    mode: Mode,
}

#[derive(Clone)]
enum Matcher {
    Exact(IpAddr),
    Cidr(IpNet),
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum Mode {
    HardBan,
    ShadowBan,
    Whitelist,
}

impl Mode {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "hard_ban" => Some(Self::HardBan),
            "shadow_ban" => Some(Self::ShadowBan),
            "whitelist" => Some(Self::Whitelist),
            _ => None,
        }
    }

    fn priority(&self) -> u8 {
        match self {
            Self::Whitelist => 0,
            Self::HardBan => 1,
            Self::ShadowBan => 2,
        }
    }
}

struct CacheInner {
    rules: Vec<Rule>,
    loaded_at: Instant,
}

pub struct IpAclCache {
    inner: RwLock<Option<CacheInner>>,
    pool: SqlitePool,
    ttl: Duration,
}

impl IpAclCache {
    pub fn new(pool: SqlitePool) -> Arc<Self> {
        Arc::new(Self {
            inner: RwLock::new(None),
            pool,
            ttl: Duration::from_secs(15),
        })
    }

    pub async fn invalidate(&self) {
        let mut guard = self.inner.write().await;
        *guard = None;
    }

    async fn ensure_loaded(&self) -> anyhow::Result<()> {
        {
            let guard = self.inner.read().await;
            if let Some(c) = guard.as_ref() {
                if c.loaded_at.elapsed() < self.ttl {
                    return Ok(());
                }
            }
        }
        let rows: Vec<(String, String, i64)> = sqlx::query_as(
            "SELECT ip_address, mode, is_cidr FROM ip_access_control",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut rules = Vec::with_capacity(rows.len());
        for (ip_text, mode_text, _) in rows {
            let Some(mode) = Mode::from_str(&mode_text) else {
                continue;
            };
            // CIDR っぽいかどうかは記法から判定（is_cidr は保険として無視）
            if ip_text.contains('/') {
                if let Ok(net) = IpNet::from_str(&ip_text) {
                    rules.push(Rule { matcher: Matcher::Cidr(net), mode });
                } else {
                    tracing::warn!(ip = %ip_text, "invalid CIDR in ip_access_control");
                }
            } else if let Ok(ip) = IpAddr::from_str(&ip_text) {
                rules.push(Rule { matcher: Matcher::Exact(ip), mode });
            } else {
                tracing::warn!(ip = %ip_text, "invalid IP in ip_access_control");
            }
        }

        let mut guard = self.inner.write().await;
        *guard = Some(CacheInner {
            rules,
            loaded_at: Instant::now(),
        });
        Ok(())
    }

    /// IP に対する判定。優先順位: whitelist > hard_ban > shadow_ban。
    pub async fn evaluate(&self, ip_str: &str) -> IpDecision {
        if let Err(e) = self.ensure_loaded().await {
            tracing::warn!(error = %e, "ip acl reload failed; allow as failsafe");
            return IpDecision::Allow;
        }
        let Ok(ip) = IpAddr::from_str(ip_str) else {
            return IpDecision::Allow;
        };
        let guard = self.inner.read().await;
        let Some(cache) = guard.as_ref() else {
            return IpDecision::Allow;
        };

        let mut chosen: Option<Mode> = None;
        for rule in &cache.rules {
            let hit = match &rule.matcher {
                Matcher::Exact(a) => *a == ip,
                Matcher::Cidr(net) => net.contains(&ip),
            };
            if !hit {
                continue;
            }
            // whitelist が出たら確定
            if rule.mode == Mode::Whitelist {
                return IpDecision::Whitelist;
            }
            // hard / shadow は優先度の高い方を覚える
            chosen = Some(match chosen {
                None => rule.mode,
                Some(prev) => {
                    if rule.mode.priority() < prev.priority() {
                        rule.mode
                    } else {
                        prev
                    }
                }
            });
        }
        match chosen {
            Some(Mode::HardBan) => IpDecision::HardBan,
            Some(Mode::ShadowBan) => IpDecision::ShadowBan,
            _ => IpDecision::Allow,
        }
    }
}
