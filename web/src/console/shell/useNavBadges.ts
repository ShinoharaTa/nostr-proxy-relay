import { useEffect } from 'react';
import { useInbox, useLive } from '../state/ConsoleState';
import type { NavId } from './navConfig';

export interface NavBadge {
  /** 数字を出すなら件数、点だけなら null */
  count: number | null;
  /** hot = 恒久の判断が要るものがある、warm = それ以外 */
  tone: 'hot' | 'warm';
  label: string;
}

/**
 * ナビのバッジ（#54）。
 * - ホーム: 要対応の件数。拒否急増（恒久判断の候補）があれば hot
 * - ライブ: 最後に見てから拒否があれば点（数字にすると常に増えて無視されるため）
 * - 設定: 上流リレーの不調があれば点
 * - 名簿: 出さない（常にある情報で、知らせるものがない）
 * あわせてタブ名とアプリアイコンにも要対応件数を出す。
 */
export function useNavBadges(labels: { home: (n: number) => string; live: string; settings: string }): Partial<Record<NavId, NavBadge>> {
  const { items } = useInbox();
  const { unseenRejections } = useLive();
  const count = items.length;

  useEffect(() => {
    document.title = `${count > 0 ? `(${count}) ` : ''}${location.host} console`;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
      else nav.clearAppBadge?.()?.catch(() => {});
    } catch { /* 未対応ブラウザ */ }
  }, [count]);

  const badges: Partial<Record<NavId, NavBadge>> = {};
  if (count > 0) {
    const hot = items.some((i) => i.kind === 'npub_surge' || i.kind === 'ip_surge');
    badges.home = { count, tone: hot ? 'hot' : 'warm', label: labels.home(count) };
  }
  if (unseenRejections > 0) badges.live = { count: null, tone: 'hot', label: labels.live };
  if (items.some((i) => i.kind === 'relay_down')) badges.settings = { count: null, tone: 'warm', label: labels.settings };
  return badges;
}

export function badgeText(n: number): string {
  return n > 99 ? '99+' : String(n);
}
