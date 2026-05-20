# ドキュメント

Proxy Nostr Relay の公開ドキュメント目次です。

## このプロダクトは

> **JP 圏の Nostr 運用者のための「人間が速く判断するための前段フィルタ」プロキシリレー**

クライアントとバックエンドリレーの間に置き、不要 EVENT を遮断・遅延・観測します。
自動制裁ではなく、運用者が**秒速で判断・対処できる**ためのツールに全振りしています。

詳しくは [機能仕様](specification_ja) を参照してください。

## 目次

- [機能仕様](specification_ja) — 全機能のリファレンス
- [Filter Query Language 仕様](filter-query) — 高度なフィルタ DSL
- [API リファレンス](api) — 管理 API
- [設定と運用](configuration) — systemd / Nginx / 環境変数
- [データの永続化とバックアップ](persistence) — SQLite ファイル運用
- [開発者ガイド](development) — ローカル開発と貢献方法
- [NIP-11 比較表](nip11-comparison) — 他リレー実装との対応比較
- [NIP-11 推奨設定](nip11-recommendations) — 設定値の推奨

### UI 全面再設計（Phase 2 計画）

- [UI テーマ仕様書 — PROFILER](ui_theme_ja) — 採用テーマ (Watch Dogs 1 ctOS) のデザイントークン・装飾ルール
- [UI 全面再設計 計画書](ui_redesign_ja) — IA 再構成・新 URL・レスポンシブ・実装フェーズ

---

## 概要

```
┌──────────────┐  WebSocket  ┌──────────────────────┐  WebSocket  ┌──────────────────┐
│  Nostr Client│ ──────────> │  Proxy Nostr Relay   │ ──────────> │ Backend Relay(s) │
└──────────────┘             │ ┌──────────────────┐ │             └──────────────────┘
                             │ │ Filter Pipeline  │ │
                             │ │ POST/REQ ライン  │ │
                             │ └──────────────────┘ │
                             └──────────────────────┘
```

EVENT は以下の順で評価されます（詳細は [仕様 §6](specification_ja)）：

1. **接続層**：IP アクセス制御（Hard BAN / Shadow BAN / Whitelist + CIDR）
2. **POST 層**：POST ポリシー（Allowlist / Denylist）と per-npub オーバーライド
3. **Quarantine 層**：時限ミュート（Discord 風の自由解除日時指定）
4. **コンテンツ層**：Simple BAN（GUI）と DSL Filter Rules
5. **Bot 検出層**：kind 6/7 重複検出

---

## 主な機能

### モデレーション
- **POST ポリシー切替**：Allowlist（デフォルト deny）/ Denylist（デフォルト allow）をリレー全体で切替可能
- **Simple BAN**：npub / kind / 組合せ / タグ含有を GUI で登録
- **DSL Filter Rules**：SQL ライク構文で正規表現や複合条件を記述
- **Quarantine**：任意の解除日時で一時隔離。スコープも選択可（黙殺 / シャドウ / 読み取り専用 / 全拒否）
- **Hard BAN / Shadow BAN**：明示的な遮断と、攻撃者に気付かせない黙殺の使い分け
- **CIDR 対応 IP BAN**：botnet や VPN 経由の攻撃に対するサブネット遮断

### 信頼性
- **WebSocket Keep-Alive と自動再接続**：Ping/Pong による死活監視と REQ 再購読
- **マルチバックエンドリレー**：Failover から Fan-out/Fan-in + dedup へ段階拡張（開発中）
- **One-shot REQ 自動 CLOSE**：プロフィール取得など一回限りの subscription を自動終了

### 観測性
- **接続ログ・拒否ログ**：IP / npub / kind / reason で検索可能
- **時系列統計**：POST 数 / 配信数 / 拒否数の時系列、kind 別流量
- **InfluxDB エクスポート**：受信→再配信レイテンシ含む詳細メトリクス（拡張中）
- **リレー死活監視**：Uptime Kuma 風の状態履歴 UI

### 標準対応
- **NIP-01**：基本プロトコル
- **NIP-11**：リレー情報の自己申告
- **NIP-77**（negentropy）：自己申告のみ

## 設計原則

1. **善良な大量投稿者を壊さない** — 自動制裁はしない
2. **判断は人間、ツールは速さに全振り** — 検知の自動化より「BAN を 1 クリック」を磨く
3. **再エクスポート可能に** — ログや設定は運用者の財産として持ち出せる
4. **オープンとプライベートの両立** — Allowlist モードで個人専用リレーにも転用可
5. **GUI と DSL の両刀** — 同じ基盤で初心者と熟練者の両方が居られる

---

## 外部リンク

- [GitHub Repository](https://github.com/ShinoharaTa/nostr-proxy-relay)
- [Nostr Protocol NIPs](https://github.com/nostr-protocol/nips)
- [NIP-01: Basic protocol flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-11: Relay Information Document](https://github.com/nostr-protocol/nips/blob/master/11.md)
