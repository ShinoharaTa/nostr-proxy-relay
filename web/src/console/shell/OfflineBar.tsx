import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * ネット切断中・API 連続失敗中に画面上部に出る永続バー (docs/ui_redesign_ja.md §7.6)。
 * - `navigator.onLine` と online/offline イベントで基本制御
 * - 加えて `notifyApiUnreachable()` で fetch 失敗側からも 5 秒間に限り表示できるフックを公開
 *
 * 走査線 (`.crt-overlay`) とは別レイヤで、`z-index` を最上位に置く。
 */

type Listener = (offline: boolean) => void;
const listeners = new Set<Listener>();

let apiUnreachableUntil = 0;

/** fetch 系コードから「API に到達できない」を通知する場合に呼ぶ（5 秒間バーを出す）。 */
export function notifyApiUnreachable(): void {
  apiUnreachableUntil = Date.now() + 5000;
  listeners.forEach((l) => l(true));
}

function isOffline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return apiUnreachableUntil > Date.now();
}

export function OfflineBar() {
  const { t } = useI18n();
  const [offline, setOffline] = useState<boolean>(() => isOffline());

  useEffect(() => {
    const update = () => setOffline(isOffline());
    const onListener: Listener = () => update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    listeners.add(onListener);

    // apiUnreachableUntil の経過チェック（バーが自動で消えるように）
    const interval = window.setInterval(update, 1000);

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      listeners.delete(onListener);
      window.clearInterval(interval);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="crt-offline-bar" role="status" aria-live="polite">
      <span className="crt-offline-bar__dot" aria-hidden="true" />
      <span className="crt-offline-bar__text">
        {navigator.onLine === false ? t.offline.browserOffline : t.offline.apiUnreachable}
      </span>
    </div>
  );
}
