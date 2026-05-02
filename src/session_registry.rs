//! アクティブな WebSocket セッションのレジストリ。
//!
//! IP BAN（hard_ban）追加時に該当 IP の既存接続を強制切断するために使う。
//! また、IP ACL を再評価するために mode 変更時にも有効。

use dashmap::DashMap;
use std::net::IpAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct Session {
    pub ip: String,
    pub close_tx: tokio::sync::Mutex<Option<oneshot::Sender<()>>>,
}

#[derive(Default)]
pub struct SessionRegistry {
    next_id: AtomicU64,
    by_id: DashMap<u64, Arc<Session>>,
    by_ip: DashMap<String, Vec<u64>>,
}

impl SessionRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn register(&self, ip: String, close_tx: oneshot::Sender<()>) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let session = Arc::new(Session {
            ip: ip.clone(),
            close_tx: tokio::sync::Mutex::new(Some(close_tx)),
        });
        self.by_id.insert(id, session);
        self.by_ip.entry(ip).or_default().push(id);
        id
    }

    pub fn unregister(&self, id: u64) {
        if let Some((_, session)) = self.by_id.remove(&id) {
            if let Some(mut ids) = self.by_ip.get_mut(&session.ip) {
                ids.retain(|x| *x != id);
            }
        }
    }

    pub async fn force_disconnect_exact(&self, ip: &str) -> usize {
        let ids: Vec<u64> = self
            .by_ip
            .get(ip)
            .map(|v| v.clone())
            .unwrap_or_default();
        let mut count = 0;
        for id in ids {
            if let Some(s) = self.by_id.get(&id) {
                let mut tx = s.close_tx.lock().await;
                if let Some(tx) = tx.take() {
                    let _ = tx.send(());
                    count += 1;
                }
            }
        }
        count
    }

    /// CIDR / 単一 IP マッチで強制切断。`matcher` に true を返した IP の接続を切る。
    pub async fn force_disconnect_where<F>(&self, matcher: F) -> usize
    where
        F: Fn(&IpAddr) -> bool,
    {
        let ips: Vec<String> = self.by_ip.iter().map(|e| e.key().clone()).collect();
        let mut total = 0;
        for ip_str in ips {
            let Ok(addr) = ip_str.parse::<IpAddr>() else { continue };
            if matcher(&addr) {
                total += self.force_disconnect_exact(&ip_str).await;
            }
        }
        total
    }
}
