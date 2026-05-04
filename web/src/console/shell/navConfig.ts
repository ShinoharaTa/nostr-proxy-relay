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
  icon: IconName;
  items: NavItem[];
}

/** 5 グループ × ナビ項目（docs/ui_redesign_ja.md §4 IA） */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    icon: 'nav-overview',
    items: [
      { id: 'dashboard', label: 'DASHBOARD',   to: '/',         icon: 'nav-overview' },
      { id: 'live',      label: 'LIVE EVENTS', to: '/live',     icon: 'eye' },
    ],
  },
  {
    id: 'backend',
    label: 'BACKEND',
    icon: 'nav-backend',
    items: [
      { id: 'relays',     label: 'RELAY POOL',   to: '/relays',    icon: 'nav-backend' },
      { id: 'post-pol',   label: 'POST POLICY',  to: '/post-pol',  icon: 'nav-backend' },
    ],
  },
  {
    id: 'access',
    label: 'ACCESS',
    icon: 'nav-access',
    items: [
      { id: 'ip-acl',     label: 'IP ACL',       to: '/ip-acl',    icon: 'ban' },
      { id: 'safelist',   label: 'NPUB',         to: '/npub',      icon: 'eye' },
      { id: 'quarantine', label: 'QUARANTINE',   to: '/quarantine', icon: 'clock' },
    ],
  },
  {
    id: 'filter',
    label: 'FILTERING',
    icon: 'nav-filter',
    items: [
      { id: 'simple-ban', label: 'SIMPLE BAN',   to: '/simple-ban', icon: 'nav-filter' },
      { id: 'dsl',        label: 'DSL FILTERS',  to: '/dsl',        icon: 'nav-filter' },
    ],
  },
  {
    id: 'ops',
    label: 'OPS',
    icon: 'nav-ops',
    items: [
      { id: 'logs',     label: 'LOGS',     to: '/logs',     icon: 'nav-ops' },
      { id: 'settings', label: 'SETTINGS', to: '/settings', icon: 'nav-ops' },
    ],
  },
];
