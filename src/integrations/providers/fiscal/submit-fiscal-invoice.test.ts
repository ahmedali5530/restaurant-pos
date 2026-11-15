import { describe, expect, it, vi } from 'vitest';
import { Order, OrderStatus } from '@/api/model/order.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { submitFiscalInvoices } from '@/integrations/providers/fiscal/submit-fiscal-invoice.ts';

const order = {
  id: 'order:1',
  invoice_number: 42,
  status: OrderStatus.Paid,
} as unknown as Order;

const fbrManifest = {
  id: 'provider:fbr',
  category: 'fiscal',
  configurationSchema: { fields: [], sections: [] },
};

const praManifest = {
  id: 'provider:pra',
  category: 'fiscal',
  configurationSchema: { fields: [], sections: [] },
};

describe('submitFiscalInvoices providerIds filter', () => {
  it('only submits the requested provider ids', async () => {
    const executeImmediate = vi.fn(async (providerId: string) => ({
      success: true,
      status: 'completed',
      providerId,
      data: { invoiceNumber: `${providerId}-INV`, code: 100 },
    }));

    const manager = {
      getEnabledProvidersByCategory: () => [fbrManifest, praManifest],
      executeImmediate,
    } as unknown as IntegrationManager;

    const result = await submitFiscalInvoices(manager, order, {
      getConfig: async () => ({ qrPriority: 50 }),
      providerIds: ['provider:pra'],
    });

    expect(executeImmediate).toHaveBeenCalledTimes(1);
    expect(executeImmediate).toHaveBeenCalledWith(
      'provider:pra',
      expect.objectContaining({
        action: 'invoiceSubmission',
        idempotencyKey: 'fiscal:order:1:provider:pra',
      })
    );
    expect(Object.keys(result.resultsByProvider)).toEqual(['provider:pra']);
    expect(result.resultsByProvider['provider:pra']?.status).toBe('completed');
  });

  it('returns empty results when filtered provider is not enabled', async () => {
    const manager = {
      getEnabledProvidersByCategory: () => [fbrManifest],
      executeImmediate: vi.fn(),
    } as unknown as IntegrationManager;

    const result = await submitFiscalInvoices(manager, order, {
      getConfig: async () => ({}),
      providerIds: ['provider:pra'],
    });

    expect(result.resultsByProvider).toEqual({});
    expect(manager.executeImmediate).not.toHaveBeenCalled();
  });

  it('skips authority POST when a completed fiscal row already exists', async () => {
    const executeImmediate = vi.fn();
    const manager = {
      getEnabledProvidersByCategory: () => [praManifest],
      executeImmediate,
    } as unknown as IntegrationManager;

    const db = {
      query: vi.fn(async () => [[
        {
          provider_id: 'provider:pra',
          status: 'completed',
          invoice_number: '198081FJPT52538296',
          qrcode: '198081FJPT52538296',
          code: 100,
        },
      ]]),
      create: vi.fn(),
      merge: vi.fn(),
    };

    const result = await submitFiscalInvoices(manager, order, {
      getConfig: async () => ({ qrPriority: 50 }),
      db: db as any,
      providerIds: ['provider:pra'],
    });

    expect(executeImmediate).not.toHaveBeenCalled();
    expect(result.resultsByProvider['provider:pra']?.status).toBe('skipped');
    expect(result.resultsByProvider['provider:pra']?.error).toBe('already_completed');
    expect(result.resultsByProvider['provider:pra']?.invoiceNumber).toBe('198081FJPT52538296');
    expect(result.qrcode).toBe('198081FJPT52538296');
  });
});
