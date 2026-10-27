import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {safeNumber, toRecordId} from "@/lib/utils.ts";
import {roundInventory} from "@/lib/inventory/rounding.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type SyncDishRecipeCostsResult = {
  itemCount: number;
  dishCount: number;
};

/**
 * Sync unlocked dish recipe line costs from inventory_item.price for the given
 * items, then recalculate each affected dish's stored cost as Σ(qty × cost).
 * Skips menu_item_recipe rows where is_price_locked is true.
 */
export async function syncDishRecipeCostsForItems(
  db: DatabaseClient,
  itemIds: string[]
): Promise<SyncDishRecipeCostsResult> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean).map((id) => id.toString()))];
  if (uniqueIds.length === 0) {
    return {itemCount: 0, dishCount: 0};
  }

  const affectedDishIds = new Set<string>();

  for (const itemId of uniqueIds) {
    const itemRef = toRecordId(itemId);
    const [item] = await db.query(
      `SELECT price, average_price FROM ONLY $item`,
      {item: itemRef}
    ) as any[];

    const rawPrice = item?.price ?? item?.average_price;
    if (rawPrice === undefined || rawPrice === null) {
      continue;
    }

    const price = roundInventory(safeNumber(rawPrice));
    const [updatedRecipes] = await db.query(
      `UPDATE ${Tables.dishes_recipes}
       SET cost = $price
       WHERE item = $item AND is_price_locked != true
       RETURN AFTER`,
      {item: itemRef, price}
    ) as any[];

    for (const recipe of updatedRecipes ?? []) {
      const dishId = recordIdToString(recipe.menu_item);
      if (dishId) {
        affectedDishIds.add(dishId);
      }
    }
  }

  for (const dishId of affectedDishIds) {
    const dishRef = toRecordId(dishId);
    const [recipes] = await db.query(
      `SELECT quantity, cost FROM ${Tables.dishes_recipes} WHERE menu_item = $dish`,
      {dish: dishRef}
    ) as any[];

    const totalCost = roundInventory(
      (recipes ?? []).reduce((sum: number, recipe: any) => {
        return sum + safeNumber(recipe.quantity) * safeNumber(recipe.cost);
      }, 0)
    );

    await db.merge(dishRef, {cost: totalCost});
  }

  return {itemCount: uniqueIds.length, dishCount: affectedDishIds.size};
}

/** Sync every unlocked recipe line from current inventory prices, then dish costs. */
export async function syncAllDishRecipeCosts(
  db: DatabaseClient
): Promise<SyncDishRecipeCostsResult> {
  const [rows] = await db.query(
    `SELECT item FROM ${Tables.dishes_recipes} WHERE is_price_locked != true`
  ) as any[];

  const itemIds = [
    ...new Set(
      (rows ?? [])
        .map((row: any) => recordIdToString(row.item))
        .filter(Boolean) as string[]
    ),
  ];

  return syncDishRecipeCostsForItems(db, itemIds);
}
