import type { ReactNode } from 'react';

type Variant = 'idle' | 'live' | 'warn' | 'alert';

interface Props {
  variant?: Variant;
  children?: ReactNode;
}

export function StatusDot({ variant = 'idle', children }: Props) {
  return (
    <span className={`crt-statusdot crt-statusdot--${variant}`}>
      <span className="crt-statusdot__dot" />
      {children}
    </span>
  );
}
