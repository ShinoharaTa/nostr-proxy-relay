import { useEffect, useId, useRef, type ReactNode } from 'react';
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

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * モーダルダイアログ。
 * WAI-ARIA Dialog (Modal) パターンに従い、以下を満たす:
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby`（タイトルと紐付け）
 *  - 開いたら中の最初の操作要素へフォーカス移動
 *  - Tab / Shift+Tab をダイアログ内に閉じ込める（フォーカストラップ）
 *  - Escape で閉じ、閉じたら呼び出し元へフォーカスを戻す
 *  - 背景のスクロールを止める
 */
export function Modal({ open, title, onClose, children, footer }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 開いた直後は「実行」ではなく最初の要素（＝閉じる/キャンセル側）に置く。
    // 破壊的操作を Enter 連打で誤爆させないため。
    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((el) => el.offsetParent !== null);
      if (nodes.length === 0) return;
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="crt-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="crt-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && <h3 className="crt-modal__title" id={titleId}>{title}</h3>}
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
