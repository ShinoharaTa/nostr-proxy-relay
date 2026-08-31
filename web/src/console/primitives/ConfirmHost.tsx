import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * アプリ共通の確認ダイアログ。
 *
 * ブラウザ標準の `confirm()` は (1) テーマから外れる (2) 破壊的操作なのに
 * 「OK」としか書けず結果が予測できない (3) モバイルで文言が切れる、という問題がある。
 * 破壊的操作の確認は必ずこのフック経由で出し、**ボタンラベルに動詞を入れる**。
 */
export interface ConfirmOptions {
  title: string;
  /** 何が起きるかを具体的に。取り消せない操作はその旨を明記する */
  body?: ReactNode;
  /** 実行ボタンのラベル。"OK" ではなく "BAN する" のように動詞で */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 破壊的操作なら true（実行ボタンを danger 表示にする） */
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);

export function ConfirmHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: Resolver } | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={!!state}
        title={state?.opts.title}
        onClose={() => close(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.opts.cancelLabel ?? 'CANCEL'}
            </Button>
            <Button
              variant={state?.opts.destructive ? 'danger' : 'primary'}
              onClick={() => close(true)}
            >
              {state?.opts.confirmLabel ?? 'CONFIRM'}
            </Button>
          </>
        }
      >
        {state?.opts.body}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({...})) { ... }` */
export function useConfirm() {
  return useContext(ConfirmContext);
}
