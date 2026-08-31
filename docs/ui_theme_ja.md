# UI テーマ仕様書 — PROFILER (WD1 / ctOS)

> Proxy Nostr Relay の Web UI（LP・管理コンソール・モック）で使用する公式ビジュアルテーマ「**PROFILER**」のデザイントークンと利用ルール。**WATCH_DOGS（2014, シカゴ / Aiden Pearce / ctOS / Profiler）の HUD** をモチーフにした、装飾を極端に抑えた「監視・犯罪分析報告」風レイアウト。

> 経緯: `CRT_OPS`（蛍光イエロー＋走査線が過剰）→ `CTOS`（ctOS HUD 寄り、抑制したが甘かった）→ `DEDSEC`（WD2 派手 DedSec を誤って混入、却下）→ 本リビジョン **`PROFILER`**（WD1 一次資料に基づく忠実版）。装飾は最小限、データ表示の読みやすさ最優先。

採用経緯と他テーマとの比較は `archive/mock-themes-2026-05-04.zip` 内のテーマギャラリー（旧 `/mock`）、ならびに [UI 全面再設計計画](ui_redesign_ja) を参照。

---

## 0. 一次資料 (本仕様の根拠)

| # | 出典 | 抽出した要点 |
|---|---|---|
| 1 | [The Verge — Inside the graphic design of Watch Dogs (2014)](https://www.theverge.com/2014/5/31/5768098/inside-the-graphic-design-of-watch-dogs) | Ubisoft Alexander Karpazis（WD1 グラフィックデザイン担当）の振り返り。Profiler / Smartphone OS / Hacking UI の意匠決定の背景 |
| 2 | [HUDS+GUIS — Watchdogs Hacking UI](https://www.hudsandguis.com/home/2013/07/24/watchdogs-hacking-ui) | "**bare-bones typography and icons that draws upon early cell phone iconography and 8bit/DOS programming fonts**" / "**surveillance interfaces and criminal analysis reports**" / "raw and relatively new" / "**understated look**" |
| 3 | [Game UI Database — Watch Dogs](https://www.gameuidatabase.com/gameData.php?id=1157) | UI 抽出パレット: 暗茶 `#322111` `#6e2e29` `#6f471b` + 鈍い黄緑 **`#C4D140`** + ダークシアン **`#1A6B81`** + アラート赤 **`#D03D3E`** |
| 4 | [dafont フォーラム — ctOS Font](https://www.dafont.com/forum/read/313957/ctos-font-watch-dogs) | ctOS HUD フォントは **Helvetica（に極めて近いサンセリフ）**。ステンシルではない |
| 5 | [Watch Dogs Wiki — Hideouts](https://watchdogs.fandom.com/wiki/Hideouts) | WD1 hideout マーカーは **黄色 `>>`** 矢印 1 つだけ。装飾はほぼゼロ |

> WD2 で確立された **DedSec の派手なブランディング**（フューシャピンク / 蛍光ライム / スカルロゴ / ステンシル / グラフィティ / 警告テープ斜線）は **WD1 には存在しない**ため、PROFILER 仕様では一切採用しない。

---

## 1. テーマの世界観

「**Aiden Pearce が Profiler アプリでシカゴの市民データを覗いている画面**」の視点。

- **WD1 ctOS / Profiler 由来**: 監視カメラ HUD、犯罪分析報告、スマートフォンの簡素な OS UI
- **配色**: 暗茶（街の汚れ）+ 鈍い黄緑（ctOS の主要 accent）+ ダークシアン（接続成立）+ 赤（heat level alert）
- **テクスチャ**: 古い CCTV のスキャンライン（薄く）。グランジ・グラフィティ・警告テープは無し
- **タイポ**: Helvetica 互換のクリーンサンセリフ + IBM Plex Mono + 数値だけ VT323（DOS 端末風）

→ **装飾は border / 罫線 / `>>` プレフィックスに集中**させ、「本文・KPI 値・テーブル」の読みやすさを最優先。"basic computing" の地味さを保つ。

---

## 2. デザイントークン

### 2.1 カラー（Raw → Semantic）

| Semantic | Hex | 用途 |
|---|---|---|
| `--crt-bg`         | `#0d0a07` | ベース背景。漆黒ではなくわずかに暗茶寄り |
| `--crt-bg-soft`    | `#15110b` | サブセクション背景、入力欄、罫線下地 |
| `--crt-bg-card`    | `rgba(28, 22, 14, 0.94)` | カード/パネル背景。暗茶 |
| `--crt-fg`         | `#e6e0d4` | 本文。アイボリー寄り、純白は使わない |
| `--crt-fg-dim`     | `#807563` | サブテキスト・ラベル |
| `--crt-accent`     | `#c4d140` | **WD1 ctOS 鈍い黄緑**（Game UI DB 抽出色）。CTA / active / 主要数値 |
| `--crt-accent-2`   | `#d6e26b` | accent ホバー |
| `--crt-info`       | `#6dc4d8` | **WD1 ダークシアン由来**。connected / live |
| `--crt-warn`       | `#d4863e` | **WD1 オレンジ茶ベース**。警告 |
| `--crt-danger`     | `#d03d3e` | **WD1 アラート赤**（Heat Level）。destructive |
| `--crt-border`     | `#2e2516` | 罫線（暗茶） |
| `--crt-border-strong` | `#4a3a22` | 強調罫線 |

> ❌ ピンク `#ff0066` / 蛍光ライム `#a3ff12` / 警告テープ斜線 / 黄黒は **PROFILER では使わない**（WD2 / Legion 由来）。

セマンティックの優先順位：

1. CTA / active / 主要数値 → **accent (鈍い黄緑)**
2. 接続中・healthy → **info (ダークシアン)**
3. 警告 → **warn (オレンジ茶)**
4. 拒否・destructive・heat → **danger (赤)**

### 2.2 タイポグラフィ

| Semantic | Family | 例 | 備考 |
|---|---|---|---|
| `--crt-font-display` | `'Arimo', 'Helvetica Neue', Helvetica, Arial, sans-serif` | 見出し・section title・サイドナビ | **Helvetica 互換**（Arimo は Google Fonts 配信、Helvetica/Arial と metric-compatible） |
| `--crt-font-mono`    | `'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace` | 本文・テーブル・コード・ID | データ表示 |
| `--crt-font-numeric` | `'VT323', 'IBM Plex Mono', ui-monospace, monospace` | KPI 値・カウンタ・コード断片 | **DOS 端末風**（HUDS+GUIS 評の "8bit/DOS programming fonts"） |

スケール（推奨）：

| 用途 | 想定値 | font | letter-spacing | case |
|---|---|---|---|---|
| Logo wordmark | 18–22px / 700 | display | `0.04em` | UPPERCASE 可 |
| Hero headline | 28–36px / 700 | display | `0.01em` | Sentence case |
| Section title | 16–20px / 700 | display | `0.02em` | Sentence case |
| Card title (HUD label) | 11–12px / 700 | display | `0.16em` | UPPERCASE |
| HUD inline tag (`>> SECURED`) | 11px / 400 | mono | `0.04em` | as-is |
| Body | 13–14px / regular | mono | `0` | Sentence case |
| KPI value | 28–40px / 400 | numeric (VT323) | `0` | as-is |

> **ステンシル禁止**。display は Arimo (Helvetica) のみ。KPI 値は VT323（DOS 端末）でレトロ感だけ点で出す。

### 2.3 余白・形状トークン

| Semantic | 値 |
|---|---|
| `--crt-radius` | `0`（角張り。PROFILER も継承） |
| カード内 padding | `14–18px` |
| カード間 gap | `12–16px` |
| セクション間 margin | `24–36px` |

### 2.4 影・グロウ

```css
/* CTA ボタン: 抑えたグロウのみ */
box-shadow: 0 0 6px rgba(196, 209, 64, 0.20);

/* KPI 数値（accent 系）: 装飾は薄く、可読性優先 */
text-shadow: 0 0 4px rgba(196, 209, 64, 0.20);
```

> ❌ chromatic shift（pink/cyan）は使わない。グリッチは見出しに付けない。

### 2.5 z-index 規範

| Layer | 値 | 例 |
|---|---|---|
| 通常コンテンツ | `1` | カード・本文 |
| 装飾下層 | `0` | （無くてよい） |
| Side nav | `10` | |
| Top bar | `20` | |
| FAB | `30` | |
| ドロワー / モーダル | `100–110` | |
| トースト | `1000` | |
| **CRT 走査線オーバーレイ** | **`9998`** | 全画面、pointer-events: none、opacity 0.10 |

---

## 3. 視覚言語（必須コンポーネント）

PROFILER に "らしさ" を与える 4 つのシグネチャ。各画面で**必須は 2 つ**（`>>` プレフィックスマーク、犯罪分析報告風データ表）。

### 3.1 Hideout マーカー `>>` プレフィックス

- WD1 で hideout を示す **黄色の "`>>`" 矢印 1 つだけ**を意匠として継承
- active な side nav item、section title 先頭、ボタンの左側に小さく表示
- 色は `--crt-accent`、サイズは 1 文字相当
- 「ここに誘導している」という最低限の指示にのみ使う

### 3.2 犯罪分析報告風データ表

- header 行は太字の **display font UPPERCASE letter-spacing 0.16em**
- 罫線は 1px solid border、row hover はごく薄い `rgba(196,209,64,0.04)` ハイライト
- カラム間は左寄せ、code/ID は mono、KPI 数値は VT323
- 装飾の border 帯・コーナー L 字・ステンシルバッジは付けない

### 3.3 HUD インラインタグ (`>> SECURED` 等)

- card title 横、section の下に小さく置く
- フォーマット: `>> ACTIVE` `>> 4 nodes` `>> last 6h`
- mono 11px、color `--crt-fg-dim`、accent 系は `--crt-accent`

### 3.4 CCTV 走査線オーバーレイ（任意 / 弱め）

- opacity **0.10**（CTOS は 0.18 / DEDSEC は 0.28、PROFILER は最小限）
- 線幅 1px / 3px ピッチ、mix-blend-mode: overlay
- flicker 12 秒周期、opacity 0.96–1.0（点滅は控えめ）
- "古い CCTV を眺めている" 程度の薄さに留める

> ❌ Grunge SVG ノイズ / ノードグラフ背景 / 警告テープ斜線 / DedSec スカルロゴ は **PROFILER には無い**。

---

## 4. コンポーネント・トークン

### 4.1 Button

| variant | bg | fg | border | shape |
|---|---|---|---|---|
| primary | `--crt-accent` | `var(--crt-bg)` | `1px solid var(--crt-accent)` | 角張り、左に `>>` |
| secondary | transparent | `--crt-fg` | `1px solid --crt-border-strong` | 角張り |
| ghost | transparent | `--crt-fg-dim` | `1px solid --crt-border` | 角張り |
| destructive | transparent | `--crt-danger` | `1px solid --crt-danger` | 角張り。hover で **赤反転塗り** |

### 4.2 Side nav item

- 通常: Sentence case、display font、`color: --crt-fg-dim`
- active: 文字 `--crt-accent`、左端 2px 黄緑バー、左に黄色 `>>`、背景は **塗らない**

### 4.3 Status dot

- live (info):   ダークシアン + 1.6s pulse（控えめ scale 1.0 → 1.06）
- warn:          オレンジ茶
- alert (danger): 赤 + 1.0s pulse（scale 1.0 → 1.10）
- idle:          grey

### 4.4 Tag / Pill / Mode Badge

- 角張り、枠線のみ、塗り潰しは原則使わない
- mode：
  - `hard`      → 枠 `--crt-danger` (赤)
  - `shadow`    → 枠 `--crt-fg-dim`
  - `whitelist` → 枠 `--crt-info` (cyan)
  - `temp`      → 枠 `--crt-warn` (orange)

### 4.5 Form

- input/select 背景 `--crt-bg-soft`、ボーダー `--crt-border-strong`、focus で `--crt-accent`
- placeholder は `--crt-fg-dim`

### 4.6 Table (犯罪分析報告風)

- header: display font, 700 UPPERCASE, color `--crt-fg-dim`, letter-spacing 0.16em
- row hover: 薄い黄緑ハイライト `rgba(196, 209, 64, 0.04)`
- 区切り線は `--crt-border` 1px

### 4.7 Toast

- 4 種類 (default/ok/warn/alert) で左 border 色を切替
- 右下から slide-in、4s 自動消滅
- 派手なグロウは無し

### 4.8 Modal / Drawer

- Modal: 中央配置、半透明黒オーバーレイ、走査線は維持（弱め）
- Drawer: スマホでフォーム表示用に右からスライド
- destructive 確認モーダル: 左 border `--crt-danger` のみ（警告テープは無し）

### 4.9 Empty state / Loading

- Empty: `>> NO DATA` mono + 説明文 1 行
- Loading: 細い横バーが流れる + `>> FETCHING…` mono

---

## 5. アニメーション規範

| 用途 | duration | easing | 強度 |
|---|---|---|---|
| グリッチ見出し | **OFF（デフォルト）** | — | 使わない |
| status dot pulse (live) | 1.6s | ease-in-out | scale 1.0 → 1.06 |
| status dot pulse (alert) | 1s | ease-in-out | scale 1.0 → 1.10 |
| CCTV 走査線 flicker | 12s | linear | opacity 0.96–1.0 |
| ボタン hover | 100ms | ease | border/text |
| トースト出現 | 200ms | ease-out | translateX |

`prefers-reduced-motion: reduce` を尊重し、blink・pulse を停止し静止表示に倒す。
`prefers-contrast: more` で走査線を全停止。

---

## 6. アクセシビリティ

| 観点 | 規範 |
|---|---|
| コントラスト | 本文 `--crt-fg` (#e6e0d4) on `--crt-bg` (#0d0a07) ≒ AAA |
| 色だけでの意味伝達禁止 | mode_badge は色 + テキストラベル両方 |
| `prefers-reduced-motion` | 全アニメ停止、pulse 静止 |
| `prefers-contrast: more` | 走査線を停止 |
| キーボード操作 | フォーカスリング `outline: 2px solid var(--crt-accent)` 2px offset |
| スクリーンリーダー | 装飾レイヤ (`crt-overlay`) は `aria-hidden="true"` |

---

## 7. やってはいけない例（PROFILER 固有）

- ❌ ピンク・蛍光ライム・フューシャを使う（WD2 / Legion / DedSec 由来）
- ❌ 見出しに glitch / chromatic shift を当てる
- ❌ ステンシルフォント（Stardos Stencil / Black Ops One）を使う
- ❌ 警告テープ斜線（黄黒）を使う（WD: Legion 寄り）
- ❌ DedSec スカルロゴを表示する（コードは残してもよいが UI には出さない）
- ❌ Grunge SVG ノイズを敷く
- ❌ ノードグラフ背景・散在ドットを敷く
- ❌ 1 画面に CCTV 走査線を 2 重で被せる（モアレ）
- ❌ ライトテーマ化
- ❌ 全文 UPPERCASE（読みづらい。HUD タグと button label のみ）

---

## 8. CSS 変数のリファレンス（コピペ用）

```css
:root {
  --crt-bg:        #0d0a07;
  --crt-bg-soft:   #15110b;
  --crt-bg-card:   rgba(28, 22, 14, 0.94);
  --crt-fg:        #e6e0d4;
  --crt-fg-dim:    #807563;
  --crt-accent:    #c4d140;
  --crt-accent-2:  #d6e26b;
  --crt-info:      #6dc4d8;
  --crt-warn:      #d4863e;
  --crt-danger:    #d03d3e;
  --crt-border:    #2e2516;
  --crt-border-strong: #4a3a22;

  --crt-font-display: 'Arimo', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --crt-font-mono:    'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
  --crt-font-numeric: 'VT323', 'IBM Plex Mono', ui-monospace, monospace;
}
```

---

## 9. 参考実装

- 旧 `mock/themes/watchdogs/theme.css` (`archive/mock-themes-2026-05-04.zip` 内) がベース参考。ただし WD2 寄りだったため、本仕様は WD1 ctOS 寄りに振り直し
- `/` (LP) と `/console` (空シェル + `/console/__dev` ショールーム) をブラウザで直接確認しながら調整
- `/console/__dev` で全プリミティブ・アイコン・コンポーネントを Showroom 形式で確認


---

## UX / アクセシビリティ監査（2026-08）

GOD'S EYE テーマ適用後、一般的な UI デザイン原則に照らして監査した結果と対応。
**「映画的な見た目」を理由に UX を犠牲にしない**ことを原則とする。

### コントラスト（WCAG 2.1 AA）

キャプチャではなく計算で検証している。カード背景 `#180f07` 上の実測値:

| トークン | 比 | 判定 |
|---|---|---|
| `--crt-fg` 本文 | 15.3:1 | PASS |
| `--crt-fg-muted` 弱調 | 8.3:1 | PASS |
| `--crt-fg-dim` ラベル | **5.8:1** | PASS（旧 `#8a7358` は 4.21:1 で未達 → `#a38b6b` へ修正） |
| `--crt-accent` | 8.1:1 | PASS |
| `--crt-info` | 10.2:1 | PASS |
| `--crt-warn` | 10.6:1 | PASS |
| `--crt-danger-text` | 6.7:1 | PASS |
| `--crt-border-strong` 入力枠 | **3.5:1** | PASS（旧 `#6b4a24` は 2.53:1 で WCAG 1.4.11 未達 → `#8a612e` へ修正） |

> 入力欄・ボタンの枠線は「非テキストコントラスト」として 3:1 が必要（1.4.11）。
> 単なる区切り線（`--crt-border`）は対象外。

### 確認ダイアログ

**ブラウザ標準の `confirm()` は使わない。** 以下の理由で UX を下げるため:
1. テーマから外れ、どのサイトの警告か分からない
2. ボタンが「OK / キャンセル」固定で、**何が起きるか予測できない**
3. モバイルで文言が省略される

代わりに `useConfirm()`（`primitives/ConfirmHost.tsx`）を使い、
**タイトル・具体的な影響の説明・動詞入りの実行ラベル**を必ず与える。
破壊的操作は `destructive: true` で実行ボタンを danger 表示にする。

```tsx
const confirm = useConfirm();
if (!(await confirm({
  title: '恒久 BAN を実行しますか？',
  body: `${npub} の投稿を恒久的に拒否します。解除は NPUB 画面から行えます。`,
  confirmLabel: 'BAN する',
  destructive: true,
}))) return;
```

### ダイアログのキーボード操作（WAI-ARIA Dialog パターン）

`Modal` は以下を満たす:
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`（タイトルと紐付け）
- 開いたら**最初の操作要素**にフォーカス（＝閉じる側。Enter 連打での誤爆防止）
- Tab / Shift+Tab をダイアログ内に閉じ込める（フォーカストラップ）
- Escape で閉じ、閉じたら**呼び出し元のボタンへフォーカスを戻す**
- 背景のスクロールを停止

### その他の原則

- フォーカスリングは `:focus-visible` で accent 2px + offset 2px（`design/base.css`）。**消さない**
- 破壊的操作は赤（danger）、通常の主操作は accent。色だけに頼らずラベルにも動詞を入れる
- `prefers-reduced-motion` でスキャンライン・ティッカー・点滅を停止
- テーブルは 1024px 未満でカード化（§6.3）。狭幅で HUD タグが縦積みに崩れないよう `nowrap`
