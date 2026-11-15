import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {toast} from "sonner";
import i18n from "@/lib/i18n.ts";
import {entityAfterWrite} from "@/integrations/events/publish/entity.ts";
import type {ManagerLike} from "@/integrations/events/publish/safe.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type DeleteInventoryItemResult = "deleted" | "deactivated";

type DeleteInventoryItemOptions = {
  db: DatabaseClient;
  id: string;
  entityLabel?: string;
  onAfter?: () => void | Promise<void>;
  manager?: ManagerLike;
  changedBy?: string;
};

const toCount = (value: any): number => {
  if (typeof value?.count === "number") return value.count;
  if (typeof value?.["count()"] === "number") return value["count()"];
  return 0;
};

const hasResults = (queryResult: any): boolean => {
  if (!Array.isArray(queryResult) || queryResult.length === 0) return false;
  const first = queryResult[0];
  if (Array.isArray(first)) {
    return first.reduce((sum: number, row: any) => sum + toCount(row), 0) > 0;
  }
  return toCount(first) > 0;
};

/** Tables that force soft-delete (item still has operational history). */
const HARD_REF_CHECKS: {table: string; field: string}[] = [
  {table: Tables.inventory_ledger, field: "inventory_item"},
  {table: Tables.inventory_purchase_items, field: "item"},
  {table: Tables.inventory_purchase_order_items, field: "item"},
  {table: Tables.inventory_purchase_return_items, field: "item"},
  {table: Tables.inventory_issue_items, field: "item"},
  {table: Tables.inventory_issue_return_items, field: "item"},
  {table: Tables.inventory_waste_items, field: "item"},
  {table: Tables.inventory_adjustment_items, field: "item"},
  {table: Tables.stock_transfer_items, field: "item"},
  {table: Tables.recipe_items, field: "item"},
  {table: Tables.recipe_outputs, field: "item"},
  {table: Tables.production_batch_inputs, field: "item"},
  {table: Tables.production_batch_outputs, field: "item"},
  {table: Tables.kitchen_reconciliation_items, field: "item"},
  {table: Tables.kitchen_stock_counts, field: "item"},
  {table: Tables.kitchen_wastes, field: "item"},
  {table: Tables.kitchen_staff_meals, field: "item"},
  {table: Tables.kitchen_complimentary_items, field: "item"},
  {table: Tables.buffet_consumption_logs, field: "item"},
  {table: Tables.buffet_stock_snapshots, field: "item"},
  {table: Tables.buffet_waste_logs, field: "item"},
  {table: Tables.inventory_item_groups, field: "main_item"},
  {table: Tables.inventory_item_group_items, field: "item"},
];

async function itemHasHardRefs(db: DatabaseClient, item: ReturnType<typeof toRecordId>): Promise<boolean> {
  for (const check of HARD_REF_CHECKS) {
    const result = await db.query(
      `SELECT count() AS count FROM ${check.table} WHERE ${check.field} = $item GROUP ALL`,
      {item}
    );
    if (hasResults(result)) return true;
  }
  return false;
}

type DishRecipeRow = {
  id: any;
  menu_item?: any;
};

async function listDishRecipes(
  db: DatabaseClient,
  item: ReturnType<typeof toRecordId>
): Promise<DishRecipeRow[]> {
  const [rows] = await db.query(
    `SELECT id, menu_item FROM ${Tables.dishes_recipes} WHERE item = $item`,
    {item}
  );
  return (rows ?? []) as DishRecipeRow[];
}

async function removeRecipesFromDishes(
  db: DatabaseClient,
  recipes: DishRecipeRow[]
): Promise<void> {
  const byDish = new Map<string, Set<string>>();
  for (const recipe of recipes) {
    const dishId = recordIdToString(recipe.menu_item);
    const recipeId = recordIdToString(recipe.id);
    if (!dishId || !recipeId) continue;
    if (!byDish.has(dishId)) byDish.set(dishId, new Set());
    byDish.get(dishId)!.add(recipeId);
  }

  for (const [dishId, recipeIds] of byDish) {
    const dishRef = toRecordId(dishId);
    const [dish] = await db.query(`SELECT items FROM ONLY $dish`, {dish: dishRef}) as any[];
    const current = Array.isArray(dish?.items) ? dish.items : [];
    const next = current.filter((id: any) => {
      const key = recordIdToString(id);
      return key ? !recipeIds.has(key) : true;
    });
    await db.merge(dishRef, {items: next.map((id: any) => toRecordId(id))});
  }
}

/**
 * Delete or deactivate an inventory item:
 * - hard refs → soft delete (deleted_at)
 * - only dish recipes → remove recipe lines, prune dish.items, hard delete
 * - unused → hard delete
 */
export async function deleteInventoryItem({
  db,
  id,
  entityLabel,
  onAfter,
  manager,
  changedBy,
}: DeleteInventoryItemOptions): Promise<DeleteInventoryItemResult> {
  const item = toRecordId(id);
  const label = entityLabel || i18n.t("inventory:tabs.items", {defaultValue: "Item"});

  const emit = async (action: "delete" | "deactivate") => {
    await entityAfterWrite({
      manager,
      domain: "inventory",
      table: Tables.inventory_items,
      entityId: String(id),
      action,
      label,
      source: "inventory-item-delete",
      changedBy,
    });
  };

  try {
    if (await itemHasHardRefs(db, item)) {
      await db.merge(item, {deleted_at: new Date()});
      toast.info(
        i18n.t("toast:inventory.itemDeactivated", {
          name: label,
          defaultValue: "{{name}} is in use and was deactivated.",
        })
      );
      await emit("deactivate");
      await onAfter?.();
      return "deactivated";
    }

    const recipes = await listDishRecipes(db, item);
    if (recipes.length > 0) {
      await removeRecipesFromDishes(db, recipes);
      await db.query(`DELETE ${Tables.dishes_recipes} WHERE item = $item`, {item});
    }

    await db.delete(item);
    toast.success(
      i18n.t("toast:inventory.itemDeleted", {
        name: label,
        defaultValue: "{{name}} deleted successfully.",
      })
    );
    await emit("delete");
    await onAfter?.();
    return "deleted";
  } catch (error: any) {
    toast.error(
      error?.message ??
        i18n.t("toast:inventory.itemDeleteFailed", {
          name: label,
          defaultValue: "Failed to delete {{name}}.",
        })
    );
    throw error;
  }
}
