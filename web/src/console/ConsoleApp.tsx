import { Routes, Route, Navigate } from 'react-router-dom';
import './design/base.css';
import './primitives/primitives.css';
import './shell/shell.css';
import './design/v2.css';
import { AppShell } from './shell/AppShell';
import { ConsoleI18nProvider } from './i18n';
import { ToastHost } from './primitives/Toast';
import { ConfirmHost } from './primitives/ConfirmHost';
import { ConsoleStateProvider } from './state/ConsoleState';
import { TargetProvider } from './target/TargetCard';
import { PaletteProvider } from './palette/CommandPalette';
import { Showroom } from './pages/Showroom';
import { HomePage } from './pages/Home';
import { LiveEvents } from './pages/LiveEvents';
import { RosterPage } from './pages/Roster';
import { SettingsHub } from './pages/SettingsHub';

/**
 * 管理コンソール（#52 で再設計）。
 * - basename="/console" の `<BrowserRouter>` 配下で動作
 * - ナビは ホーム / ライブ / 名簿 / 設定 の 4 つ。措置は対象カードと ⌘K に集約
 * - 旧 URL はすべて redirect を残す（ブックマーク保護）
 */
export function ConsoleApp() {
  return (
    <ConsoleI18nProvider>
    <ToastHost>
      <ConfirmHost>
      <ConsoleStateProvider>
      <TargetProvider>
      <PaletteProvider>
      <AppShell>
        <Routes>
          <Route path="/"                  element={<HomePage />} />
          <Route path="/live"              element={<LiveEvents />} />
          <Route path="/roster"            element={<RosterPage />} />
          <Route path="/settings"          element={<Navigate to="/settings/relays" replace />} />
          <Route path="/settings/:section" element={<SettingsHub />} />

          {/* プリミティブショールーム (開発用) */}
          <Route path="/__dev" element={<Showroom />} />

          {/* ── 旧 URL の互換 redirect ── */}
          <Route path="/investigate"        element={<RedirectKeepQuery to="/settings/investigate" />} />
          <Route path="/logs"               element={<Navigate to="/settings/logs" replace />} />
          <Route path="/block"              element={<Navigate to="/roster" replace />} />
          <Route path="/quarantine"         element={<Navigate to="/roster?tab=quarantine" replace />} />
          <Route path="/auto-guard"         element={<Navigate to="/settings/guard" replace />} />
          <Route path="/policy"             element={<Navigate to="/settings/policy" replace />} />
          <Route path="/kind"               element={<Navigate to="/settings/kind" replace />} />
          <Route path="/dsl"                element={<Navigate to="/settings/dsl" replace />} />
          <Route path="/relays"             element={<Navigate to="/settings/relays" replace />} />
          <Route path="/nip11"              element={<Navigate to="/settings/nip11" replace />} />
          <Route path="/system"             element={<Navigate to="/settings/system" replace />} />
          <Route path="/dashboard"          element={<Navigate to="/" replace />} />
          <Route path="/deck"               element={<Navigate to="/" replace />} />
          <Route path="/access/npub"        element={<Navigate to="/roster" replace />} />
          <Route path="/access/ip"          element={<Navigate to="/roster?tab=ip" replace />} />
          <Route path="/access/quarantine"  element={<Navigate to="/roster?tab=quarantine" replace />} />
          <Route path="/access/post-policy" element={<Navigate to="/settings/policy" replace />} />
          <Route path="/filter/kind"        element={<Navigate to="/settings/kind" replace />} />
          <Route path="/filter/dsl"         element={<Navigate to="/settings/dsl" replace />} />
          <Route path="/filter/quick-ban"   element={<Navigate to="/settings/dsl" replace />} />
          <Route path="/filter/auto-guard"  element={<Navigate to="/settings/guard" replace />} />
          <Route path="/backend/relays"     element={<Navigate to="/settings/relays" replace />} />
          <Route path="/backend/nip11"      element={<Navigate to="/settings/nip11" replace />} />
          <Route path="/operations/telemetry" element={<Navigate to="/settings/system" replace />} />
          <Route path="/operations/system"    element={<Navigate to="/settings/system" replace />} />
          <Route path="/npub"       element={<Navigate to="/roster" replace />} />
          <Route path="/ip-acl"     element={<Navigate to="/roster?tab=ip" replace />} />
          <Route path="/post-pol"   element={<Navigate to="/settings/policy" replace />} />
          <Route path="/simple-ban" element={<Navigate to="/settings/dsl" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      </PaletteProvider>
      </TargetProvider>
      </ConsoleStateProvider>
      </ConfirmHost>
    </ToastHost>
    </ConsoleI18nProvider>
  );
}

/** `?authors=` などのクエリを保ったまま移す（調査画面への直リンク用） */
function RedirectKeepQuery({ to }: { to: string }) {
  return <Navigate to={`${to}${window.location.search}`} replace />;
}
