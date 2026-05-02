# 機能仕様

Proxy Nostr Relay の機能仕様をまとめたドキュメントです。
プロダクトの方向性は [`../やりたいこと.md`](../やりたいこと.md)、
実装ロードマップは [`../Todos.md`](../Todos.md) を参照してください。

## 目次

1. [プロダクト概要](#1-プロダクト概要)
2. [ターゲットと設計原則](#2-ターゲットと設計原則)
3. [スコープ外（やらないこと）](#3-スコープ外やらないこと)
4. [全体アーキテクチャ](#4-全体アーキテクチャ)
5. [機能仕様](#5-機能仕様)
   1. [WebSocket プロキシ](#51-websocket-プロキシ)
   2. [POST ポリシー（Allowlist / Denylist）](#52-post-ポリシーallowlist--denylist)
   3. [IP アクセス制御（Hard BAN / Shadow BAN / Whitelist + CIDR）](#53-ip-アクセス制御hard-ban--shadow-ban--whitelist--cidr)
   4. [npub 管理（Safelist + per-npub override）](#54-npub-管理safelist--per-npub-override)
   5. [Quarantine（時限ミュート）](#55-quarantine時限ミュート)
   6. [Simple BAN ルール](#56-simple-ban-ルール)
   7. [DSL Filter Rules](#57-dsl-filter-rules)
   8. [Kind ブラックリスト](#58-kind-ブラックリスト)
   9. [マルチバックエンドリレー](#59-マルチバックエンドリレー)
   10. [観測性（カウンタ・レイテンシ・InfluxDB）](#510-観測性カウンタレイテンシinfluxdb)
   11. [ログとリテンション](#511-ログとリテンション)
   12. [NIP-11 Relay Information](#512-nip-11-relay-information)
   13. [管理 UI（管制コンソール / Live Event Stream）](#513-管理-ui管制コンソール--live-event-stream)
6. [評価順序（フィルタリングパイプライン）](#6-評価順序フィルタリングパイプライン)
7. [用語集](#7-用語集)

---

## 1. プロダクト概要

> **JP 圏の Nostr 運用者のための「人間が速く判断するための前段フィルタ」プロキシリレー**

クライアントとバックエンドリレーの間に立ち、不要 EVENT を遮断・遅延・観測する。
自動制裁ではなく、運用者が**秒速で判断・対処できる**ためのツールに全振りする。

## 2. ターゲットと設計原則

### ターゲット運用者像
- JP コミュニティ向け Nostr リレーを公開している個人〜小規模運用者
- 自分も Nostr ユーザーで、悪意ある投稿者を「人間として」知っている
- 実況勢など**大量 POST する善良ユーザーを壊したくない**

### 設計原則
1. 善良な大量投稿者を壊さない
2. 判断は人間、ツールは速さに全振り
3. 再エクスポート可能に（ログ・設定は運用者の財産）
4. オープン運用と個人運用の両立
5. GUI と DSL の両刀

## 3. スコープ外（やらないこと）

- 行動ベースの自動 BAN
- NIP-13 PoW 強制
- First-seen による新規ユーザー強制締め出し
- NIP-42 を必須にした READ 制限
- プロキシでのイベント署名検証（後段リレー任せ）
- BAN リストの運用者間自動連携・購読

## 4. 全体アーキテクチャ

```
┌──────────────┐  WebSocket  ┌──────────────────────┐  WebSocket  ┌──────────────────┐
│  Nostr Client│ ──────────> │  Proxy Nostr Relay   │ ──────────> │ Backend Relay(s) │
└──────────────┘             │ ┌──────────────────┐ │             └──────────────────┘
                             │ │ Filter Pipeline  │ │
                             │ ├──────────────────┤ │
                             │ │ POST Policy      │ │
                             │ │ IP Access Ctrl   │ │
                             │ │ Npub BAN         │ │
                             │ │ Kind / Tag Filter│ │
                             │ │ Quarantine       │ │
                             │ │ DSL Rules        │ │
                             │ └──────────────────┘ │
                             │ ┌──────────────────┐ │
                             │ │  Admin UI / API  │ │  Basic Auth
                             │ ├──────────────────┤ │
                             │ │  InfluxDB Export │ │
                             │ └──────────────────┘ │
                             └──────────────────────┘
                                       │
                                       ▼
                                  SQLite (data/app.sqlite)
```

---

## 5. 機能仕様

### 5.1 WebSocket プロキシ

クライアントからの WebSocket 接続を受け、バックエンドリレーへ転送する。

#### 主要機能
- NIP-01 メッセージ（`EVENT` / `REQ` / `CLOSE` / `OK` / `EOSE` / `CLOSED` / `NOTICE`）の中継
- Ping/Pong による Keep-Alive
  - クライアント側：30 秒ごとに Ping、120 秒で timeout 切断
  - バックエンド側：30 秒ごとに Ping、90 秒で timeout 切断
- バックエンド切断時の自動再接続 + REQ の再購読
- One-shot REQ の自動 CLOSE（`EOSE_AUTOCLOSE_KINDS`）

#### REQ キャッシュとリカバリ
- クライアントから受けた `REQ` を `subscription_id` をキーとしてキャッシュ
- バックエンド再接続後にキャッシュ済み REQ を全て再送
- クライアントが `CLOSE` を送ったら、対応するキャッシュエントリを削除
- バックエンドが `CLOSED` を送ったら、対応するキャッシュエントリを削除

#### EOSE 自動 CLOSE
- 環境変数 `EOSE_AUTOCLOSE_KINDS`（カンマ区切り、既定 `0`）で指定された kind のみを REQ に含む場合、
  EOSE 受信後にプロキシからバックエンドへ `CLOSE` を送り、キャッシュからも除去
- 用途：プロフィール取得（kind 0）など one-shot で完結する subscription をプール圧迫から守る

---

### 5.2 POST ポリシー（Allowlist / Denylist）

#### 仕様

リレー全体の POST ポリシーを `allowlist` / `denylist` の 2 モードで切替可能にする。
さらに per-npub オーバーライドで個別制御できる。

| モード | 既定の挙動 | per-npub override で `allow` | `deny` |
|---|---|---|---|
| `allowlist` | 全員 deny | 個別に POST 許可 | 念押し deny（変化なし） |
| `denylist` | 全員 allow | 念押し allow（変化なし） | 個別に POST 拒否 |

`deny` は常に最強。モード切替で意図せず開放される事故を防ぐ安全弁。

#### モード切替時の挙動
- 既存接続は切らず、**次の POST から新ポリシーを評価**
- UI 切替時に「○○モードに切り替えると未登録 npub が POST 可能になります」等の警告表示

#### DB スキーマ変更
```sql
CREATE TABLE relay_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton
  post_policy TEXT NOT NULL DEFAULT 'allowlist'
    CHECK (post_policy IN ('allowlist', 'denylist')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 既存 safelist の意味を再解釈：
-- flags & 1 (post_allowed) を「per-npub allow override」として使う
-- safelist.banned を「per-npub deny override」として使う
-- flags & 2 (filter_bypass) は直交（POST 許可とは別）
```

#### API
- `GET /api/post-policy` → `{ post_policy: "allowlist" | "denylist" }`
- `PUT /api/post-policy` body: `{ post_policy }`

#### 評価ロジック
```
fn evaluate_post(npub):
  if safelist[npub].banned: return Deny("banned_npub")
  match post_policy:
    "allowlist":
      if safelist[npub].post_allowed: return Allow
      else: return Deny("not_in_safelist")
    "denylist":
      return Allow  # banned 以外は全員許可
```

拒否時は `["NOTICE", "blocked: <reason>"]` を返してから処理を中断する。

---

### 5.3 IP アクセス制御（Hard BAN / Shadow BAN / Whitelist + CIDR）

#### モード

| Mode | 接続 | EVENT | REQ | 用途 |
|---|---|---|---|---|
| `hard_ban` | **拒否**（即切断） | — | — | 明らかな攻撃者の遮断 |
| `shadow_ban` | 受理（普通に見える） | OK true 偽装、転送しない | 即 EOSE 偽装、転送・キャッシュしない | 黙殺。攻撃者に「効いていない」と気付かせない |
| `whitelist` | 受理（無条件で BAN を上書き） | 通常通り | 通常通り | 自宅 IP / VPN を誤爆から守る |

#### マッチング
- 完全一致 IP（`192.168.1.1`）と CIDR（`192.168.1.0/24`）の両方をサポート
- マッチが複数あったら**最も具体的なもの**（プレフィックス長が最大）を採用
- 同じプレフィックス長の場合は `whitelist` > `hard_ban` > `shadow_ban` の優先

#### 既存接続への影響
- `hard_ban` 追加：該当 IP の既存セッションを**強制切断**
- `shadow_ban` 追加：既存接続は維持（黙殺の信憑性のため）。新規 REQ / EVENT から shadow 適用
- `whitelist` 追加：既存接続は維持

#### Shadow BAN の細かい挙動
- **EVENT 受信時**：バックエンドへ転送せず、`["OK", event_id, true, ""]` を即返す
- **REQ 受信時**：バックエンドへ転送せず、REQ キャッシュにも入れず、`["EOSE", sub_id]` を即返す
- **CLOSE 受信時**：通常通り処理（クライアントの内部状態と整合させる）
- 接続ログ・拒否ログには `shadow_drop` reason で記録（運用者は把握できる）

#### DB スキーマ変更
```sql
-- 既存テーブルを拡張
ALTER TABLE ip_access_control ADD COLUMN mode TEXT
  CHECK (mode IN ('hard_ban', 'shadow_ban', 'whitelist'));

-- マイグレーション：
-- banned=1 → mode='hard_ban'
-- whitelisted=1 → mode='whitelist'
-- それ以外 → 行を削除（無意味なメモはそのまま残してもよい）

-- 旧列は段階的に削除予定
```

#### API
- `GET /api/ip-access-control` → `[{ id, ip_or_cidr, mode, memo, created_at, updated_at }, ...]`
- `POST /api/ip-access-control` body: `{ ip_or_cidr, mode, memo }`
- `PUT /api/ip-access-control/:id` body: `{ ip_or_cidr, mode, memo }`
- `DELETE /api/ip-access-control/:id`

---

### 5.4 npub 管理（Safelist + per-npub override）

#### モデル
`safelist` テーブルは「リレー全体ポリシー（§5.2）への per-npub オーバーライド」を表現する。

| 列 | 意味 |
|---|---|
| `npub` (PK) | 対象 npub |
| `flags & 1` (post_allowed) | per-npub の POST allow オーバーライド |
| `flags & 2` (filter_bypass) | フィルタを bypass（POST 許可とは直交） |
| `banned` | per-npub の POST deny オーバーライド（最強） |
| `memo` | 運用メモ |

#### API（既存維持）
- `GET /api/safelist`
- `POST /api/safelist` （upsert）
- `DELETE /api/safelist/:npub`
- `PUT /api/safelist/:npub/ban`
- `PUT /api/safelist/:npub/unban`

---

### 5.5 Quarantine（時限ミュート）

#### 仕様

特定 npub を**一定期間だけ制限する**。Discord のミュート仕様を参考に、解除日時を任意指定できる。

#### スコープ（どの動作を制限するか）

| Scope | 振る舞い |
|---|---|
| `silent_drop` | EVENT を黙って捨てる（OK true は返す） |
| `shadow_to_others` | 当該 npub の EVENT は受理し、他クライアントには配信しない（自分の画面では見える） |
| `read_only` | POST 不可、READ は可 |
| `block_all` | POST/READ 共に拒否（接続切断はしない） |

#### DB スキーマ
```sql
CREATE TABLE quarantine_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  npub TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('silent_drop','shadow_to_others','read_only','block_all')),
  expires_at TEXT NOT NULL,           -- ISO 8601, NULL は不可（無期限なら BAN を使う）
  reason TEXT,
  kind_filter TEXT,                    -- JSON array: 特定 kind のみ対象、NULL なら全 kind
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_quarantine_npub_expires ON quarantine_entries(npub, expires_at);
```

#### バックグラウンドタスク
- 1 分間隔で `expires_at <= now()` のエントリを削除
- 削除時に `quarantine_lifted` イベントとして relay_event_logs に記録

#### API
- `GET /api/quarantine` → アクティブ + 過去のエントリ
- `POST /api/quarantine` body: `{ npub, scope, expires_at, reason, kind_filter? }`
- `DELETE /api/quarantine/:id` （即時解除）

---

### 5.6 Simple BAN ルール

#### 仕様
DSL を書かずに、構造化された BAN ルールを GUI で組める仕組み。
バックエンドから来た EVENT を、有効な `simple_ban_rules` 全件に対して順に評価し、
いずれかに合致したら drop & log_rejection。`filter_bypass` 持ちの npub はスキップ。

#### rule_type と判定式

| rule_type | 判定 |
|---|---|
| `npub` | `event.pubkey` の npub が `npub_list[]` に含まれる |
| `kind` | `event.kind` が `kind_list[]` に含まれる |
| `npub_kind` | 上記の AND |
| `tag_contains` | `event.tags` に `tag_name` を持つタグがあり、その値（index 1）に `tag_value_pattern` を部分一致で含む |

#### POST への適用（オプション）
- ルール毎に `apply_to_post BOOLEAN` フラグを追加（既定 false）
- true のルールは POST 時にも評価し、合致したら `["OK", id, false, "blocked: simple_ban:<id>"]` で拒否

#### キャッシュ
- 30 秒キャッシュ + watch チャンネル（B-2）で即時無効化対応

#### Rejection ログ
- `reason = "simple_ban:<id>"` で記録

#### API（既存ルートを拡張）
- `GET /api/simple-ban-rules`
- `POST /api/simple-ban-rules` body: `{ rule_type, npub_list?, kind_list?, tag_name?, tag_value_pattern?, enabled?, memo?, apply_to_post? }`
- `PUT /api/simple-ban-rules/:id`
- `DELETE /api/simple-ban-rules/:id`

---

### 5.7 DSL Filter Rules

詳細な DSL 仕様は [`filter-query_ja.md`](filter-query_ja.md) を参照。

#### 評価順
1. `safelist[npub].filter_bypass` が true ならスキップ
2. `rule_order ASC, id ASC` の順で全件評価
3. 最初にマッチしたルールで drop し `filter_rule:<id>` をログ

#### POST への適用
- Simple BAN と同じ仕組みで、ルール毎に `apply_to_post BOOLEAN` を持たせる
- POST 時にマッチしたら `["OK", id, false, "blocked: filter_rule:<id>"]` で拒否

#### キャッシュ
- 30 秒キャッシュ + watch チャンネル（B-2）

---

### 5.8 Kind ブラックリスト

`req_kind_blacklist` に登録された kind の **応答 EVENT** を drop する。
名前は歴史的経緯で `req_*` だが、実際の対象は「バックエンドから返ってくる EVENT の kind」。
UI ラベルは「Kind Drop（応答 EVENT）」と表記する。

| 列 | 意味 |
|---|---|
| `kind_value` | 単一 kind 指定 |
| `kind_min`, `kind_max` | 範囲指定（両方必須） |
| `enabled` | 有効/無効 |

---

### 5.9 マルチバックエンドリレー

#### フェーズ 1: Failover（C-1 で導入）
- `relay_config` の `enabled = 1` のうち最初の 1 本のみをアクティブに使用
- アクティブが落ちたら次へ自動切替
- すべての永続接続は `RelayPool` が管理し、各クライアント接続から共有

#### フェーズ 2: Fan-out / Fan-in（C-2 で導入）

| Mode | 動作 |
|---|---|
| `failover` | アクティブ 1 本（既定） |
| `fan_out_event` | EVENT は全リレーへ送出、最も早く OK を返した結果をクライアントへ |
| `fan_in_req` | REQ は全リレーへ送出、event.id で dedup（直近 N 万件 LRU）してクライアントへ配信 |
| `sharded` | kind / pubkey の hash でリレーを振り分け（将来） |

#### DB スキーマ追加
```sql
ALTER TABLE relay_config ADD COLUMN role TEXT
  CHECK (role IN ('primary', 'mirror', 'read_only')) DEFAULT 'primary';
ALTER TABLE relay_config ADD COLUMN weight INTEGER DEFAULT 1;

ALTER TABLE relay_settings ADD COLUMN backend_strategy TEXT
  CHECK (backend_strategy IN ('failover','fan_out_event','fan_in_req','sharded'))
  DEFAULT 'failover';
```

#### Subscription 名前空間
- クライアントから受けた `REQ` の `sub_id` を `<client_uuid>:<original_sub_id>` に変換してリレーへ送る
- 応答（`EVENT` / `EOSE` / `CLOSED`）の `sub_id` を分解して、対応するクライアントへ振り分ける

---

### 5.10 観測性（カウンタ・レイテンシ・InfluxDB）

#### Event カウンタの時系列化

```sql
CREATE TABLE event_counters (
  bucket TEXT NOT NULL,           -- '2026-05-02 14:00' 等の時刻バケット
  kind INTEGER NOT NULL,
  posted INTEGER NOT NULL DEFAULT 0,    -- クライアント→プロキシ
  delivered INTEGER NOT NULL DEFAULT 0, -- プロキシ→クライアント
  rejected INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, kind)
);
```

- ws_proxy 内で 5 秒バッチに集約してから UPSERT
- `GET /api/stats/timeseries` を `posted` / `delivered` / `rejected` を返すよう拡張

#### InfluxDB エクスポート

10 秒間隔。measurement / tag / field の命名規約：

| Measurement | Tag | Field | 意味 |
|---|---|---|---|
| `relay_events_total` | direction, kind | value | 直近 10 秒の件数 |
| `relay_events_rejected` | reason | value | 直近 10 秒の件数 |
| `relay_forward_latency_ms` | direction | p50, p95, max | 受信→再配信レイテンシ |
| `relay_active_connections` | host | value | スナップショット |
| `relay_active_subscriptions` | host | value | REQ キャッシュサイズ合計 |
| `relay_pool_status` | url | status (0/1) | バックエンド up/down |

レイテンシは `hdrhistogram` クレートで集計。
Grafana ダッシュボード JSON サンプルを `docs/grafana/` に同梱予定。

---

### 5.11 ログとリテンション

#### テーブル一覧

| テーブル | 役割 | 既存/新規 |
|---|---|---|
| `connection_logs` | クライアント接続 1 件 1 行（IP, 接続時刻, 切断時刻, event_count, rejected_event_count） | 既存 |
| `event_rejection_logs` | 拒否 EVENT 1 件 1 行（event_id, npub, ip, kind, reason） | 既存 |
| `relay_event_logs` | バックエンドリレーの状態遷移ログ（url, event_type, message, latency_ms） | 新設 |
| `event_counters` | 時系列カウンタ（§5.10） | 新設 |

#### TTL クリーナ
- 環境変数 `LOG_RETENTION_DAYS` で全テーブル共通の保持期間（既定 60 日）
- 1 時間に 1 回 `DELETE FROM ... WHERE created_at <= ?` を `LIMIT 5000` で分割実行
- `event_counters` のみ「日次サマリにロールアップしてから古い行を削除」も検討

#### Rejection reason の語彙

| reason | 発生元 |
|---|---|
| `not_in_safelist` | §5.2 allowlist モードで未登録 npub の POST |
| `banned_npub` | §5.4 per-npub deny |
| `banned_ip` | §5.3 hard_ban |
| `shadow_drop` | §5.3 shadow_ban |
| `kind_blacklist` | §5.8 |
| `simple_ban:<id>` | §5.6 |
| `filter_rule:<id>` | §5.7 |
| `quarantine:<scope>` | §5.5 |
| `bot_filter` | レガシー bot 検出（kind 6/7 同 created_at） |

---

### 5.12 NIP-11 Relay Information

`Accept: application/nostr+json` で `/` にアクセスすると、JSON 形式のリレー情報を返す。
編集は管理 UI から（`relay_info` テーブル）。

| 主なフィールド | 用途 |
|---|---|
| `name`, `description`, `pubkey`, `contact`, `icon` | リレー基本情報 |
| `supported_nips` | サポート NIP 一覧 |
| `software`, `version` | ソフトウェア情報 |
| `limitation.max_*` | 制限値（将来 §C-4 で実効化） |
| `negentropy` | NIP-77 サポート表示 |

---

### 5.13 管理 UI（管制コンソール / Live Event Stream）

#### 構成
- ルート 3 分割を見据えた構成（実装は段階的）
  - `/`：LP（用途別訴求）
  - `/console`：管制コンソール（リアルタイム表示中心）
  - `/config`：設定タブ（既存 React UI が中心、編集中心）

#### Live Event Stream
- バックエンド：`GET /api/events/stream`（SSE）
- フィルタ：query parameter で `kind` / `npub` / `ip` / `reason` / `direction`
- イベント：プロキシを通過する EVENT を JSON Lines 形式でストリーム
- UI：管制コンソール側で「BAN」「Quarantine」「whitelist 化」のワンクリックボタン

#### 認証
- 管理 UI 全般は Basic 認証
- フェーズ B-4 で：失敗ロックアウト、レート制限、`/api/relay-nip11` の URL バリデーション強化

---

## 6. 評価順序（フィルタリングパイプライン）

EVENT が通過する評価順序を上から順に：

### POST（クライアント → バックエンド）
1. 接続時：IP アクセス制御（hard_ban → 即切断 / whitelist → bypass フラグ）
2. EVENT 受信
3. IP shadow_ban チェック → 該当なら OK true 偽装、終了
4. POST ポリシー評価（§5.2）
5. Quarantine 評価（§5.5、scope に応じて drop / OK true 偽装）
6. POST 適用フラグ付き Simple BAN（§5.6）
7. POST 適用フラグ付き DSL Rule（§5.7）
8. すべて pass → バックエンドへ転送

### REQ 応答 EVENT（バックエンド → クライアント）
1. IP shadow_ban チェック → 該当なら EOSE 偽装で REQ 段階で打ち切り（応答 EVENT は届かない）
2. EVENT 受信
3. `safelist[npub].filter_bypass` チェック → true なら以下スキップ
4. Quarantine `shadow_to_others` 評価
5. npub BAN 評価
6. Kind ブラックリスト評価（§5.8）
7. Simple BAN 評価（§5.6）
8. DSL Rule 評価（§5.7）
9. レガシー bot 検出（kind 6/7 同 created_at）
10. すべて pass → クライアントへ配信

---

## 7. 用語集

| 用語 | 意味 |
|---|---|
| **POST** | クライアントがリレーに送る `EVENT` メッセージ |
| **REQ** | クライアントがリレーに購読をリクエストする `REQ` メッセージ |
| **応答 EVENT** | バックエンドからクライアントへ流れる EVENT（REQ の応答） |
| **Allowlist モード** | デフォルト deny、許可リスト方式 |
| **Denylist モード** | デフォルト allow、拒否リスト方式 |
| **Hard BAN** | 接続を即拒否する強い遮断 |
| **Shadow BAN** | 接続は許すが内容は黙殺する見えない遮断 |
| **Quarantine** | 一定期間だけの限定的な制限（時限ミュート） |
| **Simple BAN** | DSL を使わず GUI で組める構造化フィルタ |
| **DSL Filter Rule** | SQL ライク構文で記述する高度なフィルタ |
| **filter_bypass** | safelist フラグ。フィルタ全般を素通りさせる |
| **fan-out / fan-in** | 複数バックエンドへの配信 / からの集約 |
