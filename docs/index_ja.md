# ドキュメント

Proxy Nostr Relayの詳細な機能説明とセットアップガイドです。

## 目次

- [Filter Query Language仕様](filter-query) — フィルタルールの記述方法

---

## 概要

Proxy Nostr Relayは、クライアントとバックエンドリレーの間に配置するプロキシサーバーです。

```
クライアント → Proxy Relay → バックエンドリレー
                    ↓
              フィルタエンジン
```

フィルタエンジンが以下の順序でイベントをチェックし、条件に一致したものをブロックします：

1. IP BANチェック
2. Npub BANチェック
3. Kindブラックリスト
4. カスタムフィルタルール
5. Bot検出ルール

---

## 機能一覧

### プロキシリレー
クライアントからの接続を受け付け、バックエンドリレーに中継します。複数のバックエンドリレーを設定可能です。

### Bot検出
Kind 6（リポスト）やKind 7（リアクション）で、参照先イベントと同じ`created_at`を持つ投稿をBot判定してブロックします。

### Filter Query Language
SQLライクな構文でフィルタ条件を記述できるDSLです。正規表現、タグベースフィルタ、複合条件（AND/OR/NOT）をサポートしています。

詳細は [Filter Query Language仕様](filter-query) を参照してください。

### セーフリスト
信頼できるnpubを登録し、以下の権限を付与できます：

| フラグ | 説明 |
|--------|------|
| `post_allowed` (1) | EVENTの投稿を許可 |
| `filter_bypass` (2) | フィルタをバイパス |
| 両方 (3) | 上記両方を許可 |

### IPアドレス管理
IPアドレス単位でBAN/ホワイトリストを設定できます。

### Kindブラックリスト
特定のKind値またはKind範囲（例: 10000-19999）をブロックできます。

### ログ・統計
- **接続ログ**: IP、接続時刻、切断時刻、イベント数を記録
- **拒否ログ**: 拒否されたイベントのID、npub、IP、Kind、理由を記録
- **統計情報**: 接続数、拒否数、拒否理由別内訳、トップnpub/IPを表示

---

## 外部リンク

- [GitHub Repository](https://github.com/ShinoharaTa/nostr-proxy-relay)
- [Nostr Protocol NIPs](https://github.com/nostr-protocol/nips)
- [NIP-01: Basic protocol flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
