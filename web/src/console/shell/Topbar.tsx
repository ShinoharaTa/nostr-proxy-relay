import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { StatusDot } from '../primitives/StatusDot';
import { useI18n } from '../i18n';

interface Props {
  title?: ReactNode;
  /** 中央に出すライブステータス */
  liveLabel?: ReactNode;
  /** 右側に置く操作群 */
  right?: ReactNode;
  /** モバイルでナビ起動時 */
  onMenu?: () => void;
}

/** GOD'S EYE Topbar
 *  - スカル・グリッチ・ステンシルは無し
 *  - "{>>} God's Eye" 1 行のみ。HUD タグは犯罪分析報告風に控えめに */
export function Topbar({ title = "God's Eye", liveLabel = 'Online', right, onMenu }: Props) {
  const { lang, setLang } = useI18n();
  return (
    <header className="crt-shell__top crt-topbar">
      <div className="crt-topbar__brand">
        {onMenu && (
          <button
            className="crt-btn crt-btn--ghost crt-btn--icon crt-lg-down"
            onClick={onMenu}
            aria-label="open menu"
          >
            <Icon name="nav-filter" />
          </button>
        )}
        <span className="crt-topbar__title">{title}</span>
        <span className="crt-hud-tag crt-hide-sm">nostr proxy</span>
      </div>

      <div className="crt-topbar__center crt-hide-sm">
        <StatusDot variant="live">{liveLabel}</StatusDot>
        <span className="crt-hud-tag">uplink ok</span>
      </div>

      <div className="crt-topbar__right">
        <button
          className="crt-btn crt-btn--ghost"
          onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
          aria-label="switch language"
          title={lang === 'ja' ? 'Switch to English' : '日本語に切り替え'}
        >
          {lang === 'ja' ? 'EN' : 'JA'}
        </button>
        {right}
      </div>
    </header>
  );
}
