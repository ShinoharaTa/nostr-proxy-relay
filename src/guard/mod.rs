//! 自動ガード（spec §5.14）。
//!
//! 検知は自動、恒久制裁はしない。発火時のアクションは呼び出し側（ws_proxy）が
//! 時限 Quarantine の自動発行として実行する。このモジュールは純粋なメモリ内判定のみを持つ。
//!
//! 参考実装: kojira/strfry-ratelimit（sliding window / kind クラス別除外）。

use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::config::AutoGuardSettings;

/// この操作数ごとに空バケット・期限切れエントリを evict する（メモリ衛生）。
const EVICT_EVERY_OPS: u64 = 4096;
/// 同一イベント検知の追跡上限（LRU 的に古い観測から捨てる）。
const MAX_TRACKED_DUPES: usize = 100_000;
/// content がこの長さ未満の EVENT は同一イベント検知の対象外。
/// "+" や "GM" のような日常的な短文が異 IP から重複するのは正常なため。
const MIN_DUPE_CONTENT_LEN: usize = 8;

/// replaceable kind（0, 3, 41, 10000–19999）は蓄積悪用が不可能なのでバースト対象外。
fn is_replaceable(kind: i64) -> bool {
    kind == 0 || kind == 3 || kind == 41 || (10_000..20_000).contains(&kind)
}

/// ephemeral kind（20000–29999）は保存されないのでバースト対象外。
fn is_ephemeral(kind: i64) -> bool {
    (20_000..30_000).contains(&kind)
}

/// ガード判定の結果。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuardVerdict {
    /// 通過
    Pass,
    /// content mute 済みの内容（発火済みの同一イベント）
    ContentMuted,
    /// バースト検知が発火（この npub を時限 Quarantine すべき）
    BurstFired,
    /// 同一イベント検知が発火（この npub を時限 Quarantine + content mute 登録済み）
    DuplicateFired,
}

/// 同一イベント検知の観測エントリ。
struct DupeEntry {
    /// 観測した接続元 IP の集合
    ips: HashSet<String>,
    first_seen: u64,
}

pub struct AutoGuard {
    /// pubkey → 窓内の POST タイムスタンプ（sliding window）
    buckets: Mutex<HashMap<String, VecDeque<u64>>>,
    /// content hash → 観測エントリ
    dupes: Mutex<HashMap<String, DupeEntry>>,
    /// content hash → mute 失効時刻（unix 秒）
    mutes: Mutex<HashMap<String, u64>>,
    /// evict の間引き用カウンタ
    op_count: AtomicU64,
}

impl AutoGuard {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            buckets: Mutex::new(HashMap::new()),
            dupes: Mutex::new(HashMap::new()),
            mutes: Mutex::new(HashMap::new()),
            op_count: AtomicU64::new(0),
        })
    }

    /// POST された EVENT を評価する。unix 秒 `now` は呼び出し側が渡す（テスト容易性）。
    pub fn check(
        &self,
        cfg: &AutoGuardSettings,
        now: u64,
        pubkey: &str,
        kind: i64,
        content: &str,
        ip: &str,
    ) -> GuardVerdict {
        if !cfg.enabled {
            return GuardVerdict::Pass;
        }

        if self.op_count.fetch_add(1, Ordering::Relaxed) % EVICT_EVERY_OPS == EVICT_EVERY_OPS - 1 {
            self.evict(now, cfg);
        }

        // 1) content mute（発火済み内容は npub を問わず drop）
        let content_hash = if content.len() >= MIN_DUPE_CONTENT_LEN {
            let hash = hash_content(content);
            let muted = {
                let mutes = self.mutes.lock().unwrap();
                mutes.get(&hash).is_some_and(|expires| *expires > now)
            };
            if muted {
                return GuardVerdict::ContentMuted;
            }
            Some(hash)
        } else {
            None
        };

        // 2) 同一イベント検知（異なる接続元 IP からの同一 content）
        if let Some(hash) = content_hash {
            let fired = {
                let mut dupes = self.dupes.lock().unwrap();
                if dupes.len() >= MAX_TRACKED_DUPES {
                    // 追跡上限。窓外の古い観測から捨てる（全捨てはしない）
                    dupes.retain(|_, e| e.first_seen + cfg.duplicate_window_secs > now);
                }
                let entry = dupes.entry(hash.clone()).or_insert_with(|| DupeEntry {
                    ips: HashSet::new(),
                    first_seen: now,
                });
                // 窓外の観測はリセットして再カウント
                if entry.first_seen + cfg.duplicate_window_secs <= now {
                    entry.ips.clear();
                    entry.first_seen = now;
                }
                entry.ips.insert(ip.to_string());
                if entry.ips.len() as u64 >= cfg.duplicate_threshold {
                    dupes.remove(&hash);
                    true
                } else {
                    false
                }
            };
            if fired {
                self.mutes
                    .lock()
                    .unwrap()
                    .insert(hash, now + cfg.quarantine_secs);
                return GuardVerdict::DuplicateFired;
            }
        }

        // 3) バースト検知（蓄積型 kind のみ）
        if is_ephemeral(kind) || is_replaceable(kind) || cfg.exclude_kinds.contains(&kind) {
            return GuardVerdict::Pass;
        }
        let mut buckets = self.buckets.lock().unwrap();
        let bucket = buckets.entry(pubkey.to_string()).or_default();
        while let Some(&front) = bucket.front() {
            if front + cfg.burst_window_secs <= now {
                bucket.pop_front();
            } else {
                break;
            }
        }
        if bucket.len() as u64 >= cfg.burst_max_events {
            // 発火後は窓をクリアして連続発火を抑える（次の窓で再カウント）
            bucket.clear();
            return GuardVerdict::BurstFired;
        }
        bucket.push_back(now);
        GuardVerdict::Pass
    }

    /// アクティブな content mute の一覧（hash, 失効 unix 秒）。
    pub fn active_mutes(&self, now: u64) -> Vec<(String, u64)> {
        let mutes = self.mutes.lock().unwrap();
        let mut list: Vec<(String, u64)> = mutes
            .iter()
            .filter(|(_, expires)| **expires > now)
            .map(|(h, e)| (h.clone(), *e))
            .collect();
        list.sort_by(|a, b| b.1.cmp(&a.1));
        list
    }

    /// content mute を全クリアする（誤検知時の緊急解除）。クリアした件数を返す。
    pub fn clear_mutes(&self) -> usize {
        let mut mutes = self.mutes.lock().unwrap();
        let n = mutes.len();
        mutes.clear();
        n
    }

    fn evict(&self, now: u64, cfg: &AutoGuardSettings) {
        self.buckets.lock().unwrap().retain(|_, b| {
            while let Some(&front) = b.front() {
                if front + cfg.burst_window_secs <= now {
                    b.pop_front();
                } else {
                    break;
                }
            }
            !b.is_empty()
        });
        self.dupes
            .lock()
            .unwrap()
            .retain(|_, e| e.first_seen + cfg.duplicate_window_secs > now);
        self.mutes.lock().unwrap().retain(|_, expires| *expires > now);
    }
}

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> AutoGuardSettings {
        AutoGuardSettings {
            enabled: true,
            burst_window_secs: 60,
            burst_max_events: 3,
            exclude_kinds: HashSet::from([7]),
            duplicate_threshold: 3,
            duplicate_window_secs: 300,
            quarantine_secs: 600,
        }
    }

    #[test]
    fn disabled_guard_always_passes() {
        let guard = AutoGuard::new();
        let mut c = cfg();
        c.enabled = false;
        for _ in 0..100 {
            assert_eq!(guard.check(&c, 1000, "pk", 1, "long enough content", "ip1"), GuardVerdict::Pass);
        }
    }

    #[test]
    fn burst_fires_after_max_events_in_window() {
        let guard = AutoGuard::new();
        let c = cfg();
        assert_eq!(guard.check(&c, 1000, "pk", 1, "content-a1", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1001, "pk", 1, "content-a2", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1002, "pk", 1, "content-a3", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1003, "pk", 1, "content-a4", "ip1"), GuardVerdict::BurstFired);
    }

    #[test]
    fn burst_window_slides() {
        let guard = AutoGuard::new();
        let c = cfg();
        assert_eq!(guard.check(&c, 1000, "pk", 1, "content-b1", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1001, "pk", 1, "content-b2", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1002, "pk", 1, "content-b3", "ip1"), GuardVerdict::Pass);
        // 窓（60 秒）を過ぎれば古い分は prune され通過する
        assert_eq!(guard.check(&c, 1061, "pk", 1, "content-b4", "ip1"), GuardVerdict::Pass);
    }

    #[test]
    fn burst_exempts_ephemeral_replaceable_and_excluded_kinds() {
        let guard = AutoGuard::new();
        let c = cfg();
        for i in 0..20u64 {
            // kind 7 は exclude_kinds、kind 0 は replaceable、kind 20001 は ephemeral
            for kind in [7, 0, 10_002, 20_001] {
                assert_eq!(
                    guard.check(&c, 1000 + i, "pk", kind, &format!("content-{kind}-{i}"), "ip1"),
                    GuardVerdict::Pass,
                    "kind {kind} should be exempt"
                );
            }
        }
    }

    #[test]
    fn per_pubkey_isolation() {
        let guard = AutoGuard::new();
        let c = cfg();
        for i in 0..3u64 {
            assert_eq!(guard.check(&c, 1000 + i, "pk1", 1, &format!("content-c{i}"), "ip1"), GuardVerdict::Pass);
        }
        // 別 pubkey は影響を受けない
        assert_eq!(guard.check(&c, 1003, "pk2", 1, "content-c9", "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1004, "pk1", 1, "content-cA", "ip1"), GuardVerdict::BurstFired);
    }

    #[test]
    fn duplicate_fires_on_distinct_ips_then_mutes_content() {
        let guard = AutoGuard::new();
        let c = cfg();
        let spam = "identical spam content here";
        assert_eq!(guard.check(&c, 1000, "pk1", 1, spam, "ip1"), GuardVerdict::Pass);
        // 同一 IP の再送では発火しない
        assert_eq!(guard.check(&c, 1001, "pk1", 1, spam, "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1002, "pk2", 1, spam, "ip2"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1003, "pk3", 1, spam, "ip3"), GuardVerdict::DuplicateFired);
        // 以後は npub / IP を問わず mute で drop
        assert_eq!(guard.check(&c, 1004, "pk4", 1, spam, "ip4"), GuardVerdict::ContentMuted);
        assert_eq!(guard.check(&c, 1005, "pk1", 1, spam, "ip1"), GuardVerdict::ContentMuted);
        // mute は発火時刻（1003）+ quarantine_secs（600 秒）で失効
        assert_eq!(guard.check(&c, 1003 + 601, "pk5", 1, spam, "ip5"), GuardVerdict::Pass);
    }

    #[test]
    fn duplicate_ignores_short_content() {
        let guard = AutoGuard::new();
        let c = cfg();
        for (i, ip) in ["ip1", "ip2", "ip3", "ip4", "ip5"].iter().enumerate() {
            assert_eq!(
                guard.check(&c, 1000 + i as u64, &format!("pk{i}"), 1, "+", ip),
                GuardVerdict::Pass
            );
        }
    }

    #[test]
    fn duplicate_window_resets_observation() {
        let guard = AutoGuard::new();
        let c = cfg();
        let spam = "identical spam content here";
        assert_eq!(guard.check(&c, 1000, "pk1", 1, spam, "ip1"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1001, "pk2", 1, spam, "ip2"), GuardVerdict::Pass);
        // 窓（300 秒）を過ぎたら観測はリセットされ、カウントは 1 から
        assert_eq!(guard.check(&c, 1000 + 301, "pk3", 1, spam, "ip3"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1000 + 302, "pk4", 1, spam, "ip4"), GuardVerdict::Pass);
        assert_eq!(guard.check(&c, 1000 + 303, "pk5", 1, spam, "ip5"), GuardVerdict::DuplicateFired);
    }

    #[test]
    fn clear_mutes_lifts_content_mute() {
        let guard = AutoGuard::new();
        let c = cfg();
        let spam = "identical spam content here";
        for (i, ip) in ["ip1", "ip2", "ip3"].iter().enumerate() {
            let _ = guard.check(&c, 1000 + i as u64, &format!("pk{i}"), 1, spam, ip);
        }
        assert_eq!(guard.check(&c, 1010, "pk9", 1, spam, "ip9"), GuardVerdict::ContentMuted);
        assert_eq!(guard.active_mutes(1010).len(), 1);
        assert_eq!(guard.clear_mutes(), 1);
        assert_eq!(guard.check(&c, 1011, "pk9", 1, spam, "ip9"), GuardVerdict::Pass);
    }
}
