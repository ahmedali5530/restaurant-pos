import { describe, expect, it } from 'vitest';
import {
  formatKraItemCode,
  parseKraItemCodeSequence,
} from '@/integrations/providers/fiscal/kra/item-code.ts';

describe('KRA item code', () => {
  it('formats KE + type + pkg + qty + 7-digit sequence', () => {
    expect(
      formatKraItemCode({
        itemTyCd: '2',
        pkgUnitCd: 'NT',
        qtyUnitCd: 'U',
        sequence: 1,
      })
    ).toBe('KE2NTU0000001');
  });

  it('pads and truncates sequence to 7 digits', () => {
    expect(
      formatKraItemCode({
        itemTyCd: '2',
        pkgUnitCd: 'NT',
        qtyUnitCd: 'U',
        sequence: 12345678,
      })
    ).toBe('KE2NTU2345678');
  });

  it('parses sequence from a valid code', () => {
    expect(parseKraItemCodeSequence('KE2NTU0000042')).toBe(42);
    expect(parseKraItemCodeSequence('bad')).toBeNull();
  });
});
