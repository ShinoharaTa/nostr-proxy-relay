import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: Props) {
  return (
    <div className="crt-empty">
      <div className="crt-empty__title">{title}</div>
      {hint && <div>{hint}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
