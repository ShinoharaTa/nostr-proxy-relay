import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

interface Props {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="crt-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="crt-modal">
        {title && <h3 className="crt-modal__title">{title}</h3>}
        <Button
          variant="ghost"
          iconOnly
          aria-label="close"
          className="crt-modal__close"
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
        <div>{children}</div>
        {footer && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
