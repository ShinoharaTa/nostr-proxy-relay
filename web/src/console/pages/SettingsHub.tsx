import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useInbox } from '../state/ConsoleState';
import { BackendRelays } from './BackendRelays';
import { AutoGuardPage } from './AutoGuard';
import { PostPolicyPage } from './PostPolicy';
import { KindBlocklistPage } from './KindBlocklist';
import { RulesPage } from './Rules';
import { Nip11Editor } from './Nip11Editor';
import { LogsPage } from './Logs';
import { InvestigatePage } from './Investigate';
import { SettingsPage } from './Settings';

/** 設定の項目。頻度の低い画面はすべてここに畳む（#54）。順序は使う頻度順 */
export const HUB_SECTIONS = ['relays', 'guard', 'policy', 'kind', 'dsl', 'logs', 'investigate', 'nip11', 'system'] as const;
export type HubSection = (typeof HUB_SECTIONS)[number];

const PAGES: Record<HubSection, () => React.ReactElement> = {
  relays: () => <BackendRelays />,
  guard: () => <AutoGuardPage />,
  policy: () => <PostPolicyPage />,
  kind: () => <KindBlocklistPage />,
  dsl: () => <RulesPage />,
  logs: () => <LogsPage />,
  investigate: () => <InvestigatePage />,
  nip11: () => <Nip11Editor />,
  system: () => <SettingsPage />,
};

export function SettingsHub() {
  const { t } = useI18n();
  const { section } = useParams();
  const { items } = useInbox();
  if (!section || !(HUB_SECTIONS as readonly string[]).includes(section)) {
    return <Navigate to="/settings/relays" replace />;
  }
  const relayDown = items.some((i) => i.kind === 'relay_down');
  const Page = PAGES[section as HubSection];
  return (
    <div className="v2-hub">
      <nav className="v2-hub__nav" aria-label={t.v2.hub.title}>
        {HUB_SECTIONS.map((s) => (
          <NavLink key={s} to={`/settings/${s}`} className={({ isActive }) => `v2-hub__link ${isActive ? 'is-active' : ''}`}>
            {t.v2.hub.sections[s]}
            {s === 'relays' && relayDown && <span className="v2-dot v2-dot--warm" aria-label={t.v2.nav.badgeSettings} />}
          </NavLink>
        ))}
      </nav>
      <div className="v2-hub__body">
        <Page />
      </div>
    </div>
  );
}
