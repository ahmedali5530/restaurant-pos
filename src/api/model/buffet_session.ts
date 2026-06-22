import {DateTime} from "surrealdb";
import {BuffetMenu, BuffetMenuItem, BuffetSessionType} from "@/api/model/buffet_menu.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {ProductionBatch} from "@/api/model/production_batch.ts";
import {User} from "@/api/model/user.ts";

export type BuffetSessionStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "closing"
  | "closed"
  | "voided";

export type BuffetProductionBatchStatus = "planned" | "completed" | "skipped";

export type BuffetSnapshotType = "start" | "end" | "refill";

export type BuffetGuestCountType = "expected" | "actual" | "checkpoint";

export interface BuffetSession {
  id: string;
  menu: BuffetMenu;
  store: InventoryStore;
  business_date: string;
  session_type: BuffetSessionType;
  status: BuffetSessionStatus;
  expected_guests: number;
  actual_guests: number;
  buffet_price: number;
  scheduled_start?: DateTime;
  scheduled_end?: DateTime;
  session_number: string;
  posted_to_ledger: boolean;
  notes?: string;
  created_at: DateTime;
  created_by: User;
  started_at?: DateTime;
  closed_at?: DateTime;
  closed_by?: User;
  production_batches?: BuffetProductionBatch[];
  snapshots?: BuffetStockSnapshot[];
  guest_counts?: BuffetGuestCount[];
  waste_logs?: BuffetWasteLog[];
  consumption_logs?: BuffetConsumptionLog[];
}

export interface BuffetProductionBatch {
  id: string;
  session: BuffetSession;
  menu_item: BuffetMenuItem;
  production_batch?: ProductionBatch;
  planned_qty: number;
  status: BuffetProductionBatchStatus;
}

export interface BuffetStockSnapshot {
  id: string;
  session: BuffetSession;
  item: InventoryItem;
  snapshot_type: BuffetSnapshotType;
  quantity: number;
  captured_at: DateTime;
  captured_by: User;
  production_batch?: ProductionBatch;
  notes?: string;
}

export interface BuffetGuestCount {
  id: string;
  session: BuffetSession;
  count_type: BuffetGuestCountType;
  guest_count: number;
  recorded_at: DateTime;
  recorded_by: User;
}

export interface BuffetWasteLog {
  id: string;
  session: BuffetSession;
  item: InventoryItem;
  quantity: number;
  reason?: string;
  ledger_waste_item?: InventoryWasteItem;
  created_at: DateTime;
  created_by: User;
}

export interface BuffetConsumptionLog {
  id: string;
  session: BuffetSession;
  item: InventoryItem;
  produced_qty: number;
  leftover_qty: number;
  total_consumed: number;
  guest_consumption: number;
  waste_qty: number;
  staff_meal_qty: number;
  theoretical_guest_qty: number;
  variance_qty: number;
  unit_food_cost: number;
  total_food_cost: number;
  posted_to_ledger: boolean;
}
