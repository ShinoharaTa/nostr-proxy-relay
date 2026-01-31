# Proxy Nostr Relay

Nostrプロトコル用のプロキシリレーサーバー。Botや不要な投稿をフィルタリングし、DSL（Domain Specific Language）でフィルタルールを設定できます。

## 機能

### コア機能
- **プロキシリレー機能**: クライアントとバックエンドリレー間のプロキシとして動作
- **イベントフィルタリング**: Kind 6（リポスト）やKind 7（リアクション）のBot投稿を自動検出・ブロック
- **セーフリスト機能**: 特定のnpubからの投稿を許可、またはフィルタをバイパス
- **Filter Query Language**: DSL形式でフィルタ条件を記述可能
- **管理UI**: ReactベースのWeb管理画面（`/config`）
- **Basic認証**: 管理画面へのアクセス保護

### Bot対策・マネジメント機能（v0.2.0〜）
- **IPアドレス管理**: IPアドレス単位でのBAN/ホワイトリスト管理
- **NpubのBAN**: 迷惑ユーザーのNpubをBAN
- **Kind ブラックリスト**: 特定のKind値またはKind範囲をブロック
- **接続ログ**: 接続情報（IP、接続時刻、切断時刻）を記録
- **拒否ログ**: 拒否されたイベントの詳細（理由、Npub、IP、Kind）を記録
- **統計情報**: 接続数、拒否数、拒否理由別内訳、トップNpub/IPの表示

### Filter Query Language（v0.3.0〜）
- **DSL形式のフィルタールール**: SQLライクな構文でフィルタ条件を記述
- **正規表現サポート**: `matches` 演算子で正規表現マッチング
- **複合条件**: `AND`、`OR`、`NOT` で条件を組み合わせ
- **タグベースフィルター**: タグの存在確認、カウント、値の比較
- **バリデーションAPI**: クエリの構文チェック

詳細は [Filter Query Language仕様](/docs/filter-query) を参照してください。

## フィルタリングロジック

- **Kind 6/7のBot検出**: 参照先のKind 1イベントと`created_at`が同一の場合、Botの可能性が高いためブロック
- **キャッシュミス時の動作**: 参照先イベントがキャッシュにない場合（1秒以上経過している可能性）、イベントを通過
- **ホワイトリスト**: セーフリストに登録されたnpubはフィルタをバイパス

## クイックスタート（動作テスト用）

### 1. 環境変数を設定してサーバーを起動

```bash
# 必須の環境変数を設定
export ADMIN_USER=admin
export ADMIN_PASS=your-password

# サーバーを起動（開発モード）
cargo run
```

サーバーは `ws://127.0.0.1:8080/` で起動します。

### 2. 自分のNostrアカウントをセーフリストに追加

EVENT（投稿）を送信するには、自分のnpubをセーフリストに追加する必要があります。

```bash
# Basic認証ヘッダーを設定
AUTH_HEADER="Basic $(echo -n 'admin:your-password' | base64)"

# 自分のnpubをセーフリストに追加（投稿を許可）
curl -X POST \
  -H "Authorization: $AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"npub\": \"YOUR_NPUB_HERE\",
    \"flags\": 1,
    \"memo\": \"自分のアカウント\"
  }" \
  http://localhost:8080/api/safelist
```

**重要**: `YOUR_NPUB_HERE`を自分のnpubに置き換えてください。

### 3. Nostrクライアントで接続

Nostrクライアント（Amethyst、Damus、Snortなど）のリレー設定に以下を追加：

```
ws://127.0.0.1:8080/
```

または、コマンドラインでテスト：

```bash
# WebSocket接続のテスト（例）
wscat -c ws://127.0.0.1:8080/
```

### 4. 動作確認

- **REQ（読み取り）**: 公開されているため、認証なしで利用可能
- **EVENT（投稿）**: セーフリストに登録したnpubからのみ投稿可能
- **フィルタリング**: Kind 6/7のBot投稿が自動的にブロックされます

### トラブルシューティング

- サーバーが起動しない場合: `ADMIN_USER`と`ADMIN_PASS`が設定されているか確認
- EVENTが拒否される場合: セーフリストに自分のnpubが正しく追加されているか確認
- ログを確認: `export RUST_LOG=debug`で詳細なログを有効化

## 必要な環境

- **Rust**: 1.70以上（[rustup](https://rustup.rs/)でインストール可能）
- **Node.js**: 18以上（フロントエンド開発用、本番ではビルド済みファイルを使用）
- **SQLite**: 3.x（Rustの`sqlx`が自動的に使用）

## セットアップ

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd proxy-nostr-relay
```

### 2. バックエンドのビルド

```bash
# Rustプロジェクトのルートディレクトリで実行
cargo build --release
```

### 3. 環境変数の設定

```bash
cp .env.example .env
# .envを編集して必要な値を設定
```

### 4. フロントエンドのビルド

```bash
cd web
npm install
npm run build
```

ビルドされたファイルは`web/dist`に出力されます。

## 開発モード（ホットリロード）

フロントエンドの変更を即座に反映させたい場合は、開発モードで起動します。

### ターミナル1: バックエンド

```bash
# .envを読み込んで起動
source .env && cargo run
```

### ターミナル2: フロントエンド（開発サーバー）

```bash
cd web
npm run dev
```

フロントエンド開発サーバーは `http://localhost:3000` で起動し、APIリクエストは自動的にバックエンド（`http://127.0.0.1:8080`）にプロキシされます。

**注意**: 開発モードでは `http://localhost:3000/` にアクセスしてください。

## 環境変数

以下の環境変数を設定してください：

| 変数名 | 説明 | 必須 | デフォルト値 |
|--------|------|------|-------------|
| `ENV` | 環境モード（LOCAL/PROD） | ❌ | - |
| `ADMIN_USER` | 管理画面のユーザー名 | ✅ | - |
| `ADMIN_PASS` | 管理画面のパスワード | ✅ | - |
| `DATABASE_URL` | SQLiteデータベースのURL | ❌ | `sqlite:data/app.sqlite` |
| `RUST_LOG` | ログレベル（オプション） | ❌ | `info` |

> **注意**: バックエンドリレーは管理画面（`/config`）から設定してください。

### 環境変数の設定例

```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-secure-password
export DATABASE_URL=sqlite:data/app.sqlite
export RUST_LOG=info
```

または、`.env`ファイルを作成して設定することもできます（ただし、アプリケーションは直接`.env`を読み込みません。`dotenv`などのツールを使用するか、シェルスクリプトで読み込んでください）。

## 実行方法

### 開発環境での実行

1. **バックエンドサーバーの起動**

```bash
# 環境変数を設定
export ADMIN_USER=admin
export ADMIN_PASS=your-password

# サーバーを起動
cargo run
```

サーバーはデフォルトで `http://127.0.0.1:8080` で起動します。

2. **フロントエンド開発サーバーの起動**（開発時のみ）

別のターミナルで：

```bash
cd web
npm run dev
```

### 本番環境での実行

1. **リリースビルド**

```bash
cargo build --release
```

2. **実行**

```bash
# 環境変数を設定
export ADMIN_USER=admin
export ADMIN_PASS=your-secure-password

# 実行
./target/release/proxy-nostr-relay
```

3. **初期設定**

サーバー起動後、管理画面（`/config`）にアクセスしてバックエンドリレーを設定してください。

### systemdサービスとして実行（Linux）

`/etc/systemd/system/proxy-nostr-relay.service`を作成：

```ini
[Unit]
Description=Proxy Nostr Relay
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/proxy-nostr-relay
Environment="ADMIN_USER=admin"
Environment="ADMIN_PASS=your-secure-password"
Environment="DATABASE_URL=sqlite:data/app.sqlite"
ExecStart=/path/to/proxy-nostr-relay/target/release/proxy-nostr-relay
Restart=always

[Install]
WantedBy=multi-user.target
```

> **注意**: バックエンドリレーはサービス起動後、管理画面（`/config`）から設定してください。

サービスを有効化：

```bash
sudo systemctl daemon-reload
sudo systemctl enable proxy-nostr-relay
sudo systemctl start proxy-nostr-relay
```

## エンドポイント

### WebSocket（Nostrプロトコル）

- **`/`**: Nostrクライアント用のWebSocketエンドポイント
  - クライアントはこのエンドポイントに接続してNostrプロトコルを使用

### HTTP API

すべてのAPIエンドポイントはBasic認証が必要です。

#### リレー設定

- **`GET /api/relay`**: バックエンドリレー設定の一覧取得
- **`PUT /api/relay`**: バックエンドリレー設定の更新

#### セーフリスト管理

- **`GET /api/safelist`**: セーフリストの一覧取得
- **`POST /api/safelist`**: セーフリストへの追加・更新
- **`DELETE /api/safelist/:npub`**: セーフリストからの削除
- **`PUT /api/safelist/:npub/ban`**: NpubをBAN
- **`PUT /api/safelist/:npub/unban`**: NpubのBAN解除

#### フィルタルール管理

- **`GET /api/filters`**: フィルタルールの一覧取得
- **`POST /api/filters`**: フィルタルールの作成（DSLクエリを使用）
- **`PUT /api/filters/:id`**: フィルタルールの更新
- **`DELETE /api/filters/:id`**: フィルタルールの削除
- **`POST /api/filters/validate`**: DSLクエリの構文チェック（[仕様](/docs/filter-query)）

#### IP管理

- **`GET /api/ip-access-control`**: IP一覧取得
- **`POST /api/ip-access-control`**: IP追加（BAN/ホワイトリスト）
- **`PUT /api/ip-access-control/:id`**: IP更新
- **`DELETE /api/ip-access-control/:id`**: IP削除

#### Kindブラックリスト

- **`GET /api/req-kind-blacklist`**: ブラックリスト一覧取得
- **`POST /api/req-kind-blacklist`**: ブラックリスト追加
- **`PUT /api/req-kind-blacklist/:id`**: ブラックリスト更新（有効/無効切り替え）
- **`DELETE /api/req-kind-blacklist/:id`**: ブラックリスト削除

#### ログ・統計

- **`GET /api/connection-logs`**: 接続ログ取得（ページネーション対応）
- **`GET /api/event-rejection-logs`**: 拒否ログ取得（ページネーション対応）
- **`GET /api/stats`**: 統計情報取得（接続数、拒否数、トップNpub/IPなど）

#### 管理画面

- **`GET /config`**: React管理UI（Basic認証が必要）

#### ドキュメント（公開）

- **`GET /docs`**: ドキュメントトップページ（認証不要）
- **`GET /docs/filter-query`**: Filter Query Language仕様（認証不要）

#### ヘルスチェック

- **`GET /healthz`**: ヘルスチェックエンドポイント

## API使用例

### Basic認証ヘッダーの設定

```bash
# Base64エンコード: admin:password
AUTH_HEADER="Basic $(echo -n 'admin:password' | base64)"
```

### リレー設定の取得

```bash
curl -H "Authorization: $AUTH_HEADER" http://localhost:8080/api/relay
```

### セーフリストへの追加

```bash
curl -X POST \
  -H "Authorization: $AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "npub": "npub1...",
    "flags": 3,
    "memo": "信頼できるBot"
  }' \
  http://localhost:8080/api/safelist
```

`flags`の値：
- `1`: 投稿を許可（`post_allowed`）
- `2`: フィルタをバイパス（`filter_bypass`）
- `3`: 両方（`1 | 2`）

### フィルタルールの作成

```bash
# DSLクエリを使用してフィルタルールを作成
curl -X POST \
  -H "Authorization: $AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kind 1でNGワードを含むものをブロック",
    "nl_text": "kind == 1 AND content matches \".*NGワード.*\""
  }' \
  http://localhost:8080/api/filters
```

DSLクエリの構文については [Filter Query Language仕様](/docs/filter-query) を参照してください。

## テスト

### ユニットテストとインテグレーションテストの実行

```bash
cargo test
```

### 特定のテストのみ実行

```bash
cargo test --test integration
```

## データベース

SQLiteデータベースはデフォルトで`data/app.sqlite`に作成されます。

### マイグレーション

アプリケーション起動時に自動的にマイグレーションが実行されます。

手動でマイグレーションを確認する場合：

```bash
sqlx migrate info
```

## アーキテクチャ

```
┌─────────────┐
│   Client    │
│  (Nostr)    │
└──────┬──────┘
       │ WebSocket (/)
       │
┌──────▼──────────────────┐
│  Proxy Nostr Relay      │
│  ┌────────────────────┐ │
│  │  Filter Engine     │ │
│  │  - Kind 6/7 Check  │ │
│  │  - Safelist        │ │
│  └────────────────────┘ │
│  ┌────────────────────┐ │
│  │  SQLite DB         │ │
│  │  - Config          │ │
│  │  - Safelist        │ │
│  │  - Filter Rules    │ │
│  └────────────────────┘ │
└──────┬──────────────────┘
       │ WebSocket
       │
┌──────▼──────┐
│  Backend    │
│   Relay     │
└─────────────┘
```

## 開発

### プロジェクト構造

```
proxy-nostr-relay/
├── src/
│   ├── main.rs          # エントリーポイント
│   ├── db/              # データベース接続・マイグレーション
│   ├── nostr/           # Nostrプロトコル実装
│   ├── proxy/           # WebSocketプロキシ実装
│   ├── filter/          # フィルタリングエンジン
│   ├── parser/          # Filter Query Language パーサー
│   ├── auth/            # Basic認証
│   └── api/             # HTTP APIルート
├── web/                 # Reactフロントエンド
│   ├── src/
│   └── dist/            # ビルド済みファイル
├── migrations/          # SQLiteマイグレーション
├── tests/               # インテグレーションテスト
└── Cargo.toml          # Rust依存関係
```

### ログ

ログレベルは`RUST_LOG`環境変数で制御できます：

```bash
export RUST_LOG=debug  # 詳細なログ
export RUST_LOG=info   # 通常のログ（デフォルト）
export RUST_LOG=warn   # 警告のみ
export RUST_LOG=error  # エラーのみ
```

## トラブルシューティング

### データベースファイルが見つからない

`data`ディレクトリが存在しない場合、アプリケーション起動時に自動的に作成されます。権限エラーが発生する場合は、ディレクトリの書き込み権限を確認してください。

### WebSocket接続が失敗する

- バックエンドリレーのURLが正しいか確認
- ファイアウォール設定を確認
- ログレベルを`debug`に設定して詳細を確認

### Basic認証が機能しない

- `ADMIN_USER`と`ADMIN_PASS`環境変数が正しく設定されているか確認
- 認証ヘッダーが正しくBase64エンコードされているか確認

## ライセンス

このプロジェクトはオープンソースとして提供されています。ライセンスの詳細は`LICENSE`ファイルを参照してください。

## 貢献

プルリクエストやイシューの報告を歓迎します。貢献のガイドラインについては、`CONTRIBUTING.md`を参照してください（作成予定）。

## 作者

[あなたの名前/組織名]

## 関連リンク

- [Nostrプロトコル仕様](https://github.com/nostr-protocol/nips)
- [NIP-01: Basic protocol flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
