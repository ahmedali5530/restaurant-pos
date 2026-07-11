import { describe, expect, it } from 'vitest';
import { Order, OrderStatus } from '@/api/model/order.ts';
import {
  formatPkFiscalAmount,
  mapPkPaymentMode,
  serializePkFiscalInvoice,
} from '@/integrations/providers/fiscal/pk-fbr-pra/serialize-invoice.ts';

const baseOrder = {
  id: 'order:1',
  invoice_number: 42,
  auto_id: 1,
  status: OrderStatus['In Progress'],
  created_at: {} as Order['created_at'],
  floor: {} as Order['floor'],
  table: {} as Order['table'],
  order_type: {} as Order['order_type'],
  user: {} as Order['user'],
  tax: { id: 'tax:1', name: 'GST', rate: 16, priority: 1 },
  tax_amount: 16,
  discount_amount: 5,
  service_charge_amount: 10,
  tip_amount: 2,
  items: [
    {
      id: 'order_item:1',
      quantity: 2,
      price: 50,
      discount: 0,
      item: { id: 'menu_item:1', name: 'Tea', price: 50 } as Order['items'][number]['item'],
      modifiers: [],
      position: 0,
      created_at: {} as Order['items'][number]['created_at'],
      tax_mode: 'exclusive' as const,
    },
  ],
  payments: [
    {
      id: 'order_payment:1',
      amount: 100,
      payable: 113,
      payment_type: { id: 'payment_type:1', name: 'Cash', type: 'Cash' },
    },
  ],
} as unknown as Order;

describe('serializePkFiscalInvoice', () => {
  it('formats amounts with two decimals', () => {
    expect(formatPkFiscalAmount(12.5)).toBe('12.50');
  });

  it('maps cash payment mode to 1 and card to 2', () => {
    expect(mapPkPaymentMode(baseOrder)).toBe(1);
    expect(
      mapPkPaymentMode({
        ...baseOrder,
        payments: [
          {
            ...baseOrder.payments![0],
            payment_type: { id: 'payment_type:2', name: 'Card', type: 'Card' },
          },
        ],
      } as Order)
    ).toBe(2);
  });

  it('uses SaleValue+Tax for PRA and non-Punjab FBR TotalAmount', () => {
    const pra = serializePkFiscalInvoice(baseOrder, 'pra', {
      posId: 'POS-1',
      defaultPctCode: '69111020',
      invoiceType: 1,
    });
    expect(pra.POSID).toBe('POS-1');
    expect(pra.USIN).toBe('42');
    expect(pra.Items[0].PCTCode).toBe('69111020');
    expect(pra.Items[0].Quantity).toBe('2.00');
    expect(Number(pra.Items[0].TotalAmount)).toBeGreaterThan(Number(pra.Items[0].SaleValue));

    const fbr = serializePkFiscalInvoice(baseOrder, 'fbr', {
      posId: 'POS-1',
      defaultPctCode: '69111020',
      punjabMode: false,
    });
    expect(fbr.Items[0].TotalAmount).toBe(pra.Items[0].TotalAmount);
  });

  it('uses SaleValue-only TotalAmount for FBR Punjab mode', () => {
    const fbr = serializePkFiscalInvoice(baseOrder, 'fbr', {
      posId: 'POS-1',
      defaultPctCode: '69111020',
      punjabMode: true,
    });
    const qty = Number(fbr.Items[0].Quantity);
    const sale = Number(fbr.Items[0].SaleValue);
    expect(fbr.Items[0].TotalAmount).toBe((qty * sale).toFixed(2));
  });
});
