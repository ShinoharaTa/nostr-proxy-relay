import { describe, expect, it } from 'vitest';
import { detectInput, hexToNpub, npubToHex, bech32Encode } from './nostrId';

// NIP-19 の例
const NPUB = 'npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg';
const HEX = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e';
const NPROFILE = 'nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p';
const NPROFILE_HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

describe('bech32', () => {
  it('npub と hex を相互変換できる', () => {
    expect(hexToNpub(HEX)).toBe(NPUB);
    expect(npubToHex(NPUB)).toBe(HEX);
  });
  it('チェックサムが壊れていれば npub と判定しない', () => {
    expect(npubToHex(NPUB.slice(0, -1) + 'q')).toBeNull();
    expect(detectInput(NPUB.slice(0, -1) + 'q').kind).toBe('text');
  });
});

describe('detectInput', () => {
  it('npub / hex / nprofile を npub に寄せる', () => {
    expect(detectInput(NPUB)).toEqual({ kind: 'npub', npub: NPUB, via: 'npub' });
    expect(detectInput(`  nostr:${NPUB} `)).toMatchObject({ kind: 'npub', npub: NPUB });
    expect(detectInput(HEX)).toEqual({ kind: 'npub', npub: NPUB, via: 'hex' });
    expect(detectInput(NPROFILE)).toEqual({ kind: 'npub', npub: hexToNpub(NPROFILE_HEX), via: 'nprofile' });
  });
  it('note は投稿者なし、nevent は author があれば npub を返す', () => {
    const id = Array.from({ length: 32 }, (_, i) => i);
    const note = bech32Encode('note', id);
    expect(detectInput(note)).toMatchObject({ kind: 'event', author: null, via: 'note' });
    const author = Array.from({ length: 32 }, () => 0x7e);
    const nevent = bech32Encode('nevent', [0, 32, ...id, 2, 32, ...author]);
    expect(detectInput(nevent)).toMatchObject({ kind: 'event', author: bech32Encode('npub', author), via: 'nevent' });
  });
  it('IPv4 / IPv6 / CIDR を判別する', () => {
    expect(detectInput('203.0.113.7')).toEqual({ kind: 'ip', value: '203.0.113.7', cidr: false });
    expect(detectInput('198.51.100.0/24')).toEqual({ kind: 'ip', value: '198.51.100.0/24', cidr: true });
    expect(detectInput('240f:170:d0fa:1:8cc9:cf91:10a4:4d93')).toMatchObject({ kind: 'ip', cidr: false });
    expect(detectInput('2001:db8::/32')).toMatchObject({ kind: 'ip', cidr: true });
    expect(detectInput('999.1.1.1').kind).toBe('text');
  });
  it('それ以外は検索語', () => {
    expect(detectInput('上流')).toEqual({ kind: 'text', query: '上流' });
    expect(detectInput('   ')).toEqual({ kind: 'none' });
  });
});
