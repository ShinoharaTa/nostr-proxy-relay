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
