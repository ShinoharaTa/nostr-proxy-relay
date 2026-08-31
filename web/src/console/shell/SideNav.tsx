import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { NAV_GROUPS, isItemActive, type NavItem } from './navConfig';
import { Actors, Quarantine } from '../api';

/** 未対応件数。ナビ上で「対応が要る場所」を示すためだけの軽い集計。 */
interface Badges { block: number; quarantine: number }

export function SideNav() {
  const loc = useLocation();
  const badges = useNavBadges();

  return (
    <nav className="crt-shell__side crt-side crt-lg-up" aria-label="primary">
      <div className="crt-side__brand">
        <strong>God&apos;s Eye</strong>
        <span>nostr proxy relay</span>
      </div>

      {NAV_GROUPS.map((g) => (
        <div className="crt-side__group" key={g.id}>
          <div className="crt-side__group-label">
            <Icon name={g.icon} size={12} /> {g.label}
          </div>
          <ul className="crt-side__items">
            {g.items.map((it) => (
              <li key={it.id}>
                <NavLinkRow item={it} active={isItemActive(it.to, loc.pathname)} badges={badges} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLinkRow({ item, active, badges }: { item: NavItem; active: boolean; badges: Badges }) {
  const count = item.badge ? badges[item.badge] : 0;
  return (
    <Link
      to={item.to}
      className={`crt-side__item ${active ? 'crt-side__item--active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon name={item.icon} size={15} />
      <span className="crt-side__item-text">
        <span>{item.label}</span>
        {item.sub && <span className="crt-side__item-sub">{item.sub}</span>}
      </span>
      {count > 0 && (
        <span className="crt-side__badge" title={`${count} 件が未対応`}>{count}</span>
      )}
    </Link>
  );
}

/**
 * 「とめる」グループの未対応件数を取る。
 * - block: 直近 24h に拒否が出ていて、まだ ACL / BAN / Quarantine のどれも当たっていないアクター
 * - quarantine: 現在アクティブな隔離
 * 60 秒間隔。ナビの装飾なので失敗しても黙って 0 のままにする。
 */
function useNavBadges(): Badges {
  const [badges, setBadges] = useState<Badges>({ block: 0, quarantine: 0 });

  useEffect(() => {
    let alive = true;
    const ctl = new AbortController();

    const load = async () => {
      try {
        const [ips, npubs, q] = await Promise.all([
          Actors.topIps('24h', 'rejections', ctl.signal),
          Actors.topNpubs('24h', ctl.signal),
          Quarantine.list(ctl.signal),
        ]);
        if (!alive) return;
        const unhandledIps = ips.filter((a) => a.mode === 'normal' && a.rejections > 0).length;
        const unhandledNpubs = npubs.filter((a) => !a.banned && !a.quarantined && a.rejections > 0).length;
        setBadges({
          block: unhandledIps + unhandledNpubs,
          quarantine: q.filter((e) => e.active).length,
        });
      } catch {
        /* ナビの装飾なので握りつぶす */
      }
    };

    load();
    const id = window.setInterval(load, 60000);
    return () => { alive = false; ctl.abort(); window.clearInterval(id); };
  }, []);

  return badges;
}
