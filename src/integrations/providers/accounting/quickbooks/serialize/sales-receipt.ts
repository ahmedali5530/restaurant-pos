/**
 * Serialize a POSR completed sale into a QuickBooks SalesReceipt.
 * Produces the JSON body for the Intuit Accounting API v3.
 */

export interface QboSalesReceiptInput {
  docNumber?: string;
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
  paymentMethodId?: string;
  depositToAccountId?: string;
  salesTermId?: string;
  txnDate?: string;
  classId?: string;
  departmentId?: string;
  currencyCode?: string;
  exchangeRate?: number;
  salesReceiptNumber?: string;
}

export interface QboSalesReceiptPayload {
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
  TotalAmt?: number;
  ApplyTaxAfterDiscount?: boolean;
  PrivateNote?: string;
  PaymentMethodRef?: { value: string };
  DepositToAccountRef?: { value: string };
  CustomerMemo?: { value: string };
  SalesTermRef?: { value: string };
  CurrencyRef?: { value: string; name?: string };
  ExchangeRate?: number;
  ClassRef?: { value: string };
  DepartmentRef?: { value: string };
}

export const serializeSalesReceipt = (input: QboSalesReceiptInput): QboSalesReceiptPayload => {
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

  // Add discount line if applicable
  if (input.discountAmount && input.discountAmount > 0) {
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: -Math.abs(input.discountAmount),
      Description: 'Discount',
      SalesItemLineDetail: {},
    });
  }

  // Add tip line if applicable
  if (input.tipAmount && input.tipAmount > 0) {
    lines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: input.tipAmount,
      Description: 'Tip / Service Charge',
      SalesItemLineDetail: {},
    });
  }

  const payload: QboSalesReceiptPayload = {
    Line: lines,
    TxnDate: input.txnDate ?? new Date().toISOString().slice(0, 10),
    ApplyTaxAfterDiscount: true,
    PrivateNote: `POSR order ${input.salesReceiptNumber ?? input.docNumber ?? ''} — auto-generated`,
  };

  if (input.docNumber) {
    payload.DocNumber = input.docNumber;
  }

  if (input.customerId) {
    payload.CustomerRef = { value: input.customerId, name: input.customerName };
  }

  if (input.paymentMethodId) {
    payload.PaymentMethodRef = { value: input.paymentMethodId };
  }

  if (input.depositToAccountId) {
    payload.DepositToAccountRef = { value: input.depositToAccountId };
  }

  if (input.classId) {
    payload.ClassRef = { value: input.classId };
  }

  if (input.departmentId) {
    payload.DepartmentRef = { value: input.departmentId };
  }

  if (input.salesTermId) {
    payload.SalesTermRef = { value: input.salesTermId };
  }

  if (input.currencyCode) {
    payload.CurrencyRef = { value: input.currencyCode };
  }

  if (input.exchangeRate !== undefined) {
    payload.ExchangeRate = input.exchangeRate;
  }

  return payload;
};
