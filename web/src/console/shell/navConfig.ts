import type { IconName } from '../icons/Icon';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: IconName;
}

export interface NavGroup {
  id: string;
  label: string;
  /** Bottom Tab / 折りたたみ時に出すアイコン */
  icon: IconName;
  items: NavItem[];
}

/**
 * 5 グループ × ナビ項目（docs/ui_redesign_ja.md §3.2 IA + §4 URL マップ）。
 * - URL は `/console/...` 配下を前提に **basename を抜いた** 相対パスで定義
 *   (ConsoleApp は basename="/console" の <BrowserRouter> 配下)
 * - 命名は §3.3 命名統一表に準拠
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    icon: 'nav-overview',
    items: [
      { id: 'dashboard', label: 'DASHBOARD',   to: '/',         icon: 'nav-overview' },
      { id: 'live',      label: 'LIVE EVENTS', to: '/live',     icon: 'eye' },
      { id: 'logs',      label: 'LOGS',        to: '/logs',     icon: 'nav-ops' },
    ],
  },
  {
    id: 'backend',
    label: 'BACKEND',
    icon: 'nav-backend',
    items: [
      { id: 'relays', label: 'BACKEND RELAYS', to: '/backend/relays', icon: 'nav-backend' },
      { id: 'nip11',  label: 'NIP-11',         to: '/backend/nip11',  icon: 'nav-backend' },
    ],
  },
  {
    id: 'access',
    label: 'ACCESS',
    icon: 'nav-access',
    items: [
      { id: 'post-policy', label: 'POST POLICY', to: '/access/post-policy', icon: 'nav-access' },
      { id: 'npub',        label: 'NPUB',        to: '/access/npub',        icon: 'eye' },
      { id: 'ip',          label: 'IP ACL',      to: '/access/ip',          icon: 'ban' },
      { id: 'quarantine',  label: 'QUARANTINE',  to: '/access/quarantine',  icon: 'clock' },
    ],
  },
  {
    id: 'filter',
    label: 'FILTERING',
    icon: 'nav-filter',
    items: [
      { id: 'kind',      label: 'KIND BLOCKLIST', to: '/filter/kind',      icon: 'nav-filter' },
      { id: 'dsl',       label: 'DSL RULES',      to: '/filter/dsl',       icon: 'nav-filter' },
      { id: 'quick-ban', label: 'QUICK BAN',      to: '/filter/quick-ban', icon: 'ban' },
    ],
  },
  {
    id: 'ops',
    label: 'OPERATIONS',
    icon: 'nav-ops',
    items: [
      { id: 'telemetry', label: 'TELEMETRY', to: '/operations/telemetry', icon: 'nav-ops' },
      { id: 'system',    label: 'SYSTEM',    to: '/operations/system',    icon: 'nav-ops' },
    ],
  },
];

/** 階層深さに応じて active 判定。`/console/access/ip` のとき `/access/ip` が一致。 */
export function isItemActive(itemTo: string, currentPath: string): boolean {
  if (itemTo === '/') return currentPath === '/' || currentPath === '';
  return currentPath === itemTo || currentPath.startsWith(`${itemTo}/`);
}

export function isGroupActive(group: NavGroup, currentPath: string): boolean {
  return group.items.some((it) => isItemActive(it.to, currentPath));
}
