import { describe, expect, it } from 'vitest';
import { buildOrderItemPayload, normalizeUnitPrice } from '@/lib/order-item-pricing.ts';
import { calculateOrderItemPaymentTax } from '@/lib/tax-calculator.ts';
import { MenuItemType, type MenuItem } from '@/api/model/cart_item.ts';
import type { Tax } from '@/api/model/tax.ts';
import type { OrderItem } from '@/api/model/order_item.ts';

const vat10: Tax = { id: 'tax:1', name: 'VAT', rate: 10 } as Tax;

const makeInclusiveCartItem = (overrides: Partial<MenuItem> = {}): MenuItem => ({
  id: 'cart-1',
  quantity: 2,
  price: 110,
  level: 0,
  newOrOld: MenuItemType.new,
  tax_mode: 'inclusive',
  taxes: [vat10],
  dish: {
    id: 'dish:1',
    name: 'Burger',
    price: 110,
    tax_mode: 'inclusive',
    taxes: [vat10],
  } as MenuItem['dish'],
  ...overrides,
});

describe('order-item-pricing', () => {
  it('normalizes inclusive gross price to net', () => {
    expect(normalizeUnitPrice(110, 'inclusive', [vat10])).toBe(100);
    expect(normalizeUnitPrice(50, 'exclusive', [vat10])).toBe(50);
  });

  it('stores net price, original_price, taxes, and line tax at creation', () => {
    const payload = buildOrderItemPayload(makeInclusiveCartItem());

    expect(payload.price).toBe(100);
    expect(payload.original_price).toBe(110);
    expect(payload.tax_mode).toBe('inclusive');
    expect(payload.taxes).toEqual([vat10]);
    expect(payload.tax).toBe(20);
  });

  it('payment tax on stored order item matches line tax for inclusive menu taxes', () => {
    const payload = buildOrderItemPayload(makeInclusiveCartItem());
    const orderItem = {
      price: payload.price,
      quantity: 2,
      tax_mode: 'inclusive',
      taxes: [vat10],
      modifiers: [],
    } as OrderItem;

    expect(calculateOrderItemPaymentTax(orderItem, null)).toBe(20);
  });

  it('exclusive lines without menu taxes use payment tax only', () => {
    const orderItem = {
      price: 50,
      quantity: 1,
      tax_mode: 'exclusive',
      modifiers: [],
    } as OrderItem;
    const paymentTax: Tax = { id: 'tax:2', name: 'Sales', rate: 5 } as Tax;

    expect(calculateOrderItemPaymentTax(orderItem, paymentTax)).toBe(2.5);
    expect(calculateOrderItemPaymentTax(orderItem, null)).toBe(0);
  });
});
