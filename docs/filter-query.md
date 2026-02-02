# Filter Query Language (DSL) Specification

[日本語 (Japanese)](filter-query_ja.md)

`proxy-nostr-relay` uses a SQL-like DSL (Domain Specific Language) to define flexible filtering rules.

## Basic Syntax

Rules are written as expressions that evaluate to true or false. If an expression evaluates to true, the event is blocked.

### Supported Fields

- `kind`: Event kind (integer)
- `content`: Event content (string)
- `pubkey`: Author's public key (hex string)
- `created_at`: Event creation time (unix timestamp)

### Operators

- `==`, `!=`: Equality and inequality
- `>`, `>=`, `<`, `<=`: Numeric comparisons
- `matches`: Regular expression matching (e.g., `content matches ".*spam.*"`)
- `contains`: String containment
- `AND`, `OR`, `NOT`: Logical operators

## Tag Filtering

You can filter based on event tags using the `tag` function.

- `tag("e")`: Returns the value of the first "e" tag.
- `tag_count("p")`: Returns the number of "p" tags.
- `has_tag("t")`: Returns true if a "t" tag exists.

## Examples

### Block specific kinds
```sql
kind == 10002 OR kind == 30001
```

### Block content with regular expressions
```sql
kind == 1 AND content matches "(?i)cryptocurrency|airdrop"
```

### Complex rules
```sql
kind == 1 AND tag_count("p") > 10 AND NOT has_tag("t")
```
