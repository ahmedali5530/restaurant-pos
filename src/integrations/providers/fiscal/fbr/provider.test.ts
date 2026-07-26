import { describe, expect, it, vi } from 'vitest';
import { Order, OrderStatus } from '@/api/model/order.ts';
import { FbrProvider } from '@/integrations/providers/fiscal/fbr/provider.ts';
import { TransportRouter } from '@/integrations/transport/router.ts';
import { apiUrl } from '@/lib/api.service.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

const order = {
  id: 'order:1',
  invoice_number: 7,
  auto_id: 1,
  status: OrderStatus.Paid,
  created_at: {} as Order['created_at'],
  floor: {} as Order['floor'],
  table: {} as Order['table'],
  order_type: {} as Order['order_type'],
  user: {} as Order['user'],
  tax: { id: 'tax:1', name: 'GST', rate: 16, priority: 1 },
  tax_amount: 16,
  items: [
    {
      id: 'order_item:1',
      quantity: 1,
      price: 100,
      item: { id: 'menu_item:1', name: 'Item', price: 100 },
      modifiers: [],
      position: 0,
      created_at: {},
      tax_mode: 'exclusive',
    },
  ],
  payments: [
    {
      id: 'order_payment:1',
      amount: 116,
      payable: 116,
      payment_type: { id: 'payment_type:1', name: 'Cash', type: 'Cash' },
    },
  ],
} as unknown as Order;

describe('FbrProvider execute', () => {
  it('sends Bearer token and returns InvoiceNumber on Code 100', async () => {
    const provider = new FbrProvider();
    provider.setConfigLoader(async () => ({
      apiBaseUrl: 'https://fbr.example/invoice',
      bearerToken: 'secret-token',
      posId: '123',
      defaultPctCode: '69111020',
      sellerNtn: '1234567',
    }));

    const send = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: { Code: 100, InvoiceNumber: 'FBR-INV-1', Response: 'OK' },
    }));
    const transport = { send } as unknown as TransportRouter;
    provider.setTransport(transport);

    const response = await provider.execute(
      { action: 'invoiceSubmission', payload: { order } },
      { providerId: 'provider:fbr', now: nowSurrealDateTime() }
    );

    expect(response.success).toBe(true);
    expect(response.data?.invoiceNumber).toBe('FBR-INV-1');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: apiUrl('/fiscal/invoice'),
        body: expect.objectContaining({
          url: 'https://fbr.example/invoice',
          bearerToken: 'secret-token',
          payload: expect.any(Object),
        }),
      })
    );
  });

  it('fails when authority Code is not 100', async () => {
    const provider = new FbrProvider();
    provider.setConfigLoader(async () => ({
      apiBaseUrl: 'https://fbr.example/invoice',
      bearerToken: 'secret-token',
      posId: '123',
      defaultPctCode: '69111020',
      sellerNtn: '1234567',
    }));
    provider.setTransport({
      send: async () => ({
        ok: true,
        status: 200,
        body: { Code: 101, Response: 'Invalid POSID' },
      }),
    } as unknown as TransportRouter);

    const response = await provider.execute(
      { action: 'invoiceSubmission', payload: { order } },
      { providerId: 'provider:fbr', now: nowSurrealDateTime() }
    );

    expect(response.success).toBe(false);
    expect(response.error).toContain('Invalid POSID');
  });
});
