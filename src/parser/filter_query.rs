//! Filter Query DSL - Lexer, Parser, and Compiler
//!
//! This module implements a complete DSL for filtering Nostr events.

use std::collections::HashMap;
use regex::Regex;

use super::filter_query_ast::*;
use crate::nostr::event::Event;

// Re-export AST types for external use
pub use super::filter_query_ast::{
    Expr, Condition, Field, Operator, Value, 
    ParseError, ValidationResult, extract_fields
};

// ============================================================================
// Lexer
// ============================================================================

/// Lexer for the filter query DSL
pub struct Lexer<'a> {
    input: &'a str,
    chars: std::iter::Peekable<std::str::CharIndices<'a>>,
    current_pos: usize,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            input,
            chars: input.char_indices().peekable(),
            current_pos: 0,
        }
    }

    fn peek_char(&mut self) -> Option<char> {
        self.chars.peek().map(|(_, c)| *c)
    }

    fn next_char(&mut self) -> Option<(usize, char)> {
        let result = self.chars.next();
        if let Some((pos, _)) = result {
            self.current_pos = pos;
        }
        result
    }

    fn skip_whitespace(&mut self) {
        while let Some(c) = self.peek_char() {
            if c.is_whitespace() {
                self.next_char();
            } else if c == '#' {
                // Skip comment until end of line
                while let Some(c) = self.peek_char() {
                    self.next_char();
                    if c == '\n' {
                        break;
                    }
                }
            } else {
                break;
            }
        }
    }

    fn read_string(&mut self) -> Result<String, ParseError> {
        let start = self.current_pos;
        let mut s = String::new();
        
        // Skip opening quote
        self.next_char();
        
        loop {
            match self.next_char() {
                Some((_, '"')) => break,
                Some((_, '\\')) => {
                    // Escape sequence
                    match self.next_char() {
                        Some((_, 'n')) => s.push('\n'),
                        Some((_, 't')) => s.push('\t'),
                        Some((_, 'r')) => s.push('\r'),
                        Some((_, '\\')) => s.push('\\'),
                        Some((_, '"')) => s.push('"'),
                        Some((pos, c)) => {
                            return Err(ParseError {
                                message: format!("Unknown escape sequence: \\{}", c),
                                position: pos,
                            });
                        }
                        None => {
                            return Err(ParseError {
                                message: "Unterminated string".to_string(),
                                position: start,
                            });
                        }
                    }
                }
                Some((_, c)) => s.push(c),
                None => {
                    return Err(ParseError {
                        message: "Unterminated string".to_string(),
                        position: start,
                    });
                }
            }
        }
        
        Ok(s)
    }

    fn read_number(&mut self) -> i64 {
        let mut s = String::new();
        let negative = if self.peek_char() == Some('-') {
            self.next_char();
            true
        } else {
            false
        };
        
        while let Some(c) = self.peek_char() {
            if c.is_ascii_digit() {
                s.push(c);
                self.next_char();
            } else {
                break;
            }
        }
        
        let n: i64 = s.parse().unwrap_or(0);
        if negative { -n } else { n }
    }

    fn read_ident(&mut self) -> String {
        let mut s = String::new();
        
        while let Some(c) = self.peek_char() {
            if c.is_alphanumeric() || c == '_' {
                s.push(c);
                self.next_char();
            } else {
                break;
            }
        }
        
        s
    }

    pub fn next_token(&mut self) -> Result<SpannedToken, ParseError> {
        self.skip_whitespace();
        
        let start = self.chars.peek().map(|(pos, _)| *pos).unwrap_or(self.input.len());
        
        let token = match self.peek_char() {
            None => Token::Eof,
            Some('"') => Token::String(self.read_string()?),
            Some(c) if c.is_ascii_digit() || (c == '-' && self.input[start..].len() > 1 && self.input[start+1..].chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)) => {
                Token::Number(self.read_number())
            }
            Some('(') => { self.next_char(); Token::LParen }
            Some(')') => { self.next_char(); Token::RParen }
            Some('[') => { self.next_char(); Token::LBracket }
            Some(']') => { self.next_char(); Token::RBracket }
            Some(',') => { self.next_char(); Token::Comma }
            Some('.') => { self.next_char(); Token::Dot }
            Some('=') => {
                self.next_char();
                if self.peek_char() == Some('=') {
                    self.next_char();
                    Token::Eq
                } else {
                    return Err(ParseError {
                        message: "Expected '==' but got '='".to_string(),
                        position: start,
                    });
                }
            }
            Some('!') => {
                self.next_char();
                if self.peek_char() == Some('=') {
                    self.next_char();
                    Token::Ne
                } else {
                    return Err(ParseError {
                        message: "Expected '!=' but got '!'".to_string(),
                        position: start,
                    });
                }
            }
            Some('>') => {
                self.next_char();
                if self.peek_char() == Some('=') {
                    self.next_char();
                    Token::Ge
                } else {
                    Token::Gt
                }
            }
            Some('<') => {
                self.next_char();
                if self.peek_char() == Some('=') {
                    self.next_char();
                    Token::Le
                } else {
                    Token::Lt
                }
            }
            Some(c) if c.is_alphabetic() || c == '_' => {
                let ident = self.read_ident();
                match ident.to_lowercase().as_str() {
                    "and" => Token::And,
                    "or" => Token::Or,
                    "not" => Token::Not,
                    "contains" => Token::Contains,
                    "starts_with" => Token::StartsWith,
                    "ends_with" => Token::EndsWith,
                    "matches" => Token::Matches,
                    "in" => Token::In,
                    "not_in" => Token::NotIn,
                    "exists" => Token::Exists,
                    "true" => Token::Ident("true".to_string()),
                    "false" => Token::Ident("false".to_string()),
                    _ => Token::Ident(ident),
                }
            }
            Some(c) => {
                return Err(ParseError {
                    message: format!("Unexpected character: '{}'", c),
                    position: start,
                });
            }
        };
        
        let end = self.chars.peek().map(|(pos, _)| *pos).unwrap_or(self.input.len());
        
        Ok(SpannedToken { token, start, end })
    }

    /// Tokenize the entire input
    pub fn tokenize(&mut self) -> Result<Vec<SpannedToken>, ParseError> {
        let mut tokens = Vec::new();
        loop {
            let token = self.next_token()?;
            let is_eof = token.token == Token::Eof;
            tokens.push(token);
            if is_eof {
                break;
            }
        }
        Ok(tokens)
    }
}

// ============================================================================
// Parser
// ============================================================================

/// Recursive descent parser for the filter query DSL
pub struct Parser {
    tokens: Vec<SpannedToken>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<SpannedToken>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn current(&self) -> &SpannedToken {
        &self.tokens[self.pos.min(self.tokens.len() - 1)]
    }

    fn peek(&self) -> &Token {
        &self.current().token
    }

    fn advance(&mut self) -> &SpannedToken {
        let current = &self.tokens[self.pos.min(self.tokens.len() - 1)];
        if self.pos < self.tokens.len() - 1 {
            self.pos += 1;
        }
        current
    }

    fn expect(&mut self, expected: Token) -> Result<(), ParseError> {
        if *self.peek() == expected {
            self.advance();
            Ok(())
        } else {
            Err(ParseError {
                message: format!("Expected '{}' but got '{}'", expected, self.peek()),
                position: self.current().start,
            })
        }
    }

    /// Parse the entire expression
    pub fn parse(&mut self) -> Result<Expr, ParseError> {
        let expr = self.parse_or_expr()?;
        
        if *self.peek() != Token::Eof {
            return Err(ParseError {
                message: format!("Unexpected token: '{}'", self.peek()),
                position: self.current().start,
            });
        }
        
        Ok(expr)
    }

    /// Parse OR expression: and_expr (OR and_expr)*
    fn parse_or_expr(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_and_expr()?;
        
        while *self.peek() == Token::Or {
            self.advance();
            let right = self.parse_and_expr()?;
            left = Expr::Or {
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        
        Ok(left)
    }

    /// Parse AND expression: not_expr (AND not_expr)*
    fn parse_and_expr(&mut self) -> Result<Expr, ParseError> {
        let mut left = self.parse_not_expr()?;
        
        while *self.peek() == Token::And {
            self.advance();
            let right = self.parse_not_expr()?;
            left = Expr::And {
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        
        Ok(left)
    }

    /// Parse NOT expression: NOT? primary
    fn parse_not_expr(&mut self) -> Result<Expr, ParseError> {
        if *self.peek() == Token::Not {
            self.advance();
            let expr = self.parse_not_expr()?;
            Ok(Expr::Not { expr: Box::new(expr) })
        } else {
            self.parse_primary()
        }
    }

    /// Parse primary: ( expr ) | condition
    fn parse_primary(&mut self) -> Result<Expr, ParseError> {
        if *self.peek() == Token::LParen {
            self.advance();
            let expr = self.parse_or_expr()?;
            self.expect(Token::RParen)?;
            Ok(expr)
        } else {
            self.parse_condition()
        }
    }

    /// Parse condition: field operator value
    fn parse_condition(&mut self) -> Result<Expr, ParseError> {
        let field = self.parse_field()?;
        let op = self.parse_operator()?;
        let value = self.parse_value()?;
        
        Ok(Expr::Condition(Condition { field, op, value }))
    }

    /// Parse field: ident | tag[name] | tag[name].count | tag[name].value
    fn parse_field(&mut self) -> Result<Field, ParseError> {
        let token = self.advance().clone();
        
        match &token.token {
            Token::Ident(name) => {
                match name.as_str() {
                    "content_length" => Ok(Field::ContentLength),
                    "referenced_created_at" => Ok(Field::ReferencedCreatedAt),
                    "tag" => {
                        // tag[name] or tag[name].count or tag[name].value
                        self.expect(Token::LBracket)?;
                        let tag_name = match self.advance().token.clone() {
                            Token::Ident(s) => s,
                            Token::String(s) => s,
                            _ => {
                                return Err(ParseError {
                                    message: "Expected tag name".to_string(),
                                    position: self.current().start,
                                });
                            }
                        };
                        self.expect(Token::RBracket)?;
                        
                        // Check for .count or .value
                        if *self.peek() == Token::Dot {
                            self.advance();
                            let prop = match &self.advance().token {
                                Token::Ident(s) => s.clone(),
                                _ => {
                                    return Err(ParseError {
                                        message: "Expected 'count' or 'value' after '.'".to_string(),
                                        position: self.current().start,
                                    });
                                }
                            };
                            match prop.as_str() {
                                "count" => Ok(Field::TagCount { tag_name }),
                                "value" => Ok(Field::TagValue { tag_name }),
                                _ => Err(ParseError {
                                    message: format!("Unknown tag property: '{}'", prop),
                                    position: self.current().start,
                                }),
                            }
                        } else {
                            Ok(Field::Tag { tag_name })
                        }
                    }
                    _ => Ok(Field::Simple { name: name.clone() }),
                }
            }
            _ => Err(ParseError {
                message: format!("Expected field name but got '{}'", token.token),
                position: token.start,
            }),
        }
    }

    /// Parse operator
    fn parse_operator(&mut self) -> Result<Operator, ParseError> {
        let token = self.advance().clone();
        
        match &token.token {
            Token::Eq => Ok(Operator::Eq),
            Token::Ne => Ok(Operator::Ne),
            Token::Gt => Ok(Operator::Gt),
            Token::Lt => Ok(Operator::Lt),
            Token::Ge => Ok(Operator::Ge),
            Token::Le => Ok(Operator::Le),
            Token::Contains => Ok(Operator::Contains),
            Token::StartsWith => Ok(Operator::StartsWith),
            Token::EndsWith => Ok(Operator::EndsWith),
            Token::Matches => Ok(Operator::Matches),
            Token::In => Ok(Operator::In),
            Token::NotIn => Ok(Operator::NotIn),
            Token::Exists => Ok(Operator::Exists),
            _ => Err(ParseError {
                message: format!("Expected operator but got '{}'", token.token),
                position: token.start,
            }),
        }
    }

    /// Parse value: string | number | bool | list | field_ref
    fn parse_value(&mut self) -> Result<Value, ParseError> {
        let token = self.current().clone();
        
        match &token.token {
            Token::String(s) => {
                self.advance();
                Ok(Value::String(s.clone()))
            }
            Token::Number(n) => {
                self.advance();
                Ok(Value::Number(*n))
            }
            Token::Ident(s) if s == "true" => {
                self.advance();
                Ok(Value::Bool(true))
            }
            Token::Ident(s) if s == "false" => {
                self.advance();
                Ok(Value::Bool(false))
            }
            Token::Ident(s) => {
                // Field reference
                let field = self.parse_field()?;
                Ok(Value::Field(Box::new(field)))
            }
            Token::LBracket => {
                // List
                self.advance();
                let mut values = Vec::new();
                
                if *self.peek() != Token::RBracket {
                    values.push(self.parse_value()?);
                    
                    while *self.peek() == Token::Comma {
                        self.advance();
                        values.push(self.parse_value()?);
                    }
                }
                
                self.expect(Token::RBracket)?;
                Ok(Value::List(values))
            }
            _ => Err(ParseError {
                message: format!("Expected value but got '{}'", token.token),
                position: token.start,
            }),
        }
    }
}

// ============================================================================
// Compiler and Evaluator
// ============================================================================

/// Compiled filter ready for evaluation
pub struct CompiledFilter {
    ast: Expr,
    regex_cache: HashMap<String, Regex>,
}

impl CompiledFilter {
    /// Compile an AST into a filter
    pub fn compile(ast: Expr) -> Result<Self, ParseError> {
        let mut regex_cache = HashMap::new();
        Self::compile_regexes(&ast, &mut regex_cache)?;
        Ok(Self { ast, regex_cache })
    }

    fn compile_regexes(expr: &Expr, cache: &mut HashMap<String, Regex>) -> Result<(), ParseError> {
        match expr {
            Expr::And { left, right } | Expr::Or { left, right } => {
                Self::compile_regexes(left, cache)?;
                Self::compile_regexes(right, cache)?;
            }
            Expr::Not { expr } => {
                Self::compile_regexes(expr, cache)?;
            }
            Expr::Condition(cond) => {
                if cond.op == Operator::Matches {
                    if let Value::String(pattern) = &cond.value {
                        if !cache.contains_key(pattern) {
                            match Regex::new(pattern) {
                                Ok(re) => { cache.insert(pattern.clone(), re); }
                                Err(e) => {
                                    return Err(ParseError {
                                        message: format!("Invalid regex: {}", e),
                                        position: 0,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    /// Evaluate the filter against an event
    pub fn matches(&self, event: &Event, kind1_cache: &HashMap<String, i64>) -> bool {
        self.evaluate(&self.ast, event, kind1_cache)
    }

    fn evaluate(&self, expr: &Expr, event: &Event, kind1_cache: &HashMap<String, i64>) -> bool {
        match expr {
            Expr::And { left, right } => {
                self.evaluate(left, event, kind1_cache) && self.evaluate(right, event, kind1_cache)
            }
            Expr::Or { left, right } => {
                self.evaluate(left, event, kind1_cache) || self.evaluate(right, event, kind1_cache)
            }
            Expr::Not { expr } => {
                !self.evaluate(expr, event, kind1_cache)
            }
            Expr::Condition(cond) => {
                self.evaluate_condition(cond, event, kind1_cache)
            }
        }
    }

    fn evaluate_condition(&self, cond: &Condition, event: &Event, kind1_cache: &HashMap<String, i64>) -> bool {
        let field_value = self.get_field_value(&cond.field, event, kind1_cache);
        
        match cond.op {
            Operator::Exists => {
                // For exists, check if the field has any value
                field_value.is_some()
            }
            _ => {
                let Some(fv) = field_value else { return false };
                self.compare(&fv, &cond.op, &cond.value, event, kind1_cache)
            }
        }
    }

    fn get_field_value(&self, field: &Field, event: &Event, kind1_cache: &HashMap<String, i64>) -> Option<FieldValue> {
        match field {
            Field::Simple { name } => match name.as_str() {
                "id" => Some(FieldValue::String(event.id.clone())),
                "pubkey" => Some(FieldValue::String(event.pubkey.clone())),
                "npub" => {
                    // Convert pubkey to npub
                    hex::decode(&event.pubkey).ok().and_then(|bytes| {
                        bech32::Hrp::parse("npub").ok().and_then(|hrp| {
                            bech32::encode::<bech32::Bech32>(hrp, &bytes).ok()
                        })
                    }).map(FieldValue::String)
                }
                "kind" => Some(FieldValue::Number(event.kind)),
                "created_at" => Some(FieldValue::Number(event.created_at)),
                "content" => Some(FieldValue::String(event.content.clone())),
                _ => None,
            },
            Field::ContentLength => Some(FieldValue::Number(event.content.len() as i64)),
            Field::Tag { tag_name } => {
                // Check if tag exists (return true as a marker)
                if event.tags.iter().any(|t| t.first().map(|s| s.as_str()) == Some(tag_name.as_str())) {
                    Some(FieldValue::Bool(true))
                } else {
                    None
                }
            }
            Field::TagCount { tag_name } => {
                let count = event.tags.iter()
                    .filter(|t| t.first().map(|s| s.as_str()) == Some(tag_name.as_str()))
                    .count();
                Some(FieldValue::Number(count as i64))
            }
            Field::TagValue { tag_name } => {
                event.tags.iter()
                    .find(|t| t.first().map(|s| s.as_str()) == Some(tag_name.as_str()))
                    .and_then(|t| t.get(1))
                    .cloned()
                    .map(FieldValue::String)
            }
            Field::ReferencedCreatedAt => {
                // Get the created_at of the referenced kind1 event
                event.first_e_tag_event_id()
                    .and_then(|id| kind1_cache.get(id))
                    .copied()
                    .map(FieldValue::Number)
            }
        }
    }

    fn compare(&self, field_value: &FieldValue, op: &Operator, value: &Value, event: &Event, kind1_cache: &HashMap<String, i64>) -> bool {
        match op {
            Operator::Eq => self.compare_eq(field_value, value, event, kind1_cache),
            Operator::Ne => !self.compare_eq(field_value, value, event, kind1_cache),
            Operator::Gt => self.compare_numeric(field_value, value, event, kind1_cache, |a, b| a > b),
            Operator::Lt => self.compare_numeric(field_value, value, event, kind1_cache, |a, b| a < b),
            Operator::Ge => self.compare_numeric(field_value, value, event, kind1_cache, |a, b| a >= b),
            Operator::Le => self.compare_numeric(field_value, value, event, kind1_cache, |a, b| a <= b),
            Operator::Contains => {
                if let (FieldValue::String(s), Value::String(pattern)) = (field_value, value) {
                    s.to_lowercase().contains(&pattern.to_lowercase())
                } else {
                    false
                }
            }
            Operator::StartsWith => {
                if let (FieldValue::String(s), Value::String(pattern)) = (field_value, value) {
                    s.to_lowercase().starts_with(&pattern.to_lowercase())
                } else {
                    false
                }
            }
            Operator::EndsWith => {
                if let (FieldValue::String(s), Value::String(pattern)) = (field_value, value) {
                    s.to_lowercase().ends_with(&pattern.to_lowercase())
                } else {
                    false
                }
            }
            Operator::Matches => {
                if let (FieldValue::String(s), Value::String(pattern)) = (field_value, value) {
                    self.regex_cache.get(pattern).map(|re| re.is_match(s)).unwrap_or(false)
                } else {
                    false
                }
            }
            Operator::In => {
                if let Value::List(list) = value {
                    list.iter().any(|v| self.compare_eq(field_value, v, event, kind1_cache))
                } else {
                    false
                }
            }
            Operator::NotIn => {
                if let Value::List(list) = value {
                    !list.iter().any(|v| self.compare_eq(field_value, v, event, kind1_cache))
                } else {
                    true
                }
            }
            Operator::Exists => {
                // Already handled in evaluate_condition
                true
            }
        }
    }

    fn compare_eq(&self, field_value: &FieldValue, value: &Value, event: &Event, kind1_cache: &HashMap<String, i64>) -> bool {
        match (field_value, value) {
            (FieldValue::String(a), Value::String(b)) => a == b,
            (FieldValue::Number(a), Value::Number(b)) => a == b,
            (FieldValue::Bool(a), Value::Bool(b)) => a == b,
            (FieldValue::Number(a), Value::Field(field)) => {
                if let Some(FieldValue::Number(b)) = self.get_field_value(field, event, kind1_cache) {
                    *a == b
                } else {
                    false
                }
            }
            (FieldValue::String(a), Value::Field(field)) => {
                if let Some(FieldValue::String(b)) = self.get_field_value(field, event, kind1_cache) {
                    *a == b
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    fn compare_numeric<F>(&self, field_value: &FieldValue, value: &Value, event: &Event, kind1_cache: &HashMap<String, i64>, cmp: F) -> bool
    where
        F: Fn(i64, i64) -> bool,
    {
        match (field_value, value) {
            (FieldValue::Number(a), Value::Number(b)) => cmp(*a, *b),
            (FieldValue::Number(a), Value::Field(field)) => {
                if let Some(FieldValue::Number(b)) = self.get_field_value(field, event, kind1_cache) {
                    cmp(*a, b)
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    /// Get the AST for serialization
    pub fn ast(&self) -> &Expr {
        &self.ast
    }
}

/// Internal field value enum for evaluation
#[derive(Debug, Clone)]
enum FieldValue {
    String(String),
    Number(i64),
    Bool(bool),
}

// ============================================================================
// Public API
// ============================================================================

/// Parse a filter query string into an AST
pub fn parse(input: &str) -> Result<Expr, ParseError> {
    let mut lexer = Lexer::new(input);
    let tokens = lexer.tokenize()?;
    let mut parser = Parser::new(tokens);
    parser.parse()
}

/// Parse and compile a filter query string
pub fn compile(input: &str) -> Result<CompiledFilter, ParseError> {
    let ast = parse(input)?;
    CompiledFilter::compile(ast)
}

/// Validate a filter query string and return detailed results
pub fn validate(input: &str) -> ValidationResult {
    match parse(input) {
        Ok(ast) => {
            // Try to compile to check regex patterns
            match CompiledFilter::compile(ast.clone()) {
                Ok(_) => {
                    let fields = extract_fields(&ast);
                    ValidationResult::success(ast, fields)
                }
                Err(e) => ValidationResult::error(e.message, e.position),
            }
        }
        Err(e) => ValidationResult::error(e.message, e.position),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lexer() {
        let mut lexer = Lexer::new("kind == 6");
        let tokens = lexer.tokenize().unwrap();
        assert_eq!(tokens.len(), 4); // kind, ==, 6, EOF
    }

    #[test]
    fn test_parse_simple() {
        let expr = parse("kind == 6").unwrap();
        match expr {
            Expr::Condition(cond) => {
                assert_eq!(cond.field, Field::Simple { name: "kind".to_string() });
                assert_eq!(cond.op, Operator::Eq);
                assert_eq!(cond.value, Value::Number(6));
            }
            _ => panic!("Expected Condition"),
        }
    }

    #[test]
    fn test_parse_and() {
        let expr = parse("kind == 6 AND content contains \"test\"").unwrap();
        match expr {
            Expr::And { left, right } => {
                assert!(matches!(*left, Expr::Condition(_)));
                assert!(matches!(*right, Expr::Condition(_)));
            }
            _ => panic!("Expected And"),
        }
    }

    #[test]
    fn test_parse_or() {
        let expr = parse("kind == 6 OR kind == 7").unwrap();
        assert!(matches!(expr, Expr::Or { .. }));
    }

    #[test]
    fn test_parse_not() {
        let expr = parse("NOT kind == 6").unwrap();
        assert!(matches!(expr, Expr::Not { .. }));
    }

    #[test]
    fn test_parse_parentheses() {
        let expr = parse("(kind == 6 OR kind == 7) AND content contains \"test\"").unwrap();
        match expr {
            Expr::And { left, .. } => {
                assert!(matches!(*left, Expr::Or { .. }));
            }
            _ => panic!("Expected And"),
        }
    }

    #[test]
    fn test_parse_list() {
        let expr = parse("kind in [6, 7, 8]").unwrap();
        match expr {
            Expr::Condition(cond) => {
                assert_eq!(cond.op, Operator::In);
                if let Value::List(list) = cond.value {
                    assert_eq!(list.len(), 3);
                } else {
                    panic!("Expected List");
                }
            }
            _ => panic!("Expected Condition"),
        }
    }

    #[test]
    fn test_parse_tag() {
        let expr = parse("tag[e].count > 5").unwrap();
        match expr {
            Expr::Condition(cond) => {
                assert_eq!(cond.field, Field::TagCount { tag_name: "e".to_string() });
            }
            _ => panic!("Expected Condition"),
        }
    }

    #[test]
    fn test_validate_success() {
        let result = validate("kind == 6 AND content contains \"test\"");
        assert!(result.valid);
        assert!(result.ast.is_some());
        assert!(result.fields_used.is_some());
    }

    #[test]
    fn test_validate_error() {
        let result = validate("kind === 6");
        assert!(!result.valid);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_regex_validation() {
        let result = validate("content matches \"[invalid\"");
        assert!(!result.valid);
        assert!(result.error.unwrap().contains("Invalid regex"));
    }

    #[test]
    fn test_compile_and_match() {
        let filter = compile("kind == 1 AND content contains \"hello\"").unwrap();
        
        let event = Event {
            id: "test".to_string(),
            pubkey: "abc".to_string(),
            created_at: 1234567890,
            kind: 1,
            tags: vec![],
            content: "Hello World!".to_string(),
            sig: "sig".to_string(),
        };
        
        let cache = HashMap::new();
        assert!(filter.matches(&event, &cache));
    }

    #[test]
    fn test_compile_and_no_match() {
        let filter = compile("kind == 6").unwrap();
        
        let event = Event {
            id: "test".to_string(),
            pubkey: "abc".to_string(),
            created_at: 1234567890,
            kind: 1,
            tags: vec![],
            content: "test".to_string(),
            sig: "sig".to_string(),
        };
        
        let cache = HashMap::new();
        assert!(!filter.matches(&event, &cache));
    }
}
