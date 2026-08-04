import { describe, expect, it } from 'vitest';
import { serializeJournalEntry, QboJournalEntryInput } from '@/integrations/providers/accounting/quickbooks/serialize/journal-entry.ts';

describe('serializeJournalEntry', () => {
  const baseInput: QboJournalEntryInput = {
    txnDate: '2026-08-03',
    docNumber: 'JE-42',
    privateNote: 'POSR payroll posting',
    lines: [
      {
        description: 'Wages',
        amount: 5000,
        postingType: 'Debit',
        accountId: 'ACC-PAYROLL-EXP',
      },
      {
        description: 'Wages Payable',
        amount: 5000,
        postingType: 'Credit',
        accountId: 'ACC-PAYROLL-LIAB',
      },
    ],
  };

  it('serializes basic journal entry with debits and credits', () => {
    const result = serializeJournalEntry(baseInput);

    expect(result.TxnDate).toBe('2026-08-03');
    expect(result.DocNumber).toBe('JE-42');
    expect(result.PrivateNote).toBe('POSR payroll posting');
    expect(result.Line).toHaveLength(2);

    const debitLine = result.Line?.[0];
    expect(debitLine?.Amount).toBe(5000);
    expect(debitLine?.JournalEntryLineDetail?.PostingType).toBe('Debit');
    expect(debitLine?.JournalEntryLineDetail?.AccountRef?.value).toBe('ACC-PAYROLL-EXP');

    const creditLine = result.Line?.[1];
    expect(creditLine?.Amount).toBe(5000);
    expect(creditLine?.JournalEntryLineDetail?.PostingType).toBe('Credit');
    expect(creditLine?.JournalEntryLineDetail?.AccountRef?.value).toBe('ACC-PAYROLL-LIAB');
  });

  it('includes optional class, department, customer, vendor on lines', () => {
    const input: QboJournalEntryInput = {
      lines: [
        {
          description: 'COGS',
          amount: 100,
          postingType: 'Debit',
          accountId: 'ACC-COGS',
          classId: 'CLASS-BAR',
          departmentId: 'DEPT-FOH',
          customerId: 'CUST-1',
        },
      ],
    };

    const result = serializeJournalEntry(input);
    const detail = result.Line?.[0]?.JournalEntryLineDetail;
    expect(detail?.ClassRef?.value).toBe('CLASS-BAR');
    expect(detail?.DepartmentRef?.value).toBe('DEPT-FOH');
    expect(detail?.CustomerRef?.value).toBe('CUST-1');
  });

  it('includes vendor ref when present', () => {
    const input: QboJournalEntryInput = {
      lines: [
        {
          description: 'AP',
          amount: 200,
          postingType: 'Credit',
          accountId: 'ACC-AP',
          vendorId: 'VEND-1',
        },
      ],
    };

    const result = serializeJournalEntry(input);
    expect(result.Line?.[0]?.JournalEntryLineDetail?.VendorRef?.value).toBe('VEND-1');
  });

  it('uses today as default TxnDate', () => {
    const input: QboJournalEntryInput = {
      lines: [{ amount: 1, postingType: 'Debit', accountId: 'ACC' }],
    };

    const result = serializeJournalEntry(input);
    expect(result.TxnDate).toBeTruthy();
  });

  it('includes currency when provided', () => {
    const input: QboJournalEntryInput = {
      lines: [{ amount: 1, postingType: 'Debit', accountId: 'ACC' }],
      currencyCode: 'USD',
    };

    const result = serializeJournalEntry(input);
    expect(result.CurrencyRef?.value).toBe('USD');
  });

  it('omits optional fields when not provided', () => {
    const input: QboJournalEntryInput = {
      lines: [{ amount: 1, postingType: 'Debit', accountId: 'ACC' }],
    };

    const result = serializeJournalEntry(input);
    expect(result.DocNumber).toBeUndefined();
    expect(result.Line?.[0]?.JournalEntryLineDetail?.ClassRef).toBeUndefined();
    expect(result.Line?.[0]?.JournalEntryLineDetail?.CustomerRef).toBeUndefined();
  });
});
