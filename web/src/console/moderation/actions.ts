/**
 * 措置の実行と取り消し（#54）。
 *
 * 画面ごとに API を直接叩くと「取り消す」の実装が散らばるので、措置はここに集める。
 * 各措置は実行前の状態を読み、元に戻す関数を返す。確認ダイアログを出すかどうかは呼び出し側
 * （useModeration）が決める。恒久措置（拒否 / HARD BAN）だけ確認する方針（設計原則 3）。
 */
import { Actors, Inbox, IpAcl, Quarantine, Relays, Safelist } from '../api';
import type { IpAclMode } from '../api';

export type ModAction =
  | { type: 'allow'; npub: string }
  | { type: 'unallow'; npub: string }
  | { type: 'unbypass'; npub: string }
  | { type: 'deny'; npub: string }
  | { type: 'undeny'; npub: string }
  | { type: 'quarantine'; npub: string; secs: number }
  | { type: 'unquarantine'; npub: string }
  | { type: 'ip'; ip: string; mode: IpAclMode }
  | { type: 'snooze'; key: string }
  | { type: 'relay-suspend'; url: string; secs: number };

export type Undo = () => Promise<void>;

/** 恒久で、実行前に確認が要る措置 */
export function isPermanent(a: ModAction): boolean {
  return a.type === 'deny' || (a.type === 'ip' && a.mode === 'hard_ban');
}

/** 確認を経ずに実行する。戻り値は取り消し関数（取り消せない措置は null）。 */
export async function apply(a: ModAction): Promise<Undo | null> {
  switch (a.type) {
    case 'allow':
    case 'unallow':
    case 'unbypass':
    case 'deny':
    case 'undeny': {
      const prev = (await Actors.npubDetail(a.npub)).safelist;
      const restore: Undo = async () => {
        if (!prev) { await Safelist.remove(a.npub); return; }
        await Safelist.upsert({ npub: a.npub, flags: prev.flags, memo: prev.memo, banned: prev.banned });
        await (prev.banned ? Safelist.ban(a.npub) : Safelist.unban(a.npub));
      };
      const flags = prev?.flags ?? 0;
      const memo = prev?.memo ?? '';
      if (a.type === 'allow') {
        await Safelist.upsert({ npub: a.npub, flags: flags | 1, memo, banned: false });
        // 明示的に許可したら拒否は外す
        if (prev?.banned) await Safelist.unban(a.npub);
      } else if (a.type === 'unallow' || a.type === 'unbypass') {
        const bit = a.type === 'unallow' ? 1 : 2;
        await Safelist.upsert({ npub: a.npub, flags: flags & ~bit, memo, banned: prev?.banned ?? false });
      } else if (a.type === 'deny') {
        await Safelist.ban(a.npub);
      } else {
        await Safelist.unban(a.npub);
      }
      return restore;
    }
    case 'quarantine': {
      const row = await Quarantine.create({ npub: a.npub, scope: 'post', reason: 'manual', duration_secs: a.secs });
      return async () => { await Quarantine.remove(row.id); };
    }
    case 'unquarantine': {
      const entries = (await Actors.npubDetail(a.npub)).quarantine_entries;
      await Promise.all(entries.map((q) => Quarantine.remove(q.id)));
      return async () => {
        // 残り時間で付け直す（自動ガードの理由はそのまま残す）
        for (const q of entries) {
          const left = q.expires_at ? Math.max(60, Math.round((Date.parse(q.expires_at.replace(' ', 'T') + 'Z') - Date.now()) / 1000)) : null;
          await Quarantine.create({ npub: a.npub, scope: q.scope, reason: q.reason, duration_secs: left });
        }
      };
    }
    case 'ip': {
      const prev = (await IpAcl.list()).find((r) => r.ip_address === a.ip);
      if (a.mode === 'normal') {
        if (prev?.id != null) await IpAcl.remove(prev.id);
      } else {
        await IpAcl.create({ ip_address: a.ip, mode: a.mode, memo: prev?.memo ?? '' });
      }
      return async () => {
        if (prev) { await IpAcl.create({ ip_address: prev.ip_address, mode: prev.mode, memo: prev.memo }); return; }
        const now = (await IpAcl.list()).find((r) => r.ip_address === a.ip);
        if (now?.id != null) await IpAcl.remove(now.id);
      };
    }
    case 'snooze':
      await Inbox.snooze(a.key);
      return async () => { await Inbox.unsnooze(a.key); };
    case 'relay-suspend':
      await Relays.suspend(a.url, a.secs);
      return async () => { await Relays.resume(a.url); };
  }
}

/** 他の画面（受信箱・名簿・カード）に再取得を促すイベント */
export const MODERATION_CHANGED = 'console:moderation-changed';
export function notifyChanged(): void {
  window.dispatchEvent(new Event(MODERATION_CHANGED));
}
