# API リファレンス

このリレーが公開するすべての HTTP エンドポイントの一覧です。

| 区分 | プレフィックス | 認証 | 用途 |
|---|---|---|---|
| 公開 API | `/api/public/*` | **不要** | LP / 外部監視向けの読み取り専用 |
| 管理 API | `/api/*` | Basic 認証 | 管理コンソール (`/console`) が叩く全機能 |
| 互換 | `/config/*` | 不要 | `/console/*` への 301 永続リダイレクト |

## 認証

管理 API は HTTP Basic 認証。資格情報は `.env` の `ADMIN_USER` / `ADMIN_PASS` を使う。

```text
Authorization: Basic <base64(ADMIN_USER:ADMIN_PASS)>
```

連続失敗時は IP 単位で throttle がかかる（既定: 5 分間に 10 回失敗で 15 分ロック、`AUTH_*` env で変更可。`GET /api/system/info` で現状確認可能）。

---

## 公開 API（認証なし）

### `GET /api/public/status`

LP に表示する集計ステータス。1 秒キャッシュ。`npub` / `IP` などの個人情報は一切含まない。

```jsonc
{
  "status": "operational",                 // operational | degraded | down
  "uptime_sec": 131,
  "connections_active": 9,
  "events": {
    "posted_1h":    [/* 60 buckets, 直近 1h を 1min 単位 */],
    "delivered_1h": [/* 60 */],
    "rejected_1h":  [/* 60 */]
  },
  "backends": [
    { "url": "wss://yabu.me", "status": "connected", "connected_since": "..." }
  ],
  "incidents": [
    { "ts": "2026-05-06 09:29:18", "event_type": "connected", "summary": "yabu.me " }
  ],
  "generated_at": "..."
}
```

---

## 管理 API（要 Basic 認証）

### Backend Relays

- `GET    /api/relay`         バックエンドリレー一覧（`url`, `enabled`, `role`, `weight`, `read_enabled`, `write_enabled`）
- `PUT    /api/relay`         一括更新（`{ relays: [...] }`）
- `GET    /api/relay-status`  各リレーのライブ状態（接続中・最終エラー・接続開始時刻）+ `suspended: [{url, until}]`
- `POST   /api/relay/suspend`  上流を期限付きで切り離す（`{url, duration_secs?}` 既定 1 時間。期限で自動復帰、spec §5.17）
- `POST   /api/relay/resume`   一時停止中の上流を即時復帰（`{url}`）
- `GET    /api/relay-nip11?url=...`  指定 URL の NIP-11 を probe して返す
- `GET    /api/relay-info`    自リレー NIP-11
- `PUT    /api/relay-info`    自リレー NIP-11 更新

### Access Control

- `GET    /api/post-policy`               POST ポリシー (allowlist / denylist)・backend_strategy・write_routing
- `PUT    /api/post-policy`               同上を更新（**変更時はフロントで確認モーダル必須**）。`write_routing`: `all` / `primary_default`（spec §5.15）
- `GET    /api/safelist`                  npub 一覧
- `POST   /api/safelist`                  upsert（`{ npub, flags, memo }`）
- `DELETE /api/safelist/:npub`
- `PUT    /api/safelist/:npub/ban`
- `PUT    /api/safelist/:npub/unban`
- `GET    /api/ip-access-control`         IP/CIDR ACL 一覧（mode: `hard_ban` / `shadow_ban` / `whitelist` / `normal`）
- `POST   /api/ip-access-control`         追加
- `PUT    /api/ip-access-control/:id`
- `DELETE /api/ip-access-control/:id`
- `GET    /api/quarantine`                Quarantine 中の npub 一覧
- `POST   /api/quarantine`                Quarantine 追加（`{ npub, scope?, reason?, duration_secs? }`）
- `DELETE /api/quarantine/:id`            Quarantine 解除

### Filtering

- `GET    /api/req-kind-blacklist`        REQ kind blocklist 一覧
- `POST   /api/req-kind-blacklist`        追加（`kind_value` 単発 or `kind_min`〜`kind_max`）
- `PUT    /api/req-kind-blacklist/:id`
- `DELETE /api/req-kind-blacklist/:id`
- `GET    /api/filters`                   DSL ルール一覧
- `POST   /api/filters`                   作成（`{ name, nl_text, apply_to_post?, apply_to_backend? }`）
- `PUT    /api/filters/:id`               更新
- `DELETE /api/filters/:id`               削除
- `POST   /api/filters/validate`          DSL 構文チェック (`{ query }` → `{ ok, error? }`)
- `GET    /api/simple-ban-rules`          Quick BAN ルール一覧
- `POST   /api/simple-ban-rules`          作成
- `PUT    /api/simple-ban-rules/:id`
- `DELETE /api/simple-ban-rules/:id`
- `POST   /api/translate/simple-to-dsl`   Quick BAN → DSL 変換プレビュー
- `POST   /api/translate/dsl-to-simple`   DSL → Quick BAN への戻し（可能なら）
- `POST   /api/translate/dry-run`         DSL を 1 イベントに当てて結果を返す
- `GET    /api/auto-guard`                自動ガード設定 + アクティブな content mute（spec §5.14）
- `PUT    /api/auto-guard`                自動ガード設定を更新（`{ enabled, burst_window_secs, burst_max_events, exclude_kinds, duplicate_threshold, duplicate_window_secs, quarantine_secs }`）
- `DELETE /api/auto-guard/content-mutes`  content mute を全クリア（誤検知時の緊急解除）
- `GET    /api/stats/actors?by=ip|npub&window=1h|24h|7d|all&sort=...&limit=`  アクター集約（多い順 + 対処状態 JOIN、ui_redesign §14.2）
- `GET    /api/actors/:type/:id`          アクターインスペクタ用詳細（type: `ip` / `npub`）
- `POST   /api/investigate`               イベント調査（上流へ REQ → パターン解析。**何も保存しない**、spec §5.16）。入力は hex / NIP-19 両対応（nsec は 400）。`refs` で反応収集、`until` でページング

### Operations

- `GET    /api/stats`                     現在値（接続数・拒否件数・拒否理由 top）
- `GET    /api/stats/timeseries?period=1h|24h|7d`  時系列バケット
- `GET    /api/connection-logs`           接続履歴（`?limit&offset&ip_address&from&to`）
- `GET    /api/event-rejection-logs`      フィルタ拒否履歴（`?limit&offset&npub&kind&reason&from&to`）
- `GET    /api/relay-event-logs`          バックエンドリレーのイベント履歴（`?limit&relay_url&event_type&from&to`）
- `GET    /api/app-version`               `{ "version": "0.3.1" }`
- `GET    /api/system/info`               バージョン / uptime / auth_throttle / retention / disk / env_overrides
- `GET    /api/telemetry/status`          InfluxDB 設定状況（token は last4 のみ）
- `POST   /api/telemetry/test`            InfluxDB に test write を 1 行送信し成否を返す

### Live Stream

- `GET    /api/events/stream`             SSE。フロント Live Events タブが購読
  - `Content-Type: text/event-stream`、`Transfer-Encoding: chunked`
  - イベント種別: `accepted` / `delivered` / `rejected` / `dropped` / `connection`

---

## エラーモデル

- `4xx` / `5xx` はレスポンスボディに人間向け説明（任意の文字列）を含む。
- フロントは `ApiError(status, body)` で受けて、トースト UI に変換する（`web/src/console/api/client.ts`）。

---

## 互換: 旧 `/config/*`

旧管理 UI のパスはすべて 301 永続リダイレクトする。クエリ文字列は維持する。

```text
GET /config                       → 301 Location: /console
GET /config/                      → 301 Location: /console
GET /config/dashboard             → 301 Location: /console/dashboard
GET /config/access/post-policy?x  → 301 Location: /console/access/post-policy?x
```

実装は `src/main.rs` の `legacy_config_root` / `legacy_config_rest` ハンドラ。

---

## 使用例 (curl)

```bash
# LP 用ステータス（認証なし）
curl http://localhost:8080/api/public/status

# 統計取得
curl -u admin:pass http://localhost:8080/api/stats

# Quarantine 追加（10 分）
curl -u admin:pass -H 'Content-Type: application/json' \
  -d '{"npub":"npub1...","duration_secs":600}' \
  http://localhost:8080/api/quarantine

# DSL ルールの dry-run
curl -u admin:pass -H 'Content-Type: application/json' \
  -d '{"dsl":"kind == 1 AND content =~ /spam/i","event":{"kind":1,"content":"spam"}}' \
  http://localhost:8080/api/translate/dry-run

# InfluxDB へのテスト書き込み
curl -u admin:pass -X POST http://localhost:8080/api/telemetry/test
```
