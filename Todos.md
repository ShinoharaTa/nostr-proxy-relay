# 実装ロードマップ

[`やりたいこと.md`](やりたいこと.md) のビジョンを実装に落とすための工程表。
各機能の詳細仕様は [`docs/specification_ja.md`](docs/specification_ja.md) を参照。

工数は「平日換算 / 1 人 / Rust + Web 両方」のラフ見積もり。

---

## フェーズ A：既存機能の整合性 fix と中核機能（P0）

UI 改修最小で動かせて、見た目の効果が大きい層。

### A-0. 仕様意思決定の確定（先行）
すでに合意済み。再確認用にここに残す：

- POST ポリシー：`Allowlist` / `Denylist` トグル + 個別 npub override
- Npub BAN は POST も止める（`NOTICE: blocked: banned npub`）
- IP whitelist は「BAN を上書きする例外」として扱う
- `req_kind_blacklist` は名称維持、UI ラベルだけ実態に合わせる
- イベント署名検証はプロキシではしない（後段リレー任せ）
- 管理 UI 認証は Basic 維持 + ロックアウト + レート制限のみ
- `EOSE_AUTOCLOSE_KINDS` は env 維持しつつ DB + UI でも編集可能
- DB ログ保持期間：env で設定可、既定 60 日

### A-1. POST ポリシー（Allowlist / Denylist）の切替実装  `1.0d`
- `relay_settings(post_policy TEXT)` を追加
- `safelist` の `flags` / `banned` を「per-npub override」として再解釈
- `is_post_allowed` を `evaluate_post_policy(npub) -> Allow/Deny` に置き換え
- `GET / PUT /api/post-policy`
- UI に「全体モード」トグル + 切替時警告
- 詳細：spec §5.2

### A-2. IP アクセス制御の刷新（Hard BAN / Shadow BAN / Whitelist + CIDR）  `1.5d`
- `ip_access_control.banned/whitelisted` 列を `mode` enum に集約
- CIDR マッチを実装（`192.168.1.0/24`）
- Hard BAN：接続拒否（既存挙動）
- **Shadow BAN：接続は受理、EVENT は OK true 偽装、REQ は即 EOSE**
- Whitelist：BAN を上書きする例外
- BAN/Mode 変更時に既存接続を強制切断（hard_ban のみ）
- 詳細：spec §5.3

### A-3. Simple BAN ルールを評価エンジンに統合  `1.0d`
- `filter/engine.rs` で rule_type 4 種を評価
- 30 秒キャッシュに載せる
- `simple_ban:<id>` を rejection reason に
- Simple BAN を **POST にも適用可能**にする（オプション）
- 詳細：spec §5.6

### A-4. Quarantine（時限ミュート）  `1.5d`
- 新テーブル `quarantine_entries(npub, expires_at, reason, kind?, scope, ...)`
- Discord 風：解除日時を任意指定可能
- スコープ選択可：`silent_drop` / `shadow_to_others` / `read_only` 等
- バックグラウンドタスクで期限切れ自動クリア
- 詳細：spec §5.5

### A-5. Event カウンタの時系列化  `1.5d`
- `event_counters(bucket, kind, posted, delivered, rejected)` 新設
- ws_proxy の 3 ヶ所で UPSERT（5 秒バッチで集約）
- `/api/stats/timeseries` を拡張
- `StatsChart.tsx` を 3 系列対応へ
- 詳細：spec §5.10

### A-6. ログ TTL の自動クリーナ  `0.3d`
- 既存ファイルログのクリーナと同じ仕組みで DB クリーンアップタスク
- 既定 60 日、env `LOG_RETENTION_DAYS` で上書き
- 大量 DELETE は LIMIT で分割

---

## フェーズ B：観測・運用の充実（P1）

### B-1. リレー接続イベントの永続ログ  `1.0d`
- `relay_event_logs(url, event_type, message, latency_ms, created_at)` 新設
- 状態遷移点 5 箇所でチャンネル送信、バッファ書き込み
- `GET /api/relay-event-logs?url=&event_type=&...`
- 詳細：spec §5.11

### B-2. 設定即時反映（watch チャンネル）  `0.5d`
- ルール CRUD 時に `tokio::sync::watch` で version を発火
- `FilterEngine::reload_rules_if_needed` を「30 秒経過 OR バージョン変化」へ
- IP BAN は新規接続から反映で OK（強制切断ボタンは別途）

### B-3. InfluxDB 指標の拡張  `1.5d`
- `metrics::Counters`（atomic）を ws_proxy に差し込み
- 受信→再配信レイテンシを `hdrhistogram` で p50/p95/max 計測
- measurement 命名規則（`relay_events_total` / `relay_events_rejected` / `relay_forward_latency_ms` / `relay_active_connections` / `relay_active_subscriptions` / `relay_pool_status`）
- Grafana ダッシュボード JSON サンプルを `docs/grafana/` に同梱
- 詳細：spec §5.10

### B-4. 管理 API のセキュリティ衛生  `0.7d`
- ログイン失敗 5 回/5 分で IP 一時ロック
- `/api/*` に簡易レート制限（例: 60 req/分/IP）
- `/api/relay-nip11` の URL 検査（`wss?://` 限定 + private IP 拒否）

### B-5. Live Event Stream（SSE 基盤）  `1.5d`
- `GET /api/events/stream`（SSE）：流れている EVENT を kind / npub / IP / reason フィルタ付きで配信
- まずバックエンド側のみ。UI は管制コンソール検討段階で
- 詳細：spec §5.13

---

## フェーズ C：アーキ刷新・複数リレー（P2/P3）

### C-1. ws_proxy を RelayPool 経由に一本化  `3.0d`
- `RelayConnection` に subscription_id プレフィックス分流 API を追加
- `connect_async` を廃止し `RelayPool::send/subscribe` を使う
- subscription_id を `<client_uuid>:<original_sub_id>` で名前空間分離
- reconnect ロジックを RelayPool 側に集約
- 詳細：spec §5.9

### C-2. マルチバックエンドリレー（Failover → Fan-out / Fan-in + dedup）  `2.0d+`
- `relay_config` に `role` (primary/mirror/read_only) と `weight` を追加
- ルーティング戦略 trait
- dedup 用 LRU（event.id）を実装
- まず Failover、その後 Fan-out EVENT / Fan-in REQ
- 詳細：spec §5.9

### C-3. DSL ⇔ Simple BAN 双方向変換 + ドライラン  `1.0d`
- AST から「pure-equals / in / contains」のみを抽出して simple 形式に落とす関数
- `POST /api/rules/translate` / `POST /api/rules/dry-run`

### C-4. NIP-11 limitation の実効化  `1.0d`
- max_message_length / max_subscriptions / max_filters / max_event_tags / max_content_length
- 超過時は `NOTICE` または `OK false <reason>` / `CLOSED`

---

## 並走で進めるテスト整備

- `tests/integration.rs` を擬似 backend WS で拡張
- 接続 → REQ → EVENT 受信 → CLOSE のハッピーパス
- backend 切断 → 再接続 → REQ 再購読シナリオ
- 複数クライアント共有シナリオ（C-1 後）
- フェーズ A の各機能に最低 1 つの単体テスト

---

## 並走で進めるドキュメント更新

- 新機能ごとに [`docs/specification_ja.md`](docs/specification_ja.md) を更新
- API 変更を [`docs/api_ja.md`](docs/api_ja.md) に反映
- 設定変更を [`docs/configuration_ja.md`](docs/configuration_ja.md) に反映
- 英訳は順次

---

## やらないこと（再掲）

- 自動 BAN（行動ベースの自動制裁）
- NIP-13 PoW 強制
- First-seen による新規ユーザー強制締め出し
- NIP-42 を必須にした READ 制限
- プロキシでのイベント署名検証
- BAN リストの運用者間自動連携
