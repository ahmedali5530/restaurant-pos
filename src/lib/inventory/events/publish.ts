/**
 * Compatibility re-exports — prefer `@/integrations/events`.
 */
export {
  type InventoryPostedPayload,
  type InventoryReversedPayload,
  type InventoryDocumentAdjustedPayload,
  type InventoryAdjustedPayload,
  inventoryPostedEventId,
  inventoryReversedEventId,
  inventoryDocumentAdjustedEventId,
  inventoryAdjustedEventId,
  publishInventoryPosted,
  publishInventoryReversed,
  publishInventoryDocumentAdjusted,
  publishInventoryAdjusted,
} from '@/integrations/events/publish/inventory-lifecycle.ts';
