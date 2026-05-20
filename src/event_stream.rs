//! Live Event Stream（B-5）。
//!
//! ws_proxy 側で発生したイベント（受理 / 拒否 / 切断 など）を broadcast チャンネルへ流し、
//! API の SSE エンドポイントが購読する。UI は最新の動きをリアルタイムに観測できる。

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum LiveEvent {
    /// EVENT を受理してバックエンドへ転送した。
    EventAccepted {
        ts: String,
        kind: i64,
        npub: String,
        ip: Option<String>,
    },
    /// EVENT を拒否した。
    EventRejected {
        ts: String,
        kind: i64,
        npub: String,
        ip: Option<String>,
        reason: String,
    },
    /// バックエンド由来 EVENT をクライアントに配信した。
    EventDelivered {
        ts: String,
        kind: i64,
        npub: String,
        sub_id: String,
    },
    /// バックエンド由来 EVENT を filter / quarantine 等で drop。
    EventDropped {
        ts: String,
        kind: i64,
        npub: String,
        sub_id: String,
        reason: String,
    },
    /// クライアント接続が確立した。
    ConnectionOpened { ts: String, ip: String },
    /// クライアント接続が閉じた。
    ConnectionClosed { ts: String, ip: String },
}

#[derive(Clone)]
pub struct LiveEventBus {
    tx: broadcast::Sender<LiveEvent>,
}

impl LiveEventBus {
    pub fn new(capacity: usize) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(capacity);
        Arc::new(Self { tx })
    }

    pub fn publish(&self, ev: LiveEvent) {
        let _ = self.tx.send(ev);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LiveEvent> {
        self.tx.subscribe()
    }
}
