import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { NAV_GROUPS } from './navConfig';

export function BottomTab() {
  const nav = useNavigate();
  const loc = useLocation();

  return (
    <nav className="crt-bottomtab crt-lg-down" aria-label="bottom">
      {NAV_GROUPS.map((g) => {
        const first = g.items[0];
        const active = g.items.some((it) => loc.pathname === it.to || (it.to !== '/' && loc.pathname.startsWith(it.to)));
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
