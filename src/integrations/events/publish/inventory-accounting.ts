import {
  InventoryAdjustedPayload,
  InventoryIssuedPayload,
  InventoryTransferredPayload,
  IssueReturnedPayload,
  ProductionCompletedPayload,
  PurchaseReceivedPayload,
  PurchaseReturnedPayload,
  WasteRecordedPayload,
} from '@/integrations/accounting/events/payloads.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export const purchaseReceivedEventId = (documentId: string) =>
  `PurchaseReceived:${documentId}`;
export const purchaseReturnedEventId = (documentId: string) =>
  `PurchaseReturned:${documentId}`;
export const wasteRecordedEventId = (documentId: string) =>
  `WasteRecorded:${documentId}`;
export const inventoryAdjustedEventId = (documentId: string) =>
  `InventoryAdjusted:${documentId}`;
export const inventoryIssuedEventId = (documentId: string) =>
  `InventoryIssued:${documentId}`;
export const issueReturnedEventId = (documentId: string) =>
  `IssueReturned:${documentId}`;
export const inventoryTransferredEventId = (documentId: string) =>
  `InventoryTransferred:${documentId}`;
export const productionCompletedEventId = (documentId: string) =>
  `ProductionCompleted:${documentId}`;

export const publishPurchaseReceived = async (
  manager: ManagerLike,
  payload: PurchaseReceivedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'PurchaseReceived',
          payload,
          'inventory-core',
          purchaseReceivedEventId(payload.documentId)
        )
      );
    },
    'PurchaseReceived'
  );
};

export const publishPurchaseReturned = async (
  manager: ManagerLike,
  payload: PurchaseReturnedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'PurchaseReturned',
          payload,
          'inventory-core',
          purchaseReturnedEventId(payload.documentId)
        )
      );
    },
    'PurchaseReturned'
  );
};

export const publishWasteRecorded = async (
  manager: ManagerLike,
  payload: WasteRecordedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'WasteRecorded',
          payload,
          'inventory-core',
          wasteRecordedEventId(payload.documentId)
        )
      );
    },
    'WasteRecorded'
  );
};

export const publishInventoryAdjusted = async (
  manager: ManagerLike,
  payload: InventoryAdjustedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryAdjusted',
          payload,
          'inventory-core',
          inventoryAdjustedEventId(payload.documentId)
        )
      );
    },
    'InventoryAdjusted'
  );
};

export const publishInventoryIssued = async (
  manager: ManagerLike,
  payload: InventoryIssuedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryIssued',
          payload,
          'inventory-core',
          inventoryIssuedEventId(payload.documentId)
        )
      );
    },
    'InventoryIssued'
  );
};

export const publishIssueReturned = async (
  manager: ManagerLike,
  payload: IssueReturnedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'IssueReturned',
          payload,
          'inventory-core',
          issueReturnedEventId(payload.documentId)
        )
      );
    },
    'IssueReturned'
  );
};

export const publishInventoryTransferred = async (
  manager: ManagerLike,
  payload: InventoryTransferredPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryTransferred',
          payload,
          'inventory-core',
          inventoryTransferredEventId(payload.documentId)
        )
      );
    },
    'InventoryTransferred'
  );
};

export const publishProductionCompleted = async (
  manager: ManagerLike,
  payload: ProductionCompletedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'ProductionCompleted',
          payload,
          'inventory-core',
          productionCompletedEventId(payload.documentId)
        )
      );
    },
    'ProductionCompleted'
  );
};
