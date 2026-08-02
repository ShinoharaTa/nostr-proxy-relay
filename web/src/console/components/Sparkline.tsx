import { useMemo } from 'react';
import type { StatsTimeseriesBucket } from '../api/types';
import { useI18n } from '../i18n';

interface Props {
  data: StatsTimeseriesBucket[];
  height?: number;
  /** 表示シリーズ */
  series?: ReadonlyArray<'posted' | 'delivered' | 'rejections'>;
}

const SERIES_COLOR: Record<string, string> = {
  posted:     'var(--crt-info)',
  delivered:  'var(--crt-accent)',
  rejections: 'var(--crt-danger)',
};

const SERIES_LABEL: Record<string, string> = {
  posted:     'POSTED',
  delivered:  'DELIVERED',
  rejections: 'REJECTED',
};

/**
 * シンプルな 3 シリーズ折れ線スパークライン (SVG)。
 * Chart ライブラリは入れず、自前で `viewBox` を切ってパスを描く。
 * docs/ui_redesign_ja.md §5.1 / §5.2 のチャート要件に対応。
 */
export function Sparkline({ data, height = 160, series = ['posted', 'delivered', 'rejections'] }: Props) {
  const { t } = useI18n();
  const { paths, max, ticks, width } = useMemo(() => buildChart(data, series), [data, series]);

  if (data.length === 0) {
    return (
      <div className="crt-empty" style={{ minHeight: height }}>
        <div className="crt-empty__title">NO DATA</div>
        <div>{t.sparkline.empty}</div>
      </div>
    );
  }

  return (
    <div className="crt-spark">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        role="img"
        aria-label="event timeseries"
      >
        {/* グリッド (4 横線) */}
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={0} x2={width}
            y1={height * p} y2={height * p}
            stroke="var(--crt-border)" strokeDasharray="2 4" strokeWidth={0.5}
          />
        ))}
        {/* 折れ線 */}
        {series.map((k) => (
          <path
            key={k}
            d={paths[k] ?? ''}
            fill="none"
            stroke={SERIES_COLOR[k]}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="crt-spark__legend">
        {series.map((k) => (
          <span key={k} className="crt-spark__legend-item">
            <span className="crt-spark__swatch" style={{ background: SERIES_COLOR[k] }} />
            {SERIES_LABEL[k]}
          </span>
        ))}
        <span className="crt-spark__legend-item crt-spark__legend-item--right">
          peak {ticks.max} · {ticks.from} → {ticks.to}
        </span>
      </div>
      <span className="crt-hud-tag" aria-hidden="true" style={{ display: 'none' }}>{max}</span>
    </div>
  );
}

function buildChart(
  data: StatsTimeseriesBucket[],
  series: ReadonlyArray<'posted' | 'delivered' | 'rejections'>,
) {
  const width = Math.max(100, data.length * 8);
  const height = 160;
  let max = 1;
  for (const b of data) {
    for (const k of series) {
      const v = (b as unknown as Record<string, number>)[k] ?? 0;
      if (v > max) max = v;
    }
  }
  const xStep = data.length > 1 ? width / (data.length - 1) : width;

  const paths: Partial<Record<typeof series[number], string>> = {};
  for (const k of series) {
    let d = '';
    data.forEach((b, i) => {
      const v = (b as unknown as Record<string, number>)[k] ?? 0;
      const x = i * xStep;
      const y = height - (v / max) * (height - 8) - 4;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `;
    });
    paths[k] = d;
  }
  const from = data[0]?.time ?? '';
  const to = data[data.length - 1]?.time ?? '';
  return { paths, max, ticks: { max: max.toLocaleString(), from, to }, width };
}
