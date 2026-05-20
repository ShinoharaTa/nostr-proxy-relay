import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

interface Props {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}

export function Drawer({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="crt-drawer-backdrop" onClick={onClose} />
      <aside className="crt-drawer" role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          {title && <h3 className="crt-drawer__title">{title}</h3>}
          <Button variant="ghost" iconOnly aria-label="close" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        {children}
      </aside>
    </>,
    document.body,
  );
}
