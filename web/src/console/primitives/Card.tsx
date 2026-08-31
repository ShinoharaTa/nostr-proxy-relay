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
        <header className="crt-card__head">
          {title && <h3 className="crt-card__title">{title}</h3>}
          {actions && <div className="crt-card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
