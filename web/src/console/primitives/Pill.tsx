import type { ReactNode } from 'react';

interface PillItem {
  id: string;
  label: ReactNode;
}

interface Props {
  items: PillItem[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export function Pill({ items, active, onChange, ariaLabel }: Props) {
  return (
    <div className="crt-pill" role="tablist" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={it.id === active}
          className={`crt-pill__btn ${it.id === active ? 'crt-pill__btn--active' : ''}`}
          onClick={() => onChange(it.id)}
          type="button"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
