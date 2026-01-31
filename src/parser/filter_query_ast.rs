//! Filter Query DSL - AST and Token definitions
//!
//! This module defines the Abstract Syntax Tree (AST) for the filter query DSL.
//!
//! Example queries:
//! - `kind == 6`
//! - `content contains "spam"`
//! - `kind in [6, 7] AND content matches "(bot|spam)"`
//! - `(kind == 6 OR kind == 7) AND NOT npub in ["npub1..."]`

use serde::{Deserialize, Serialize};

/// Token types for the lexer
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    // Identifiers and literals
    Ident(String),
    String(String),
    Number(i64),
    
    // Comparison operators
    Eq,         // ==
    Ne,         // !=
    Gt,         // >
    Lt,         // <
    Ge,         // >=
    Le,         // <=
    
    // String operators (keywords)
    Contains,
    StartsWith,
    EndsWith,
    Matches,
    In,
    NotIn,
    Exists,
    
    // Logical operators
    And,
    Or,
    Not,
    
    // Punctuation
    LParen,     // (
    RParen,     // )
    LBracket,   // [
    RBracket,   // ]
    Comma,      // ,
    Dot,        // .
    
    // End of input
    Eof,
}

impl std::fmt::Display for Token {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Token::Ident(s) => write!(f, "{}", s),
            Token::String(s) => write!(f, "\"{}\"", s),
            Token::Number(n) => write!(f, "{}", n),
            Token::Eq => write!(f, "=="),
            Token::Ne => write!(f, "!="),
            Token::Gt => write!(f, ">"),
            Token::Lt => write!(f, "<"),
            Token::Ge => write!(f, ">="),
            Token::Le => write!(f, "<="),
            Token::Contains => write!(f, "contains"),
            Token::StartsWith => write!(f, "starts_with"),
            Token::EndsWith => write!(f, "ends_with"),
            Token::Matches => write!(f, "matches"),
            Token::In => write!(f, "in"),
            Token::NotIn => write!(f, "not_in"),
            Token::Exists => write!(f, "exists"),
            Token::And => write!(f, "AND"),
            Token::Or => write!(f, "OR"),
            Token::Not => write!(f, "NOT"),
            Token::LParen => write!(f, "("),
            Token::RParen => write!(f, ")"),
            Token::LBracket => write!(f, "["),
            Token::RBracket => write!(f, "]"),
            Token::Comma => write!(f, ","),
            Token::Dot => write!(f, "."),
            Token::Eof => write!(f, "EOF"),
        }
    }
}

/// A token with its position in the source
#[derive(Debug, Clone)]
pub struct SpannedToken {
    pub token: Token,
    pub start: usize,
    pub end: usize,
}

/// Expression node in the AST
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Expr {
    /// Logical AND: left AND right
    And {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    /// Logical OR: left OR right
    Or {
        left: Box<Expr>,
        right: Box<Expr>,
    },
    /// Logical NOT: NOT expr
    Not {
        expr: Box<Expr>,
    },
    /// Comparison condition: field op value
    Condition(Condition),
}

/// A single condition (field operator value)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Condition {
    pub field: Field,
    pub op: Operator,
    pub value: Value,
}

/// Field reference in a condition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum Field {
    /// Simple field: id, pubkey, kind, created_at, content
    Simple { name: String },
    /// Computed field: content_length
    ContentLength,
    /// Tag field: tag[e], tag[p]
    Tag { tag_name: String },
    /// Tag count: tag[e].count
    TagCount { tag_name: String },
    /// Tag value: tag[e].value
    TagValue { tag_name: String },
    /// Referenced event's created_at (for bot detection)
    ReferencedCreatedAt,
}

impl Field {
    /// Get the field name for display/logging
    pub fn name(&self) -> String {
        match self {
            Field::Simple { name } => name.clone(),
            Field::ContentLength => "content_length".to_string(),
            Field::Tag { tag_name } => format!("tag[{}]", tag_name),
            Field::TagCount { tag_name } => format!("tag[{}].count", tag_name),
            Field::TagValue { tag_name } => format!("tag[{}].value", tag_name),
            Field::ReferencedCreatedAt => "referenced_created_at".to_string(),
        }
    }
}

/// Comparison operator
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Operator {
    /// Equal: ==
    Eq,
    /// Not equal: !=
    Ne,
    /// Greater than: >
    Gt,
    /// Less than: <
    Lt,
    /// Greater than or equal: >=
    Ge,
    /// Less than or equal: <=
    Le,
    /// String contains: contains
    Contains,
    /// String starts with: starts_with
    StartsWith,
    /// String ends with: ends_with
    EndsWith,
    /// Regex match: matches
    Matches,
    /// Value in list: in
    In,
    /// Value not in list: not_in
    NotIn,
    /// Tag exists: exists
    Exists,
}

impl std::fmt::Display for Operator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Operator::Eq => write!(f, "=="),
            Operator::Ne => write!(f, "!="),
            Operator::Gt => write!(f, ">"),
            Operator::Lt => write!(f, "<"),
            Operator::Ge => write!(f, ">="),
            Operator::Le => write!(f, "<="),
            Operator::Contains => write!(f, "contains"),
            Operator::StartsWith => write!(f, "starts_with"),
            Operator::EndsWith => write!(f, "ends_with"),
            Operator::Matches => write!(f, "matches"),
            Operator::In => write!(f, "in"),
            Operator::NotIn => write!(f, "not_in"),
            Operator::Exists => write!(f, "exists"),
        }
    }
}

/// Value in a condition
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Value {
    /// String value
    String(String),
    /// Integer value
    Number(i64),
    /// Boolean value (for exists)
    Bool(bool),
    /// List of values (for in/not_in)
    List(Vec<Value>),
    /// Field reference (for comparing two fields)
    Field(Box<Field>),
}

impl Value {
    /// Check if this value is a list
    pub fn is_list(&self) -> bool {
        matches!(self, Value::List(_))
    }
    
    /// Get as string if possible
    pub fn as_string(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }
    
    /// Get as number if possible
    pub fn as_number(&self) -> Option<i64> {
        match self {
            Value::Number(n) => Some(*n),
            _ => None,
        }
    }
}

/// Parse error with position information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub position: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} at position {}", self.message, self.position)
    }
}

impl std::error::Error for ParseError {}

/// Validation result returned by the API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ast: Option<Expr>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields_used: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<usize>,
}

impl ValidationResult {
    pub fn success(ast: Expr, fields_used: Vec<String>) -> Self {
        Self {
            valid: true,
            ast: Some(ast),
            fields_used: Some(fields_used),
            error: None,
            position: None,
        }
    }
    
    pub fn error(message: String, position: usize) -> Self {
        Self {
            valid: false,
            ast: None,
            fields_used: None,
            error: Some(message),
            position: Some(position),
        }
    }
}

/// Extract all field names used in an expression
pub fn extract_fields(expr: &Expr) -> Vec<String> {
    let mut fields = Vec::new();
    extract_fields_recursive(expr, &mut fields);
    fields.sort();
    fields.dedup();
    fields
}

fn extract_fields_recursive(expr: &Expr, fields: &mut Vec<String>) {
    match expr {
        Expr::And { left, right } | Expr::Or { left, right } => {
            extract_fields_recursive(left, fields);
            extract_fields_recursive(right, fields);
        }
        Expr::Not { expr } => {
            extract_fields_recursive(expr, fields);
        }
        Expr::Condition(cond) => {
            fields.push(cond.field.name());
            if let Value::Field(f) = &cond.value {
                fields.push(f.name());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_name() {
        assert_eq!(Field::Simple { name: "kind".to_string() }.name(), "kind");
        assert_eq!(Field::ContentLength.name(), "content_length");
        assert_eq!(Field::Tag { tag_name: "e".to_string() }.name(), "tag[e]");
        assert_eq!(Field::TagCount { tag_name: "p".to_string() }.name(), "tag[p].count");
        assert_eq!(Field::TagValue { tag_name: "e".to_string() }.name(), "tag[e].value");
    }

    #[test]
    fn test_extract_fields() {
        let expr = Expr::And {
            left: Box::new(Expr::Condition(Condition {
                field: Field::Simple { name: "kind".to_string() },
                op: Operator::Eq,
                value: Value::Number(6),
            })),
            right: Box::new(Expr::Condition(Condition {
                field: Field::Simple { name: "content".to_string() },
                op: Operator::Contains,
                value: Value::String("test".to_string()),
            })),
        };
        
        let fields = extract_fields(&expr);
        assert_eq!(fields, vec!["content", "kind"]);
    }
}
