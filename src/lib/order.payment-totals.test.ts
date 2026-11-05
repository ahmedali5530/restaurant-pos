import {describe, expect, it} from 'bun:test';
import {
  getAppliedPaymentAmount,
  getOrderPaymentTotals,
  getOrderPaymentTotalsForOrder,
  recomputeDraftPaymentPayables,
} from './order.ts';
import {OrderStatus, type Order} from '@/api/model/order.ts';

const cashType = {id: 'payment_type:cash', name: 'Cash', type: 'cash'};

describe('recomputeDraftPaymentPayables', () => {
  it('updates payable to the new check total', () => {
    const next = recomputeDraftPaymentPayables(
      [{amount: 100, payable: 100, payment_type: cashType}],
      80,
    );
    expect(next[0].payable).toBe(80);
  });
});

describe('getOrderPaymentTotals with stale payable', () => {
  it('caps collected when payable is higher than current due', () => {
    const order = {
      id: 'order:1',
      status: OrderStatus.Paid,
      items: [
        {
          id: 'order_item:1',
          quantity: 1,
          price: 50,
          item: {name: 'Dish', price: 50},
        },
      ],
      tip_amount: 0,
      tax_amount: 0,
      service_charge_amount: 0,
      discount_amount: 0,
      payments: [
        {
          id: 'pay:1',
          amount: 100,
          payable: 100,
          payment_type: cashType,
        },
      ],
    } as unknown as Order;

    const uncapped = getOrderPaymentTotals(order);
    expect(uncapped.amountCollected).toBe(100);

    const capped = getOrderPaymentTotalsForOrder(order);
    expect(capped.amountCollected).toBeLessThanOrEqual(50);
    expect(getAppliedPaymentAmount(order.payments![0])).toBe(100);
  });

  it('keeps payment share of grand total at or under 100% when paid in full', () => {
    const order = {
      id: 'order:2',
      status: OrderStatus.Paid,
      items: [
        {
          id: 'order_item:2',
          quantity: 1,
          price: 90,
          item: {name: 'Dish', price: 90},
        },
      ],
      tip_amount: 10,
      tax_amount: 0,
      service_charge_amount: 0,
      discount_amount: 0,
      payments: [
        {
          id: 'pay:2',
          amount: 100,
          payable: 100,
          payment_type: cashType,
        },
      ],
    } as unknown as Order;

    const totals = getOrderPaymentTotalsForOrder(order);
    const grand = 100;
    const pct = grand > 0 ? (totals.amountCollected / grand) * 100 : 0;
    expect(pct).toBeLessThanOrEqual(100.01);
  });
});
