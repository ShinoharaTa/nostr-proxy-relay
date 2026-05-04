# UI 全面再設計 — 計画書 (Phase 2)

> 採用テーマ **PROFILER** (Watch Dogs 1 ctOS) を前提に、Web UI（LP・管理コンソール）を
> **ゼロベースで作り直した**仕様と実装計画。
>
> 旧 `web/src/App.tsx` / `web/src/components/*` は Phase 2.7 で完全に削除済み。
> 旧 URL `/config/*` は `/console/*` への 301 永続リダイレクトで吸収する。
> テーマ仕様は [`ui_theme_ja`](ui_theme_ja) を参照。

---

## 0. 決定事項（このドキュメントの前提）

| 項目 | 決定 |
|---|---|
| 採用テーマ | **PROFILER** (Watch Dogs 1 ctOS) ([テーマ仕様](ui_theme_ja)) |
| 対応端末 | **PC / タブレット / スマホ の full parity** — 全機能を全端末で操作可能 |
| 認証 | **BasicAuth のまま継続** — UI 側にログイン画面は実装しない |
| LP の Status | **rich** — 接続数・uptime・1h 配信グラフ・バックエンド一覧・直近インシデント |
| 旧 `/config` | Phase 2.6 完了時に**単一リリースで切替**（並走期間なし、`/config/*` → `/console/*` の 301 永続リダイレクトで吸収） |
| `/mock` | 廃止（採用前に検討した SF 系テーマ12種は `archive/mock-themes-2026-05-04.zip` に退避） |

---

## 1. ゴールと非ゴール

### ゴール
- 「秒で状況把握、秒で対応」できる管理コンソールを CRT_OPS で実現
- スマホでも BAN / Quarantine などの**緊急対応**が即できる
- 命名・URL・IA を整理し、**用語が画面ごとにブレる現状**を解消
- LP に "生きている" Status を出して「このリレーは健康だ」を一目で伝える

### 非ゴール（今フェーズ外）
- 自動制裁・自動 quarantine の追加（[やりたいこと.md](../やりたいこと.md) の方針通り、人間の判断を補助するに留める）
- ロール別認証 / マルチテナント / SSO
- 多言語化（日本語固定。文言の英語混在は CRT_OPS テーマの一部として許容）
- ダークモード以外への対応（CRT_OPS は黒地前提）

---

## 2. 既存 UI の問題点

| 問題 | 発生箇所 | 解決方針 |
|---|---|---|
| タブが**フラット 13 個**で並び、目的画面まで遠い | `web/src/App.tsx` `tabs` 配列 | 5 グループの**サイドナビ**に再構成 |
| 用語の不統一（Safelist / Relay Settings / Event Logs / Simple BAN ...） | 全画面 | 命名統一表（§ 4） |
| 「設定」と「観測」が同列に並ぶ | App.tsx の単一タブバー | Console (観測) と Config (設定) を**意味で区切る** |
| LP（`src/docs.rs`）と管理コンソール（React SPA）が**別実装**で重複 | `src/docs.rs` HTML テンプレ | LP も React SPA 化、`docs.rs` の HTML を撤去 |
| レスポンシブ非対応（`web/src/index.css` 固定 px） | 全コンポーネント | CSS Grid + container query / 適切なブレークポイント |
| 「現在何が起きているか」が分散（Live Events タブ・Logs タブ・Dashboard・各セクション） | 各タブ | Console トップに**統合ライブビュー**を置く |
| 認証は BasicAuth ダイアログのみで、誰がログイン中か分からない | `src/auth/mod.rs` | UI 上に「現在のユーザー」表示（DB 値、ログアウトリンクは BasicAuth 流儀の `realm` 切替で対応 = 任意） |

---

## 3. 新しい IA（情報アーキテクチャ）

### 3.1 全体像

```
┌────────────────────────────────────────────────────────┐
│  /              LP（公開、未認証）                       │
│  /console       管理コンソール（要 BasicAuth）           │
│  /docs          公開ドキュメント（既存維持）              │
└────────────────────────────────────────────────────────┘
```

### 3.2 `/console` のサイドナビ（5 グループ）

```
OVERVIEW              ← 観測。読みに来る場所
  Dashboard           概観 KPI + ライブストリーム + 最近のインシデント
  Live Events         SSE フル表示（フィルタ付き）
  Logs                Rejection / Connection / Backend Relay の3タブ統合

BACKEND               ← バックエンドリレーの設定・健全性
  Backend Relays      接続先リレーの追加/削除/role/weight
  NIP-11              自リレーの NIP-11 (公開用) 編集

ACCESS CONTROL        ← 「誰を通すか / 黙らせるか」
  POST Policy         allowlist / denylist 切替 + backend_strategy
  Npub                公開鍵単位の許可・禁止
  IP ACL              IP / CIDR の hard / shadow / whitelist
  Quarantine          時限ミュート（npub 単位）

FILTERING             ← 「何を弾くか」
  Kind Blocklist      Kind 番号で一括拒否
  DSL Rules           Filter Query Language ルール
  Quick BAN           GUI で組める単純ルール

OPERATIONS            ← 運用補助
  Telemetry           Metrics / InfluxDB エクスポート設定
  System              auth_throttle / log retention / 環境設定の確認
```

各グループは**意味の単位**であって、画面は最大 4 個までに抑える（5 個目が出たら IA を見直す）。

### 3.3 命名統一表（旧 → 新）

| 旧名 | 新名 | 理由 |
|---|---|---|
| Safelist | **Npub** (Allow/Deny サブタブ) | 「セーフ」の意味が曖昧 |
| Relay Settings (UI 上の表記) | **Backend Relays** | 用語をバックエンドリレーに統一 |
| Event Rejection Logs | **Logs › Rejection** | Logs グループ配下に集約 |
| Connection Logs | **Logs › Connection** | 同上 |
| Relay Event Logs | **Logs › Backend Relay** | 同上、バックエンド表記統一 |
| Simple BAN Rules | **Quick BAN** | "Simple" より "Quick" が運用感に合う |
| Kind Blacklist | **Kind Blocklist** | "Block" の方が中立な現代用語 |
| Filter Rules | **DSL Rules** | 機能をそのまま表す |
| Quarantine | **Quarantine（時限ミュート）** | 説明をサブタイトルで補完 |
| Metrics Settings | **Telemetry** | 統一名 |

旧 URL はリダイレクトで吸収（§ 4）。

---

## 4. 新 URL マップ

```
/                                公開 LP（Status 付き）
/console                         Dashboard（= /console/dashboard へ）
/console/live                    Live Events
/console/logs                    Logs（rejection / connection / backend タブ内蔵）
/console/backend/relays          Backend Relays
/console/backend/nip11           NIP-11
/console/access/post-policy      POST Policy
/console/access/npub             Npub
/console/access/ip               IP ACL
/console/access/quarantine       Quarantine
/console/filter/kind             Kind Blocklist
/console/filter/dsl              DSL Rules
/console/filter/quick-ban        Quick BAN
/console/operations/telemetry    Telemetry
/console/operations/system       System
/api/...                         API（既存維持）
/api/public/status               LP 用ステータス（認証不要、1s キャッシュ）
/api/system/info                 サーバ情報・auth_throttle・retention・disk (要 BasicAuth)
/api/telemetry/status            InfluxDB 設定の表示 (要 BasicAuth)
/api/telemetry/test              InfluxDB に test write を 1 行送る (要 BasicAuth)
/docs/...                        公開ドキュメント（既存維持）
/config/*                        Phase 2.7 で → 同等 /console/* に 301 永続リダイレクト
```

---

## 5. ページ別レイアウト規範

### 5.1 LP — `/`

未認証で誰でも見る。ProxyRelay の特徴とこのインスタンスの健康度を伝える。

#### 構成
1. **ヘッダ**: ブランド (PROXYRELAY-JP)、Status バッジ（OPERATIONAL / DEGRADED / DOWN）、wss URL、CTA「CONNECT」
2. **Hero**: tagline + 1 行 description + 接続 URL 強調（コピーボタン）
3. **Live KPI**: active_connections / posted_per_min / delivered_per_min / rejected_per_min / uptime（5 枚 or 4 枚 + uptime 別行）
4. **特徴グリッド**: 6 タイル（POST Policy / IP ACL / Quarantine / Live Monitoring / NIP-11 enforcement / Filter DSL & Quick BAN）
5. **配信レート 1h チャート**: SVG 折れ線（posted / delivered / rejected）
6. **バックエンドリレー一覧**: URL / 接続継続時間 / 直近接続イベント
7. **インシデント**: 直近 N 件の `relay_event_logs` を時系列で
8. **NIP-11 サポート一覧**: タグ群
9. **フッタ**: contact、build、ドキュメントリンク（`/docs`）

#### 必要な API（新設）

```http
GET /api/public/status
→ {
  status: "operational" | "degraded" | "down",
  uptime_sec: 390780,
  connections_active: 142,
  events: { posted_1h: [...buckets], delivered_1h: [...], rejected_1h: [...] },
  backends: [{ url, connected_since, last_event_ts, status }],
  incidents: [{ ts, type, summary }]   // recent N from relay_event_logs
}
```

- 認証なし、CORS 全開放
- 1 秒キャッシュ（同時アクセスで DB を叩きすぎない）
- 個人情報・IP・npub は出さない

### 5.2 Dashboard — `/console/dashboard`

「いま何が起きているか」を 1 画面で把握。

- 上段: KPI 4 枚（ACTIVE / POSTED/min / DELIVERED/min / REJECTED/min）
- 中段左 (2/3): Events over time（period 切替 15m / 1h / 6h / 24h / 7d）
- 中段右 (1/3): いま接続中のクライアント上位 N（IP + 接続時間）
- 下段左 (1/2): 直近 30s の Live ストリーム（最新 8 件）
- 下段右 (1/2): 拒否理由トップ 5 + 直近インシデント 5 件

### 5.3 Live Events — `/console/live`

SSE フル表示。フィルタ・一時停止・クリア・JSON コピー。スマホでも見やすく等幅 + カード化。

### 5.4 Logs — `/console/logs`

3 タブ（Rejection / Connection / Backend Relay）。日時 / IP / npub / reason のフィルタ + 期間指定 + ページング。

### 5.5 Backend Relays — `/console/backend/relays`

リレー追加（URL → 自動 NIP-11 fetch → 確認 → 追加）/ role / weight / read / write の編集。各行に「いま接続中か」のステータスドット。

### 5.6 NIP-11 — `/console/backend/nip11`

自リレーの NIP-11 をフォーム編集。ライブプレビュー JSON。

### 5.7 POST Policy — `/console/access/post-policy`

allowlist / denylist のラジオ切替 + backend_strategy（Failover / Fan-out / Sharded）の選択。**変更時は確認モーダル**（運用に大きな影響があるため）。

### 5.8 Npub / IP ACL / Quarantine

- 共通の「リスト + 追加フォーム + 各行モード切替」スタイル
- スマホは「リストはカード、追加はドロワーから」（§ 6 レスポンシブ）
- 緊急時の操作に最適化：**1 タップ追加・1 タップ解除**

### 5.9 Kind Blocklist / DSL Rules / Quick BAN

- DSL Rules には dry-run モーダル（既存仕様継続）
- Quick BAN には「DSL に変換してプレビュー」ボタン
- 各ルールに `apply_to_post` / `apply_to_backend` の **明示的なバッジ**

### 5.10 Telemetry / System

- Telemetry: InfluxDB 設定の編集 + 接続テスト
- System: auth_throttle 状況、log retention 日数、env からの override 状況、disk usage（簡易）

---

## 6. レスポンシブ戦略

### 6.1 ブレークポイント

```
sm   <  640px   スマホ（縦持ち想定）
md   ≥  640px   タブレット縦
lg   ≥ 1024px   タブレット横 / 小型 PC
xl   ≥ 1280px   デスクトップ
2xl  ≥ 1536px   ワイドモニタ
```

`@container` クエリも併用し、サイドバーが閉じた状態（タブレット）の中央領域は `lg` 相当のレイアウトに切替。

### 6.2 サイドナビの振る舞い

| ブレークポイント | サイドナビ |
|---|---|
| `xl+` | 240px 固定で常時表示、ラベル + アイコン |
| `lg`  | 64px の icon-only バー、hover でツールチップ展開 |
| `md`  | 完全に閉じる、ハンバーガーで全画面オーバーレイ |
| `sm`  | 同上。下部に 5 グループ相当の **Bottom Tab** を別途設置（ワンタップで主要グループへ） |

### 6.3 テーブルのスマホ対応（最重要）

PC のテーブル UI をそのまま縮小すると操作不能になるので、`< md` では**カードリスト化**。例：IP ACL の場合、

```
┌───────────────────────────────┐
│ 192.0.2.10            ◉ HARD_BAN │
│ memo: spam burst 04-12          │
│ [ Mode ▾ ] [ Edit ] [ Delete ]  │
└───────────────────────────────┘
```

各リストコンポーネントは `<DataList>` という共通プリミティブを 1 個作り、`columns` と `mobileRender` を受け取って自動切替。

### 6.4 緊急アクションのスマホ最適化

スマホで一発でやりたい操作の優先順位：

1. **ある npub を Quarantine する**（時限ミュート）
2. **ある IP を Hard BAN する**
3. **POST Policy を allowlist ⇆ denylist 切り替える**
4. **接続中クライアントから特定 IP を切断する**

→ Bottom Tab に常設の「**+ ACTION**」FAB を置き、上記 4 種を 1 タップで実行できる "緊急パレット" を提供する。

### 6.5 Live Events のスマホ表示

- 1 行 = 1 カード（時刻 / 種別バッジ / npub or ip / reason）
- 上部固定の「フィルタチップ」（accepted, delivered, rejected, dropped）
- 「pause」「clear」は右上アイコン

### 6.6 LP のスマホ表示

- Hero は縦積み、CTA を画面幅 100% の大ボタンに
- KPI は 2x2 グリッドに圧縮、uptime は別カード
- バックエンド一覧 / インシデントはアコーディオン格納

### 6.7 タブレット（`md`〜`lg`）の振る舞い

- サイドバーは icon-only または閉じる
- KPI は 4 → 2 列 → 必要なら 1 列
- ダッシュボードのチャートは横幅優先、サブパネルは下に積む

---

## 7. 状態・遷移パターン（インタラクション規範）

### 7.1 認証フロー
- 401 が返ったら**ブラウザ標準ダイアログ**で BasicAuth プロンプト（UI 側でログイン画面は作らない）
- `/api/public/status` と LP `/` だけは認証なし
- 認証を**わざわざ捨てる**仕組みは BasicAuth の制約で完全には作れないため、UI 上に「ブラウザを完全に閉じてください」と説明モーダルを用意する

### 7.2 トースト
- API 成功 → 緑、3s で自動消滅
- API 失敗 → マゼンタ、操作ボタン（「もう一度」）付きで自動消滅させない
- 大量送信時は集約（5 秒以内の同種は最後だけ表示）

### 7.3 モーダル vs ドロワー
- **モーダル**: 確認系・削除前確認・dry-run プレビューなど、注意を引きたい時
- **ドロワー**: 入力フォーム（追加・編集）。スマホで全画面、PC で右側 480px

### 7.4 確認ダイアログを必須にする操作
- POST Policy の allow/deny 切替
- バックエンドリレーの削除
- IP ACL の hard_ban 追加（既存接続が切れる旨を表示）
- Quarantine 解除（npub の凍結を解く）
- すべてのバルク削除

### 7.5 空状態
- 各リストに「まだルールがありません。`+ ADD` で追加してください」を**説明 1 行 + ヒント例 2 行**で表示。装飾画像は使わない。

### 7.6 エラー
- API エラーは「`E_xxx`」コード + 1 行の人間向け説明 + 開発者向けに詳細トグル
- ネットワーク切断は画面上部に**永続バー**で表示（CRT 走査線とは別レイヤ）

---

## 8. 実装フェーズ計画（既存を壊さず段階移行）

旧 `/config` を残したまま新 `/console` を並走させ、最後に旧を撤去する戦略。各 Phase は **動作する状態で完結**させ、PR 単位で段階的に進める。

### Phase 2.0 — 基盤・プリミティブ・レイアウト案検討
- `web/src/console/` 新規ディレクトリ（既存 `web/src/components/` には触らない）
- デザイントークン `design/tokens.css` `breakpoints.css` `fonts.css` `animations.css`
- アイコン：`<Icon>` プリミティブ + 主要 SVG **完全自作**（5 グループナビ + 9 アクション + 5 ステータス 計 19。サブナビ用 13 個は Phase 2.1 で追加）
- 共通プリミティブ 15 個：`<Button>` `<Card>` `<KpiTile>` `<StatusDot>` `<Tag>` `<ModeBadge>` `<Pill>` `<DataList>` `<Toast>` `<Modal>` `<Drawer>` `<EmptyState>` `<LoadingState>` `<HeadlineGlitch>` `<Icon>`
- レスポンシブシェル：`<AppShell>` + `<Topbar>` + `<SideNav>` + `<BottomTab>` + `<EmergencyActionFab>`
- ルーティング：`/console` で空のレイアウト + `/console/__dev` でプリミティブショールーム
- `main.tsx` の basename 判定に `/console` を追加（auth は既存 `/config` と同じレイヤ）
- サーバ：`/console` を BasicAuth 配下で配信
- **レイアウト案検討**：`/` に直接実装した PROFILER LP をブラウザでレビューし方向決定
- ※ Storybook は導入しない。プリミティブ単体確認は `/console/__dev` で兼ねる

### Phase 2.1 — LP 完成（1〜2 day）
- 新エンドポイント `GET /api/public/status` 実装（[LP 仕様 §5.1](#51-lp---)）
- `/` を React SPA 化、CRT_OPS LP を実装
- 旧 `src/docs.rs` の HTML テンプレを削除（API 関連 docs ルートは残す）
- Status バッジの自動更新（10s ごとに polling、SSE 不要）

### Phase 2.2 — Console: Overview（2〜3 day）
- Dashboard / Live Events / Logs を実装
- `<DataList>` の PC ↔ スマホ自動切替の確立
- スマホ用 Bottom Tab + 緊急アクション FAB の最初のバージョン

### Phase 2.3 — Backend グループ
- Backend Relays / NIP-11 編集
- 役割（role / weight / read / write）の表示と編集
- リレー追加時の NIP-11 自動取得 + 確認モーダル

### Phase 2.4 — Access Control グループ
- POST Policy 切替（要モーダル）
- Npub（allow / deny / ban サブタブ統合）
- IP ACL（mode + CIDR、追加時に既存接続切断の警告）
- Quarantine（preset duration / 残時間表示）

### Phase 2.5 — Filtering グループ
- Kind Blocklist / DSL Rules（dry-run 含む）/ Quick BAN
- `apply_to_post` / `apply_to_backend` バッジの統一表示

### Phase 2.6 — Operations グループ
- Telemetry（InfluxDB 接続テスト UI）
- System（auth_throttle 状況・retention・disk）
- 設定で「アニメーション低減」「CRT オーバーレイ OFF」をトグル可能に

### Phase 2.7 — 旧 `/config` 単一切替（実施済み）
- 全画面が `/console` に移行済み
- `/config/*` → `/console/*` の **301 永続リダイレクト**を Rust 側で実装 (`src/main.rs` `legacy_config_redirect`)
- `web/src/App.tsx` `web/src/App.css` `web/src/components/*` `web/src/api.ts` `web/src/types.ts` を削除
- `main.tsx` の `/config` 分岐を削除し、basename は `/console` か `/` のどちらかに
- `vite.config.ts` の PWA scope を `/config/` → `/console/` に変更
- 同一リリースで切替（並走期間なし）

---

## 9. 既存 mock との関係

- 検討用 `/mock` は廃止し、SF コンソール系テーマ12種 (`terminal` / `tron` / `alien` / `synthwave` / `bladerunner` / `nasa` / `cyberpunk` / `apex` / `lol` / `ratchet` / `gta_phone` / `watchdogs` / `hybrid`) を `archive/mock-themes-2026-05-04.zip` に退避
- 採用は `hybrid` (`CRT_OPS`) を経由して最終的に `PROFILER` (Watch Dogs 1 ctOS) に決定。本実装の CSS 変数命名は `console/design/tokens.css` を**唯一の真実**とする（mock 側は参考扱い）
- 復元手順とテーマ一覧は `archive/README.md` 参照

---

## 10. 計測・観測

UI 側の観測：

- 各 API 呼び出しの 4xx/5xx 率を内部で集計（既存 metrics に追加）
- スマホ・PC のアクセス比率（UA ベースで User-Agent カテゴリ分けし、anonymous な count だけ）
- 「緊急アクション FAB の利用回数」を `quick_action_used` イベントで集計（後の UX 改善判断に）

これらは認証必須エンドポイント越しに集計し、外部に漏れない（個人情報なし）。

---

## 11. リスクと判断保留

| リスク | 対処 |
|---|---|
| スマホ full parity = 開発・テスト工数が重い | DataList プリミティブを最初に確立し、各画面はそれに乗るだけにする |
| BasicAuth UI のままだと「ログアウト体験」が貧弱 | UI 上で「ブラウザ全閉じが必要」と説明、必要なら Phase 後半で Cookie セッション化を別計画に |
| LP の `/api/public/status` から接続パターンを推測される懸念 | 出力する数値を 5min バケット集計値のみに、IP / npub は一切出さない |
| CRT 走査線が一部端末（古い iOS Safari など）で重い | `prefers-reduced-motion` および設定からの OFF を必須実装 |
| URL 変更で既存ブックマークが切れる | `/config/*` → `/console/*` の **301 永続リダイレクト**で吸収 |
| Phase が長引きデザインドリフト | 各 Phase 完了時に [ui_theme_ja](ui_theme_ja) との差分を必ずレビュー |

---

## 12. オープン疑問（次回の合意ポイント）

実装着手前に確定させたい：

1. **`/api/public/status` の出力粒度**: § 11 の通り集計値のみで進めて良いか
2. **「アニメーション OFF」「CRT OFF」設定の保存先**: localStorage で十分か、サーバ側に持つか
3. **Bottom Tab の構成**: スマホ画面下部の優先度（推奨：緊急アクション FAB + 4 グループタブ）

→ 既決事項：並走なし／単一切替・BasicAuth 継続・LP rich・アイコン完全自作・Storybook 不採用（Layout Mock 機能も廃止し、ブラウザで直接確認）

---

## 関連ドキュメント

- [CRT_OPS テーマ仕様書](ui_theme_ja) — 色・タイポ・装飾・コンポーネントトークン
- [機能仕様](specification_ja) — 既存機能の全体像
- [API リファレンス](api) — 既存 API（`/api/public/status` は本書で新設提案）
