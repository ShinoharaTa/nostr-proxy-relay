/** ミリ秒を `4d 12h 03m` のような人が読む形に。 */
export function formatUptimeSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m`;
}

/** `2026-05-04 09:12:34` のような ISO/SQL 形式 → `09:12:34` */
export function shortTimeOnly(s: string | null | undefined): string {
  if (!s) return '—';
  const d = parseAny(s);
  if (!d) return s;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function shortDateTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = parseAny(s);
  if (!d) return s;
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ago(s: string | null | undefined): string {
  if (!s) return '';
  const d = parseAny(s);
  if (!d) return '';
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function durationBetween(from: string | null | undefined, to?: string | null): string {
  if (!from) return '';
  const a = parseAny(from);
  const b = to ? parseAny(to) : new Date();
  if (!a || !b) return '';
  return formatUptimeSec(Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000)));
}

export function prettyNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export function bytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function parseAny(s: string): Date | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t);
  // SQLite DATETIME 形式 (`YYYY-MM-DD HH:MM:SS`) は UTC として解釈
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (m) {
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return new Date(d);
  }
  return null;
}
