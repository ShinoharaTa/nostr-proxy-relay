# archive/

本ディレクトリは、現在のプロジェクト本体では使わなくなったが、
他プロジェクト等で再利用する可能性のある成果物を圧縮保管する場所。

## 収録物

### `mock-themes-2026-05-04.zip` (41KB / 51 files)

旧 `web/src/mock/` 一式。
PROFILER 採用に至るまでに比較検討した SF コンソール系の
テーマモック (React + CSS) が入っている。

中身：

- `mock/MockApp.tsx` — `/mock` 配下のルーター
- `mock/MockIndex.tsx` — テーマ一覧
- `mock/ThemeIndex.tsx` — テーマごとの LP / Dashboard / Config プレビュー
- `mock/shared/` — 各テーマで共通利用する LP / Dashboard / Config テンプレート
- `mock/fixtures.ts` — モック用ダミーデータ
- `mock/types.ts` — モック共通型
- `mock/themes/<name>/`
  - `theme.css` — テーマトークンと装飾 CSS
  - `decoration.tsx` — テーマ固有の背景レイヤー / 装飾要素

採録テーマ (12種)：

| テーマ        | モチーフ                                          |
| ------------- | ------------------------------------------------- |
| `terminal`    | 緑 CRT 端末                                       |
| `tron`        | TRON / 青グリッド                                 |
| `alien`       | エイリアン / 警告ストライプ                       |
| `synthwave`   | 80s シンセウェーブ / 紫グラデ                     |
| `bladerunner` | ブレードランナー / 琥珀色 + 砂塵                  |
| `nasa`        | NASA ミッションコンソール / 紺 + アンバー         |
| `cyberpunk`   | Cyberpunk 2077 / 黄 + サイドレール                |
| `apex`        | APEX Legends / 赤橙 + イタリック斜めカット        |
| `lol`         | League of Legends / ダーク + 金 / コーナー装飾    |
| `ratchet`     | Ratchet & Clank / 明るい青 + ホロ                 |
| `gta_phone`   | GTA 5 携帯 UI / 明るい白基調                      |
| `watchdogs`   | Watch Dogs 2 寄り DedSec / 蛍光緑 + ピンク        |
| `hybrid`      | Cyberpunk + APEX + Terminal の合成 (採用候補だった `CRT_OPS`) |

最終的にこの中から派生して **PROFILER (Watch Dogs 1 ctOS / 渋いダークブラウン + #C4D140 黄緑)** を作り、
`web/src/console/` 側の design tokens に落とし込んでいる。

## 復元方法

```bash
cd web/src
unzip /path/to/archive/mock-themes-2026-05-04.zip
```

その後、`web/src/main.tsx` に以下を再追加すれば `/mock` で復活する：

```tsx
import { MockApp } from './mock/MockApp.tsx'

const isMock = path.startsWith('/mock')
// basename に '/mock' を含める
// pickRoot() で if (isMock) return <MockApp />
```

サーバ側 (`src/main.rs`) では、`public_static` に `.nest_service("/mock", tower::service_fn(spa_static_handler))` を再追加する。

## 注意

- zip 内の React コンポーネントは旧 `console/primitives` を `import` していない独立構造になっているので、
  そのまま別プロジェクトに持ち出して動かしやすい。
- ただし依存先として `react`, `react-router-dom` は必要。
