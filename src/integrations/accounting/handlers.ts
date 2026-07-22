import {
  InventoryAdjustedPayload,
  InventoryIssuedPayload,
  InventoryTransferredPayload,
  IssueReturnedPayload,
  OrderCancelledPayload,
  PayrollPostedPayload,
  ProductionCompletedPayload,
  PurchaseReceivedPayload,
  PurchaseReturnedPayload,
  SaleCompletedPayload,
  SaleRefundedPayload,
  WasteRecordedPayload,
} from '@/integrations/accounting/events/payloads.ts';
import { TemplateAmountContext } from '@/integrations/accounting/templates/builder.ts';
import { IntegrationEventName } from '@/integrations/core/types.ts';

export interface EventPostingHandler {
  buildAmounts: (payload: any) => TemplateAmountContext;
  originRecordId: (payload: any) => string | undefined;
}

const saleLikeAmounts = (payload: {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  tipAmount: number;
  totalCollected: number;
  tenders: { cashAmount: number; cardAmount: number; otherAmount: number };
}): TemplateAmountContext => {
  const salesRevenue = Number((payload.subtotal + payload.discountAmount).toFixed(2));
  return {
    cashAmount: payload.tenders.cashAmount,
    cardAmount: payload.tenders.cardAmount,
    otherAmount: payload.tenders.otherAmount,
    taxAmount: payload.taxAmount,
    discountAmount: payload.discountAmount,
    tipAmount: payload.tipAmount,
    salesRevenue,
    totalCollected: payload.totalCollected,
  };
};

export const buildSaleCompletedAmountContext = (
  payload: SaleCompletedPayload
): TemplateAmountContext => saleLikeAmounts(payload);

export const EVENT_POSTING_HANDLERS: Partial<
  Record<IntegrationEventName, EventPostingHandler>
> = {
  SaleCompleted: {
    buildAmounts: (payload: SaleCompletedPayload) => saleLikeAmounts(payload),
    originRecordId: (payload: SaleCompletedPayload) => payload.orderId,
  },
  SaleRefunded: {
    buildAmounts: (payload: SaleRefundedPayload) => saleLikeAmounts(payload),
    originRecordId: (payload: SaleRefundedPayload) =>
      payload.refundId || payload.orderId,
  },
  OrderCancelled: {
    buildAmounts: (payload: OrderCancelledPayload) => saleLikeAmounts(payload),
    originRecordId: (payload: OrderCancelledPayload) => payload.orderId,
  },
  PayrollPosted: {
    buildAmounts: (payload: PayrollPostedPayload) => ({
      grossPay: Number(payload.totals?.grossPay ?? 0),
      netPay: Number(payload.totals?.netPay ?? 0),
      deductions: Number(payload.totals?.deductions ?? 0),
    }),
    originRecordId: (payload: PayrollPostedPayload) => payload.payrollRunId,
  },
  PurchaseReceived: {
    buildAmounts: (payload: PurchaseReceivedPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: PurchaseReceivedPayload) => payload.documentId,
  },
  PurchaseReturned: {
    buildAmounts: (payload: PurchaseReturnedPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: PurchaseReturnedPayload) => payload.documentId,
  },
  WasteRecorded: {
    buildAmounts: (payload: WasteRecordedPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: WasteRecordedPayload) => payload.documentId,
  },
  InventoryAdjusted: {
    buildAmounts: (payload: InventoryAdjustedPayload) => ({
      increaseValue: Number(payload.increaseValue ?? 0),
      decreaseValue: Number(payload.decreaseValue ?? 0),
      netInventoryValue: Number(payload.netInventoryValue ?? 0),
    }),
    originRecordId: (payload: InventoryAdjustedPayload) => payload.documentId,
  },
  InventoryIssued: {
    buildAmounts: (payload: InventoryIssuedPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: InventoryIssuedPayload) => payload.documentId,
  },
  IssueReturned: {
    buildAmounts: (payload: IssueReturnedPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: IssueReturnedPayload) => payload.documentId,
  },
  InventoryTransferred: {
    buildAmounts: (payload: InventoryTransferredPayload) => ({
      inventoryValue: Number(payload.inventoryValue ?? 0),
    }),
    originRecordId: (payload: InventoryTransferredPayload) => payload.documentId,
  },
  ProductionCompleted: {
    buildAmounts: (payload: ProductionCompletedPayload) => {
      const inputCost = Number(payload.inputCost ?? 0);
      const outputCost = Number(payload.outputCost ?? 0);
      const yieldLoss = Number(
        payload.yieldLoss ?? Math.max(inputCost - outputCost, 0)
      );
      return { inputCost, outputCost, yieldLoss };
    },
    originRecordId: (payload: ProductionCompletedPayload) => payload.documentId,
  },
};
