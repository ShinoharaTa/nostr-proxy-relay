import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  iconOnly?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'default',
  iconOnly = false,
  className,
  children,
  ...rest
}: Props) {
  const cls = [
    'crt-btn',
    variant !== 'default' ? `crt-btn--${variant}` : '',
    iconOnly ? 'crt-btn--icon' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  return <button className={cls} {...rest}>{children}</button>;
}
