# 設定リファレンス

`proxy-nostr-relay` は環境変数を使用して動作をカスタマイズできます。

## 環境変数一覧

設定は `export` コマンドを使用して行います。

| 変数名 | 説明 | 必須 | デフォルト値 |
| :--- | :--- | :--- | :--- |
| `ADMIN_USER` | 管理画面（/config）のログインユーザー名 | ✅ | - |
| `ADMIN_PASS` | 管理画面（/config）のログインパスワード | ✅ | - |
| `DATABASE_URL` | SQLite データベースのパス | ❌ | `sqlite:data/app.sqlite` |
| `RELAY_URL` | ランディングページに表示する自リレーのURL | ❌ | `wss://your-relay.example.com` |
| `GITHUB_URL` | ランディングページに表示するソースコードURL | ❌ | プロジェクトのリポジトリURL |
| `RUST_LOG` | ログの出力レベル (`debug`, `info`, `warn`, `error`) | ❌ | `info` |

## 運用例

### 1. シェルでの実行
```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-secure-password
proxy-nostr-relay
```

### 2. systemd による自動起動 (Linux)
サーバー再起動時に自動的にリレーを立ち上げるには、systemd を使用します。

`/etc/systemd/system/proxy-nostr-relay.service` の作成例:

```ini
[Unit]
Description=Proxy Nostr Relay
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/nostr-relay
# 環境変数の設定
Environment="ADMIN_USER=admin"
Environment="ADMIN_PASS=your-secure-password"
Environment="DATABASE_URL=sqlite:/home/your-user/nostr-relay/data/app.sqlite"
Environment="RUST_LOG=info"
# 実行コマンド
ExecStart=/home/your-user/.cargo/bin/proxy-nostr-relay
Restart=always

[Install]
WantedBy=multi-user.target
```

**サービスの有効化:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable proxy-nostr-relay
sudo systemctl start proxy-nostr-relay
```

## リバースプロキシの設定 (SSL/WSS化)

Nostr クライアントから接続するためには、通常 SSL (wss://) が必要です。Nginx 等をフロントに置くことを推奨します。

**Nginx 設定例:**
```nginx
server {
    server_name your-relay.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
