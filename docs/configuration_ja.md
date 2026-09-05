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


---

## 設定の全体マップ（2026-08 棚卸し）

「どこで何を設定できるか」の一覧。**env = 起動時 / DB+UI = コンソールから live 反映**。

### 環境変数（起動時のみ）

| 変数 | 既定 | 用途 |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASS` | — (必須) | 管理コンソール BasicAuth |
| `DATABASE_URL` | `sqlite:data/app.sqlite` | DB パス |
| `LOG_DIR` | `logs` | ファイルログ出力先（1h ローテ / 72h 保持） |
| `LOG_RETENTION_DAYS` | `60` | DB ログ（connection / rejection / relay_event）保持日数 |
| `RUST_LOG` | `info` | ログレベル |
| `EOSE_AUTOCLOSE_KINDS` | — | EOSE 後 auto-close する kind（DB 値と union、env 優先） |
| `ADMIN_LOCKOUT_THRESHOLD` / `_WINDOW_SECS` / `_DURATION_SECS` | 10 / 300 / 900 | ログイン失敗ロックアウト |
| `INFLUXDB_URL` / `_BUCKET` / `_ORG` / `_TOKEN` | — | テレメトリ出力（任意） |
| `RELAY_URL` / `GITHUB_URL` | — | LP 表示用 |

### コンソール設定（DB 保存・再起動不要）

| 画面 | 設定項目 |
|---|---|
| BACKEND › Relays | URL / enabled / **role** (primary/secondary/observer) / weight / **read・write 可否** |
| BACKEND › NIP-11 | name, description 等 + limitation（max_message_length ほか — 実効制限） |
| ACCESS › POST Policy | allowlist / denylist、backend_strategy、**write_routing** (all / primary_default) |
| ACCESS › Npub | safelist（flags: 1=allow, 2=filter_bypass, **8=broadcast**）、BAN、memo |
| ACCESS › IP ACL | IP / CIDR、mode（hard_ban / shadow_ban / whitelist）、memo |
| ACCESS › Quarantine | npub 時限ミュート（scope / 期限 / reason） |
| FILTERING › Kind Blocklist | kind 単発 / 範囲 |
| FILTERING › DSL Rules | フィルタクエリ（POST / backend 適用フラグ） |
| FILTERING › Quick BAN | npub / kind / npub×kind / tag_contains |
| FILTERING › Auto Guard | 有効化、バースト窓・上限、除外 kind、重複閾値・窓、Quarantine 秒数 |

### リバースプロキシ / Cloudflare Tunnel 配下での実クライアント IP

Tunnel（cloudflared → localhost）配下では TCP ピアが常に 127.0.0.1 になる。
このままでは IP ACL・TOP SOURCES・自動ガード・ログインロックアウトが機能しないため、
**直接続のピアが loopback のときに限り**、以下のヘッダを優先順に信頼して実 IP とする:

1. `CF-Connecting-IP`（Cloudflare が必ず付与）
2. `X-Real-IP`
3. `X-Forwarded-For` の先頭

ピアが loopback でない場合はヘッダを**一切信頼しない**。
外部から `CF-Connecting-IP` を偽装して直接続されても無視される（設定は不要）。

### 設定できない（ハードコード）もの

- bind アドレス `127.0.0.1:8080`（Issue 管理: env 化予定）
- `eose_autoclose_kinds` の UI 編集（DB 列はあるが API / UI 未実装 — Issue 管理）
- WS ping/timeout 間隔（30s / 120s / 90s）、EOSE 集約猶予（1.5s / 10s）、dedupe LRU 1 万件、ファイルログ保持 72h
