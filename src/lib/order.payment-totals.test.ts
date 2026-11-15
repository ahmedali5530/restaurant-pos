import {describe, expect, it} from 'bun:test';
import {
  getAppliedPaymentAmount,
  getDraftPaymentChangeDisplay,
  getOrderPaymentTotals,
  getOrderPaymentTotalsForOrder,
  recomputeDraftPaymentPayables,
  recomputeDraftPaymentsForTotal,
} from './order.ts';
import {OrderStatus, type Order} from '@/api/model/order.ts';

const cashType = {id: 'payment_type:cash', name: 'Cash', type: 'cash'};
const cardType = {id: 'payment_type:card', name: 'Card', type: 'Card'};
const cardTypeLower = {id: 'payment_type:card2', name: 'Visa', type: 'card'};

describe('recomputeDraftPaymentPayables', () => {
  it('updates payable to the new check total', () => {
    const next = recomputeDraftPaymentPayables(
      [{amount: 100, payable: 100, payment_type: cashType}],
      80,
    );
    expect(next[0].payable).toBe(80);
  });
});

describe('recomputeDraftPaymentsForTotal', () => {
  it('sets single card amount to the new due', () => {
    const next = recomputeDraftPaymentsForTotal(
      [{id: 'a', amount: 100, payable: 100, payment_type: cardType}],
      80,
    );
    expect(next).toHaveLength(1);
    expect(next[0].amount).toBe(80);
    expect(next[0].payable).toBe(80);
  });

  it('keeps cash amount sticky when total drops', () => {
    const next = recomputeDraftPaymentsForTotal(
      [{id: 'c', amount: 120, payable: 100, payment_type: cashType}],
      80,
    );
    expect(next[0].amount).toBe(120);
    expect(next[0].payable).toBe(80);
  });

  it('reduces card remainder after cash when total drops', () => {
    const next = recomputeDraftPaymentsForTotal(
      [
        {id: 'c', amount: 50, payable: 100, payment_type: cashType},
        {id: 'a', amount: 50, payable: 100, payment_type: cardType},
      ],
      80,
    );
    expect(next.find((p) => p.id === 'c')?.amount).toBe(50);
    expect(next.find((p) => p.id === 'a')?.amount).toBe(30);
  });

  it('waterfalls decrease onto the last card first', () => {
    const next = recomputeDraftPaymentsForTotal(
      [
        {id: 'a', amount: 40, payable: 100, payment_type: cardType},
        {id: 'b', amount: 60, payable: 100, payment_type: cardTypeLower},
      ],
      80,
    );
    expect(next.find((p) => p.id === 'a')?.amount).toBe(40);
    expect(next.find((p) => p.id === 'b')?.amount).toBe(40);
  });

  it('drops the last card and reduces the earlier card when delta is large', () => {
    const next = recomputeDraftPaymentsForTotal(
      [
        {id: 'a', amount: 40, payable: 100, payment_type: cardType},
        {id: 'b', amount: 60, payable: 100, payment_type: cardType},
      ],
      30,
    );
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('a');
    expect(next[0].amount).toBe(30);
  });

  it('bumps only the last card when total increases', () => {
    const next = recomputeDraftPaymentsForTotal(
      [
        {id: 'a', amount: 40, payable: 80, payment_type: cardType},
        {id: 'b', amount: 40, payable: 80, payment_type: cardType},
      ],
      100,
    );
    expect(next.find((p) => p.id === 'a')?.amount).toBe(40);
    expect(next.find((p) => p.id === 'b')?.amount).toBe(60);
  });

  it('sets sole card up when total increases', () => {
    const next = recomputeDraftPaymentsForTotal(
      [{id: 'a', amount: 80, payable: 80, payment_type: cardType}],
      100,
    );
    expect(next[0].amount).toBe(100);
  });

  it('does not rewrite remote-captured card amounts', () => {
    const next = recomputeDraftPaymentsForTotal(
      [
        {
          id: 'r',
          amount: 60,
          payable: 100,
          payment_type: cardType,
          comments: JSON.stringify({provider: 'stripe', intentId: 'pi_1'}),
        },
        {id: 'a', amount: 40, payable: 100, payment_type: cardType},
      ],
      80,
    );
    expect(next.find((p) => p.id === 'r')?.amount).toBe(60);
    expect(next.find((p) => p.id === 'a')?.amount).toBe(20);
  });
});

describe('getDraftPaymentChangeDisplay', () => {
  it('shows remaining when underpaid', () => {
    const d = getDraftPaymentChangeDisplay(
      [{amount: 40, payment_type: cardType}],
      100,
    );
    expect(d.isRemaining).toBe(true);
    expect(d.remaining).toBe(60);
    expect(d.displayAmount).toBe(-60);
  });

  it('shows change only for cash over-tender, not stale card', () => {
    const cardOnly = getDraftPaymentChangeDisplay(
      [{amount: 100, payment_type: cardType}],
      80,
    );
    // Before reconcile this would look like change; display guard treats exact as applied.
    // After reconcile amounts match; if somehow over, exact still should not show cash change.
    expect(cardOnly.change).toBe(0);

    const cashOver = getDraftPaymentChangeDisplay(
      [{amount: 120, payment_type: cashType}],
      80,
    );
    expect(cashOver.isRemaining).toBe(false);
    expect(cashOver.change).toBe(40);
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
