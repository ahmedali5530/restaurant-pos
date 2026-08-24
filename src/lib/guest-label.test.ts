import { describe, expect, it } from 'vitest';
import { formatGuestLabel } from '@/lib/guest-label.ts';

describe('formatGuestLabel', () => {
  it('prefers name over guest_code', () => {
    expect(formatGuestLabel({ name: 'Alice', guest_code: 'G123' })).toBe('Alice');
  });

  it('falls back to #CODE when name is empty', () => {
    expect(formatGuestLabel({ name: '  ', guest_code: 'G123' })).toBe('#G123');
    expect(formatGuestLabel({ guest_code: '#AB' })).toBe('#AB');
    expect(formatGuestLabel({ code: 'X1' })).toBe('#X1');
  });

  it('returns empty for nullish guest', () => {
    expect(formatGuestLabel(null)).toBe('');
    expect(formatGuestLabel(undefined)).toBe('');
    expect(formatGuestLabel({})).toBe('');
  });
});
