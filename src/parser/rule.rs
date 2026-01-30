use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Rule {
    /// Drop kind6/7 if created_at equals referenced kind1 created_at (via `e` tag).
    DropIfSameCreatedAtAsReferencedPost {
        kinds: Vec<i64>,
        referenced_kind: i64,
        cache_miss_behavior: CacheMissBehavior,
        whitelist_bypass: bool,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CacheMissBehavior {
    Pass,
    Drop,
}

#[derive(Debug, thiserror::Error)]
pub enum ParseRuleError {
    #[error("unsupported natural language rule")]
    Unsupported,
}

/// Very small rule-based parser (KISS).
///
/// Currently supports:
/// - kind6/7 created_at == referenced kind1 created_at => drop
pub fn parse_natural_language_rule(text: &str) -> Result<Rule, ParseRuleError> {
    let t = text.to_lowercase();

    // Heuristics for the rule discussed in this project.
    let mentions_created_at = t.contains("created_at") || t.contains("created at");
    let mentions_same = t.contains("同一") || t.contains("same") || t.contains("一致");
    let mentions_reaction = t.contains("reaction") || t.contains("リアクション");
    let mentions_repost = t.contains("repost") || t.contains("リポスト");
    let mentions_reference = t.contains("参照") || t.contains("元の") || t.contains("投稿a");

    if mentions_created_at && mentions_same && mentions_reference && (mentions_reaction || mentions_repost) {
        return Ok(Rule::DropIfSameCreatedAtAsReferencedPost {
            kinds: vec![6, 7],
            referenced_kind: 1,
            cache_miss_behavior: CacheMissBehavior::Pass,
            whitelist_bypass: true,
        });
    }

    Err(ParseRuleError::Unsupported)
}

