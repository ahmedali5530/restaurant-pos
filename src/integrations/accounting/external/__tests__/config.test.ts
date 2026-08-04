import { describe, expect, it } from 'vitest';
import { parseExternalAccountingConfig, validateExternalAccountMapping } from '@/integrations/accounting/external/config.ts';

describe('parseExternalAccountingConfig', () => {
  it('parses basic config with all fields', () => {
    const raw = {
      tenantId: 'realm-123',
      syncDirection: 'posr_to_external',
      syncIntervalMinutes: 30,
      saleDocumentType: 'invoice',
      enableClasses: true,
      enableDepartments: false,
      enableInventoryJournals: true,
      defaultCustomerId: 'CUST-1',
      defaultRevenueAccount: 'ACC-REV',
      SALES_REVENUE: 'ACC-SALES-123',
      CASH_MAIN: 'ACC-CASH-456',
      CARD_RECEIVABLE: 'ACC-CARD-789',
    };

    const config = parseExternalAccountingConfig(raw);

    expect(config.tenantId).toBe('realm-123');
    expect(config.syncDirection).toBe('posr_to_external');
    expect(config.syncIntervalMinutes).toBe(30);
    expect(config.saleDocumentType).toBe('invoice');
    expect(config.enableClasses).toBe(true);
    expect(config.enableDepartments).toBe(false);
    expect(config.enableInventoryJournals).toBe(true);
    expect(config.defaultCustomerId).toBe('CUST-1');
    expect(config.defaultRevenueAccount).toBe('ACC-REV');
    expect(config.accounts.SALES_REVENUE).toBe('ACC-SALES-123');
    expect(config.accounts.CASH_MAIN).toBe('ACC-CASH-456');
    expect(config.accounts.CARD_RECEIVABLE).toBe('ACC-CARD-789');
  });

  it('uses defaults when fields are missing', () => {
    const config = parseExternalAccountingConfig({});

    expect(config.tenantId).toBe('');
    expect(config.syncDirection).toBe('posr_to_external');
    expect(config.syncIntervalMinutes).toBe(60);
    expect(config.saleDocumentType).toBe('sales_receipt');
    expect(config.enableClasses).toBe(false);
    expect(config.enableDepartments).toBe(false);
    expect(config.enableInventoryJournals).toBe(true);
  });

  it('supports realmId as fallback for tenantId', () => {
    const config = parseExternalAccountingConfig({ realmId: 'realm-old' });
    expect(config.tenantId).toBe('realm-old');
  });

  it('tenantId takes precedence over realmId', () => {
    const config = parseExternalAccountingConfig({ tenantId: 'tenant-new', realmId: 'realm-old' });
    expect(config.tenantId).toBe('tenant-new');
  });

  it('parses payment mappings', () => {
    const raw = {
      paymentMappings: {
        'pm:cash': 'QBO-CASH',
        'pm:card': 'QBO-CARD',
      },
    };

    const config = parseExternalAccountingConfig(raw);
    expect(config.paymentMappings['pm:cash']).toBe('QBO-CASH');
    expect(config.paymentMappings['pm:card']).toBe('QBO-CARD');
  });

  it('parses payment account mappings', () => {
    const raw = {
      paymentAccountMappings: {
        'pm:cash': 'ACC-CASH-DEPOSIT',
      },
    };

    const config = parseExternalAccountingConfig(raw);
    expect(config.paymentAccountMappings['pm:cash']).toBe('ACC-CASH-DEPOSIT');
  });

  it('supports account_ prefix for account mappings', () => {
    const raw = {
      account_SALES_REVENUE: 'ACC-123',
    };

    const config = parseExternalAccountingConfig(raw);
    expect(config.accounts.SALES_REVENUE).toBe('ACC-123');
  });
});

describe('validateExternalAccountMapping', () => {
  it('passes with required mappings', () => {
    const mapping = {
      SALES_REVENUE: 'ACC-1',
      CASH_MAIN: 'ACC-2',
      CARD_RECEIVABLE: 'ACC-3',
      INVENTORY: 'ACC-4',
      COGS: 'ACC-5',
    } as any;

    const result = validateExternalAccountMapping(mapping);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when SALES_REVENUE is missing', () => {
    const mapping = {
      CASH_MAIN: 'ACC-2',
      CARD_RECEIVABLE: 'ACC-3',
      INVENTORY: 'ACC-4',
      COGS: 'ACC-5',
    } as any;

    const result = validateExternalAccountMapping(mapping);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SALES_REVENUE'))).toBe(true);
  });

  it('fails when multiple required accounts are missing', () => {
    const result = validateExternalAccountMapping({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(5);
  });
});
