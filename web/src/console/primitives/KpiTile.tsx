import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  variant?: 'default' | 'ok' | 'warn' | 'alert';
}

export function KpiTile({ label, value, delta, variant = 'default' }: Props) {
  const cls = ['crt-kpi', variant !== 'default' ? `crt-kpi--${variant}` : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <span className="crt-kpi__label">{label}</span>
      <span className="crt-kpi__value">{value}</span>
      {delta !== undefined && <span className="crt-kpi__delta">{delta}</span>}
    </div>
  );
}
