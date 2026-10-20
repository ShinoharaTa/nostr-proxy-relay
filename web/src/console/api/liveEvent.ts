import type { LiveEvent } from './types';

/**
 * `/api/events/stream` の 1 メッセージを UI 用の LiveEvent に正規化する。
 *
 * サーバーは `{"type":"event_rejected","kind":1,...}` の形で送る（`kind` は Nostr の kind 番号）。
 * UI は `kind` を種別文字列、`event_kind` を番号として扱うので、ここで詰め替える。
 * 型が合わないまま描画すると `.includes` が落ちて画面全体が消える（#48）。
 */
export function parseLiveEvent(data: string): LiveEvent {
  const raw = JSON.parse(data) as Record<string, unknown>;
  const type = typeof raw.type === 'string' ? raw.type : undefined;
  const kindIsNumber = typeof raw.kind === 'number';
  return {
    ...raw,
    ts: typeof raw.ts === 'string' ? raw.ts : '',
    kind: type ?? (typeof raw.kind === 'string' ? raw.kind : ''),
    event_kind: kindIsNumber
      ? (raw.kind as number)
      : typeof raw.event_kind === 'number' ? raw.event_kind : null,
  } as LiveEvent;
}
