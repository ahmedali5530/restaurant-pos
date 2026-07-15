import { Order } from '@/api/model/order.ts';

export interface SaleCompletedTenderSplit {
  cashAmount: number;
  cardAmount: number;
  otherAmount: number;
}

export interface SaleCompletedPayload {
  orderId: string;
  invoiceNumber?: number | string;
  /** Net sales (before tax), typically grand total − tax − tip + discounts handling per template. */
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  /** Total collected from customers (sum of payments). */
  totalCollected: number;
  tenders: SaleCompletedTenderSplit;
  storeId?: string;
  branchId?: string;
  currency?: string;
  completedAt?: string;
}

const isCashPaymentType = (typeName?: string): boolean => {
  const normalized = (typeName ?? '').trim().toLowerCase();
  return normalized === 'cash' || normalized.includes('cash');
};

const isCardPaymentType = (typeName?: string): boolean => {
  const normalized = (typeName ?? '').trim().toLowerCase();
  return (
    normalized === 'card' ||
    normalized.includes('card') ||
    normalized.includes('credit') ||
    normalized.includes('debit') ||
    normalized.includes('visa') ||
    normalized.includes('master')
  );
};

export const buildTenderSplitFromOrder = (order: Order): SaleCompletedTenderSplit => {
  let cashAmount = 0;
  let cardAmount = 0;
  let otherAmount = 0;

  for (const payment of order.payments ?? []) {
    const amount = Number(payment.amount ?? payment.payable ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const typeName = payment.payment_type?.type ?? payment.payment_type?.name;
    if (isCashPaymentType(typeName)) {
      cashAmount += amount;
    } else if (isCardPaymentType(typeName)) {
      cardAmount += amount;
    } else {
      otherAmount += amount;
    }
  }

  return {
    cashAmount: Number(cashAmount.toFixed(2)),
    cardAmount: Number(cardAmount.toFixed(2)),
    otherAmount: Number(otherAmount.toFixed(2)),
  };
};

export const buildSaleCompletedPayload = (order: Order): SaleCompletedPayload => {
  const taxAmount = Number(order.tax_amount ?? 0);
  const discountAmount = Number(order.discount_amount ?? 0);
  const tipAmount = Number(order.tip_amount ?? order.tip ?? 0);
  const tenders = buildTenderSplitFromOrder(order);
  const totalCollected = Number(
    (tenders.cashAmount + tenders.cardAmount + tenders.otherAmount).toFixed(2)
  );
  const subtotal = Number(Math.max(totalCollected - taxAmount - tipAmount, 0).toFixed(2));

  return {
    orderId: String(order.id),
    invoiceNumber: order.invoice_number,
    subtotal,
    taxAmount: Number(taxAmount.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    tipAmount: Number(tipAmount.toFixed(2)),
    totalCollected,
    tenders,
    storeId: order.floor?.id ? String(order.floor.id) : undefined,
    completedAt: order.completed_at ? String(order.completed_at) : undefined,
  };
};

/** Placeholder typed payloads for future events — extend incrementally. */
export interface SaleRefundedPayload {
  orderId: string;
  refundId?: string;
  amount: number;
  taxAmount?: number;
  storeId?: string;
  branchId?: string;
  currency?: string;
}

export type AccountingBusinessEventPayloadMap = {
  SaleCompleted: SaleCompletedPayload;
  SaleRefunded: SaleRefundedPayload;
};
