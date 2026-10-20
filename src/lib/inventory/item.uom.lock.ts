import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {normalizeUom} from "@/utils/inventoryUom.ts";

type DatabaseClient = ReturnType<typeof useDB>;

/**
 * True when changing the item's stock unit would reinterpret existing
 * ledger balances or recipe quantities.
 */
export async function itemHasStockUnitHistory(
  db: DatabaseClient,
  itemId: string
): Promise<boolean> {
  const item = toRecordId(itemId);
  const [[ledger], [dishRecipes], [recipes]] = await Promise.all([
    db.query(
      `SELECT id FROM ${Tables.inventory_ledger} WHERE inventory_item = $item LIMIT 1`,
      {item}
    ),
    db.query(
      `SELECT id FROM ${Tables.dishes_recipes} WHERE item = $item LIMIT 1`,
      {item}
    ),
    db.query(
      `SELECT id FROM ${Tables.recipe_items} WHERE item = $item LIMIT 1`,
      {item}
    ),
  ]);

  const has = (rows: unknown) => Array.isArray(rows) && rows.length > 0;
  return has(ledger) || has(dishRecipes) || has(recipes);
}

export async function assertItemUomChangeAllowed(
  db: DatabaseClient,
  opts: {itemId?: string | null; previousUom?: string | null; nextUom?: string | null}
): Promise<void> {
  const prev = normalizeUom(opts.previousUom);
  const next = normalizeUom(opts.nextUom);
  if (!opts.itemId) return;
  // Creating / first set (no previous) is always allowed.
  if (!prev) return;
  if (prev === next) return;
  if (!next) {
    throw new Error("Unit of measure is required");
  }
  if (await itemHasStockUnitHistory(db, opts.itemId)) {
    throw new Error(
      "Stock unit cannot be changed after the item has ledger movements or recipe quantities"
    );
  }
}
