import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  bracket?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, bracket, actions, className, children, ...rest }: Props) {
  const cls = [
    'crt-card',
    bracket ? 'crt-card--bracket' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  return (
    <section className={cls} {...rest}>
      {(title || actions) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--crt-gap-sm)' }}>
          {title && <h3 className="crt-card__title">{title}</h3>}
          {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
