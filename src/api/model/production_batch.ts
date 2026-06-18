import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {CostAllocationMethod, OutputDisposition, Recipe} from "@/api/model/recipe.ts";
import {User} from "@/api/model/user.ts";

export type ProductionBatchStatus = "completed" | "voided";

export interface ProductionBatch {
  id: string;
  recipe: Recipe;
  store: InventoryStore;
  batch_number: string;
  scale_factor: number;
  produced_qty: number;
  status: ProductionBatchStatus;
  total_input_cost: number;
  total_output_cost: number;
  yield_loss_percent: number;
  cost_allocation: CostAllocationMethod;
  created_at: DateTime;
  created_by: User;
  completed_at: DateTime;
  notes?: string;
  inputs?: ProductionBatchInput[];
  outputs?: ProductionBatchOutput[];
}

export interface ProductionBatchInput {
  id: string;
  batch: ProductionBatch;
  item: InventoryItem;
  store: InventoryStore;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface ProductionBatchOutput {
  id: string;
  batch: ProductionBatch;
  item: InventoryItem;
  store: InventoryStore;
  quantity: number;
  yield_percent: number;
  disposition: OutputDisposition;
  allocated_cost: number;
  unit_cost: number;
  ledger_waste_item?: InventoryWasteItem;
}
