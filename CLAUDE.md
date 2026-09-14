# CLAUDE.md

このリポジトリで作業する Claude Code 向けのガイド。

## プロジェクト概要

Nostr のプロキシリレー。クライアントと上流リレーの間に立ち、Bot・スパムを前段で落とす。
Rust（axum / sqlx+SQLite / tokio-tungstenite）+ React SPA を `rust-embed` で単一バイナリに同梱する。

**重要な性質: このプロキシはイベントストレージを持たない。** 受理した EVENT は上流に保存される。
この前提は設計判断の随所に効く（調査機能が結果を保存しない、書き込み先を確定的に決める、など）。

## 設計原則（`やりたいこと.md` より）

1. **善良な大量投稿者を壊さない** — 量だけを根拠にした自動制裁はしない
2. **判断は人間、ツールは速さに全振り** — 検知の自動化より「1 クリックで打てる」を磨く
3. 自動ガードが発火しても**恒久制裁はしない**（時限 Quarantine のみ）。恒久 BAN は常に人間が決める

新機能を足すときはこの原則に照らすこと。特に「自動で BAN する」提案は原則違反になりやすい。

## よく使うコマンド

```bash
cargo build                 # web/dist は commit 済みなので Node 不要
cargo test --all-targets    # lib / bin / integration
cd web && npm run build     # tsc 型チェック込み
cd web && npm run test      # vitest
cd web && npm run screenshot -- --out ../screenshots --user admin --pass xxx
```

### UI を変更したら

**必ずスクリーンショットで目視確認する。** `npm run screenshot` で主要ページ × PC/モバイルを一括取得できる。
過去にこれで「ブランド名の残骸」「モバイルで画面全体が横スクロール」などを検出している。

横スクロールは繰り返し起きているので、UI 変更時は 390px / 768px で
`scrollWidth <= clientWidth` を確認すること（原因はたいてい `min-width: 0` 忘れ）。

## アーキテクチャ要点

| 場所 | 役割 |
|---|---|
| `src/proxy/ws_proxy.rs` | WebSocket プロキシ本体。fan-out / EOSE 集約 / POST 評価 |
| `src/filter/engine.rs` | DSL・Simple BAN・kind ブロックの評価 |
| `src/guard/` | 自動ガード（バースト検知 / 同一 content 検知） |
| `src/investigate/` | イベント調査。**上流に問い合わせて解析し、保存しない** |
| `src/client_ip.rs` | Tunnel / リバースプロキシ配下での実 IP 解決 |
| `src/relay_pool/` | 上流リレーへの常時接続（状態監視 + 調査機能が利用） |
| `web/src/console/` | 管理コンソール（GOD'S EYE テーマ） |

### 落とし穴

- **`SettingsCache` の watch 更新は `send_modify` を使う。** `send(borrow()+1)` は
  read ガードが生きたまま write を取るため同一スレッドでデッドロックする（過去に本番バグ化）
- **調査機能で共通タグを判定するときは構造タグを除外する。** リプライは全件が
  root への `e` タグと root 投稿者への `p` タグを共有するため、除外しないと
  「p=**被害者** をブロック」という誤提案が出る
- **`tests/integration.rs` は API 変更に追随させる。** 過去にコンパイル不能のまま放置されていた

## 作業の進め方

**Issue で管理し、PR で反映する。**

1. Issue を立てる（背景・方針・完了条件を書く）
2. ブランチを切る（`feat/` `fix/` `chore/`）
3. 実装 → `cargo test --all-targets` と web のビルド/テストを通す
4. PR を作成（`Closes #N` を入れる）。CI グリーンを確認
5. マージは**ユーザーの指示を待つ**

- 積み重ね PR では `--delete-branch` を使わない（ベースブランチが消えると PR が自動クローズされる）
- crates.io は公開済みバージョンを再公開できない。機能追加時は `Cargo.toml` の version を上げる
- 仕様は `docs/specification_ja.md`、UI は `docs/ui_redesign_ja.md` に追記する

## Blue/Green デプロイ

同一 URL のまま安定版（blue）と開発版（green）を切り替えられる。詳細は
[`docs/development_ja.md`](docs/development_ja.md) と [`ops/`](ops/)。

```bash
relayctl status                              # 向き先・各スロットの版・health
relayctl deploy green <git-ref> --with-db    # ref をビルドして green へ
relayctl point green                         # テスト時だけ URL を green へ
relayctl promote                             # green の版を blue へ反映し blue へ戻す
relayctl rollback                            # 直前の向き先へ戻す
```

**注意点:**
- `deploy` は指定 ref を隔離 worktree に展開してビルドする（作業ツリーを直接ビルドすると ref 指定が無視される）
- スロットの DB は独立している。**`--with-db` を付けないと上流リレー設定が空**のままで、
  WS が EOSE を返せなくなる
- `point` / `promote` は切替前に health チェックする

## 環境

- 設定の全体像は [`docs/configuration_ja.md`](docs/configuration_ja.md) の「設定の全体マップ」
- env は起動時のみ。コンソールから変更できる設定は DB に入り再起動不要で反映される
- `BIND_ADDR` でポートを変更できる（既定 `127.0.0.1:8080`）
