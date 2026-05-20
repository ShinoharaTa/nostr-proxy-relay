# Proxy Nostr Relay

**JP 圏の Nostr 運用者のための「人間が速く判断するための前段フィルタ」プロキシリレー**。

クライアントとバックエンドリレーの間に置き、不要 EVENT を遮断・遅延・観測します。
GUI で完結する Simple BAN と、運用者向けの DSL を両立させ、
初心者から熟練運用者まで同じ基盤で細かくフィルタを組めます。

詳しくは [プロダクトビジョン](やりたいこと.md) と [機能仕様](docs/specification_ja.md) を参照してください。

## クイックスタート

### 1. インストール
Rust がインストールされている環境で、以下のコマンドを実行します。

```bash
cargo install proxy-nostr-relay
```

### 2. 起動
管理画面用のユーザー名とパスワードを設定して起動します。

```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-password
# EOSE を受けたら one-shot 扱いで自動 CLOSE する kind（カンマ区切り）
# 例: kind 0 のみ one-shot にする場合
export EOSE_AUTOCLOSE_KINDS=0
proxy-nostr-relay
```

サーバーは `ws://localhost:8080` で起動します。

### 3. ランディングページ

`http://localhost:8080/` をブラウザで開くと、認証なしの**公開 LP** が表示されます。
uptime / 接続数 / 直近 1h のイベント配信レート / バックエンドリレーの健全性 / 直近インシデントを 10 秒間隔のポーリング (`GET /api/public/status`) で表示します。

### 4. 管理コンソール

`http://localhost:8080/console` を開き、設定した ID / パスワードでログインしてください。
PROFILER テーマ (Watch Dogs 1 ctOS モチーフ) の新管理コンソールが、PC・タブレット・スマホで同等の機能で動きます。サイドナビは 5 グループ:

- **OVERVIEW** — Dashboard / Live Events (SSE) / Logs
- **BACKEND** — Backend Relays / NIP-11
- **ACCESS CONTROL** — POST Policy / Npub / IP ACL / Quarantine
- **FILTERING** — Kind Blocklist / DSL Rules / Quick BAN
- **OPERATIONS** — Telemetry / System

> 旧管理画面のパス `/config/*` は `/console/*` への 301 永続リダイレクトで吸収されます。既存ブックマークはそのまま使えます。

---

## データの永続化（重要）

実行ディレクトリに生成される `data/` ディレクトリに、すべての設定とログが保存されます。
**このディレクトリをバックアップまたは移行することで、運用を継続できます。**

詳細は [永続化ガイド](docs/persistence.md) を参照してください。

## 主な機能

### モデレーション
- **POST ポリシー切替**: Allowlist（既定 deny）/ Denylist（既定 allow）をリレー全体で切替可能（開発中）
- **Simple BAN**: npub / kind / 組合せ / タグ含有を GUI で登録（開発中：エンジン統合）
- **DSL Filter Rules**: `kind == 1 AND content matches ".*NG.*"` のような SQL ライク構文
- **Quarantine（時限ミュート）**: 任意の解除日時で一時隔離（開発中）
- **Hard BAN / Shadow BAN**: 接続拒否と「攻撃者に気付かせない黙殺」の使い分け（開発中）
- **CIDR 対応 IP BAN**: サブネット遮断対応（開発中）

### 信頼性・観測性
- **WebSocket Keep-Alive と自動再接続**: Ping/Pong 死活監視と REQ 再購読
- **マルチバックエンドリレー**: Failover → Fan-out/Fan-in 段階拡張（開発中）
- **InfluxDB エクスポート**: 接続数・拒否数・リレー死活など
- **Web 管理 UI**: 統計確認・設定変更・拒否ログ閲覧

### 標準
- NIP-01 / NIP-11 / NIP-77（自己申告）

## 設計原則

1. 善良な大量投稿者を壊さない（自動制裁はしない）
2. 判断は人間、ツールは速さに全振り
3. ログ・設定は運用者の財産として持ち出せる形を保つ

## 実行ログ

- ログは標準出力とファイルの両方へ出力されます。
- ファイルログは既定で `logs/` 配下に 1 時間ごとにローテーションされます。
- 72 時間（3日）を超えたログファイルは自動削除されます。
- 出力先ディレクトリは `LOG_DIR` で変更できます。

```bash
export LOG_DIR=logs
proxy-nostr-relay
```

## 詳細ドキュメント

- [プロダクトビジョン](やりたいこと.md)
- [機能仕様](docs/specification_ja.md)
- [実装ロードマップ](Todos.md)
- [設定と運用 (systemd/Nginx)](docs/configuration_ja.md)
- [データの永続化とバックアップ](docs/persistence_ja.md)
- [Filter Query Language (DSL) 仕様](docs/filter-query_ja.md)
- [API リファレンス](docs/api_ja.md) — 公開 / 管理 / SSE / 旧 `/config` 互換
- [UI 再設計計画書 + PROFILER テーマ](docs/ui_redesign_ja.md)
- [PROFILER テーマ仕様](docs/ui_theme_ja.md)
- [開発者ガイド](docs/development_ja.md)

## ライセンス
MIT OR Apache-2.0
