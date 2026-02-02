# Filter Query Language Specification

Proxy Nostr Relay用のフィルタークエリ言語（DSL）の仕様書です。

## 概要

Filter Query Languageは、Nostrイベントをフィルタリングするための宣言的なクエリ言語です。SQLライクな構文で、直感的にフィルタ条件を記述できます。

## 基本構文

```
<field> <operator> <value>
<condition> AND <condition>
<condition> OR <condition>
NOT <condition>
(<condition>)
```

### コメント

`#` から行末までがコメントとして扱われます。

```
# これはコメントです
kind == 6  # インラインコメント
```

## フィールド一覧

| フィールド | 型 | 説明 | 例 |
|-----------|-----|------|-----|
| `id` | 文字列 | イベントID（hex形式） | `id == "abc123..."` |
| `pubkey` | 文字列 | 公開鍵（hex形式） | `pubkey == "def456..."` |
| `npub` | 文字列 | 公開鍵（bech32形式） | `npub == "npub1..."` |
| `kind` | 数値 | イベント種別（NIP-01） | `kind == 1` |
| `created_at` | 数値 | 作成日時（UNIX秒） | `created_at > 1700000000` |
| `content` | 文字列 | イベント本文 | `content contains "hello"` |
| `content_length` | 数値 | 本文の文字数 | `content_length > 1000` |
| `tag[X]` | 存在確認 | タグXの存在 | `tag[e] exists true` |
| `tag[X].count` | 数値 | タグXの個数 | `tag[e].count > 5` |
| `tag[X].value` | 文字列 | タグXの最初の値 | `tag[p].value == "abc..."` |
| `referenced_created_at` | 数値 | 参照先kind1イベントのcreated_at | `referenced_created_at == created_at` |

### Nostr Event Kinds（一部）

| Kind | 説明 |
|------|------|
| 0 | メタデータ |
| 1 | テキストノート |
| 3 | フォローリスト |
| 6 | リポスト |
| 7 | リアクション |
| 10002 | リレーリスト |

## 演算子一覧

### 比較演算子

| 演算子 | 説明 | 対象型 | 例 |
|--------|------|--------|-----|
| `==` | 等しい | 全て | `kind == 6` |
| `!=` | 等しくない | 全て | `kind != 1` |
| `>` | より大きい | 数値 | `created_at > 1700000000` |
| `<` | より小さい | 数値 | `content_length < 100` |
| `>=` | 以上 | 数値 | `kind >= 6` |
| `<=` | 以下 | 数値 | `kind <= 7` |

### 文字列演算子

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `contains` | 部分一致（大文字小文字無視） | `content contains "spam"` |
| `starts_with` | 前方一致（大文字小文字無視） | `content starts_with "RT:"` |
| `ends_with` | 後方一致（大文字小文字無視） | `content ends_with "..."` |
| `matches` | 正規表現マッチ | `content matches "(spam\|scam\|bot)"` |

### リスト演算子

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `in` | リスト内に存在 | `kind in [6, 7]` |
| `not_in` | リスト内に存在しない | `kind not_in [0, 3]` |

### 存在演算子

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `exists` | タグが存在する | `tag[e] exists true` |

## 論理演算子

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `AND` | 両方の条件を満たす | `kind == 6 AND content contains "bot"` |
| `OR` | いずれかの条件を満たす | `kind == 6 OR kind == 7` |
| `NOT` | 条件を否定 | `NOT npub in ["npub1..."]` |
| `()` | グルーピング | `(kind == 6 OR kind == 7) AND content contains "test"` |

### 演算子の優先順位

1. `NOT`（最高）
2. `AND`
3. `OR`（最低）

括弧 `()` を使用して優先順位を変更できます。

## クエリ例

### 基本的なフィルター

```dsl
# Kind 6（リポスト）をブロック
kind == 6

# Kind 6または7をブロック
kind in [6, 7]

# 特定のnpubをブロック
npub == "npub1xyz..."

# 複数のnpubをブロック
npub in ["npub1abc...", "npub1def...", "npub1ghi..."]
```

### 文字列マッチング

```dsl
# スパムキーワードを含む投稿をブロック
content contains "spam"

# 正規表現で複数キーワードをマッチ
content matches "(spam|scam|phishing|bot)"

# 特定の文字列で始まる投稿をブロック
content starts_with "[AD]"
```

### 複合条件

```dsl
# Kind 1でスパムキーワードを含む投稿をブロック
kind == 1 AND content contains "spam"

# リポストまたはリアクションで、ボットのような投稿をブロック
(kind == 6 OR kind == 7) AND content contains "bot"

# 特定のnpub以外のkind 6/7をブロック
kind in [6, 7] AND NOT npub in ["npub1trusted..."]
```

### Bot検出（高度な例）

```dsl
# 参照先のkind1と同じcreated_atを持つリポスト/リアクションをブロック
# （Botは元投稿と同じタイムスタンプを使うことが多い）
kind in [6, 7] AND referenced_created_at == created_at

# 大量のタグを持つ投稿をブロック（スパムの可能性）
tag[e].count > 10 AND content_length < 50

# 短すぎる内容でリアクションしまくるBotをブロック
kind == 7 AND content_length < 3
```

### タグベースのフィルター

```dsl
# eタグ（イベント参照）を持たないリポストをブロック
kind == 6 AND NOT tag[e] exists true

# 特定のイベントを参照するものをブロック
tag[e].value == "specific_event_id_here"

# 5個以上のpタグを持つ投稿をブロック（スパムの可能性）
tag[p].count > 5
```

## バリデーションAPI

クエリの構文チェックを行うAPIが提供されています。

### エンドポイント

```
POST /api/filters/validate
```

### リクエスト

```json
{
  "query": "kind == 6 AND content contains \"bot\""
}
```

### レスポンス（成功時）

```json
{
  "valid": true,
  "ast": {
    "type": "And",
    "left": {
      "type": "Condition",
      "field": { "type": "Simple", "name": "kind" },
      "op": "eq",
      "value": 6
    },
    "right": {
      "type": "Condition",
      "field": { "type": "Simple", "name": "content" },
      "op": "contains",
      "value": "bot"
    }
  },
  "fields_used": ["content", "kind"]
}
```

### レスポンス（エラー時）

```json
{
  "valid": false,
  "error": "Expected operator but got 'bot' at position 15",
  "position": 15
}
```

## 正規表現について

`matches` 演算子で使用する正規表現は、Rust の `regex` クレートの構文に従います。

### よく使うパターン

| パターン | 説明 |
|----------|------|
| `.*` | 任意の文字列 |
| `\d+` | 1つ以上の数字 |
| `\w+` | 1つ以上の単語文字 |
| `(a\|b)` | aまたはb |
| `^text` | 先頭がtext |
| `text$` | 末尾がtext |
| `(?i)text` | 大文字小文字を無視してtext |

### 注意事項

- 正規表現はクエリ登録時にコンパイルされます
- 無効な正規表現はバリデーションエラーになります
- 複雑すぎる正規表現はパフォーマンスに影響する可能性があります

## ベストプラクティス

1. **シンプルに保つ**: 複雑なクエリは読みにくく、パフォーマンスに影響します
2. **テストする**: バリデーションAPIでクエリをテストしてから登録してください
3. **優先順位を活用**: `rule_order` を設定して、重要なルールを先に評価させましょう
4. **ホワイトリストと組み合わせる**: 信頼できるnpubはセーフリストに登録してフィルタをバイパスさせましょう

## エラーメッセージ

| エラー | 原因 |
|--------|------|
| `Unexpected character: 'X'` | 不正な文字が含まれています |
| `Expected '==' but got '='` | `=` ではなく `==` を使用してください |
| `Expected operator but got 'X'` | フィールド名の後に演算子が必要です |
| `Expected value but got 'X'` | 演算子の後に値が必要です |
| `Unterminated string` | 文字列が閉じられていません |
| `Invalid regex: X` | 正規表現の構文エラー |

## 関連リンク

- [Nostrプロトコル仕様](https://github.com/nostr-protocol/nips)
- [NIP-01: Basic protocol flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [Rust regex構文](https://docs.rs/regex/latest/regex/#syntax)
