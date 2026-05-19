/**
 * PROFILER の UI 設定（CRT overlay / アニメーション / 緊急アクション使用回数）を
 * localStorage で永続化するための薄いユーティリティ。
 *
 * - 真実の所在は localStorage。`document.body` の class 切替で CSS を駆動する。
 * - prefers-reduced-motion は CSS 側 (animations.css) が優先で吸収するため
 *   ここでは追跡だけ行い、UI に「OS 設定で reduced-motion が ON です」と表示できるようにする。
 */

const CRT_KEY = 'profiler.crtOverlay';
const ANIM_KEY = 'profiler.animations';
const QUICK_ACTION_KEY = 'profiler.quickActionCount';

const BODY_CLASS_OVERLAY_OFF = 'crt-overlay-off';
const BODY_CLASS_ANIM_OFF = 'crt-animations-off';

/** UI 設定の現在値。常に同期で参照可能。 */
export interface UiPrefs {
  crtOverlay: boolean;
  animations: boolean;
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* noop (privacy mode 等で書けない場合) */
  }
}

/** prefers-reduced-motion が有効か（OS / ブラウザ設定）。 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 現在の UI 設定を取得（同期）。 */
export function getUiPrefs(): UiPrefs {
  return {
    crtOverlay: loadBool(CRT_KEY, true),
    animations: loadBool(ANIM_KEY, true),
  };
}

/** body class を最新の設定に同期する。 */
function applyUiPrefs(prefs: UiPrefs): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle(BODY_CLASS_OVERLAY_OFF, !prefs.crtOverlay);
  document.body.classList.toggle(BODY_CLASS_ANIM_OFF, !prefs.animations || prefersReducedMotion());
}

/** AppShell マウント時に呼び出す初期化。localStorage 値を body class に反映する。 */
export function initUiPrefs(): void {
  applyUiPrefs(getUiPrefs());
}

/** UI 設定の 1 項目を更新（localStorage と body class を同時に同期）。 */
export function setUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]): void {
  if (key === 'crtOverlay') saveBool(CRT_KEY, value as boolean);
  if (key === 'animations') saveBool(ANIM_KEY, value as boolean);
  applyUiPrefs(getUiPrefs());
}

/* ─────────────────────────────────────────────────────────────
 * 緊急アクション利用回数 (docs/ui_redesign_ja.md §10)
 *
 * 個人情報を含めずに「FAB がどれだけ押されているか」だけを記録し、
 * SystemPage / 開発時の UX 改善判断に使う。
 * - 上限 99999 でクリップ (オーバーフロー防止)
 * - サーバには送らない (将来 /api/metrics に POST する場合の足場として
 *   `recordQuickActionUsed` だけを export しておき、実装拡張時はここを差し替える)
 * ───────────────────────────────────────────────────────────── */

export type QuickActionKind =
  | 'quarantine_npub'
  | 'hard_ban_ip'
  | 'toggle_post_policy'
  | 'disconnect_ip';

export interface QuickActionCounts {
  total: number;
  per_action: Partial<Record<QuickActionKind, number>>;
}

function loadCounts(): QuickActionCounts {
  try {
    const raw = localStorage.getItem(QUICK_ACTION_KEY);
    if (!raw) return { total: 0, per_action: {} };
    const parsed = JSON.parse(raw) as Partial<QuickActionCounts>;
    return {
      total: Math.max(0, Number(parsed.total ?? 0) | 0),
      per_action: (parsed.per_action ?? {}) as Partial<Record<QuickActionKind, number>>,
    };
  } catch {
    return { total: 0, per_action: {} };
  }
}

function saveCounts(c: QuickActionCounts): void {
  try {
    localStorage.setItem(QUICK_ACTION_KEY, JSON.stringify(c));
  } catch {
    /* noop */
  }
}

/** 緊急アクション (FAB) が成功した時に 1 回呼ぶ。 */
export function recordQuickActionUsed(kind: QuickActionKind): void {
  const c = loadCounts();
  const prev = c.per_action[kind] ?? 0;
  c.per_action[kind] = Math.min(99999, prev + 1);
  c.total = Math.min(99999, c.total + 1);
  saveCounts(c);
}

/** 現時点の利用回数スナップショット (SystemPage 表示用)。 */
export function getQuickActionCounts(): QuickActionCounts {
  return loadCounts();
}

/** リセット (主にデバッグ・テスト用)。 */
export function resetQuickActionCounts(): void {
  try {
    localStorage.removeItem(QUICK_ACTION_KEY);
  } catch {
    /* noop */
  }
}
