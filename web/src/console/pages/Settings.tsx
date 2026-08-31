import { SystemPanel } from './SystemPage';
import { TelemetryPanel } from './Telemetry';

/**
 * システム（Issue #29）。
 * Telemetry は独立した画面にするほどの分量がなく（設定と接続テストのみ）、
 * 環境・保持・ディスクと並ぶ「運用設定」の 1 セクションとして System に同居させる。
 */
export function SettingsPage() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <SystemPanel />
      <TelemetryPanel />
    </div>
  );
}
