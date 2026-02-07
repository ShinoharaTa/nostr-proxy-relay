import type { RelayStatusPoint } from '../types';

interface RelayStatusBarProps {
  uptimeHistory: RelayStatusPoint[];
  title?: string;
}

export function RelayStatusBar({ uptimeHistory, title }: RelayStatusBarProps) {
  const points = uptimeHistory.length >= 30 ? uptimeHistory.slice(-30) : uptimeHistory;
  const blocks = 30;
  const filled = points.length;

  return (
    <div className="relay-status-bar">
      {title != null && <span className="relay-status-bar-title">{title}</span>}
      <div className="relay-status-bar-blocks" title={`Last ${blocks} minutes (1 block = 1 min)`}>
        {Array.from({ length: blocks }, (_, i) => {
          const idx = i - (blocks - filled);
          const point = idx >= 0 ? points[idx] : null;
          const status = point?.status ?? 'none';
          const latency = point?.latency_ms;
          const ts = point?.timestamp ? new Date(point.timestamp).toLocaleTimeString() : '';
          const label = status === 'none' ? 'No data' : `${ts} ${status}${latency != null ? ` ${latency}ms` : ''}`;
          return (
            <span
              key={i}
              className={`relay-status-block relay-status-block-${status}`}
              title={label}
            />
          );
        })}
      </div>
    </div>
  );
}
