/**
 * Serialize a POSR completed sale into a QuickBooks Invoice.
 */

export interface QboInvoiceInput {
  customerId?: string;
  customerName?: string;
  lines: Array<{
    itemName?: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    taxCodeId?: string;
    accountId?: string;
    classId?: string;
  }>;
  subtotal: number;
  taxAmount?: number;
  tipAmount?: number;
  discountAmount?: number;
  total: number;
  taxCodeId?: string;
  txnDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
  classId?: string;
  departmentId?: string;
  currencyCode?: string;
}

export interface QboInvoicePayload {
  DocNumber?: string;
  CustomerRef?: { value: string; name?: string };
  Line?: Array<{
    DetailType: string;
    Amount: number;
    SalesItemLineDetail?: {
      ItemRef?: { value: string; name?: string };
      ClassRef?: { value: string };
      TaxCodeRef?: { value: string };
      Qty?: number;
      UnitPrice?: number;
    };
    Description?: string;
  }>;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  ApplyTaxAfterDiscount?: boolean;
  PrivateNote?: string;
  CurrencyRef?: { value: string; name?: string };
  ClassRef?: { value: string };
  DepartmentRef?: { value: string };
}

export const serializeInvoice = (input: QboInvoiceInput): QboInvoicePayload => {
  const lines = input.lines.map((line) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: line.amount,
    Description: line.description ?? line.itemName,
    SalesItemLineDetail: {
      ...(line.accountId ? { ItemRef: { value: line.accountId } } : {}),
      ...(line.classId ? { ClassRef: { value: line.classId } } : {}),
      ...(line.taxCodeId ? { TaxCodeRef: { value: line.taxCodeId } } : {}),
      ...(line.quantity !== undefined ? { Qty: line.quantity } : {}),
      ...(line.unitPrice !== undefined ? { UnitPrice: line.unitPrice } : {}),
    },
  }));

  if (input.discountAmount && input.discountAmount > 0) {
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: -Math.abs(input.discountAmount),
      Description: 'Discount',
      SalesItemLineDetail: {},
    });
  }

  if (input.tipAmount && input.tipAmount > 0) {
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: input.tipAmount,
      Description: 'Tip / Service Charge',
      SalesItemLineDetail: {},
    });
  }

  const payload: QboInvoicePayload = {
    Line: lines,
    TxnDate: input.txnDate ?? new Date().toISOString().slice(0, 10),
    DueDate: input.dueDate ?? getDefaultDueDate(),
    ApplyTaxAfterDiscount: true,
    PrivateNote: `POSR order ${input.invoiceNumber ?? ''} — auto-generated`,
  };

  if (input.invoiceNumber) {
    payload.DocNumber = input.invoiceNumber;
  }

  if (input.customerId) {
    payload.CustomerRef = { value: input.customerId, name: input.customerName };
  }

  if (input.classId) {
    payload.ClassRef = { value: input.classId };
  }

  if (input.departmentId) {
    payload.DepartmentRef = { value: input.departmentId };
  }

  if (input.currencyCode) {
    payload.CurrencyRef = { value: input.currencyCode };
  }

  return payload;
};

function getDefaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}
