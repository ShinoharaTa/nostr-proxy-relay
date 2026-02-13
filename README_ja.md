# Proxy Nostr Relay

Nostr プロトコル用のプロキシリレーサーバー。
Bot や不要な投稿を高度なフィルタリングロジックと DSL（Domain Specific Language）で排除します。

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

### 3. 管理画面
ブラウザで以下のURLを開き、設定した ID/パスワードでログインしてください。
`http://localhost:8080/config`

ここで接続先のバックエンドリレーを設定できます。

---

## データの永続化（重要）

実行ディレクトリに生成される `data/` ディレクトリに、すべての設定とログが保存されます。
**このディレクトリをバックアップまたは移行することで、運用を継続できます。**

詳細は [永続化ガイド](docs/persistence.md) を参照してください。

## 主な機能

- **高度な Bot フィルタリング**: Kind 6/7 の重複投稿を自動検知。
- **Filter Query Language (DSL)**: `kind == 1 AND content matches ".*NG.*"` のような形式で独自のルールを作成可能。
- **Web 管理 UI**: ブラウザからリアルタイムに統計確認や設定変更が可能。
- **アクセス制御**: IP 単位の BAN や、npub 単位のセーフリスト管理。
- **One-shot REQ の自動クローズ**: `EOSE_AUTOCLOSE_KINDS` で指定した kind の REQ は、`EOSE` 受信後にプロキシがバックエンドへ `CLOSE` を送信（既定値: `0`）。

## 詳細ドキュメント

- [設定と運用 (systemd/Nginx)](docs/configuration.md)
- [データの永続化とバックアップ](docs/persistence.md)
- [Filter Query Language (DSL) 仕様](docs/filter-query.md)
- [API リファレンス](docs/api.md)
- [開発者ガイド](docs/development.md)

## ライセンス
MIT OR Apache-2.0
