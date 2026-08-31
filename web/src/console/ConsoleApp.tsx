import { Routes, Route, Navigate } from 'react-router-dom';
import './design/base.css';
import './primitives/primitives.css';
import './shell/shell.css';
import { AppShell } from './shell/AppShell';
import { ConsoleI18nProvider } from './i18n';
import { ToastHost } from './primitives/Toast';
import { ConfirmHost } from './primitives/ConfirmHost';
import { Showroom } from './pages/Showroom';
import { DeckPage } from './pages/Deck';
import { LiveEvents } from './pages/LiveEvents';
import { LogsPage } from './pages/Logs';
import { BackendRelays } from './pages/BackendRelays';
import { Nip11Editor } from './pages/Nip11Editor';
import { PostPolicyPage } from './pages/PostPolicy';
import { BlockPage } from './pages/Block';
import { QuarantinePage } from './pages/Quarantine';
import { KindBlocklistPage } from './pages/KindBlocklist';
import { RulesPage } from './pages/Rules';
import { AutoGuardPage } from './pages/AutoGuard';
import { SettingsPage } from './pages/Settings';

/**
 * 管理コンソール。
 * - basename="/console" の `<BrowserRouter>` 配下で動作
 * - IA / URL マップは docs/ui_redesign_ja.md §15（Issue #29 で再編）
 * - 旧 URL はすべて redirect を残す（ブックマーク保護）
 */
export function ConsoleApp() {
  return (
    <ConsoleI18nProvider>
    <ToastHost>
      <ConfirmHost>
      <AppShell>
        <Routes>
          {/* みる */}
          <Route path="/"     element={<DeckPage />} />
          <Route path="/live" element={<LiveEvents />} />
          <Route path="/logs" element={<LogsPage />} />

          {/* とめる */}
          <Route path="/block"      element={<BlockPage />} />
          <Route path="/quarantine" element={<QuarantinePage />} />
          <Route path="/auto-guard" element={<AutoGuardPage />} />

          {/* ルール */}
          <Route path="/policy" element={<PostPolicyPage />} />
          <Route path="/kind"   element={<KindBlocklistPage />} />
          <Route path="/dsl"    element={<RulesPage />} />

          {/* つなぐ */}
          <Route path="/relays" element={<BackendRelays />} />
          <Route path="/nip11"  element={<Nip11Editor />} />

          {/* 設定 */}
          <Route path="/system" element={<SettingsPage />} />

          {/* プリミティブショールーム (開発用) */}
          <Route path="/__dev" element={<Showroom />} />

          {/* ── 旧 URL の互換 redirect ──
              Phase 2 の 5 グループ構成 (/access/*, /filter/*, /backend/*, /operations/*) と
              さらに旧い平坦 URL の両方を受ける。 */}
          <Route path="/dashboard"          element={<Navigate to="/" replace />} />
          <Route path="/deck"               element={<Navigate to="/" replace />} />
          <Route path="/access/npub"        element={<Navigate to="/block" replace />} />
          <Route path="/access/ip"          element={<Navigate to="/block" replace />} />
          <Route path="/access/quarantine"  element={<Navigate to="/quarantine" replace />} />
          <Route path="/access/post-policy" element={<Navigate to="/policy" replace />} />
          <Route path="/filter/kind"        element={<Navigate to="/kind" replace />} />
          <Route path="/filter/dsl"         element={<Navigate to="/dsl" replace />} />
          <Route path="/filter/quick-ban"   element={<Navigate to="/dsl" replace />} />
          <Route path="/filter/auto-guard"  element={<Navigate to="/auto-guard" replace />} />
          <Route path="/backend/relays"     element={<Navigate to="/relays" replace />} />
          <Route path="/backend/nip11"      element={<Navigate to="/nip11" replace />} />
          <Route path="/operations/telemetry" element={<Navigate to="/system" replace />} />
          <Route path="/operations/system"    element={<Navigate to="/system" replace />} />
          <Route path="/npub"       element={<Navigate to="/block" replace />} />
          <Route path="/ip-acl"     element={<Navigate to="/block" replace />} />
          <Route path="/post-pol"   element={<Navigate to="/policy" replace />} />
          <Route path="/simple-ban" element={<Navigate to="/dsl" replace />} />
          <Route path="/settings"   element={<Navigate to="/system" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      </ConfirmHost>
    </ToastHost>
    </ConsoleI18nProvider>
  );
}
