import { Routes, Route, Navigate } from 'react-router-dom';
import './design/base.css';
import './primitives/primitives.css';
import './shell/shell.css';
import { AppShell } from './shell/AppShell';
import { ToastHost } from './primitives/Toast';
import { Showroom } from './pages/Showroom';
import { Dashboard } from './pages/Dashboard';
import { LiveEvents } from './pages/LiveEvents';
import { LogsPage } from './pages/Logs';
import { BackendRelays } from './pages/BackendRelays';
import { Nip11Editor } from './pages/Nip11Editor';
import { PostPolicyPage } from './pages/PostPolicy';
import { NpubPage } from './pages/Npub';
import { IpAclPage } from './pages/IpAcl';
import { QuarantinePage } from './pages/Quarantine';
import { KindBlocklistPage } from './pages/KindBlocklist';
import { DslRulesPage } from './pages/DslRules';
import { QuickBanPage } from './pages/QuickBan';
import { TelemetryPage } from './pages/Telemetry';
import { SystemPage } from './pages/SystemPage';

/**
 * 新管理コンソール (Phase 2)。
 * - basename="/console" の `<BrowserRouter>` 配下で動作
 * - URL マップは docs/ui_redesign_ja.md §4 を厳守
 * - 命名は §3.3 命名統一表に準拠
 */
export function ConsoleApp() {
  return (
    <ToastHost>
      <AppShell>
        <Routes>
          {/* OVERVIEW */}
          <Route path="/"     element={<Dashboard />} />
          <Route path="/live" element={<LiveEvents />} />
          <Route path="/logs" element={<LogsPage />} />

          {/* BACKEND */}
          <Route path="/backend/relays" element={<BackendRelays />} />
          <Route path="/backend/nip11"  element={<Nip11Editor />} />

          {/* ACCESS CONTROL */}
          <Route path="/access/post-policy" element={<PostPolicyPage />} />
          <Route path="/access/npub"        element={<NpubPage />} />
          <Route path="/access/ip"          element={<IpAclPage />} />
          <Route path="/access/quarantine"  element={<QuarantinePage />} />

          {/* FILTERING */}
          <Route path="/filter/kind"      element={<KindBlocklistPage />} />
          <Route path="/filter/dsl"       element={<DslRulesPage />} />
          <Route path="/filter/quick-ban" element={<QuickBanPage />} />

          {/* OPERATIONS */}
          <Route path="/operations/telemetry" element={<TelemetryPage />} />
          <Route path="/operations/system"    element={<SystemPage />} />

          {/* プリミティブショールーム (開発用) */}
          <Route path="/__dev" element={<Showroom />} />

          {/* 旧 URL の互換用 fallback */}
          <Route path="/dashboard"  element={<Navigate to="/" replace />} />
          <Route path="/relays"     element={<Navigate to="/backend/relays" replace />} />
          <Route path="/post-pol"   element={<Navigate to="/access/post-policy" replace />} />
          <Route path="/ip-acl"     element={<Navigate to="/access/ip" replace />} />
          <Route path="/npub"       element={<Navigate to="/access/npub" replace />} />
          <Route path="/quarantine" element={<Navigate to="/access/quarantine" replace />} />
          <Route path="/simple-ban" element={<Navigate to="/filter/quick-ban" replace />} />
          <Route path="/dsl"        element={<Navigate to="/filter/dsl" replace />} />
          <Route path="/settings"   element={<Navigate to="/operations/system" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ToastHost>
  );
}
