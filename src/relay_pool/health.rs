//! Status history for relay health (e.g. last 30 minutes, one point per minute).

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::RwLock;

const HISTORY_LEN: usize = 30;

#[derive(Debug, Clone, Serialize)]
pub struct StatusPoint {
    pub timestamp: DateTime<Utc>,
    pub status: String, // "up" | "down"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

#[derive(Debug)]
pub struct StatusHistory {
    points: RwLock<VecDeque<StatusPoint>>,
}

impl StatusHistory {
    pub fn new() -> Self {
        Self {
            points: RwLock::new(VecDeque::new()),
        }
    }

    pub fn record(&self, status: impl Into<String>, latency_ms: Option<u64>) {
        let point = StatusPoint {
            timestamp: Utc::now(),
            status: status.into(),
            latency_ms,
        };
        let mut g = self.points.write().unwrap();
        if g.len() >= HISTORY_LEN {
            g.pop_front();
        }
        g.push_back(point);
    }

    pub fn snapshot(&self) -> Vec<StatusPoint> {
        let g = self.points.read().unwrap();
        g.iter().cloned().collect()
    }
}

impl Default for StatusHistory {
    fn default() -> Self {
        Self::new()
    }
}
