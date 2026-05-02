use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::event::Event;

/// NIP-01 client -> relay messages (subset we need).
#[derive(Debug, Clone)]
pub enum ClientMsg {
    Req { sub_id: String, filters: Vec<Value> },
    Close { sub_id: String },
    Event { event: Event },
}

/// NIP-01 relay -> client messages (subset we need).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RelayMsg {
    /// ["EVENT", <sub_id>, <event>]
    Event(String, Event),
    /// ["EOSE", <sub_id>]
    Eose(String),
    /// ["NOTICE", <message>]
    Notice(String),
}

#[derive(Debug, thiserror::Error)]
pub enum ParseClientMsgError {
    #[error("expected JSON array")]
    NotArray,
    #[error("missing command")]
    MissingCommand,
    #[error("command must be string")]
    CommandNotString,
    #[error("unsupported command: {0}")]
    UnsupportedCommand(String),
    #[error("invalid message: {0}")]
    Invalid(String),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("message too long: {0} bytes (max {1})")]
    TooLong(usize, usize),
    #[error("event content too long: {0} bytes (max {1})")]
    ContentTooLong(usize, usize),
    #[error("event has too many tags: {0} (max {1})")]
    TooManyTags(usize, usize),
    #[error("REQ has too many filters: {0} (max {1})")]
    TooManyFilters(usize, usize),
}

/// NIP-11 由来のクライアントメッセージ制約。
#[derive(Debug, Clone, Default)]
pub struct ParseLimits {
    pub max_message_length: Option<usize>,
    pub max_content_length: Option<usize>,
    pub max_event_tags: Option<usize>,
    pub max_filters: Option<usize>,
}

pub fn parse_client_msg(text: &str) -> Result<ClientMsg, ParseClientMsgError> {
    parse_client_msg_with_limits(text, &ParseLimits::default())
}

pub fn parse_client_msg_with_limits(
    text: &str,
    limits: &ParseLimits,
) -> Result<ClientMsg, ParseClientMsgError> {
    if let Some(max) = limits.max_message_length {
        if text.len() > max {
            return Err(ParseClientMsgError::TooLong(text.len(), max));
        }
    }
    let v: Value = serde_json::from_str(text)?;
    let arr = v.as_array().ok_or(ParseClientMsgError::NotArray)?;
    let cmd_v = arr.first().ok_or(ParseClientMsgError::MissingCommand)?;
    let cmd = cmd_v
        .as_str()
        .ok_or(ParseClientMsgError::CommandNotString)?
        .to_string();

    match cmd.as_str() {
        "REQ" => {
            let sub_id = arr
                .get(1)
                .and_then(|v| v.as_str())
                .ok_or_else(|| ParseClientMsgError::Invalid("REQ missing sub_id".into()))?
                .to_string();
            let filters = arr.iter().skip(2).cloned().collect::<Vec<_>>();
            if let Some(max) = limits.max_filters {
                if filters.len() > max {
                    return Err(ParseClientMsgError::TooManyFilters(filters.len(), max));
                }
            }
            Ok(ClientMsg::Req { sub_id, filters })
        }
        "CLOSE" => {
            let sub_id = arr
                .get(1)
                .and_then(|v| v.as_str())
                .ok_or_else(|| ParseClientMsgError::Invalid("CLOSE missing sub_id".into()))?
                .to_string();
            Ok(ClientMsg::Close { sub_id })
        }
        "EVENT" => {
            let ev_v = arr
                .get(1)
                .ok_or_else(|| ParseClientMsgError::Invalid("EVENT missing event".into()))?;
            let event: Event = serde_json::from_value(ev_v.clone())?;
            if let Some(max) = limits.max_content_length {
                if event.content.len() > max {
                    return Err(ParseClientMsgError::ContentTooLong(event.content.len(), max));
                }
            }
            if let Some(max) = limits.max_event_tags {
                if event.tags.len() > max {
                    return Err(ParseClientMsgError::TooManyTags(event.tags.len(), max));
                }
            }
            Ok(ClientMsg::Event { event })
        }
        other => Err(ParseClientMsgError::UnsupportedCommand(other.to_string())),
    }
}
