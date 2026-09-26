import {describe, expect, it} from 'vitest';
import {
  aggregateAppliedPaymentsByTypeId,
  getAppliedPaymentAmount,
  getOrderPaymentTotals,
  isCashPaymentType,
} from '@/lib/order.ts';

const cashType = {id: 'payment_type:cash', name: 'Cash', type: 'cash'};
const cardType = {id: 'payment_type:card', name: 'Card', type: 'card'};

describe('getAppliedPaymentAmount', () => {
  it('uses payable when tendered amount is higher', () => {
    expect(getAppliedPaymentAmount({amount: 100, payable: 75, payment_type: cashType} as any)).toBe(75);
  });

  it('uses the tendered amount when it is not an over-tender', () => {
    expect(getAppliedPaymentAmount({amount: 40, payable: 40, payment_type: cardType} as any)).toBe(40);
  });
});

describe('getOrderPaymentTotals', () => {
  it('excludes change from cash collected', () => {
    const totals = getOrderPaymentTotals({
      payments: [
        {amount: 100, payable: 82.5, payment_type: cashType},
        {amount: 20, payable: 20, payment_type: cardType},
      ],
    } as any);

    expect(totals.cashAmount).toBe(82.5);
    expect(totals.nonCashAmount).toBe(20);
    expect(totals.amountCollected).toBe(102.5);
    expect(totals.change).toBe(17.5);
    expect(totals.nonCashBreakdown.Card).toBe(20);
  });

  it('accepts a single fetched payment record', () => {
    const totals = getOrderPaymentTotals({
      payments: {amount: 50, payable: 50, payment_type: cardType},
    } as any);

    expect(totals.nonCashAmount).toBe(50);
    expect(totals.cashAmount).toBe(0);
  });
});

describe('aggregateAppliedPaymentsByTypeId', () => {
  it('sums applied amounts by payment type id', () => {
    const totals = aggregateAppliedPaymentsByTypeId([
      {
        payments: [
          {amount: 100, payable: 70, payment_type: cashType},
          {amount: 15, payable: 15, payment_type: cardType},
        ],
      },
      {
        payments: [{amount: 10, payable: 10, payment_type: cashType}],
      },
    ] as any);

    expect(totals.get('payment_type:cash')).toBe(80);
    expect(totals.get('payment_type:card')).toBe(15);
  });
});

describe('isCashPaymentType', () => {
  it('matches cash by type or name', () => {
    expect(isCashPaymentType({type: 'Cash', name: 'Register'})).toBe(true);
    expect(isCashPaymentType({type: 'other', name: 'cash'})).toBe(true);
    expect(isCashPaymentType({type: 'card', name: 'Visa'})).toBe(false);
  });
});
