import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { NAV_GROUPS, isGroupActive } from './navConfig';

export function BottomTab() {
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <nav className="crt-bottomtab crt-lg-down" aria-label="bottom">
      {NAV_GROUPS.map((g) => {
        const first = g.items[0];
        const active = isGroupActive(g, loc.pathname);
        return (
          <button
            key={g.id}
            className={`crt-bottomtab__btn ${active ? 'crt-bottomtab__btn--active' : ''}`}
            onClick={() => nav(first.to)}
            type="button"
          >
            <Icon name={g.icon} size={18} />
            {g.label}
          </button>
        );
      })}
    </nav>
  );
}
