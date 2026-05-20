import { useEffect, useState, type ReactNode } from 'react';
import { Topbar } from './Topbar';
import { SideNav } from './SideNav';
import { BottomTab } from './BottomTab';
import { EmergencyActionFab } from './EmergencyActionFab';
import { OfflineBar } from './OfflineBar';
import { initUiPrefs, getUiPrefs } from '../utils/uiPrefs';

interface Props {
  children: ReactNode;
  topbarRight?: ReactNode;
  liveLabel?: ReactNode;
  /** 明示的に上書きしたい時のみ指定。通常は localStorage の `profiler.crtOverlay` に従う。 */
  showCrtOverlay?: boolean;
}

/** PROFILER AppShell.
 *  ds-noise / DedSec スカル overlay は外し、CCTV 走査線 (opacity 0.10) のみ。
 *  - localStorage の UI prefs を mount 時に body class に反映
 *  - OfflineBar (オフライン検出) を最上位に置く
 */
export function AppShell({ children, topbarRight, liveLabel, showCrtOverlay }: Props) {
  // SystemPage から prefs が変わったとき再レンダーする最小フック。
  const [overlayOn, setOverlayOn] = useState<boolean>(() => getUiPrefs().crtOverlay);

  useEffect(() => {
    initUiPrefs();
    setOverlayOn(getUiPrefs().crtOverlay);

    // storage イベントは「別タブ」での変更を拾う。同タブの SystemPage は body class を
    // 直接 toggle するので overlay の DOM はそのまま消えるが、ここでも追従しておく。
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'profiler.crtOverlay' || e.key === 'profiler.animations') {
        setOverlayOn(getUiPrefs().crtOverlay);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const effectiveOverlay = showCrtOverlay ?? overlayOn;

  return (
    <div className="crt-app">
      <OfflineBar />
      <div className="crt-shell">
        <SideNav />
        <Topbar right={topbarRight} liveLabel={liveLabel} />
        <main className="crt-shell__main" id="main">
          {children}
        </main>
      </div>
      <BottomTab />
      <EmergencyActionFab />
      {effectiveOverlay && <div className="crt-overlay" aria-hidden="true" />}
    </div>
  );
}
