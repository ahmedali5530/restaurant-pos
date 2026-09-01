/**
 * Serialize a POSR journal draft into a QuickBooks JournalEntry.
 * Converts debits/credits with mapped account references.
 */

export interface QboJournalEntryInput {
  txnDate?: string;
  docNumber?: string;
  privateNote?: string;
  lines: Array<{
    description?: string;
    amount: number;
    postingType: 'Debit' | 'Credit';
    accountId: string;
    classId?: string;
    departmentId?: string;
    customerId?: string;
    vendorId?: string;
  }>;
  currencyCode?: string;
}

export interface QboJournalEntryPayload {
  TxnDate?: string;
  DocNumber?: string;
  PrivateNote?: string;
  Line?: Array<{
    Description?: string;
    Amount?: number;
    DetailType: string;
    JournalEntryLineDetail: {
      PostingType: string;
      AccountRef: { value: string };
      ClassRef?: { value: string };
      DepartmentRef?: { value: string };
      CustomerRef?: { value: string };
      VendorRef?: { value: string };
    };
  }>;
  CurrencyRef?: { value: string; name?: string };
}

export const serializeJournalEntry = (input: QboJournalEntryInput): QboJournalEntryPayload => {
  const lines = input.lines.map((line) => ({
    Description: line.description,
    Amount: line.amount,
    DetailType: 'JournalEntryLineDetail',
    JournalEntryLineDetail: {
      PostingType: line.postingType,
      AccountRef: { value: line.accountId },
      ...(line.classId ? { ClassRef: { value: line.classId } } : {}),
      ...(line.departmentId ? { DepartmentRef: { value: line.departmentId } } : {}),
      ...(line.customerId ? { CustomerRef: { value: line.customerId } } : {}),
      ...(line.vendorId ? { VendorRef: { value: line.vendorId } } : {}),
    },
  }));

  const payload: QboJournalEntryPayload = {
    Line: lines,
    TxnDate: input.txnDate ?? new Date().toISOString().slice(0, 10),
    PrivateNote: input.privateNote ?? 'POSR — auto-generated journal entry',
  };

  if (input.docNumber) {
    payload.DocNumber = input.docNumber;
  }

  if (input.currencyCode) {
    payload.CurrencyRef = { value: input.currencyCode };
  }

  return payload;
};
