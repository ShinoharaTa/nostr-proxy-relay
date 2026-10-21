import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { useI18n } from '../i18n';
import { NAV_ITEMS, isItemActive } from './navConfig';
import { badgeText, useNavBadges } from './useNavBadges';

/** PC の左レール（#54）。4 項目 + バッジ */
export function SideNav() {
  const loc = useLocation();
  const { t } = useI18n();
  const n = t.v2.nav;
  const badges = useNavBadges({ home: n.badgeHome, live: n.badgeLive, settings: n.badgeSettings });

  return (
    <nav className="crt-shell__side v2-rail crt-lg-up" aria-label="primary">
      {NAV_ITEMS.map((it) => {
        const active = isItemActive(it.to, loc.pathname);
        const b = badges[it.id];
        return (
          <Link
            key={it.id}
            to={it.to}
            className={`v2-rail__item ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={b ? `${n[it.id]}（${b.label}）` : undefined}
            title={b?.label}
          >
            <span className="v2-rail__icon">
              <Icon name={it.icon} size={20} />
              {b && (b.count != null
                ? <span className={`v2-nbadge v2-nbadge--${b.tone}`}>{badgeText(b.count)}</span>
                : <span className={`v2-ndot v2-ndot--${b.tone}`} />)}
            </span>
            {n[it.id]}
          </Link>
        );
      })}
    </nav>
  );
}
