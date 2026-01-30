use anyhow::Context;
use sqlx::SqlitePool;

use crate::nostr::event::Event;

pub struct FilterEngine {
    // Minimal cache: kind1 event_id -> created_at
    kind1_created_at_by_id: std::collections::HashMap<String, i64>,
}

impl FilterEngine {
    pub fn new() -> Self {
        Self {
            kind1_created_at_by_id: std::collections::HashMap::new(),
        }
    }

    pub async fn should_drop_backend_text(
        &mut self,
        pool: &SqlitePool,
        text: &str,
    ) -> anyhow::Result<bool> {
        let v: serde_json::Value = match serde_json::from_str(text) {
            Ok(v) => v,
            Err(_) => return Ok(false), // non-json: ignore
        };
        let Some(arr) = v.as_array() else {
            return Ok(false);
        };
        if arr.first().and_then(|v| v.as_str()) != Some("EVENT") {
            return Ok(false);
        }

        // ["EVENT", <sub_id>, <event>]
        let ev_v = arr.get(2).context("EVENT missing event")?;
        let event: Event = serde_json::from_value(ev_v.clone()).context("parse event")?;

        // cache kind1
        if event.kind == 1 {
            self.kind1_created_at_by_id
                .insert(event.id.clone(), event.created_at);
            return Ok(false);
        }

        // bot filter rule (kind6/7) with whitelist bypass
        if event.kind == 6 || event.kind == 7 {
            if is_filter_bypass(pool, &event.pubkey).await? {
                return Ok(false);
            }
            let Some(target_id) = event.first_e_tag_event_id() else {
                return Ok(false);
            };
            let Some(target_created_at) = self.kind1_created_at_by_id.get(target_id) else {
                return Ok(false); // cache miss => pass
            };
            if *target_created_at == event.created_at {
                return Ok(true); // drop
            }
        }

        Ok(false)
    }
}

async fn is_filter_bypass(pool: &SqlitePool, pubkey_hex: &str) -> anyhow::Result<bool> {
    let npub = pubkey_hex_to_npub(pubkey_hex)?;
    let row: Option<(i64,)> = sqlx::query_as("SELECT flags FROM safelist WHERE npub = ?")
        .bind(npub)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(flags,)| (flags & 2) == 2).unwrap_or(false))
}

fn pubkey_hex_to_npub(pubkey_hex: &str) -> anyhow::Result<String> {
    let bytes = hex::decode(pubkey_hex).context("pubkey hex decode")?;
    let hrp = bech32::Hrp::parse("npub").context("invalid bech32 hrp")?;
    Ok(bech32::encode::<bech32::Bech32>(hrp, &bytes)?)
}

