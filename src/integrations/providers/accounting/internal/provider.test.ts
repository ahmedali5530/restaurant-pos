import { describe, expect, it, vi } from 'vitest';
import { InternalAccountingProvider } from '@/integrations/providers/accounting/internal/provider.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';
import { JournalDraftRequest } from '@/integrations/accounting/types.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { SaleCompletedPayload } from '@/integrations/accounting/events/payloads.ts';

const draft: JournalDraftRequest = {
  date: new Date().toISOString(),
  memo: 'POS sale',
  lines: [
    {
      accountId: 'account:cash',
      logicalAccount: 'CASH_MAIN',
      debit: 116,
      credit: 0,
    },
    {
      accountId: 'account:sales',
      logicalAccount: 'SALES_REVENUE',
      debit: 0,
      credit: 100,
    },
    {
      accountId: 'account:vat',
      logicalAccount: 'VAT_OUTPUT',
      debit: 0,
      credit: 16,
    },
  ],
  status: 'draft',
  originEvent: 'SaleCompleted',
  originModule: 'pos-core',
  originRecordId: 'order:1',
  integrationProviderId: 'provider:internal-accounting',
  postingRuleId: 'rule:sale-completed-restaurant-sale',
  journalTemplateId: 'restaurant_sale',
  idempotencyKey: 'accounting:SaleCompleted:order:1',
  generatedAt: new Date().toISOString(),
};

describe('InternalAccountingProvider', () => {
  it('fails validate when sale accounts are missing', async () => {
    const provider = new InternalAccountingProvider();
    provider.setConfigLoader(async () => ({}));
    const result = await provider.validate();
    expect(result.valid).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('validates when required mappings exist', async () => {
    const provider = new InternalAccountingProvider();
    provider.setConfigLoader(async () => ({
      SALES_REVENUE: 'account:sales',
      CASH_MAIN: 'account:cash',
      CARD_RECEIVABLE: 'account:card',
    }));
    const result = await provider.validate();
    expect(result.valid).toBe(true);
  });

  it('postJournal persists draft via repository', async () => {
    const provider = new InternalAccountingProvider();
    const insert = vi.fn(async (_table: string, data: Record<string, unknown>) => [
      { id: data.entry_number ? 'account_journal_entry:1' : 'account_journal_line:1' },
    ]);
    const merge = vi.fn(async () => undefined);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('idempotency_key')) {
        return [[]];
      }
      return [[{ max_value: 0 }]];
    });

    provider.setDbLoader(() => ({ query, insert, merge } as any));
    provider.setConfigLoader(async () => ({
      SALES_REVENUE: 'account:sales',
      CASH_MAIN: 'account:cash',
      CARD_RECEIVABLE: 'account:card',
    }));

    const response = await provider.execute(
      { action: 'postJournal', payload: draft as unknown as Record<string, unknown> },
      { providerId: 'provider:internal-accounting', now: nowSurrealDateTime() }
    );

    expect(response.success).toBe(true);
    expect(response.data).toEqual(
      expect.objectContaining({
        duplicate: false,
        status: 'draft',
      })
    );
    expect(insert).toHaveBeenCalled();
  });

  it('returns existing entry on duplicate idempotency key', async () => {
    const provider = new InternalAccountingProvider();
    const query = vi.fn(async () => [
      [{ id: 'account_journal_entry:existing', entry_number: 9, status: 'draft' }],
    ]);
    const insert = vi.fn();
    provider.setDbLoader(() => ({
      query,
      insert,
      merge: vi.fn(),
    } as any));

    const response = await provider.execute(
      { action: 'postJournal', payload: draft as unknown as Record<string, unknown> },
      { providerId: 'provider:internal-accounting', now: nowSurrealDateTime() }
    );

    expect(response.success).toBe(true);
    expect(response.data).toEqual(
      expect.objectContaining({
        duplicate: true,
        entryId: 'account_journal_entry:existing',
        entryNumber: 9,
      })
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('handleEvent enqueues postJournal via job enqueuer', async () => {
    const provider = new InternalAccountingProvider();
    const enqueue = vi.fn(async () => undefined);
    provider.setJobEnqueuer(enqueue);
    provider.setConfigLoader(async () => ({
      SALES_REVENUE: 'account:sales',
      VAT_OUTPUT: 'account:vat',
      CASH_MAIN: 'account:cash',
      CARD_RECEIVABLE: 'account:card',
    }));

    const payload: SaleCompletedPayload = {
      orderId: 'order:1',
      subtotal: 100,
      taxAmount: 16,
      discountAmount: 0,
      tipAmount: 0,
      totalCollected: 116,
      tenders: { cashAmount: 116, cardAmount: 0, otherAmount: 0 },
    };

    await provider.handleEvent(
      createPosEvent('SaleCompleted', payload, 'pos-core', 'SaleCompleted:order:1')
    );

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'postJournal',
        idempotencyKey: 'accounting:SaleCompleted:order:1',
      })
    );
  });
});
