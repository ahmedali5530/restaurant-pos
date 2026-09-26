import { describe, expect, it } from 'vitest';
import {
  isGhostOperationalOrder,
  preserveOrderHeaderOnMerge,
  shouldMaterializeNewOrder,
} from './order-validity.ts';
import type { OrderRecord } from './types.ts';

describe('order-validity', () => {
  it('treats empty In Progress shells as ghosts, not pending local creates', () => {
    expect(isGhostOperationalOrder({ status: 'In Progress', invoice_number: undefined })).toBe(true);
    expect(isGhostOperationalOrder({
      status: 'In Progress',
      invoice_number: undefined,
      owner_terminal_id: 'terminal-1',
    })).toBe(false);
    expect(isGhostOperationalOrder({ status: 'In Progress', invoice_number: 65003 })).toBe(false);
    expect(isGhostOperationalOrder({ status: 'Paid', invoice_number: undefined })).toBe(false);
  });

  it('allows materializing closed rows, invoiced opens, and owned pending opens', () => {
    expect(shouldMaterializeNewOrder({ status: 'Paid' })).toBe(true);
    expect(shouldMaterializeNewOrder({ status: 'In Progress', invoice_number: 1 })).toBe(true);
    expect(shouldMaterializeNewOrder({ status: 'In Progress', order_type: 'order_type:x' })).toBe(false);
    expect(shouldMaterializeNewOrder({
      status: 'In Progress',
      owner_terminal_id: 'terminal-1',
    })).toBe(true);
  });

  it('preserves invoice and closed status on sparse merge', () => {
    const existing = {
      id: 'order:a',
      status: 'Paid',
      invoice_number: 65002,
      user: 'user:u1',
      order_type: 'order_type:o1',
    } as OrderRecord;
    const patch = preserveOrderHeaderOnMerge(existing, {
      order_type: 'order_type:o2',
      status: 'In Progress',
    });
    expect(patch.invoice_number).toBe(65002);
    expect(patch.user).toBe('user:u1');
    expect(patch.status).toBe('Paid');
  });

  it('preserves the local invoice code on sparse merge', () => {
    const existing = {
      id: 'order:a',
      status: 'In Progress',
      local_invoice_code: 'ABC123',
    } as OrderRecord;
    const patch = preserveOrderHeaderOnMerge(existing, {
      order_type: 'order_type:o2',
    });
    expect(patch.local_invoice_code).toBe('ABC123');
  });
});
