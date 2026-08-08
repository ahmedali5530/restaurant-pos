import { recordIdToString } from '@/api/reports/shared/records.ts';
import { createPosEvent } from '@/integrations/events/pos-event-adapter.ts';
import { ManagerLike, safePublish } from '@/integrations/events/publish/safe.ts';

export type InventoryPostedPayload = {
  referenceType: string;
  referenceId: string;
  documentNumber?: string | number;
  ledgerEntryCount: number;
  postedBy?: string;
  businessDate?: string;
};

export type InventoryReversedPayload = {
  referenceType: string;
  referenceId: string;
  ledgerEntryCount: number;
  reversedBy?: string;
};

/** Ledger document adjustment (not accounting InventoryAdjusted value event). */
export type InventoryDocumentAdjustedPayload = {
  referenceType: string;
  referenceId: string;
  documentNumber?: string | number;
  ledgerEntryCount: number;
  reason?: string;
  adjustedBy?: string;
  businessDate?: string;
};

/** @deprecated Use InventoryDocumentAdjustedPayload — kept for re-export compatibility. */
export type InventoryAdjustedPayload = InventoryDocumentAdjustedPayload;

export const inventoryPostedEventId = (referenceType: string, referenceId: string) =>
  `InventoryPosted:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

export const inventoryReversedEventId = (referenceType: string, referenceId: string) =>
  `InventoryReversed:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

export const inventoryDocumentAdjustedEventId = (
  referenceType: string,
  referenceId: string
) =>
  `InventoryDocumentAdjusted:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

/** @deprecated Use inventoryDocumentAdjustedEventId */
export const inventoryAdjustedEventId = inventoryDocumentAdjustedEventId;

export const publishInventoryPosted = async (
  manager: ManagerLike,
  payload: InventoryPostedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryPosted',
          payload,
          'inventory',
          inventoryPostedEventId(payload.referenceType, payload.referenceId)
        )
      );
    },
    'InventoryPosted'
  );
};

export const publishInventoryReversed = async (
  manager: ManagerLike,
  payload: InventoryReversedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryReversed',
          payload,
          'inventory',
          inventoryReversedEventId(payload.referenceType, payload.referenceId)
        )
      );
    },
    'InventoryReversed'
  );
};

export const publishInventoryDocumentAdjusted = async (
  manager: ManagerLike,
  payload: InventoryDocumentAdjustedPayload
): Promise<void> => {
  await safePublish(
    manager,
    async (m) => {
      await m.publish(
        createPosEvent(
          'InventoryDocumentAdjusted',
          payload,
          'inventory',
          inventoryDocumentAdjustedEventId(
            payload.referenceType,
            payload.referenceId
          )
        )
      );
    },
    'InventoryDocumentAdjusted'
  );
};

/** @deprecated Prefer publishInventoryDocumentAdjusted */
export const publishInventoryAdjusted = publishInventoryDocumentAdjusted;
