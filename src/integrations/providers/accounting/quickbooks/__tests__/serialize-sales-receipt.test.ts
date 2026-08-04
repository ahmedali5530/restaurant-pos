import { describe, expect, it } from 'vitest';
import { serializeSalesReceipt, QboSalesReceiptInput } from '@/integrations/providers/accounting/quickbooks/serialize/sales-receipt.ts';

describe('serializeSalesReceipt', () => {
  const baseInput: QboSalesReceiptInput = {
    docNumber: 'POSR-42',
    customerId: 'CUST-1',
    customerName: 'Test Customer',
    lines: [
      {
        itemName: 'Burger',
        description: 'Classic Burger',
        quantity: 2,
        unitPrice: 10,
        amount: 20,
        taxCodeId: 'TAX-1',
        accountId: 'ACC-REV',
      },
    ],
    subtotal: 20,
    taxAmount: 3.2,
    total: 23.2,
    paymentMethodId: 'PM-CASH',
    depositToAccountId: 'ACC-DEP',
    txnDate: '2026-08-03',
  };

  it('serializes basic sale receipt', () => {
    const result = serializeSalesReceipt(baseInput);

    expect(result.DocNumber).toBe('POSR-42');
    expect(result.CustomerRef?.value).toBe('CUST-1');
    expect(result.CustomerRef?.name).toBe('Test Customer');
    expect(result.TxnDate).toBe('2026-08-03');
    expect(result.Line).toHaveLength(1);
    expect(result.Line?.[0].DetailType).toBe('SalesItemLineDetail');
    expect(result.Line?.[0].Amount).toBe(20);
    expect(result.Line?.[0].SalesItemLineDetail?.Qty).toBe(2);
    expect(result.Line?.[0].SalesItemLineDetail?.UnitPrice).toBe(10);
    expect(result.PaymentMethodRef?.value).toBe('PM-CASH');
    expect(result.DepositToAccountRef?.value).toBe('ACC-DEP');
    expect(result.ApplyTaxAfterDiscount).toBe(true);
  });

  it('adds discount line when discount amount > 0', () => {
    const input = { ...baseInput, discountAmount: 5 };
    const result = serializeSalesReceipt(input);

    expect(result.Line).toHaveLength(2);
    const discountLine = result.Line?.[1];
    expect(discountLine?.Amount).toBe(-5);
    expect(discountLine?.Description).toBe('Discount');
  });

  it('adds tip line when tip amount > 0', () => {
    const input = { ...baseInput, tipAmount: 3 };
    const result = serializeSalesReceipt(input);

    const tipLine = result.Line?.find((l) => l.Description === 'Tip / Service Charge');
    expect(tipLine?.Amount).toBe(3);
  });

  it('includes discount and tip lines when both present', () => {
    const input = { ...baseInput, discountAmount: 2, tipAmount: 4 };
    const result = serializeSalesReceipt(input);

    expect(result.Line).toHaveLength(3);
  });

  it('omits discount line when zero', () => {
    const input = { ...baseInput, discountAmount: 0 };
    const result = serializeSalesReceipt(input);

    expect(result.Line?.some((l) => l.Description === 'Discount')).toBe(false);
  });

  it('includes class and department when present', () => {
    const input = { ...baseInput, classId: 'CLASS-1', departmentId: 'DEPT-1' };
    const result = serializeSalesReceipt(input);

    expect(result.ClassRef?.value).toBe('CLASS-1');
    expect(result.DepartmentRef?.value).toBe('DEPT-1');
  });

  it('includes currency and exchange rate', () => {
    const input = { ...baseInput, currencyCode: 'EUR', exchangeRate: 0.92 };
    const result = serializeSalesReceipt(input);

    expect(result.CurrencyRef?.value).toBe('EUR');
    expect(result.ExchangeRate).toBe(0.92);
  });

  it('includes sales term when provided', () => {
    const input = { ...baseInput, salesTermId: 'TERM-30' };
    const result = serializeSalesReceipt(input);

    expect(result.SalesTermRef?.value).toBe('TERM-30');
  });

  it('uses today as default TxnDate when not provided', () => {
    const { txnDate, ...input } = baseInput;
    const result = serializeSalesReceipt(input);
    expect(result.TxnDate).toBeTruthy();
  });
});
