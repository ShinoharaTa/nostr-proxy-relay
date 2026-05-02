//! Simple BAN ⇔ DSL 双方向変換と dry-run 用ユーティリティ。
//!
//! `simple_ban_rules` の rule_type ごとに対応する DSL 文字列を生成する。
//! 逆変換は「DSL のごく一部のサブセットだけ Simple BAN に落とせる」ようにする。

use serde::{Deserialize, Serialize};

use super::filter_query::{self, CompiledFilter};
use super::filter_query_ast::{Condition, Expr, Field, Operator, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleRule {
    pub rule_type: String,
    pub npub_list: Option<String>,
    pub kind_list: Option<String>,
    pub tag_name: Option<String>,
    pub tag_value_pattern: Option<String>,
}

/// Simple BAN ルールを DSL 文字列に変換する。
pub fn simple_to_dsl(rule: &SimpleRule) -> Result<String, String> {
    match rule.rule_type.as_str() {
        "npub" => {
            let npubs = parse_csv(rule.npub_list.as_deref().unwrap_or(""));
            if npubs.is_empty() {
                return Err("npub_list is empty".into());
            }
            Ok(format!("npub in [{}]", join_quoted(&npubs)))
        }
        "kind" => {
            let kinds = parse_csv(rule.kind_list.as_deref().unwrap_or(""));
            if kinds.is_empty() {
                return Err("kind_list is empty".into());
            }
            Ok(format!("kind in [{}]", kinds.join(", ")))
        }
        "npub_kind" => {
            let npubs = parse_csv(rule.npub_list.as_deref().unwrap_or(""));
            let kinds = parse_csv(rule.kind_list.as_deref().unwrap_or(""));
            if npubs.is_empty() || kinds.is_empty() {
                return Err("npub_list and kind_list are required".into());
            }
            Ok(format!(
                "npub in [{}] AND kind in [{}]",
                join_quoted(&npubs),
                kinds.join(", ")
            ))
        }
        "tag_contains" => {
            let tag = rule
                .tag_name
                .as_deref()
                .ok_or("tag_name required for tag_contains")?
                .trim();
            let pat = rule
                .tag_value_pattern
                .as_deref()
                .ok_or("tag_value_pattern required for tag_contains")?
                .trim();
            if tag.is_empty() || pat.is_empty() {
                return Err("tag_name / tag_value_pattern is empty".into());
            }
            Ok(format!("tag[{}] contains \"{}\"", tag, escape_str(pat)))
        }
        other => Err(format!("unknown rule_type: {}", other)),
    }
}

/// DSL ルールを Simple BAN へ落とせるか試みる。
/// 落とせない場合は None。
pub fn dsl_to_simple(input: &str) -> Option<SimpleRule> {
    let expr = filter_query::parse(input).ok()?;
    expr_to_simple(&expr)
}

fn expr_to_simple(expr: &Expr) -> Option<SimpleRule> {
    match expr {
        Expr::Condition(cond) => condition_to_simple(cond),
        Expr::And { left, right } => {
            let l = expr_to_simple(left)?;
            let r = expr_to_simple(right)?;
            merge_npub_kind(l, r)
        }
        _ => None,
    }
}

fn condition_to_simple(cond: &Condition) -> Option<SimpleRule> {
    match (&cond.field, &cond.op) {
        (Field::Simple { name }, Operator::In) if name == "npub" => {
            if let Value::List(items) = &cond.value {
                let npubs: Vec<String> = items
                    .iter()
                    .filter_map(|v| match v {
                        Value::String(s) => Some(s.clone()),
                        _ => None,
                    })
                    .collect();
                if npubs.is_empty() {
                    return None;
                }
                return Some(SimpleRule {
                    rule_type: "npub".into(),
                    npub_list: Some(npubs.join(",")),
                    kind_list: None,
                    tag_name: None,
                    tag_value_pattern: None,
                });
            }
            None
        }
        (Field::Simple { name }, Operator::In) if name == "kind" => {
            if let Value::List(items) = &cond.value {
                let kinds: Vec<String> = items
                    .iter()
                    .filter_map(|v| match v {
                        Value::Number(n) => Some(n.to_string()),
                        _ => None,
                    })
                    .collect();
                if kinds.is_empty() {
                    return None;
                }
                return Some(SimpleRule {
                    rule_type: "kind".into(),
                    npub_list: None,
                    kind_list: Some(kinds.join(",")),
                    tag_name: None,
                    tag_value_pattern: None,
                });
            }
            None
        }
        (Field::Simple { name }, Operator::Eq) if name == "kind" => {
            if let Value::Number(n) = &cond.value {
                return Some(SimpleRule {
                    rule_type: "kind".into(),
                    npub_list: None,
                    kind_list: Some(n.to_string()),
                    tag_name: None,
                    tag_value_pattern: None,
                });
            }
            None
        }
        (Field::Tag { tag_name }, Operator::Contains) => {
            if let Value::String(s) = &cond.value {
                return Some(SimpleRule {
                    rule_type: "tag_contains".into(),
                    npub_list: None,
                    kind_list: None,
                    tag_name: Some(tag_name.clone()),
                    tag_value_pattern: Some(s.clone()),
                });
            }
            None
        }
        _ => None,
    }
}

fn merge_npub_kind(a: SimpleRule, b: SimpleRule) -> Option<SimpleRule> {
    let (npub, kind) = match (a.rule_type.as_str(), b.rule_type.as_str()) {
        ("npub", "kind") => (a, b),
        ("kind", "npub") => (b, a),
        _ => return None,
    };
    Some(SimpleRule {
        rule_type: "npub_kind".into(),
        npub_list: npub.npub_list,
        kind_list: kind.kind_list,
        tag_name: None,
        tag_value_pattern: None,
    })
}

/// 与えた DSL を試しに 1 件のサンプル Event に当てて、ヒット可否と AST を返す。
pub fn dry_run(dsl: &str, sample: &crate::nostr::event::Event) -> DryRunResult {
    match filter_query::compile(dsl) {
        Ok(filter) => {
            let cache = std::collections::HashMap::new();
            let matched = CompiledFilter::matches(&filter, sample, &cache);
            DryRunResult {
                ok: true,
                matched,
                error: None,
            }
        }
        Err(e) => DryRunResult {
            ok: false,
            matched: false,
            error: Some(format!("{}", e.message)),
        },
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DryRunResult {
    pub ok: bool,
    pub matched: bool,
    pub error: Option<String>,
}

fn parse_csv(s: &str) -> Vec<String> {
    s.split(',')
        .map(|x| x.trim().to_string())
        .filter(|x| !x.is_empty())
        .collect()
}

fn join_quoted(items: &[String]) -> String {
    items
        .iter()
        .map(|s| format!("\"{}\"", escape_str(s)))
        .collect::<Vec<_>>()
        .join(", ")
}

fn escape_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
