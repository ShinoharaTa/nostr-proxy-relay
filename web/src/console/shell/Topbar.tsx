import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../icons/Icon';
import { useI18n } from '../i18n';
import { Quarantine, Relays, Stats } from '../api';
import { usePalette } from '../palette/CommandPalette';
import { MODERATION_CHANGED } from '../moderation/actions';

interface Summary { up: number; enabled: number; down: string | null; rejPerMin: number | null; quarantined: number }

/** 上部バー（#54）。1 行の状態サマリと、常設の「貼る・探す」 */
export function Topbar() {
  const { t, lang, setLang } = useI18n();
  const palette = usePalette();
  const s = useSummary();
  const st = t.v2.status;
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="crt-shell__top v2-top">
      <Link to="/" className="v2-top__brand">
        <Icon name="nav-deck" size={18} />
        <span>{location.host}</span>
      </Link>
      <div className="v2-top__chips">
        {s && (
          <>
            <Link to="/settings/relays" className="v2-chip v2-chip--status" title={s.down ? `${s.down} ${st.down}` : undefined}>
              <span className={`v2-dot ${s.down ? 'v2-dot--warm' : 'v2-dot--ok'}`} />
              {st.upstream} <span className="v2-mono">{s.up}/{s.enabled}</span>
              {s.down && <span className="v2-hide-narrow v2-muted"> · {s.down.replace('wss://', '')} {st.down}</span>}
            </Link>
            {s.rejPerMin != null && (
              <span className="v2-chip v2-chip--status v2-hide-narrow">{st.rejectPerMin} <span className="v2-mono v2-deny-text">{s.rejPerMin}</span></span>
            )}
            <Link to="/roster?tab=quarantine" className="v2-chip v2-chip--status">{st.quarantined} <span className="v2-mono v2-q-text">{s.quarantined}</span></Link>
          </>
        )}
      </div>
      <button type="button" className="v2-search" onClick={() => palette.open()}>
        <Icon name="search" size={16} />
        <span className="v2-search__label">{t.v2.nav.search}</span>
        <kbd className="crt-kbd v2-hide-narrow">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <button
        type="button"
        className="v2-btn v2-btn--sm"
        onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
        aria-label="switch language"
        title={lang === 'ja' ? 'Switch to English' : '日本語に切り替え'}
      >
        {lang === 'ja' ? 'EN' : 'JA'}
      </button>
    </header>
  );
}

function useSummary(): Summary | null {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [rs, q, ts] = await Promise.all([Relays.status(), Quarantine.list(), Stats.timeseries('15m').catch(() => [])]);
        if (!alive) return;
        const enabled = rs.relays.filter((r) => r.enabled !== false);
        const up = enabled.filter((r) => r.status === 'connected');
        const down = enabled.find((r) => r.status !== 'connected');
        // 最後のバケットは集計途中なので 1 つ前を使う
        const last = ts.length >= 2 ? ts[ts.length - 2] : ts[ts.length - 1];
        setS({
          up: up.length,
          enabled: enabled.length,
          down: down?.url ?? null,
          rejPerMin: last ? last.rejections : null,
          quarantined: q.filter((x) => x.active).length,
        });
      } catch { /* 上部バーの装飾なので失敗は無視 */ }
    };
    load();
    const id = window.setInterval(load, 30_000);
    window.addEventListener(MODERATION_CHANGED, load);
    return () => { alive = false; window.clearInterval(id); window.removeEventListener(MODERATION_CHANGED, load); };
  }, []);
  return s;
}
