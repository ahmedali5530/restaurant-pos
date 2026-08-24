import { describe, expect, it } from 'vitest';
import { formatTaxLabel } from '@/lib/tax-label.ts';

describe('formatTaxLabel', () => {
  it('appends rate when name has no percent', () => {
    expect(formatTaxLabel('GST', 5)).toBe('GST 5%');
    expect(formatTaxLabel('VAT', 17)).toBe('VAT 17%');
  });

  it('does not duplicate percent when name already includes it', () => {
    expect(formatTaxLabel('Taxe ASI 2%', 2)).toBe('Taxe ASI 2%');
    expect(formatTaxLabel('GST 5 %', 5)).toBe('GST 5 %');
  });

  it('handles missing name or rate', () => {
    expect(formatTaxLabel(undefined, 8)).toBe('8%');
    expect(formatTaxLabel('Taxe', 0)).toBe('Taxe');
    expect(formatTaxLabel('', null)).toBe('');
  });
});
