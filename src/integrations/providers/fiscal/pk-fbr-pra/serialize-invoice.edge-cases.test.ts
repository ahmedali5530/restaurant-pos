import { describe, it, expect } from 'vitest';
import {
  formatPkFiscalAmount,
  mapPkPaymentMode,
  resolvePkFiscalItemIdentity,
} from './serialize-invoice.ts';
import type { Order } from '@/api/model/order.ts';

/**
 * Edge-case tests for the PK fiscal serializer's pure helper functions.
 *
 * The existing serialize-invoice.test.ts covers the integration test
 * (serializePkFiscalInvoice with a full order). These tests cover the
 * individual helper functions with edge-case inputs:
 *   - formatPkFiscalAmount: zero, negative, large, rounding
 *   - mapPkPaymentMode: all payment types, empty/missing payments
 *   - resolvePkFiscalItemIdentity: fallback chain, truncation, missing fields
 *
 * These are pure functions with no external dependencies — no DB, no
 * cart/tax helpers — so they can be tested directly.
 */

describe('formatPkFiscalAmount', () => {
  it('formats zero as "0.00"', () => {
    expect(formatPkFiscalAmount(0)).toBe('0.00');
  });

  it('formats integers with two decimals', () => {
    expect(formatPkFiscalAmount(1000)).toBe('1000.00');
  });

  it('formats decimals with exactly two places', () => {
    expect(formatPkFiscalAmount(1000.5)).toBe('1000.50');
    expect(formatPkFiscalAmount(1000.05)).toBe('1000.05');
  });

  it('rounds to two decimals (rounds up)', () => {
    expect(formatPkFiscalAmount(1000.999)).toBe('1001.00');
  });

  it('rounds to two decimals (rounds down)', () => {
    expect(formatPkFiscalAmount(1000.004)).toBe('1000.00');
  });

  it('formats very large amounts', () => {
    expect(formatPkFiscalAmount(999999999.99)).toBe('999999999.99');
  });

  it('handles small amounts', () => {
    expect(formatPkFiscalAmount(0.01)).toBe('0.01');
    expect(formatPkFiscalAmount(0.1)).toBe('0.10');
  });

  it('handles negative amounts (refunds) without crashing', () => {
    const result = formatPkFiscalAmount(-100);
    expect(typeof result).toBe('string');
    expect(result).toContain('100');
  });
});

describe('mapPkPaymentMode', () => {
  it('maps cash payment to 1', () => {
    const order = { payments: [{ payment_type: { type: 'Cash' } }] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('maps card payment to 2', () => {
    const order = { payments: [{ payment_type: { type: 'Card' } }] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(2);
  });

  it('maps remote payment to 1 (default — only card maps to 2)', () => {
    const order = { payments: [{ payment_type: { type: 'Remote' } }] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('maps points payment to 1 (default)', () => {
    const order = { payments: [{ payment_type: { type: 'Points' } }] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('defaults to 1 when no payments array', () => {
    const order = { payments: [] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('defaults to 1 when payments is undefined', () => {
    const order = {} as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('defaults to 1 when payment_type is undefined', () => {
    const order = { payments: [{}] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(1);
  });

  it('uses payment_type.name when type is missing', () => {
    const order = { payments: [{ payment_type: { name: 'Card' } }] } as unknown as Order;
    expect(mapPkPaymentMode(order)).toBe(2);
  });
});

describe('resolvePkFiscalItemIdentity', () => {
  it('uses dish number when available', () => {
    const item = { item: { id: 'dish:1', name: 'Burger', number: 'D001' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemCode).toBe('D001');
    expect(result.ItemName).toBe('Burger');
  });

  it('uses menu_name when name is missing', () => {
    const item = { item: { id: 'dish:1', menu_name: 'Cheese Burger' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemName).toBe('Cheese Burger');
  });

  it('falls back to "Item" when name and menu_name are missing', () => {
    const item = { item: { id: 'dish:1', number: 'D001' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemName).toBe('Item');
  });

  it('falls back to dish id (record suffix) when number is missing', () => {
    const item = { item: { id: 'dish:abc', name: 'Pizza' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    // recordIdSuffix strips the table prefix: 'dish:abc' → 'abc'
    expect(result.ItemCode).toBe('abc');
  });

  it('falls back to order_item id when both number and dish id are missing', () => {
    const item = { id: 'order_item:xyz', item: { name: 'Salad' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemCode).toBe('xyz');
  });

  it('falls back to "ITEM" when all identities are missing', () => {
    const item = { item: { name: 'Unknown' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemCode).toBe('ITEM');
  });

  it('truncates item code to max 50 characters', () => {
    const longNumber = 'D' + '0'.repeat(100);
    const item = { item: { id: 'dish:1', name: 'Test', number: longNumber } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemCode.length).toBeLessThanOrEqual(50);
  });

  it('truncates item name to max 150 characters', () => {
    const longName = 'A'.repeat(200);
    const item = { item: { id: 'dish:1', name: longName, number: 'D001' } } as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemName.length).toBeLessThanOrEqual(150);
  });

  it('handles undefined item gracefully', () => {
    const item = undefined as unknown as Order['items'][number];
    const result = resolvePkFiscalItemIdentity(item);
    expect(result.ItemCode).toBe('ITEM');
    expect(result.ItemName).toBe('Item');
  });
});
