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
- [Blue/Green 運用スクリプト](ops/) — Caddyfile / systemd ユニット / `relayctl`
- [CLAUDE.md](CLAUDE.md) — このリポジトリで作業する AI コーディングエージェント向けガイド

## Blue/Green デプロイ

1 台のサーバーで安定版と開発版を並行稼働させ、**同じ公開 URL** の向き先を切り替えられます。
DNS / CDN 側の設定変更は不要です（トンネルやリバースプロキシは `localhost:8080` を
向いたままで、Caddy が現在のスロットへ流します）。

```
公開 URL → localhost:8080（Caddy）→ 現在のスロット
  relay-blue   :8081  /srv/relay/blue    安定版
  relay-green  :8082  /srv/relay/green   開発版
```

### セットアップ

```bash
# 1. Caddy を入れ、ops/ のファイルを配置する
sudo install -m644 ops/Caddyfile /etc/caddy/Caddyfile
sudo install -m644 ops/systemd/relay-*.service /etc/systemd/system/
sudo install -m755 ops/relayctl /usr/local/bin/relayctl

# 2. スロットを作る（env で BIND_ADDR / DATABASE_URL / LOG_DIR をスロットごとに設定）
sudo mkdir -p /srv/relay/{blue,green}/logs /srv/relay/state
sudo cp ops/systemd/relay-blue.env.example /srv/relay/blue/env   # 編集する
printf 'reverse_proxy 127.0.0.1:8081\n' | sudo tee /etc/caddy/active-slot.conf
echo blue | sudo tee /srv/relay/state/active

sudo systemctl daemon-reload && sudo systemctl enable --now relay-blue relay-green caddy
```

### 操作

```bash
relayctl status                              # 向き先・各スロットの版・health
relayctl deploy green <git-ref> [--with-db]  # ref をビルドして green へ
relayctl point green                         # テスト用に URL を green へ向ける
relayctl promote                             # green の版を blue へ反映し blue へ戻す
relayctl rollback                            # 直前の向き先へ戻す
relayctl logs green 100
```

典型的な流れ: `deploy green <branch> --with-db` → `point green` で検証 →
良ければ `promote`（blue が最新になり、green は開発用に空く）。

**注意点**

- `deploy` は指定 ref を隔離した `git worktree` に展開してビルドします。
  作業ツリーで checkout 中のブランチが何であれ、配布物には影響しません。
- **DB はスロットごとに独立**しているため、開発版のマイグレーションが安定版を壊しません。
  `--with-db` を付けると安定版の DB を（`VACUUM INTO` で安全に）複製します。
  付けない場合スロットの DB は空で、**上流リレーが未設定**のまま起動します。
- `point` / `promote` は切替前に health チェックを行い、落ちていれば中止します。

詳細は [`ops/`](ops/) と [開発者ガイド](docs/development_ja.md) を参照してください。

## ライセンス
MIT OR Apache-2.0
