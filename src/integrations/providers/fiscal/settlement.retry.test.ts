import { describe, expect, it, vi } from 'vitest';
import { Order, OrderStatus } from '@/api/model/order.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import {
  hasCompletedFiscalSubmission,
  retryFiscalSubmissionForOrder,
} from '@/integrations/providers/fiscal/settlement.ts';
import * as orderFiscalRepo from '@/integrations/storage/order-fiscal-repository.ts';
import * as submitModule from '@/integrations/providers/fiscal/submit-fiscal-invoice.ts';

const order = {
  id: 'order:1',
  invoice_number: 42,
  status: OrderStatus.Paid,
} as unknown as Order;

describe('hasCompletedFiscalSubmission', () => {
  it('returns true when a completed row exists for the provider', async () => {
    vi.spyOn(orderFiscalRepo, 'listOrderFiscalSubmissions').mockResolvedValue([
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:fbr',
        status: 'failed',
        qrcode: null,
      },
      {
        id: 'integration_order_fiscal:2',
        provider_id: 'provider:fbr',
        status: 'completed',
        qrcode: 'FBR-1',
      },
    ] as any);

    const db = { query: vi.fn(), create: vi.fn(), merge: vi.fn() };
    await expect(hasCompletedFiscalSubmission(db, 'order:1', 'provider:fbr')).resolves.toBe(true);
  });

  it('returns false when only failed rows exist', async () => {
    vi.spyOn(orderFiscalRepo, 'listOrderFiscalSubmissions').mockResolvedValue([
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:fbr',
        status: 'failed',
        error: 'timeout',
      },
    ] as any);

    const db = { query: vi.fn(), create: vi.fn(), merge: vi.fn() };
    await expect(hasCompletedFiscalSubmission(db, 'order:1', 'provider:fbr')).resolves.toBe(false);
  });
});

describe('retryFiscalSubmissionForOrder', () => {
  it('skips when provider already completed', async () => {
    vi.spyOn(orderFiscalRepo, 'listOrderFiscalSubmissions').mockResolvedValue([
      {
        id: 'integration_order_fiscal:1',
        provider_id: 'provider:pra',
        status: 'completed',
        invoice_number: 'PRA-1',
        qrcode: 'PRA-1',
      },
    ] as any);

    const submitSpy = vi.spyOn(submitModule, 'submitFiscalInvoices');
    const manager = {
      isProviderEnabled: () => true,
    } as unknown as IntegrationManager;
    const db = {
      query: vi.fn(async () => [order]),
      create: vi.fn(),
      merge: vi.fn(),
    };

    const result = await retryFiscalSubmissionForOrder(manager, db, 'order:1', 'provider:pra');
    expect(result).toEqual({ skipped: true, reason: 'already_completed' });
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('skips when provider is disabled', async () => {
    const manager = {
      isProviderEnabled: () => false,
    } as unknown as IntegrationManager;
    const db = { query: vi.fn(), create: vi.fn(), merge: vi.fn() };

    const result = await retryFiscalSubmissionForOrder(manager, db, 'order:1', 'provider:pra');
    expect(result).toEqual({ skipped: true, reason: 'provider_disabled' });
  });
});
