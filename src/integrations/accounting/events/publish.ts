/**
 * Compatibility re-exports — prefer `@/integrations/events`.
 */
export {
  saleCompletedEventId,
  saleRefundedEventId,
  orderCancelledEventId,
  publishSaleCompleted,
  publishSaleRefunded,
  publishOrderCancelled,
} from '@/integrations/events/publish/sales.ts';

export {
  payrollPostedEventId,
  publishPayrollPosted,
} from '@/integrations/events/publish/hr.ts';

export {
  purchaseReceivedEventId,
  purchaseReturnedEventId,
  wasteRecordedEventId,
  inventoryAdjustedEventId,
  inventoryIssuedEventId,
  issueReturnedEventId,
  inventoryTransferredEventId,
  productionCompletedEventId,
  publishPurchaseReceived,
  publishPurchaseReturned,
  publishWasteRecorded,
  publishInventoryAdjusted,
  publishInventoryIssued,
  publishIssueReturned,
  publishInventoryTransferred,
  publishProductionCompleted,
} from '@/integrations/events/publish/inventory-accounting.ts';
