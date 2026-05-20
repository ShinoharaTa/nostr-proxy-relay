import type { CSSProperties } from 'react';
import * as React from 'react';
import { ICON_PATHS } from './paths';

export type IconName = keyof typeof ICON_PATHS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
  style?: CSSProperties;
  ariaHidden?: boolean;
}

/**
 * CRT_OPS 自作アイコン。すべて 24×24 viewBox、stroke 1.75px、角張り、line-cap=square。
 *
 * 使い方:
 *   <Icon name="ban" size={20} />
 *   <Icon name="dot-warn" />          // 塗り込みのものは fill:currentColor 扱い
 */
export function Icon({
  name,
  size = 20,
  color,
  className,
  title,
  style,
  ariaHidden = true,
}: Props) {
  const def = ICON_PATHS[name] as { body: React.ReactNode; fill?: boolean } | undefined;
  if (!def) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-hidden={ariaHidden && !title}
      aria-label={title}
      className={`crt-icon crt-icon-${name} ${className ?? ''}`}
      style={{ color, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {title && <title>{title}</title>}
      {def.fill ? (
        <g fill="currentColor" stroke="none">{def.body}</g>
      ) : (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="square"
          strokeLinejoin="miter"
        >
          {def.body}
        </g>
      )}
    </svg>
  );
}
