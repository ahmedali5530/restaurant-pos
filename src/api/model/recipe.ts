import {DateTime} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {User} from "@/api/model/user.ts";

export type CostAllocationMethod = "yield" | "value";
export type OutputDisposition = "inventory" | "waste";

export interface Recipe {
  id: string;
  name: string;
  code?: string;
  notes?: string;
  is_active: boolean;
  base_batch_qty: number;
  primary_output?: RecipeOutput;
  cost_allocation: CostAllocationMethod;
  created_at: DateTime;
  created_by: User;
  items?: RecipeItem[];
  outputs?: RecipeOutput[];
}

export interface RecipeItem {
  id: string;
  recipe: Recipe;
  item: InventoryItem;
  quantity: number;
  sort_order: number;
}

export interface RecipeOutput {
  id: string;
  recipe: Recipe;
  item: InventoryItem;
  yield_percent: number;
  disposition: OutputDisposition;
  value_weight: number;
  is_primary: boolean;
  sort_order: number;
}
