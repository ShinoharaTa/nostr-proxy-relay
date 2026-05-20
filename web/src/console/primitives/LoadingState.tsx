import type { ReactNode } from 'react';

interface Props {
  title?: ReactNode;
  hint?: ReactNode;
}

export function LoadingState({ title = 'LOADING', hint }: Props) {
  return (
    <div className="crt-loading">
      <div className="crt-loading__title">{title}</div>
      {hint && <div>{hint}</div>}
      <div className="crt-loading__bar" />
    </div>
  );
}
