import type { ReactNode } from 'react';

type Variant = 'info' | 'warn' | 'alert' | 'accent' | 'dim';

interface Props {
  variant?: Variant;
  children?: ReactNode;
}

export function Tag({ variant = 'dim', children }: Props) {
  return <span className={`crt-tag crt-tag--${variant}`}>{children}</span>;
}
