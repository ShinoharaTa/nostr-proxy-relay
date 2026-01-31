# Proxy Nostr Relay Documentation

Proxy Nostr Relayのドキュメントへようこそ。

## ドキュメント一覧

### API仕様

- [Filter Query Language](filter-query) - フィルタークエリ言語の仕様

### クイックリンク

- [GitHub Repository](https://github.com/your-repo/proxy-nostr-relay)
- [Nostr Protocol NIPs](https://github.com/nostr-protocol/nips)

## 概要

Proxy Nostr Relayは、Nostrプロトコル用のプロキシリレーサーバーです。

### 主な機能

- **プロキシリレー機能**: クライアントとバックエンドリレー間のプロキシとして動作
- **イベントフィルタリング**: 柔軟なDSLでフィルタルールを設定
- **Bot対策**: 自動Bot検出とブロック
- **セーフリスト**: 信頼できるユーザーのホワイトリスト管理
- **管理UI**: Webベースの管理画面

### フィルタリングの仕組み

```
クライアント → Proxy Relay → バックエンドリレー
                    ↓
              フィルタエンジン
                    ↓
              ・IP BAN チェック
              ・Npub BAN チェック
              ・Kind ブラックリスト
              ・カスタムフィルタルール
              ・Bot検出ルール
```

## 管理画面

管理画面は `/config` でアクセスできます（Basic認証が必要）。

### 設定項目

1. **Relay Settings** - バックエンドリレーの設定
2. **Safelist** - 許可リスト管理
3. **Filter Rules** - フィルタルール管理
4. **IP Access Control** - IP管理
5. **Kind Blacklist** - Kindブラックリスト
6. **Logs** - 接続ログ・拒否ログ

## サポート

問題や質問がある場合は、GitHubのIssuesでお知らせください。
