import { describe, expect, it } from 'vitest';
import { parseLiveEvent } from './liveEvent';

describe('parseLiveEvent', () => {
  it('サーバー形式（type + 数値 kind）を UI 形式に詰め替える', () => {
    const e = parseLiveEvent(
      '{"type":"event_rejected","ts":"2026-10-20T12:00:00Z","kind":1,"npub":"npub1x","ip":"1.2.3.4","reason":"spam"}',
    );
    expect(e.kind).toBe('event_rejected');
    expect(e.event_kind).toBe(1);
    expect(e.reason).toBe('spam');
  });

  it('kind 番号を持たない接続イベントも文字列の kind になる', () => {
    const e = parseLiveEvent('{"type":"connection_opened","ts":"2026-10-20T12:00:00Z","ip":"1.2.3.4"}');
    expect(e.kind).toBe('connection_opened');
    expect(e.event_kind).toBeNull();
  });

  it('既に UI 形式のデータはそのまま通す', () => {
    const e = parseLiveEvent('{"kind":"accepted","ts":"x","event_kind":7}');
    expect(e.kind).toBe('accepted');
    expect(e.event_kind).toBe(7);
  });
});
