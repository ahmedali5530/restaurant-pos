import {DateTime} from "surrealdb";
import {KitchenReconciliation} from "@/api/model/kitchen_reconciliation.ts";
import {User} from "@/api/model/user.ts";

export type KitchenReconciliationChangeType =
  | "create"
  | "update"
  | "verify"
  | "csv_import"
  | "missed_stub";

export interface KitchenReconciliationFieldChange {
  item_id?: string;
  field: string;
  old: unknown;
  new: unknown;
}

export interface KitchenReconciliationRevision {
  id: string;
  reconciliation: KitchenReconciliation;
  revision_number: number;
  change_type: KitchenReconciliationChangeType;
  changed_by: User;
  changed_at: DateTime;
  snapshot_before?: Record<string, unknown> | null;
  snapshot_after: Record<string, unknown>;
  field_changes: KitchenReconciliationFieldChange[];
}
