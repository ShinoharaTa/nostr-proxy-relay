# 開発者ガイド

このプロジェクトをソースからビルドしたり、改造したりするためのガイドです。

## 必要環境
- **Rust**: 1.75以上
- **Node.js**: 20以上 (フロントエンドビルド用)
- **SQLite**: 3.x

## ビルド手順

### 1. 全体のビルド (推奨)
`cargo build` を実行すると、`build.rs` が自動的にフロントエンドをビルドし、バイナリに埋め込みます。

```bash
cargo build --release
```

### 2. フロントエンドのみビルド
```bash
cd web
npm ci
npm run build
```

## 開発モード

フロントエンドとバックエンドを個別に起動して、ホットリロードを有効にします。

### ターミナル 1: バックエンド
```bash
export ADMIN_USER=admin
export ADMIN_PASS=admin
cargo run
```

### ターミナル 2: フロントエンド
```bash
cd web
npm run dev
```
`http://localhost:3000` で開発サーバーが立ち上がり、API リクエストは自動的に 8080 ポートへプロキシされます。

## プロジェクト構造
- `src/`: Rust バックエンドソース
  - `api/`: HTTP API 実装
  - `proxy/`: WebSocket プロキシロジック
  - `filter/`: フィルタリングエンジン
  - `parser/`: DSL パーサー
- `web/`: React フロントエンドソース
- `migrations/`: データベースマイグレーションファイル
- `docs/`: ドキュメント


## UI のスクリーンショット確認

コンソールの見た目を目視確認するためのキャプチャスクリプトを同梱している。
主要 17 ページ × PC(1440) / モバイル(390) の計 34 枚を一括で撮る。

```bash
# 初回のみ: ブラウザを取得
cd web && npx playwright install --with-deps chromium

# ローカルで起動中のサーバーに対して撮影 (既定 http://127.0.0.1:8080)
cd web && npm run screenshot -- --out ../screenshots --user admin --pass yourpass
```

オプション: `--base URL` / `--out DIR` / `--user` / `--pass`
（未指定時は `ADMIN_USER` / `ADMIN_PASS` 環境変数を参照）。

出力先 `screenshots/` は gitignore 済み。UI に手を入れた PR では、
変更前後のキャプチャを添えるとレビューが速い。


## Blue/Green 運用（Issue #39）

同一 URL（`wss://r-test.shino3.net`）のまま、安定版と開発版を切り替えて運用する。

```
Cloudflare Tunnel → localhost:8080（Caddy）→ 現在のスロット
  relay-blue.service  :8081  /srv/relay/blue   安定版（常用）
  relay-green.service :8082  /srv/relay/green  開発版
```

**Cloudflare 側の設定変更は不要。** 既存の `r-test → localhost:8080` をそのまま使い、
Caddy が現在のスロットへ流す。切替は Caddy の無停止リロードのみ。

### 操作（`relayctl`）

```bash
relayctl status                              # 向き先・各スロットの版・health
relayctl deploy green <git-ref> [--with-db]  # ref をビルドして green へ（--with-db で安定版 DB を複製）
relayctl point green                         # テスト用に URL を green へ向ける
relayctl point blue                          # 安定版へ戻す
relayctl promote                             # green の版を blue へ反映し blue へ戻す
relayctl rollback                            # 直前の向き先へ戻す
relayctl logs green 100                      # ログ
```

典型的な流れ: `deploy green <branch> --with-db` → `point green` で検証 →
良ければ `promote`（blue が最新になり、green は開発用に残る）。

### 設計上の注意

- **deploy は指定 ref を隔離 worktree に展開してビルドする。**
  作業ツリーを直接ビルドすると、checkout 中のブランチが何であれそれがビルドされ、
  「ref を指定したのに別物が入る」事故になる
- **DB はスロットごとに独立。** 開発版のマイグレーションが安定版のスキーマを壊さないため。
  新しいスロットの DB は空なので、**上流リレー設定を引き継ぐには `--with-db` が必要**
  （付け忘れると上流ゼロで WS が EOSE を返せない）
- `point` / `promote` は切替前に health チェックを行い、落ちていれば中止する
- 各スロットの設定は `/srv/relay/<slot>/env`（`BIND_ADDR` でポートを分ける）
