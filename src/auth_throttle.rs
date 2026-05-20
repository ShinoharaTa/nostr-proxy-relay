//! 管理 API の認証ロックアウトと簡易レート制限。
//!
//! - 同一 IP からの BasicAuth 失敗が短時間に N 回続くと一時 lock
//! - 成功でカウンタリセット
//! - 設定: `ADMIN_LOCKOUT_THRESHOLD`（既定 10）, `ADMIN_LOCKOUT_WINDOW_SECS`（300）, `ADMIN_LOCKOUT_DURATION_SECS`（900）

use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy)]
struct Attempts {
    failures: u32,
    first_failure_at: Instant,
    locked_until: Option<Instant>,
}

#[derive(Clone)]
pub struct AuthThrottle {
    inner: Arc<DashMap<String, Attempts>>,
    threshold: u32,
    window: Duration,
    lock_duration: Duration,
}

impl AuthThrottle {
    pub fn from_env() -> Self {
        let threshold: u32 = std::env::var("ADMIN_LOCKOUT_THRESHOLD")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10);
        let window_secs: u64 = std::env::var("ADMIN_LOCKOUT_WINDOW_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(300);
        let lock_secs: u64 = std::env::var("ADMIN_LOCKOUT_DURATION_SECS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(900);
        Self {
            inner: Arc::new(DashMap::new()),
            threshold,
            window: Duration::from_secs(window_secs),
            lock_duration: Duration::from_secs(lock_secs),
        }
    }

    pub fn is_locked(&self, ip: &str) -> bool {
        if let Some(a) = self.inner.get(ip) {
            if let Some(until) = a.locked_until {
                if Instant::now() < until {
                    return true;
                }
            }
        }
        false
    }

    pub fn on_success(&self, ip: &str) {
        self.inner.remove(ip);
    }

    pub fn on_failure(&self, ip: &str) {
        let now = Instant::now();
        let mut entry = self
            .inner
            .entry(ip.to_string())
            .or_insert_with(|| Attempts {
                failures: 0,
                first_failure_at: now,
                locked_until: None,
            });

        // ウィンドウ外ならリセット
        if now.duration_since(entry.first_failure_at) > self.window {
            entry.failures = 0;
            entry.first_failure_at = now;
            entry.locked_until = None;
        }
        entry.failures += 1;
        if entry.failures >= self.threshold {
            entry.locked_until = Some(now + self.lock_duration);
            tracing::warn!(
                ip = %ip,
                failures = entry.failures,
                lock_secs = self.lock_duration.as_secs(),
                "Admin auth locked due to too many failures"
            );
        }
    }
}
