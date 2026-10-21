import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'default' | 'ok' | 'warn' | 'alert';

/** トースト内のボタン（「取り消す」など）。押すとトーストは閉じる */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastInput {
  title?: string;
  message: ReactNode;
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
}
interface ToastItem extends Required<Pick<ToastInput, 'message' | 'variant' | 'durationMs'>> {
  id: number;
  title?: string;
  action?: ToastAction;
}

interface ToastApi {
  push: (t: ToastInput) => void;
  /** 表示中のトーストのうち、最後に出た action を実行する（キーボードの z 用） */
  runLastAction: () => boolean;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastHost>');
  return ctx;
}

interface HostProps { children: ReactNode }

export function ToastHost({ children }: HostProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((t: ToastInput) => {
    idRef.current += 1;
    const item: ToastItem = {
      id: idRef.current,
      title: t.title,
      message: t.message,
      variant: t.variant ?? 'default',
      durationMs: t.durationMs ?? (t.action ? 8000 : 4000),
      action: t.action,
    };
    setItems((prev) => [...prev, item]);
  }, []);

  const itemsRef = useRef<ToastItem[]>([]);
  itemsRef.current = items;
  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((x) => x.id !== id)), []);
  const runLastAction = useCallback(() => {
    const last = [...itemsRef.current].reverse().find((x) => x.action);
    if (!last?.action) return false;
    dismiss(last.id);
    last.action.onClick();
    return true;
  }, [dismiss]);
  const api = useMemo(() => ({ push, runLastAction }), [push, runLastAction]);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((it) =>
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== it.id)), it.durationMs),
    );
    return () => { timers.forEach(clearTimeout); };
  }, [items]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="crt-toast-host" aria-live="polite">
          {items.map((it) => (
            <div
              key={it.id}
              className={`crt-toast ${it.variant !== 'default' ? `crt-toast--${it.variant}` : ''}`}
              role="status"
            >
              {it.title && <div className="crt-toast__title">{it.title}</div>}
              <div className="crt-toast__body">
                <div>{it.message}</div>
                {it.action && (
                  <button
                    type="button"
                    className="crt-btn crt-toast__action"
                    onClick={() => { dismiss(it.id); it.action!.onClick(); }}
                  >
                    {it.action.label} <kbd className="crt-kbd">z</kbd>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
