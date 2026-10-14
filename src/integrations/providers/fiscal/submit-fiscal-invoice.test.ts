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
});
