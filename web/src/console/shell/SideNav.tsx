import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { NAV_GROUPS, isItemActive } from './navConfig';

export function SideNav() {
  const loc = useLocation();
  return (
    <nav className="crt-shell__side crt-side crt-lg-up" aria-label="primary">
      <div className="crt-side__brand">
        <strong>Profiler</strong>
        <span>nostr proxy relay</span>
      </div>

      {NAV_GROUPS.map((g) => (
        <div className="crt-side__group" key={g.id}>
          <div className="crt-side__group-label">
            <Icon name={g.icon} size={14} /> {g.label}
          </div>
          <ul className="crt-side__items">
            {g.items.map((it) => {
              const active = isItemActive(it.to, loc.pathname);
              return (
                <li key={it.id}>
                  <Link
                    to={it.to}
                    className={`crt-side__item ${active ? 'crt-side__item--active' : ''}`}
                  >
                    <Icon name={it.icon} size={14} />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
