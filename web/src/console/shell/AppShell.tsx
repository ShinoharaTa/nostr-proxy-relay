import type { ReactNode } from 'react';
import { Topbar } from './Topbar';
import { SideNav } from './SideNav';
import { BottomTab } from './BottomTab';
import { EmergencyActionFab } from './EmergencyActionFab';

interface Props {
  children: ReactNode;
  topbarRight?: ReactNode;
  liveLabel?: ReactNode;
  showCrtOverlay?: boolean;
}

/** PROFILER AppShell.
 *  ds-noise / DedSec スカル overlay は外し、CCTV 走査線 (opacity 0.10) のみ。
 */
export function AppShell({ children, topbarRight, liveLabel, showCrtOverlay = true }: Props) {
  return (
    <div className="crt-app">
      <div className="crt-shell">
        <SideNav />
        <Topbar right={topbarRight} liveLabel={liveLabel} />
        <main className="crt-shell__main" id="main">
          {children}
        </main>
      </div>
      <BottomTab />
      <EmergencyActionFab />
      {showCrtOverlay && <div className="crt-overlay" aria-hidden="true" />}
    </div>
  );
}
