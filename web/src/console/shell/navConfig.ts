import type { IconName } from '../icons/Icon';

/**
 * ナビゲーション（#54 / docs/ui_redesign_ja.md §16）。
 *
 * 機能ごとの 13 画面をやめ、対象中心の 4 項目にした。措置は対象カードと ⌘K に集め、
 * 頻度の低い画面は「設定」に畳む。バッジは「知らせるべきもの」がある項目にだけ出す。
 */
export type NavId = 'home' | 'live' | 'roster' | 'settings';

export interface NavItem {
  id: NavId;
  to: string;
  icon: IconName;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', to: '/', icon: 'nav-home' },
  { id: 'live', to: '/live', icon: 'nav-live' },
  { id: 'roster', to: '/roster', icon: 'nav-roster' },
  { id: 'settings', to: '/settings', icon: 'nav-system' },
];

/** `/console/settings/relays` のとき `/settings` が一致 */
export function isItemActive(itemTo: string, currentPath: string): boolean {
  if (itemTo === '/') return currentPath === '/' || currentPath === '';
  return currentPath === itemTo || currentPath.startsWith(`${itemTo}/`);
}
