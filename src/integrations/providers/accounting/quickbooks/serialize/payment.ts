/**
 * Serialize a POSR payment into a QuickBooks Payment.
 */

export interface QboPaymentInput {
  customerId?: string;
  customerName?: string;
  total: number;
  paymentMethodRef?: string;
  depositToAccountId?: string;
  paymentDate?: string;
  paymentRefNum?: string;
  lines?: Array<{
    amount: number;
    linkedTxnId?: string;
    linkedTxnType?: 'Invoice' | 'SalesReceipt';
  }>;
  privateNote?: string;
  currencyCode?: string;
}

export interface QboPaymentPayload {
  CustomerRef?: { value: string; name?: string };
  TotalAmt?: number;
  PaymentMethodRef?: { value: string };
  DepositToAccountRef?: { value: string };
  TxnDate?: string;
  PaymentRefNum?: string;
  Line?: Array<{
    Amount: number;
    LinkedTxn?: Array<{
      TxnId: string;
      TxnType: string;
    }>;
  }>;
  PrivateNote?: string;
  CurrencyRef?: { value: string; name?: string };
}

export const serializePayment = (input: QboPaymentInput): QboPaymentPayload => {
  const payload: QboPaymentPayload = {
    TotalAmt: input.total,
    TxnDate: input.paymentDate ?? new Date().toISOString().slice(0, 10),
    PrivateNote: input.privateNote ?? 'POSR payment — auto-generated',
  };

  if (input.customerId) {
    payload.CustomerRef = { value: input.customerId, name: input.customerName };
  }

  if (input.paymentMethodRef) {
    payload.PaymentMethodRef = { value: input.paymentMethodRef };
  }

  if (input.depositToAccountId) {
    payload.DepositToAccountRef = { value: input.depositToAccountId };
  }

  if (input.paymentRefNum) {
    payload.PaymentRefNum = input.paymentRefNum;
  }

  if (input.lines && input.lines.length > 0) {
    payload.Line = input.lines.map((line) => ({
      Amount: line.amount,
      ...(line.linkedTxnId && line.linkedTxnType
        ? {
            LinkedTxn: [
              {
                TxnId: line.linkedTxnId,
                TxnType: line.linkedTxnType,
              },
            ],
          }
        : {}),
    }));
  }

  if (input.currencyCode) {
    payload.CurrencyRef = { value: input.currencyCode };
  }

  return payload;
};
