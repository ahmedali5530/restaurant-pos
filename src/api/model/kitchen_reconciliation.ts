import {DateTime} from "surrealdb";
import {Kitchen} from "@/api/model/kitchen.ts";
import {User} from "@/api/model/user.ts";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";

export type KitchenReconciliationStatus = "draft" | "verified" | "missed";

export interface KitchenReconciliation {
  id: string;
  kitchen: Kitchen;
  business_date: string;
  date_from: DateTime;
  date_to: DateTime;
  status: KitchenReconciliationStatus;
  revision: number;
  parent?: KitchenReconciliation;
  superseded_by?: KitchenReconciliation;
  created_at: DateTime;
  created_by: User;
  verified_at?: DateTime;
  verified_by?: User;
  notes?: string;
  items?: KitchenReconciliationItem[];
}
