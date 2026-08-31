import type { IconName } from '../icons/Icon';

export interface NavItem {
  id: string;
  /** 主ラベル（日本語）。「何ができる画面か」が読める動詞・名詞で */
  label: string;
  /** 補足（英語の元名称や一言説明）。主ラベルの下に小さく出す */
  sub?: string;
  to: string;
  icon: IconName;
  /** 未対応件数バッジを出すキー（AppShell 側で件数を解決する） */
  badge?: 'block' | 'quarantine';
}

export interface NavGroup {
  id: string;
  label: string;
  /** Bottom Tab / 折りたたみ時に出すアイコン */
  icon: IconName;
  items: NavItem[];
}

/**
 * ナビゲーション定義（Issue #29 / docs/ui_redesign_ja.md §15）。
 *
 * 設計原則:
 * - グループは**運用者の意図**で切る（実装都合の ACCESS / FILTERING はやめた）
 * - ラベルは日本語で「何ができるか」、`sub` に元の英語名を残して移行の手掛かりにする
 * - **アイコンは全項目で固有**にする（重複させると見分けの助けにならずノイズになる）
 * - URL は `/console/...` 配下を前提に basename を抜いた相対パスで定義
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'watch',
    label: 'みる',
    icon: 'grp-watch',
    items: [
      { id: 'deck', label: '管制卓', sub: '全体状況と要対応', to: '/',      icon: 'nav-deck' },
      { id: 'live', label: 'ライブ', sub: '流れているイベント', to: '/live', icon: 'nav-live' },
      { id: 'logs', label: 'ログ',   sub: '接続 / 拒否 / リレー', to: '/logs', icon: 'nav-log' },
      { id: 'investigate', label: '調査', sub: '出所とパターンを解析', to: '/investigate', icon: 'nav-investigate' },
    ],
  },
  {
    id: 'stop',
    label: 'とめる',
    icon: 'nav-block',
    items: [
      { id: 'block',      label: 'ブロック',   sub: 'npub・IP をまとめて', to: '/block',      icon: 'nav-block',       badge: 'block' },
      { id: 'quarantine', label: '一時停止',   sub: 'Quarantine（時限）',  to: '/quarantine', icon: 'nav-pause-timed', badge: 'quarantine' },
      { id: 'guard',      label: '自動ガード', sub: '閾値とその発火',      to: '/auto-guard', icon: 'nav-guard' },
    ],
  },
  {
    id: 'rules',
    label: 'ルール',
    icon: 'nav-policy',
    items: [
      { id: 'policy', label: '投稿ポリシー', sub: '誰の投稿を受けるか', to: '/policy', icon: 'nav-policy' },
      { id: 'kind',   label: 'kind 制限',   sub: '種別で弾く',         to: '/kind',   icon: 'nav-kind' },
      { id: 'dsl',    label: 'DSL ルール',  sub: '条件式で弾く',       to: '/dsl',    icon: 'nav-dsl' },
    ],
  },
  {
    id: 'uplink',
    label: 'つなぐ',
    icon: 'nav-uplink',
    items: [
      { id: 'relays', label: '上流リレー',   sub: '接続先と読み書き',   to: '/relays', icon: 'nav-uplink' },
      { id: 'nip11',  label: 'リレー情報',   sub: 'NIP-11 公開情報',    to: '/nip11',  icon: 'nav-info' },
    ],
  },
  {
    id: 'settings',
    label: '設定',
    icon: 'nav-system',
    items: [
      { id: 'system', label: 'システム', sub: '計測・環境・保持', to: '/system', icon: 'nav-system' },
    ],
  },
];

/** 階層深さに応じて active 判定。`/console/block` のとき `/block` が一致。 */
export function isItemActive(itemTo: string, currentPath: string): boolean {
  if (itemTo === '/') return currentPath === '/' || currentPath === '';
  return currentPath === itemTo || currentPath.startsWith(`${itemTo}/`);
}

export function isGroupActive(group: NavGroup, currentPath: string): boolean {
  return group.items.some((it) => isItemActive(it.to, currentPath));
}
