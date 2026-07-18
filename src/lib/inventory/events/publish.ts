import { IntegrationManager } from "@/integrations/core/integration-manager.ts";
import { createPosEvent } from "@/integrations/events/pos-event-adapter.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

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

export type InventoryAdjustedPayload = {
  referenceType: string;
  referenceId: string;
  documentNumber?: string | number;
  ledgerEntryCount: number;
  reason?: string;
  adjustedBy?: string;
  businessDate?: string;
};

export const inventoryPostedEventId = (referenceType: string, referenceId: string) =>
  `InventoryPosted:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

export const inventoryReversedEventId = (referenceType: string, referenceId: string) =>
  `InventoryReversed:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

export const inventoryAdjustedEventId = (referenceType: string, referenceId: string) =>
  `InventoryAdjusted:${referenceType}:${recordIdToString(referenceId) || referenceId}`;

export const publishInventoryPosted = async (
  manager: IntegrationManager | null | undefined,
  payload: InventoryPostedPayload
): Promise<void> => {
  if (!manager) return;
  const event = createPosEvent(
    "InventoryPosted",
    payload,
    "inventory",
    inventoryPostedEventId(payload.referenceType, payload.referenceId)
  );
  await manager.publish(event);
};

export const publishInventoryReversed = async (
  manager: IntegrationManager | null | undefined,
  payload: InventoryReversedPayload
): Promise<void> => {
  if (!manager) return;
  const event = createPosEvent(
    "InventoryReversed",
    payload,
    "inventory",
    inventoryReversedEventId(payload.referenceType, payload.referenceId)
  );
  await manager.publish(event);
};

export const publishInventoryAdjusted = async (
  manager: IntegrationManager | null | undefined,
  payload: InventoryAdjustedPayload
): Promise<void> => {
  if (!manager) return;
  const event = createPosEvent(
    "InventoryAdjusted",
    payload,
    "inventory",
    inventoryAdjustedEventId(payload.referenceType, payload.referenceId)
  );
  await manager.publish(event);
};
