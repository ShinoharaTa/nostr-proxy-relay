import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { useI18n } from '../i18n';
import { usePalette } from '../palette/CommandPalette';
import { NAV_ITEMS, isItemActive, type NavItem } from './navConfig';
import { badgeText, useNavBadges } from './useNavBadges';

/** スマホの下部タブ（#54）。中央の ⊕ で貼る・探す */
export function BottomTab() {
  const loc = useLocation();
  const { t } = useI18n();
  const n = t.v2.nav;
  const palette = usePalette();
  const badges = useNavBadges({ home: n.badgeHome, live: n.badgeLive, settings: n.badgeSettings });

  const tab = (it: NavItem) => {
    const active = isItemActive(it.to, loc.pathname);
    const b = badges[it.id];
    return (
      <Link
        key={it.id}
        to={it.to}
        className={`v2-tab ${active ? 'is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={b ? `${n[it.id]}（${b.label}）` : undefined}
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
  };

  return (
    <nav className="v2-tabs crt-lg-down" aria-label="bottom">
      {tab(NAV_ITEMS[0])}
      {tab(NAV_ITEMS[1])}
      <button type="button" className="v2-fab" onClick={() => palette.open()} aria-label={n.searchShort}>
        <Icon name="plus" size={24} />
      </button>
      {tab(NAV_ITEMS[2])}
      {tab(NAV_ITEMS[3])}
    </nav>
  );
}
