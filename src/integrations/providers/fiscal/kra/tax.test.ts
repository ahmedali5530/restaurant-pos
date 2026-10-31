import { describe, expect, it } from 'vitest';
import {
  accumulateKraTaxBucket,
  emptyKraTaxBuckets,
  resolveKraTaxTyCd,
} from '@/integrations/providers/fiscal/kra/tax.ts';

describe('KRA tax mapping', () => {
  const config = { taxTyCd: 'B', zeroTaxTyCd: 'A' };

  it('uses dish override when A–E', () => {
    expect(resolveKraTaxTyCd({ config, dishOverride: 'e', taxRate: 16 })).toBe('E');
  });

  it('maps ~16% to B and ~8% to E and zero to configured zero type', () => {
    expect(resolveKraTaxTyCd({ config, taxRate: 16 })).toBe('B');
    expect(resolveKraTaxTyCd({ config, taxRate: 8 })).toBe('E');
    expect(resolveKraTaxTyCd({ config, taxRate: 0 })).toBe('A');
  });

  it('accumulates taxable and tax into the matching bucket', () => {
    const buckets = emptyKraTaxBuckets();
    accumulateKraTaxBucket(buckets, 'B', 1000, 160, 16);
    accumulateKraTaxBucket(buckets, 'A', 200, 0, 0);
    expect(buckets.taxblAmtB).toBe(1000);
    expect(buckets.taxAmtB).toBe(160);
    expect(buckets.taxRtB).toBe(16);
    expect(buckets.taxblAmtA).toBe(200);
  });
});
