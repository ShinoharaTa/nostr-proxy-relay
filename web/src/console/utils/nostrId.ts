/**
 * Nostr 識別子（npub / nprofile / note / nevent / hex）と IP の判別（#54）。
 *
 * ⌘K パレットに何を貼っても受け付けるための最小実装。依存を増やさないよう bech32 を自前で持つ。
 * 判別できた識別子は「対象」（npub か IP）に寄せる。note は投稿者が分からないので、
 * 呼び出し側が上流へ問い合わせて解決する。
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from) return null;
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    return null;
  }
  return out;
}

/** bech32 を復号して hrp とバイト列を返す。チェックサム不一致なら null。 */
export function bech32Decode(str: string): { hrp: string; bytes: number[] } | null {
  const s = str.toLowerCase();
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length || s.length > 5000) return null;
  const hrp = s.slice(0, pos);
  const data: number[] = [];
  for (const c of s.slice(pos + 1)) {
    const d = CHARSET.indexOf(c);
    if (d === -1) return null;
    data.push(d);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) return null;
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  return bytes ? { hrp, bytes } : null;
}

export function bech32Encode(hrp: string, bytes: number[]): string {
  const data = convertBits(bytes, 8, 5, true) ?? [];
  const values = [...hrpExpand(hrp), ...data];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum = Array.from({ length: 6 }, (_, i) => (mod >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...checksum].map((d) => CHARSET[d]).join('');
}

const toHex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => hex.match(/../g)!.map((h) => parseInt(h, 16));

export function hexToNpub(hex: string): string {
  return bech32Encode('npub', fromHex(hex.toLowerCase()));
}

export function npubToHex(npub: string): string | null {
  const d = bech32Decode(npub);
  return d && d.hrp === 'npub' && d.bytes.length === 32 ? toHex(d.bytes) : null;
}

/** nprofile / nevent の TLV。type 0 = 本体（pubkey / event id）、type 2 = author */
function tlv(bytes: number[]): Map<number, number[][]> {
  const out = new Map<number, number[][]>();
  let i = 0;
  while (i + 2 <= bytes.length) {
    const t = bytes[i];
    const len = bytes[i + 1];
    const v = bytes.slice(i + 2, i + 2 + len);
    if (v.length !== len) break;
    out.set(t, [...(out.get(t) ?? []), v]);
    i += 2 + len;
  }
  return out;
}

export type Detected =
  | { kind: 'npub'; npub: string; via: 'npub' | 'nprofile' | 'hex' }
  /** 投稿を指す識別子。author が入っていれば即座に対象へ寄せられる */
  | { kind: 'event'; eventId: string; author: string | null; via: 'note' | 'nevent' }
  | { kind: 'ip'; value: string; cidr: boolean }
  | { kind: 'text'; query: string }
  | { kind: 'none' };

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function isIp(v: string): { ok: boolean; cidr: boolean } {
  const [addr, prefix, extra] = v.split('/');
  if (extra !== undefined) return { ok: false, cidr: false };
  const cidr = prefix !== undefined;
  if (cidr && !/^\d{1,3}$/.test(prefix)) return { ok: false, cidr };
  if (IPV4.test(addr)) return { ok: !cidr || +prefix <= 32, cidr };
  if (addr.includes(':') && IPV6.test(addr) && (addr.match(/::/g) ?? []).length <= 1) {
    return { ok: !cidr || +prefix <= 128, cidr };
  }
  return { ok: false, cidr };
}

/** 貼られた文字列を判別する。`nostr:` 接頭辞や前後の空白は取り除く。 */
export function detectInput(raw: string): Detected {
  const v = raw.trim().replace(/^nostr:/i, '');
  if (!v) return { kind: 'none' };

  if (/^[0-9a-f]{64}$/i.test(v)) return { kind: 'npub', npub: hexToNpub(v), via: 'hex' };

  if (/^(npub|nprofile|note|nevent)1/i.test(v)) {
    const d = bech32Decode(v);
    if (d) {
      if (d.hrp === 'npub' && d.bytes.length === 32) return { kind: 'npub', npub: v.toLowerCase(), via: 'npub' };
      if (d.hrp === 'note' && d.bytes.length === 32) return { kind: 'event', eventId: toHex(d.bytes), author: null, via: 'note' };
      const t = tlv(d.bytes);
      const main = t.get(0)?.[0];
      if (d.hrp === 'nprofile' && main?.length === 32) return { kind: 'npub', npub: bech32Encode('npub', main), via: 'nprofile' };
      if (d.hrp === 'nevent' && main?.length === 32) {
        const author = t.get(2)?.[0];
        return { kind: 'event', eventId: toHex(main), author: author?.length === 32 ? bech32Encode('npub', author) : null, via: 'nevent' };
      }
    }
  }

  const ip = isIp(v);
  if (ip.ok) return { kind: 'ip', value: v.toLowerCase(), cidr: ip.cidr };

  return { kind: 'text', query: v };
}

/** 表示用に中央を省略する（npub1abcd…wxyz） */
export function shortId(id: string): string {
  if (id.startsWith('npub1')) return `${id.slice(0, 10)}…${id.slice(-6)}`;
  return id.length > 24 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id;
}

/** フォーカスが入力欄にあるか（ショートカットキーを無効にする判定） */
export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}

/**
 * 共有で届いた文字列（本文・URL・タイトル）から識別子を 1 つ取り出す（#55）。
 * クライアントによって `nostr:npub1…` や `https://njump.me/nevent1…` の形で届くので、
 * bech32 の識別子を優先し、なければ IP を探す。見つからなければ null。
 */
export function extractShared(parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(' ');
  const bech = text.match(/\b(npub1|nprofile1|note1|nevent1)[02-9ac-hj-np-z]{20,}/i);
  if (bech) return bech[0];
  const hex = text.match(/\b[0-9a-f]{64}\b/i);
  if (hex) return hex[0];
  for (const token of text.split(/[\s,]+/)) {
    const d = detectInput(token);
    if (d.kind === 'ip') return d.value;
  }
  return null;
}
