use serde::{Deserialize, Serialize};

/// NIP-01 event (minimal).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub id: String,
    pub pubkey: String,
    pub created_at: i64,
    pub kind: i64,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,
}

impl Event {
    /// Returns the first `e` tag's event id if present.
    pub fn first_e_tag_event_id(&self) -> Option<&str> {
        self.tags
            .iter()
            .find(|t| t.first().map(|s| s.as_str()) == Some("e"))
            .and_then(|t| t.get(1))
            .map(|s| s.as_str())
    }
}

