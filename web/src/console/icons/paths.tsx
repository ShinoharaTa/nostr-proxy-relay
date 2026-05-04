import type { ReactNode } from 'react';

interface IconDef {
  body: ReactNode;
  /** true なら fill レンダリング（塗り込み）、false なら stroke レンダリング */
  fill?: boolean;
}

/**
 * PROFILER (WD1 ctOS) 自作 SVG アイコン辞書。
 * - 24×24 viewBox 前提
 * - 角張り、stroke 1.75 / line-cap square / miter
 * - WD1 ctOS の Profiler / hideout マーカー風の最小限ピクトグラム
 * - `ds-skull` は WD2 / DedSec 由来でコード内に残しているが、UI からは出さない
 */
export const ICON_PATHS = {
  // ─────────── ナビゲーション (5 グループ) ───────────
  /** OVERVIEW: 三角ピーク (Dashboard 系) */
  'nav-overview': {
    body: <>
      <polyline points="3 18 9 10 13 14 21 5" />
      <polyline points="21 11 21 5 15 5" />
    </>,
  },
  /** BACKEND: サーバラック型 */
  'nav-backend': {
    body: <>
      <rect x="3" y="4" width="18" height="6" />
      <rect x="3" y="14" width="18" height="6" />
      <line x1="6" y1="7" x2="8" y2="7" />
      <line x1="6" y1="17" x2="8" y2="17" />
    </>,
  },
  /** ACCESS CONTROL: 鍵穴 + 矢羽根 */
  'nav-access': {
    body: <>
      <rect x="6" y="11" width="12" height="9" />
      <path d="M9 11 V8 a3 3 0 0 1 6 0 V11" />
      <line x1="12" y1="14" x2="12" y2="17" />
    </>,
  },
  /** FILTERING: スリット格子 */
  'nav-filter': {
    body: <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </>,
  },
  /** OPERATIONS: 工具 (レンチ + ナット) */
  'nav-ops': {
    body: <>
      <path d="M14 4 a4 4 0 0 1 4 6 l3 3 -3 3 -3 -3 a4 4 0 0 1 -6 -4" />
      <line x1="9" y1="13" x2="3" y2="19" />
    </>,
  },

  // ─────────── アクション ───────────
  'plus': {
    body: <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>,
  },
  'close': {
    body: <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="6" y1="18" x2="18" y2="6" />
    </>,
  },
  'pause': {
    body: <>
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </>,
  },
  'play': {
    body: <polygon points="6 4 20 12 6 20" />,
  },
  /** Shadow: 通常の目 */
  'eye': {
    body: <>
      <path d="M2 12 C5 6 9 4 12 4 s7 2 10 8 c-3 6 -7 8 -10 8 s-7 -2 -10 -8 z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  },
  /** Shadow BAN: 目に斜線 */
  'eye-off': {
    body: <>
      <path d="M2 12 C5 6 9 4 12 4 s7 2 10 8 c-3 6 -7 8 -10 8 s-7 -2 -10 -8 z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </>,
  },
  /** Hard BAN: × を矢羽根角ブラケットで囲む */
  'ban': {
    body: <>
      <polyline points="3 3 7 3 7 7" />
      <polyline points="21 3 17 3 17 7" />
      <polyline points="3 21 7 21 7 17" />
      <polyline points="21 21 17 21 17 17" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="9" y1="15" x2="15" y2="9" />
    </>,
  },
  /** Quarantine 残時間 */
  'clock': {
    body: <>
      <circle cx="12" cy="12" r="8" />
      <polyline points="12 7 12 12 16 14" />
    </>,
  },
  /** プラグ抜き = IP 強制切断 */
  'disconnect': {
    body: <>
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <line x1="11" y1="9" x2="11" y2="15" />
      <line x1="13" y1="9" x2="13" y2="15" />
    </>,
  },

  // ─────────── ステータス ───────────
  'dot': {
    fill: true,
    body: <circle cx="12" cy="12" r="5" />,
  },
  'dot-warn': {
    fill: true,
    body: <polygon points="12 4 21 20 3 20" />,
  },
  'dot-danger': {
    fill: true,
    body: <>
      <circle cx="12" cy="12" r="6" />
      <rect x="11" y="6" width="2" height="6" fill="#000" />
    </>,
  },
  'arrow-up': {
    body: <>
      <line x1="12" y1="20" x2="12" y2="6" />
      <polyline points="6 12 12 6 18 12" />
    </>,
  },
  'arrow-down': {
    body: <>
      <line x1="12" y1="4" x2="12" y2="18" />
      <polyline points="6 12 12 18 18 12" />
    </>,
  },

  // ─────────── DedSec シンボル ───────────
  /** DedSec スカル: 角張ったハクティビスト系骸骨。トップバー・ロゴ脇用。
   *  形状: 5 角形ヘルメット + 三角形眼窩 ×2 + 歯のスリット 3 本。 */
  'ds-skull': {
    fill: true,
    body: <>
      {/* helmet shell (5角形) */}
      <path d="M3 8 L8 3 L16 3 L21 8 L21 14 L17 18 L17 21 L7 21 L7 18 L3 14 Z" />
      {/* 眼窩 (三角形 ×2) を切り抜く */}
      <polygon points="6 9 11 9 8.5 14" fill="#000" />
      <polygon points="13 9 18 9 15.5 14" fill="#000" />
      {/* 歯のスリット (3 本) */}
      <rect x="9"  y="17" width="1.4" height="3" fill="#000" />
      <rect x="11.3" y="17" width="1.4" height="3" fill="#000" />
      <rect x="13.6" y="17" width="1.4" height="3" fill="#000" />
    </>,
  },
} satisfies Record<string, IconDef>;
