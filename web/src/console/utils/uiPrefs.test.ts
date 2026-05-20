/**
 * uiPrefs.ts の純粋なロジック (localStorage 周りとカウンタ集計) のみテスト。
 * body class や matchMedia の DOM 副作用は最小限のモックで吸収する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// localStorage / document / matchMedia のシム
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string)        { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string)     { this.store.delete(k); }
  clear()                   { this.store.clear(); }
}

const storage = new MemoryStorage();
const bodyClassList = new Set<string>();

beforeEach(() => {
  storage.clear();
  bodyClassList.clear();

  // localStorage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = storage;
  // document.body.classList (toggle のみ uiPrefs が利用)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).document = {
    body: {
      classList: {
        toggle: (name: string, force: boolean) => {
          if (force) bodyClassList.add(name);
          else bodyClassList.delete(name);
        },
      },
    },
  };
  // window.matchMedia: prefers-reduced-motion は false 既定 (上書きはテスト内で)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    matchMedia: vi.fn((_q: string) => ({ matches: false })),
  };
  // module キャッシュをリセットして、初期化済み状態を持ち込まないようにする
  vi.resetModules();
});

async function loadModule() {
  return await import('./uiPrefs');
}

describe('getUiPrefs / setUiPref', () => {
  it('defaults are crtOverlay=true / animations=true', async () => {
    const m = await loadModule();
    expect(m.getUiPrefs()).toEqual({ crtOverlay: true, animations: true });
  });

  it('setUiPref persists to localStorage and updates body class', async () => {
    const m = await loadModule();
    m.setUiPref('crtOverlay', false);
    expect(storage.getItem('profiler.crtOverlay')).toBe('0');
    expect(bodyClassList.has('crt-overlay-off')).toBe(true);

    m.setUiPref('crtOverlay', true);
    expect(storage.getItem('profiler.crtOverlay')).toBe('1');
    expect(bodyClassList.has('crt-overlay-off')).toBe(false);
  });

  it('animations OFF adds body class regardless of reduced-motion', async () => {
    const m = await loadModule();
    m.setUiPref('animations', false);
    expect(bodyClassList.has('crt-animations-off')).toBe(true);
  });

  it('prefers-reduced-motion forces animations OFF even if pref is ON', async () => {
    // matchMedia を reduce 有効に差し替えてからモジュールを読み直し
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.matchMedia = vi.fn(() => ({ matches: true }));
    const m = await loadModule();
    // animations 設定は ON のまま (default)。reduced-motion で off クラスが付くこと。
    m.initUiPrefs();
    expect(bodyClassList.has('crt-animations-off')).toBe(true);
    expect(m.prefersReducedMotion()).toBe(true);
  });
});

describe('initUiPrefs', () => {
  it('applies saved values to body class', async () => {
    storage.setItem('profiler.crtOverlay', '0');
    storage.setItem('profiler.animations', '0');
    const m = await loadModule();
    m.initUiPrefs();
    expect(bodyClassList.has('crt-overlay-off')).toBe(true);
    expect(bodyClassList.has('crt-animations-off')).toBe(true);
  });
});

describe('recordQuickActionUsed / getQuickActionCounts', () => {
  it('starts at zero', async () => {
    const m = await loadModule();
    expect(m.getQuickActionCounts()).toEqual({ total: 0, per_action: {} });
  });

  it('increments per-action and total', async () => {
    const m = await loadModule();
    m.recordQuickActionUsed('hard_ban_ip');
    m.recordQuickActionUsed('hard_ban_ip');
    m.recordQuickActionUsed('quarantine_npub');
    const c = m.getQuickActionCounts();
    expect(c.total).toBe(3);
    expect(c.per_action.hard_ban_ip).toBe(2);
    expect(c.per_action.quarantine_npub).toBe(1);
    expect(c.per_action.disconnect_ip).toBeUndefined();
  });

  it('persists across module re-imports (= page reloads)', async () => {
    const m1 = await loadModule();
    m1.recordQuickActionUsed('toggle_post_policy');
    // resetModules で読み直しても localStorage シムは生きている
    vi.resetModules();
    const m2 = await loadModule();
    expect(m2.getQuickActionCounts().total).toBe(1);
    expect(m2.getQuickActionCounts().per_action.toggle_post_policy).toBe(1);
  });

  it('clips at 99999 to avoid overflow', async () => {
    const m = await loadModule();
    storage.setItem(
      'profiler.quickActionCount',
      JSON.stringify({ total: 99999, per_action: { hard_ban_ip: 99999 } }),
    );
    m.recordQuickActionUsed('hard_ban_ip');
    const c = m.getQuickActionCounts();
    expect(c.total).toBe(99999);
    expect(c.per_action.hard_ban_ip).toBe(99999);
  });

  it('resetQuickActionCounts clears storage', async () => {
    const m = await loadModule();
    m.recordQuickActionUsed('disconnect_ip');
    m.resetQuickActionCounts();
    expect(m.getQuickActionCounts()).toEqual({ total: 0, per_action: {} });
  });

  it('tolerates corrupted JSON gracefully', async () => {
    storage.setItem('profiler.quickActionCount', '{not json');
    const m = await loadModule();
    expect(m.getQuickActionCounts()).toEqual({ total: 0, per_action: {} });
  });
});
