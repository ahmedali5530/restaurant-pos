import { describe, expect, it, vi } from 'vitest';
import { AccountingPostingEngine } from '@/integrations/accounting/posting-engine.ts';
import { buildSaleCompletedAmountContext } from '@/integrations/accounting/templates/builder.ts';
import { findMatchingPostingRule } from '@/integrations/accounting/rules/default-rules.ts';
import { parseInternalAccountingConfig } from '@/integrations/accounting/mapping/account-mapping.ts';
import { buildAccountingIdempotencyKey } from '@/integrations/accounting/idempotency.ts';
import { SaleCompletedPayload } from '@/integrations/accounting/events/payloads.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';

const mapping = {
  SALES_REVENUE: 'account:sales',
  VAT_OUTPUT: 'account:vat',
  CASH_MAIN: 'account:cash',
  CARD_RECEIVABLE: 'account:card',
  DISCOUNT: 'account:discount',
  TIPS: 'account:tips',
};

const salePayload: SaleCompletedPayload = {
  orderId: 'order:42',
  subtotal: 100,
  taxAmount: 16,
  discountAmount: 0,
  tipAmount: 0,
  totalCollected: 116,
  tenders: {
    cashAmount: 50,
    cardAmount: 66,
    otherAmount: 0,
  },
};

describe('Accounting posting engine', () => {
  it('matches SaleCompleted to restaurant_sale rule', () => {
    const event = createPosEvent('SaleCompleted', salePayload, 'pos-core', 'SaleCompleted:order:42');
    const rule = findMatchingPostingRule(event);
    expect(rule?.templateId).toBe('restaurant_sale');
  });

  it('builds balanced draft and calls sink with postJournal', async () => {
    const engine = new AccountingPostingEngine();
    const event = createPosEvent('SaleCompleted', salePayload, 'pos-core', 'SaleCompleted:order:42');
    const sink = vi.fn(async () => undefined);

    const result = await engine.process(
      event,
      {
        autoPublish: false,
        postingMode: 'draft',
        accounts: mapping,
      },
      'provider:internal-accounting',
      sink
    );

    expect(result.handled).toBe(true);
    expect(result.draft?.status).toBe('draft');
    expect(result.draft?.idempotencyKey).toBe(
      buildAccountingIdempotencyKey('SaleCompleted:order:42')
    );
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'postJournal',
        idempotencyKey: buildAccountingIdempotencyKey('SaleCompleted:order:42'),
      })
    );

    const debit = result.draft!.lines.reduce((sum, line) => sum + line.debit, 0);
    const credit = result.draft!.lines.reduce((sum, line) => sum + line.credit, 0);
    expect(Number(debit.toFixed(2))).toBe(Number(credit.toFixed(2)));
  });

  it('marks draft posted when autoPublish is enabled', async () => {
    const engine = new AccountingPostingEngine();
    const event = createPosEvent('SaleCompleted', salePayload, 'pos-core', 'SaleCompleted:order:42');
    const sink = vi.fn(async () => undefined);

    const result = await engine.process(
      event,
      {
        autoPublish: true,
        postingMode: 'auto_publish',
        accounts: mapping,
      },
      'provider:internal-accounting',
      sink
    );

    expect(result.draft?.status).toBe('posted');
  });

  it('fails when required account mapping is missing', async () => {
    const engine = new AccountingPostingEngine();
    const event = createPosEvent('SaleCompleted', salePayload, 'pos-core', 'SaleCompleted:order:42');
    const sink = vi.fn(async () => undefined);

    const result = await engine.process(
      event,
      {
        autoPublish: false,
        postingMode: 'draft',
        accounts: { CASH_MAIN: 'account:cash' },
      },
      'provider:internal-accounting',
      sink
    );

    expect(result.handled).toBe(false);
    expect(result.error).toContain('No GL mapping');
    expect(sink).not.toHaveBeenCalled();
  });

  it('builds amount context for cash/card/tax', () => {
    const amounts = buildSaleCompletedAmountContext(salePayload);
    expect(amounts.cashAmount).toBe(50);
    expect(amounts.cardAmount).toBe(66);
    expect(amounts.taxAmount).toBe(16);
    expect(amounts.salesRevenue).toBe(100);
  });
});

describe('Internal accounting config', () => {
  it('defaults autoPublish to off', () => {
    const config = parseInternalAccountingConfig({
      SALES_REVENUE: 'account:1',
      CASH_MAIN: 'account:2',
      CARD_RECEIVABLE: 'account:3',
    });
    expect(config.autoPublish).toBe(false);
    expect(config.postingMode).toBe('draft');
    expect(config.accounts.SALES_REVENUE).toBe('account:1');
  });
});
