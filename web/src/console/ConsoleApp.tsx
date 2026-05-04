import { Routes, Route } from 'react-router-dom';
import './design/base.css';
import './primitives/primitives.css';
import './shell/shell.css';
import { AppShell } from './shell/AppShell';
import { ToastHost } from './primitives/Toast';
import { Showroom } from './pages/Showroom';
import { Stub } from './pages/Stub';

export function ConsoleApp() {
  return (
    <ToastHost>
      <AppShell>
        <Routes>
          {/* Phase 2.0 では各画面はスタブ。Phase 2.x で順次本実装に置換する。 */}
          <Route path="/"            element={<Stub title="DASHBOARD"   description="OPS ダッシュボード。" />} />
          <Route path="/live"        element={<Stub title="LIVE EVENTS" description="SSE ライブストリーム。" />} />
          <Route path="/relays"      element={<Stub title="RELAY POOL" />} />
          <Route path="/post-pol"    element={<Stub title="POST POLICY" />} />
          <Route path="/ip-acl"      element={<Stub title="IP ACL" description="IP 制限。" />} />
          <Route path="/npub"        element={<Stub title="NPUB SAFELIST" />} />
          <Route path="/quarantine"  element={<Stub title="QUARANTINE" />} />
          <Route path="/simple-ban"  element={<Stub title="SIMPLE BAN" />} />
          <Route path="/dsl"         element={<Stub title="DSL FILTERS" />} />
          <Route path="/logs"        element={<Stub title="LOGS" />} />
          <Route path="/settings"    element={<Stub title="SETTINGS" />} />

          {/* プリミティブショールーム */}
          <Route path="/__dev"       element={<Showroom />} />
        </Routes>
      </AppShell>
    </ToastHost>
  );
}
