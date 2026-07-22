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

export interface SaleRefundedPayload {
  orderId: string;
  refundId: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  totalCollected: number;
  tenders: SaleCompletedTenderSplit;
  storeId?: string;
  branchId?: string;
  currency?: string;
  itemIds?: string[];
}

export interface OrderCancelledPayload {
  orderId: string;
  voidBatchKey: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  totalCollected: number;
  tenders: SaleCompletedTenderSplit;
  storeId?: string;
  branchId?: string;
  currency?: string;
}

export interface PayrollPostedPayload {
  payrollRunId: string;
  periodId?: string;
  periodStart?: string;
  periodEnd?: string;
  totals: {
    grossPay: number;
    netPay: number;
    deductions: number;
    adjustments?: number;
    bonuses?: number;
  };
}

export interface AccountingInventoryLine {
  itemId?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  locationId?: string;
}

export interface PurchaseReceivedPayload {
  documentId: string;
  supplierId?: string;
  locationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface PurchaseReturnedPayload {
  documentId: string;
  purchaseId?: string;
  supplierId?: string;
  locationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface WasteRecordedPayload {
  documentId: string;
  locationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface InventoryAdjustedPayload {
  documentId: string;
  locationId?: string;
  /** Positive = stock increase, negative = stock decrease (absolute value used with signed keys). */
  netInventoryValue: number;
  increaseValue: number;
  decreaseValue: number;
  reason?: string;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface InventoryIssuedPayload {
  documentId: string;
  locationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface IssueReturnedPayload {
  documentId: string;
  issuanceId?: string;
  locationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface InventoryTransferredPayload {
  documentId: string;
  fromLocationId?: string;
  toLocationId?: string;
  inventoryValue: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export interface ProductionCompletedPayload {
  documentId: string;
  locationId?: string;
  inputCost: number;
  outputCost: number;
  yieldLoss: number;
  lines?: AccountingInventoryLine[];
  branchId?: string;
  currency?: string;
}

export type AccountingBusinessEventPayloadMap = {
  SaleCompleted: SaleCompletedPayload;
  SaleRefunded: SaleRefundedPayload;
  OrderCancelled: OrderCancelledPayload;
  PayrollPosted: PayrollPostedPayload;
  PurchaseReceived: PurchaseReceivedPayload;
  PurchaseReturned: PurchaseReturnedPayload;
  WasteRecorded: WasteRecordedPayload;
  InventoryAdjusted: InventoryAdjustedPayload;
  InventoryIssued: InventoryIssuedPayload;
  IssueReturned: IssueReturnedPayload;
  InventoryTransferred: InventoryTransferredPayload;
  ProductionCompleted: ProductionCompletedPayload;
};

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

/** Allocate a refund/void total across cash/card/other in proportion to original tenders. */
export const allocateTendersByRatio = (
  total: number,
  base: SaleCompletedTenderSplit
): SaleCompletedTenderSplit => {
  const baseTotal = base.cashAmount + base.cardAmount + base.otherAmount;
  if (!Number.isFinite(total) || total <= 0) {
    return { cashAmount: 0, cardAmount: 0, otherAmount: 0 };
  }
  if (baseTotal <= 0) {
    return { cashAmount: Number(total.toFixed(2)), cardAmount: 0, otherAmount: 0 };
  }
  const cashAmount = Number(((total * base.cashAmount) / baseTotal).toFixed(2));
  const cardAmount = Number(((total * base.cardAmount) / baseTotal).toFixed(2));
  const otherAmount = Number((total - cashAmount - cardAmount).toFixed(2));
  return { cashAmount, cardAmount, otherAmount };
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

export const buildSaleRefundedPayload = (params: {
  order: Order;
  refundId: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  total: number;
  itemIds?: string[];
}): SaleRefundedPayload => {
  const baseTenders = buildTenderSplitFromOrder(params.order);
  const tenders = allocateTendersByRatio(params.total, baseTenders);
  return {
    orderId: String(params.order.id),
    refundId: params.refundId,
    subtotal: Number(params.subtotal.toFixed(2)),
    taxAmount: Number(params.taxAmount.toFixed(2)),
    discountAmount: Number(params.discountAmount.toFixed(2)),
    tipAmount: Number(params.tipAmount.toFixed(2)),
    totalCollected: Number(params.total.toFixed(2)),
    tenders,
    storeId: params.order.floor?.id ? String(params.order.floor.id) : undefined,
    itemIds: params.itemIds,
  };
};

export const buildOrderCancelledPayload = (
  order: Order,
  voidBatchKey: string
): OrderCancelledPayload => {
  const sale = buildSaleCompletedPayload(order);
  return {
    orderId: sale.orderId,
    voidBatchKey,
    subtotal: sale.subtotal,
    taxAmount: sale.taxAmount,
    discountAmount: sale.discountAmount,
    tipAmount: sale.tipAmount,
    totalCollected: sale.totalCollected,
    tenders: sale.tenders,
    storeId: sale.storeId,
  };
};
