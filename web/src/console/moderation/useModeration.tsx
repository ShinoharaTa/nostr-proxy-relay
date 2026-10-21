import { useCallback } from 'react';
import { useConfirm, useToast } from '../primitives';
import { useI18n } from '../i18n';
import { apply, isPermanent, notifyChanged, type ModAction } from './actions';
import { shortId } from '../utils/nostrId';

const fmtSecs = (secs: number) =>
  secs % 86400 === 0 ? `${secs / 86400}d` : secs % 3600 === 0 ? `${secs / 3600}h` : `${Math.round(secs / 60)}m`;

/**
 * 措置を実行するフック。恒久措置だけ確認し、それ以外は即実行して「取り消す」付きのトーストを出す（#54）。
 * 戻り値は実行したかどうか（確認でやめた・失敗したら false）。
 */
export function useModeration() {
  const toast = useToast();
  const confirm = useConfirm();
  const { t } = useI18n();
  const m = t.v2.mod;

  return useCallback(
    async (a: ModAction): Promise<boolean> => {
      if (isPermanent(a)) {
        const opts = a.type === 'deny' ? m.confirmDeny(shortId(a.npub)) : m.confirmHardBan(a.type === 'ip' ? a.ip : '');
        if (!(await confirm({ ...opts, destructive: true }))) return false;
      }
      try {
        const undo = await apply(a);
        notifyChanged();
        const message =
          a.type === 'quarantine' ? m.done.quarantine(fmtSecs(a.secs))
          : a.type === 'ip' ? m.done.ip(a.mode.toUpperCase().replace('_', ' '))
          : a.type === 'relay-suspend' ? m.done.relaySuspend
          : m.done[a.type];
        toast.push({
          variant: 'ok',
          message,
          action: undo
            ? {
                label: m.undo,
                onClick: () => {
                  undo()
                    .then(() => { notifyChanged(); toast.push({ message: m.undone }); })
                    .catch((e: Error) => toast.push({ variant: 'alert', message: t.common.opFailed(e.message) }));
                },
              }
            : undefined,
        });
        return true;
      } catch (e) {
        toast.push({ variant: 'alert', message: t.common.opFailed((e as Error).message) });
        return false;
      }
    },
    [confirm, toast, m, t.common],
  );
}

export { fmtSecs };
