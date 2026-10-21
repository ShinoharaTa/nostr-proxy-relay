import { describe, expect, it } from 'vitest';
import { splitValues } from './QuickRegister';

describe('splitValues', () => {
  it('改行・空白・カンマで分割し、空要素と重複を除く', () => {
    expect(splitValues(' npub1a\nnpub1b, npub1a\n\n  npub1c ')).toEqual(['npub1a', 'npub1b', 'npub1c']);
  });
  it('空入力は空配列', () => {
    expect(splitValues('  \n ')).toEqual([]);
  });
});
