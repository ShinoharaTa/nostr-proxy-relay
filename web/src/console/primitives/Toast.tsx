import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'default' | 'ok' | 'warn' | 'alert';

interface ToastInput {
  title?: string;
  message: ReactNode;
  variant?: ToastVariant;
  durationMs?: number;
}
interface ToastItem extends Required<Pick<ToastInput, 'message' | 'variant' | 'durationMs'>> {
  id: number;
  title?: string;
}

interface ToastApi {
  push: (t: ToastInput) => void;
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
      durationMs: t.durationMs ?? 4000,
    };
    setItems((prev) => [...prev, item]);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const timers = items.map((it) =>
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== it.id)), it.durationMs),
    );
    return () => { timers.forEach(clearTimeout); };
  }, [items]);

  return (
    <ToastCtx.Provider value={{ push }}>
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
              <div>{it.message}</div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
