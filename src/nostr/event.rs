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


/// NIP-01 の型・形式チェックに落ちた理由。ハッシュ・署名の検証はしない。
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum InvalidEvent {
    #[error("event must be an object")]
    NotObject,
    #[error("bad event id")]
    Id,
    #[error("bad pubkey")]
    Pubkey,
    #[error("bad created_at")]
    CreatedAt,
    #[error("bad kind")]
    Kind,
    #[error("bad tags")]
    Tags,
    #[error("bad content")]
    Content,
    #[error("bad signature")]
    Sig,
}

fn is_lower_hex(s: &str, len: usize) -> bool {
    s.len() == len && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// JSON 値が NIP-01 のイベントとして型・形式が正しいかを検査し、`Event` に変換する。
///
/// - id / pubkey は 64 桁、sig は 128 桁の小文字 hex（空 sig もここで落ちる）
/// - created_at は 0 以上の整数、kind は 0〜65535 の整数（`1.0` や `"1"` は不可）
/// - tags は文字列配列の配列、content は文字列
pub fn validate_event_value(v: &serde_json::Value) -> Result<Event, InvalidEvent> {
    let obj = v.as_object().ok_or(InvalidEvent::NotObject)?;
    let hex_field = |key: &str, len: usize, err: InvalidEvent| -> Result<String, InvalidEvent> {
        match obj.get(key).and_then(|x| x.as_str()) {
            Some(s) if is_lower_hex(s, len) => Ok(s.to_string()),
            _ => Err(err),
        }
    };
    let id = hex_field("id", 64, InvalidEvent::Id)?;
    let pubkey = hex_field("pubkey", 64, InvalidEvent::Pubkey)?;
    let sig = hex_field("sig", 128, InvalidEvent::Sig)?;
    let created_at = obj
        .get("created_at")
        .and_then(|x| x.as_u64())
        .and_then(|n| i64::try_from(n).ok())
        .ok_or(InvalidEvent::CreatedAt)?;
    let kind = obj
        .get("kind")
        .and_then(|x| x.as_u64())
        .filter(|n| *n <= 65535)
        .ok_or(InvalidEvent::Kind)? as i64;
    let tags = obj
        .get("tags")
        .and_then(|x| x.as_array())
        .ok_or(InvalidEvent::Tags)?
        .iter()
        .map(|t| {
            t.as_array()
                .ok_or(InvalidEvent::Tags)?
                .iter()
                .map(|s| s.as_str().map(str::to_string).ok_or(InvalidEvent::Tags))
                .collect::<Result<Vec<_>, _>>()
        })
        .collect::<Result<Vec<_>, _>>()?;
    let content = obj
        .get("content")
        .and_then(|x| x.as_str())
        .ok_or(InvalidEvent::Content)?
        .to_string();
    Ok(Event { id, pubkey, created_at, kind, tags, content, sig })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid() -> serde_json::Value {
        json!({
            "id": "a".repeat(64),
            "pubkey": "b".repeat(64),
            "created_at": 1700000000,
            "kind": 1,
            "tags": [["e", "x"], ["p", "y", "wss://r"]],
            "content": "hi",
            "sig": "c".repeat(128),
        })
    }

    fn with(key: &str, value: serde_json::Value) -> serde_json::Value {
        let mut v = valid();
        v[key] = value;
        v
    }

    #[test]
    fn accepts_valid_event() {
        let ev = validate_event_value(&valid()).unwrap();
        assert_eq!(ev.kind, 1);
        assert_eq!(ev.tags.len(), 2);
    }

    #[test]
    fn rejects_bad_hex_fields() {
        assert_eq!(validate_event_value(&with("sig", json!(""))).unwrap_err(), InvalidEvent::Sig);
        assert_eq!(validate_event_value(&with("sig", json!("c".repeat(127)))).unwrap_err(), InvalidEvent::Sig);
        assert_eq!(validate_event_value(&with("id", json!("kind1id"))).unwrap_err(), InvalidEvent::Id);
        assert_eq!(validate_event_value(&with("id", json!("A".repeat(64)))).unwrap_err(), InvalidEvent::Id);
        assert_eq!(validate_event_value(&with("id", json!("g".repeat(64)))).unwrap_err(), InvalidEvent::Id);
        assert_eq!(validate_event_value(&with("pubkey", json!(123))).unwrap_err(), InvalidEvent::Pubkey);
    }

    #[test]
    fn rejects_wrong_types() {
        assert_eq!(validate_event_value(&json!([])).unwrap_err(), InvalidEvent::NotObject);
        assert_eq!(validate_event_value(&with("created_at", json!("1700000000"))).unwrap_err(), InvalidEvent::CreatedAt);
        assert_eq!(validate_event_value(&with("created_at", json!(-1))).unwrap_err(), InvalidEvent::CreatedAt);
        assert_eq!(validate_event_value(&with("created_at", json!(1.5))).unwrap_err(), InvalidEvent::CreatedAt);
        assert_eq!(validate_event_value(&with("kind", json!(1.0))).unwrap_err(), InvalidEvent::Kind);
        assert_eq!(validate_event_value(&with("kind", json!(70000))).unwrap_err(), InvalidEvent::Kind);
        assert_eq!(validate_event_value(&with("tags", json!({}))).unwrap_err(), InvalidEvent::Tags);
        assert_eq!(validate_event_value(&with("tags", json!([["e", 1]]))).unwrap_err(), InvalidEvent::Tags);
        assert_eq!(validate_event_value(&with("tags", json!(["e"]))).unwrap_err(), InvalidEvent::Tags);
        assert_eq!(validate_event_value(&with("content", json!(null))).unwrap_err(), InvalidEvent::Content);
        let mut missing = valid();
        missing.as_object_mut().unwrap().remove("sig");
        assert_eq!(validate_event_value(&missing).unwrap_err(), InvalidEvent::Sig);
    }
}
