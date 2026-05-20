import type { ReactNode } from 'react';

type Mode = 'hard' | 'shadow' | 'whitelist' | 'temp' | 'neutral';

interface Props {
  mode: Mode;
  children?: ReactNode;
}

const LABEL: Record<Mode, string> = {
  hard:      'HARD BAN',
  shadow:    'SHADOW',
  whitelist: 'WHITELIST',
  temp:      'TEMP',
  neutral:   'NEUTRAL',
};

export function ModeBadge({ mode, children }: Props) {
  return <span className={`crt-mode crt-mode--${mode}`}>{children ?? LABEL[mode]}</span>;
}
