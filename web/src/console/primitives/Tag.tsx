import type { ReactNode } from 'react';

type Variant = 'info' | 'warn' | 'alert' | 'accent' | 'dim';

interface Props {
  variant?: Variant;
  children?: ReactNode;
  /** ホバー時の補足（復帰予定時刻など） */
  title?: string;
}

export function Tag({ variant = 'dim', children, title }: Props) {
  return <span className={`crt-tag crt-tag--${variant}`} title={title}>{children}</span>;
}
