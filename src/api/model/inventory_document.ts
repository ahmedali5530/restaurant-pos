import { User } from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

/**
 * Shared lifecycle status for inventory business documents.
 * Only Posted documents affect the inventory ledger.
 */
export type InventoryDocumentStatus =
  | "draft"
  | "approved"
  | "posted"
  | "cancelled"
  | "voided";

export const INVENTORY_DOCUMENT_STATUSES: InventoryDocumentStatus[] = [
  "draft",
  "approved",
  "posted",
  "cancelled",
  "voided",
];

export interface LifecycleFields {
  status?: InventoryDocumentStatus;
  approved_at?: DateTime;
  approved_by?: User;
  posted_at?: DateTime;
  posted_by?: User;
  voided_at?: DateTime;
  voided_by?: User;
  cancelled_at?: DateTime;
  cancelled_by?: User;
  /** Phase 5 — revision chain (kitchen_reconciliation pattern). */
  revision?: number;
  parent?: string | { id?: string };
  superseded_by?: string | { id?: string };
}

/**
 * Normalize a missing/legacy status to `posted` so historical rows
 * (saved before lifecycle existed) behave as already posted.
 */
export const normalizeDocumentStatus = (
  status?: string | null
): InventoryDocumentStatus => {
  if (!status) {
    return "posted";
  }
  const normalized = String(status).toLowerCase() as InventoryDocumentStatus;
  if (INVENTORY_DOCUMENT_STATUSES.includes(normalized)) {
    return normalized;
  }
  return "posted";
};
