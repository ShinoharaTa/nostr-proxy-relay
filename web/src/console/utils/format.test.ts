import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatUptimeSec,
  shortTimeOnly,
  shortDateTime,
  ago,
  durationBetween,
  prettyNumber,
  bytes,
} from './format';

describe('formatUptimeSec', () => {
  it('returns em-dash for null / undefined / non-positive', () => {
    expect(formatUptimeSec(null)).toBe('—');
    expect(formatUptimeSec(undefined)).toBe('—');
    expect(formatUptimeSec(0)).toBe('—');
    expect(formatUptimeSec(-5)).toBe('—');
    expect(formatUptimeSec(Number.NaN)).toBe('—');
  });

  it('formats sub-hour as Nm', () => {
    expect(formatUptimeSec(59)).toBe('0m');
    expect(formatUptimeSec(60)).toBe('1m');
    expect(formatUptimeSec(60 * 30)).toBe('30m');
  });

  it('formats hours as Nh MMm', () => {
    expect(formatUptimeSec(3600)).toBe('1h 00m');
    expect(formatUptimeSec(3600 * 2 + 60 * 5)).toBe('2h 05m');
  });

  it('formats days as Nd HHh MMm', () => {
    expect(formatUptimeSec(86400)).toBe('1d 00h 00m');
    expect(formatUptimeSec(86400 * 4 + 3600 * 12 + 60 * 3)).toBe('4d 12h 03m');
  });
});

describe('shortTimeOnly', () => {
  it('handles empty / null', () => {
    expect(shortTimeOnly(null)).toBe('—');
    expect(shortTimeOnly(undefined)).toBe('—');
    expect(shortTimeOnly('')).toBe('—');
  });

  it('returns HH:MM:SS for ISO input', () => {
    // 入力は UTC。出力はローカル TZ なので時刻数値そのものは検証せず、
    // フォーマット ("HH:MM:SS") だけを検証する。
    const out = shortTimeOnly('2026-05-19T08:34:05Z');
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('falls back to original string for unparseable input', () => {
    expect(shortTimeOnly('not-a-date')).toBe('not-a-date');
  });
});

describe('shortDateTime', () => {
  it('returns M/D HH:MM for SQLite-style datetime', () => {
    const out = shortDateTime('2026-05-19 08:34:05');
    expect(out).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });
});

describe('ago', () => {
  afterEach(() => vi.useRealTimers());

  it('returns empty string on missing input', () => {
    expect(ago(null)).toBe('');
    expect(ago('')).toBe('');
  });

  it('formats seconds / minutes / hours / days', () => {
    vi.useFakeTimers();
    const now = new Date('2026-05-19T10:00:00Z');
    vi.setSystemTime(now);
    expect(ago('2026-05-19T09:59:30Z')).toBe('30s ago');
    expect(ago('2026-05-19T09:55:00Z')).toBe('5m ago');
    expect(ago('2026-05-19T07:00:00Z')).toBe('3h ago');
    expect(ago('2026-05-17T10:00:00Z')).toBe('2d ago');
  });

  it('never returns negative duration for future timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T10:00:00Z'));
    expect(ago('2026-05-19T11:00:00Z')).toBe('0s ago');
  });
});

describe('durationBetween', () => {
  it('returns empty if from missing', () => {
    expect(durationBetween(null)).toBe('');
    expect(durationBetween('')).toBe('');
  });

  it('computes Nd HHh MMm form between two SQL datetimes', () => {
    const out = durationBetween('2026-05-15 00:00:00', '2026-05-19 12:03:00');
    expect(out).toBe('4d 12h 03m');
  });
});

describe('prettyNumber', () => {
  it('uses locale grouping', () => {
    // Node/jsdom 既定 locale は通常 en-US で `,` を使う。区切り文字が含まれることだけ確認。
    expect(prettyNumber(1234567)).toMatch(/[,.]/);
    expect(prettyNumber(1234567)).toContain('1');
    expect(prettyNumber(0)).toBe('0');
  });

  it('returns em-dash on missing / NaN / Infinity', () => {
    expect(prettyNumber(null)).toBe('—');
    expect(prettyNumber(undefined)).toBe('—');
    expect(prettyNumber(Number.NaN)).toBe('—');
    expect(prettyNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('bytes', () => {
  it('handles em-dash for null', () => {
    expect(bytes(null)).toBe('—');
    expect(bytes(undefined)).toBe('—');
  });

  it('formats bytes < 1 KiB as integer', () => {
    expect(bytes(0)).toBe('0 B');
    expect(bytes(512)).toBe('512 B');
    expect(bytes(1023)).toBe('1023 B');
  });

  it('formats KB at 1.0 KB boundary', () => {
    expect(bytes(1024)).toBe('1.0 KB');
    expect(bytes(2048)).toBe('2.0 KB');
  });

  it('formats MB / GB', () => {
    expect(bytes(1024 * 1024)).toBe('1.0 MB');
    expect(bytes(1024 * 1024 * 1024)).toBe('1.00 GB');
    expect(bytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50 GB');
  });
});
