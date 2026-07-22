import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { Order } from '@/api/model/order.ts';
import {
  buildOrderCancelledPayload,
  buildSaleCompletedPayload,
  buildSaleRefundedPayload,
  InventoryAdjustedPayload,
  InventoryIssuedPayload,
  InventoryTransferredPayload,
  IssueReturnedPayload,
  PayrollPostedPayload,
  ProductionCompletedPayload,
  PurchaseReceivedPayload,
  PurchaseReturnedPayload,
  SaleRefundedPayload,
  WasteRecordedPayload,
} from '@/integrations/accounting/events/payloads.ts';

export const saleCompletedEventId = (orderId: string) => `SaleCompleted:${orderId}`;
export const saleRefundedEventId = (refundId: string) => `SaleRefunded:${refundId}`;
export const orderCancelledEventId = (orderId: string, voidBatchKey: string) =>
  `OrderCancelled:${orderId}:${voidBatchKey}`;
export const payrollPostedEventId = (runId: string) => `PayrollPosted:${runId}`;
export const purchaseReceivedEventId = (documentId: string) =>
  `PurchaseReceived:${documentId}`;
export const purchaseReturnedEventId = (documentId: string) =>
  `PurchaseReturned:${documentId}`;
export const wasteRecordedEventId = (documentId: string) => `WasteRecorded:${documentId}`;
export const inventoryAdjustedEventId = (documentId: string) =>
  `InventoryAdjusted:${documentId}`;
export const inventoryIssuedEventId = (documentId: string) =>
  `InventoryIssued:${documentId}`;
export const issueReturnedEventId = (documentId: string) => `IssueReturned:${documentId}`;
export const inventoryTransferredEventId = (documentId: string) =>
  `InventoryTransferred:${documentId}`;
export const productionCompletedEventId = (documentId: string) =>
  `ProductionCompleted:${documentId}`;

const safePublish = async (
  manager: IntegrationManager | undefined | null,
  publishFn: () => Promise<void>
) => {
  if (!manager) {
    return;
  }
  try {
    await publishFn();
  } catch (error) {
    console.warn('Failed publishing accounting business event', error);
  }
};

/**
 * Publishes a SaleCompleted business event. POS must not create journals —
 * only publish through the integration manager.
 */
export const publishSaleCompleted = async (
  manager: IntegrationManager,
  order: Order
): Promise<void> => {
  const orderId = String(order.id);
  const payload = buildSaleCompletedPayload(order);
  await manager.publish(
    createPosEvent('SaleCompleted', payload, 'pos-core', saleCompletedEventId(orderId))
  );
};

export const publishSaleRefunded = async (
  manager: IntegrationManager | undefined | null,
  params: {
    order: Order;
    refundId: string;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    tipAmount: number;
    total: number;
    itemIds?: string[];
  }
): Promise<void> => {
  await safePublish(manager, async () => {
    const payload: SaleRefundedPayload = buildSaleRefundedPayload(params);
    await manager!.publish(
      createPosEvent(
        'SaleRefunded',
        payload,
        'pos-core',
        saleRefundedEventId(params.refundId)
      )
    );
  });
};

export const publishOrderCancelled = async (
  manager: IntegrationManager | undefined | null,
  order: Order,
  voidBatchKey: string
): Promise<void> => {
  await safePublish(manager, async () => {
    const payload = buildOrderCancelledPayload(order, voidBatchKey);
    await manager!.publish(
      createPosEvent(
        'OrderCancelled',
        payload,
        'pos-core',
        orderCancelledEventId(String(order.id), voidBatchKey)
      )
    );
  });
};

export const publishPayrollPosted = async (
  manager: IntegrationManager | undefined | null,
  payload: PayrollPostedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'PayrollPosted',
        payload,
        'hr-core',
        payrollPostedEventId(payload.payrollRunId)
      )
    );
  });
};

export const publishPurchaseReceived = async (
  manager: IntegrationManager | undefined | null,
  payload: PurchaseReceivedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'PurchaseReceived',
        payload,
        'inventory-core',
        purchaseReceivedEventId(payload.documentId)
      )
    );
  });
};

export const publishPurchaseReturned = async (
  manager: IntegrationManager | undefined | null,
  payload: PurchaseReturnedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'PurchaseReturned',
        payload,
        'inventory-core',
        purchaseReturnedEventId(payload.documentId)
      )
    );
  });
};

export const publishWasteRecorded = async (
  manager: IntegrationManager | undefined | null,
  payload: WasteRecordedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'WasteRecorded',
        payload,
        'inventory-core',
        wasteRecordedEventId(payload.documentId)
      )
    );
  });
};

export const publishInventoryAdjusted = async (
  manager: IntegrationManager | undefined | null,
  payload: InventoryAdjustedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'InventoryAdjusted',
        payload,
        'inventory-core',
        inventoryAdjustedEventId(payload.documentId)
      )
    );
  });
};

export const publishInventoryIssued = async (
  manager: IntegrationManager | undefined | null,
  payload: InventoryIssuedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'InventoryIssued',
        payload,
        'inventory-core',
        inventoryIssuedEventId(payload.documentId)
      )
    );
  });
};

export const publishIssueReturned = async (
  manager: IntegrationManager | undefined | null,
  payload: IssueReturnedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'IssueReturned',
        payload,
        'inventory-core',
        issueReturnedEventId(payload.documentId)
      )
    );
  });
};

export const publishInventoryTransferred = async (
  manager: IntegrationManager | undefined | null,
  payload: InventoryTransferredPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'InventoryTransferred',
        payload,
        'inventory-core',
        inventoryTransferredEventId(payload.documentId)
      )
    );
  });
};

export const publishProductionCompleted = async (
  manager: IntegrationManager | undefined | null,
  payload: ProductionCompletedPayload
): Promise<void> => {
  await safePublish(manager, async () => {
    await manager!.publish(
      createPosEvent(
        'ProductionCompleted',
        payload,
        'inventory-core',
        productionCompletedEventId(payload.documentId)
      )
    );
  });
};
