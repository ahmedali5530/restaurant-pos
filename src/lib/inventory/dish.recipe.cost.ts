import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {safeNumber, toRecordId} from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

/**
 * Sync unlocked dish recipe line costs from inventory_item.price for the given
 * items, then recalculate each affected dish's stored cost as Σ(qty × cost).
 * Skips menu_item_recipe rows where is_price_locked is true.
 */
export async function syncDishRecipeCostsForItems(
  db: DatabaseClient,
  itemIds: string[]
): Promise<void> {
  const uniqueIds = [...new Set(itemIds.filter(Boolean).map((id) => id.toString()))];
  if (uniqueIds.length === 0) {
    return;
  }

  const affectedDishIds = new Set<string>();

  for (const itemId of uniqueIds) {
    const itemRef = toRecordId(itemId);
    const [item] = await db.query(`SELECT price FROM ONLY $item`, {item: itemRef}) as any[];

    if (!item || item.price === undefined || item.price === null) {
      continue;
    }

    const price = safeNumber(item.price);
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

    const totalCost = (recipes ?? []).reduce((sum: number, recipe: any) => {
      return sum + safeNumber(recipe.quantity) * safeNumber(recipe.cost);
    }, 0);

    await db.merge(dishRef, {cost: totalCost});
  }
}
