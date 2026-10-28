import {Tables} from "@/api/db/tables.ts";
import type {
  ImportDbLike,
  ImportIssue,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";
import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {toRecordId} from "@/lib/utils.ts";
import {canUseInDishRecipe} from "@/utils/inventoryItemTypes.ts";
import {convertQuantity, normalizeUom} from "@/utils/inventoryUom.ts";
import {toStockLine} from "@/lib/inventory/unit.convert.ts";
import {roundInventory} from "@/lib/inventory/rounding.ts";
import type {TFunc} from "@/lib/data-import/helpers.ts";

type DishRow = {
  id: unknown;
  name?: string;
  number?: string | number;
  price?: number | string | null;
};

type LineCostContext = {
  dishId: string | null;
  itemId: string | null;
  lineCost: number | null;
};

const resolveDish = (
  dishKey: string,
  byNumber: Map<string, DishRow>,
  byName: Map<string, DishRow[]>,
): {status: "found"; dish: DishRow} | {status: "not_found"} | {status: "ambiguous"} => {
  const byNum = byNumber.get(dishKey);
  if (byNum) return {status: "found", dish: byNum};
  const nameMatches = byName.get(dishKey.toLowerCase()) ?? [];
  if (nameMatches.length === 1) return {status: "found", dish: nameMatches[0]};
  if (nameMatches.length > 1) return {status: "ambiguous"};
  return {status: "not_found"};
};

const itemUnitCost = (item: any, costRaw: unknown): number => {
  if (costRaw !== null && costRaw !== undefined && String(costRaw).trim() !== "") {
    const n = Number(costRaw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const fromItem = Number(item?.price ?? item?.average_price ?? 0);
  return Number.isFinite(fromItem) ? fromItem : 0;
};

/** Line food cost in stock units: stock_qty × unit_cost. */
export function recipeLineFoodCost(opts: {
  quantity: unknown;
  enteredUom?: unknown;
  stockUom?: unknown;
  unitCost: number;
}): number | null {
  const qty = Number(opts.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const stockUom = String(opts.stockUom ?? "").trim();
  const enteredUom = String(opts.enteredUom ?? "").trim() || stockUom;
  if (!stockUom) {
    return roundInventory(qty * opts.unitCost);
  }
  try {
    const stock = toStockLine({
      enteredQuantity: qty,
      enteredUom,
      stockUom,
      stockUnitPrice: opts.unitCost,
      mode: "quantity_only",
    });
    return roundInventory(stock.quantity * stock.price);
  } catch {
    return null;
  }
}

/**
 * Cross-field cleanse/import validation for dish recipe rows:
 * - dish must exist (by number or unique name)
 * - resolved ingredient must be recipe-eligible
 * - entered UOM must convert to the item's stock UOM (e.g. L vs KG → error)
 * - resulting recipe food cost must not exceed the dish selling price (warning)
 */
export async function validateDishIngredientRecords(
  db: ImportDbLike,
  t: TFunc,
  records: ImportRecord[],
  options?: {signal?: AbortSignal},
): Promise<void> {
  const active = records.filter((r) => !r.skipped);
  if (!active.length) return;

  const [dishRows] = await db.query(
    `SELECT id, name, number, price FROM ${Tables.dishes} WHERE deleted_at = none`,
  );
  const dishes = (dishRows ?? []) as DishRow[];

  const byNumber = new Map<string, DishRow>();
  const byName = new Map<string, DishRow[]>();
  const dishById = new Map<string, DishRow>();
  for (const dish of dishes) {
    const id = dish.id != null ? String(dish.id) : "";
    if (id) dishById.set(id, dish);
    const num = String(dish.number ?? "").trim();
    if (num) byNumber.set(num, dish);
    const nameKey = String(dish.name ?? "").trim().toLowerCase();
    if (!nameKey) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(dish);
    byName.set(nameKey, list);
  }

  const itemIds = new Set<string>();
  for (const record of active) {
    const ref = record.values.ingredient as ResolvedReference | null;
    if (ref?.id) itemIds.add(String(ref.id));
  }

  const itemById = new Map<string, any>();
  if (itemIds.size) {
    const ids = Array.from(itemIds).map((id) => toRecordId(id));
    const [itemRows] = await db.query(
      `SELECT id, name, code, uom, price, average_price, item_types, item_type
       FROM ${Tables.inventory_items}
       WHERE id IN $ids`,
      {ids},
    );
    for (const item of itemRows ?? []) {
      if (item?.id != null) itemById.set(String(item.id), item);
    }
  }

  const lineCtxByIndex = new Map<number, LineCostContext>();
  const fileItemsByDish = new Map<string, Set<string>>();
  const fileCostByDish = new Map<string, number>();
  const rowsByDish = new Map<string, number[]>();

  active.forEach((record, index) => {
    throwIfAborted(options?.signal);
    const issues: ImportIssue[] = [];
    const ctx: LineCostContext = {dishId: null, itemId: null, lineCost: null};

    const dishKey = String(record.values.dish_number ?? "").trim();
    if (dishKey) {
      const resolved = resolveDish(dishKey, byNumber, byName);
      if (resolved.status === "not_found") {
        issues.push({
          field: "dish_number",
          code: "cross_field",
          severity: "error",
          message: t("toast:admin.invalidDishNameOrNumber", {
            defaultValue: `Dish "${dishKey}" was not found`,
          }),
        });
      } else if (resolved.status === "ambiguous") {
        issues.push({
          field: "dish_number",
          code: "cross_field",
          severity: "error",
          message: t("toast:admin.ambiguousDishName", {
            defaultValue: `Dish name "${dishKey}" matches more than one menu item`,
          }),
        });
      } else {
        ctx.dishId = String(resolved.dish.id);
      }
    }

    const ingredientRef = record.values.ingredient as ResolvedReference | null;
    if (ingredientRef?.id) {
      const item = itemById.get(String(ingredientRef.id));
      if (!item) {
        issues.push({
          field: "ingredient",
          code: "cross_field",
          severity: "error",
          message: t("toast:admin.invalidIngredient", {
            defaultValue: `Ingredient "${ingredientRef.label}" was not found`,
          }),
        });
      } else if (!canUseInDishRecipe(item)) {
        issues.push({
          field: "ingredient",
          code: "cross_field",
          severity: "error",
          message: t("toast:admin.invalidIngredientType", {
            defaultValue: `"${ingredientRef.label}" cannot be used as a recipe ingredient`,
          }),
        });
      } else {
        ctx.itemId = String(item.id);
        const stockUomRaw = String(item.uom ?? "").trim();
        const enteredRaw = String(record.values.uom ?? "").trim();
        const stockUom = normalizeUom(stockUomRaw);
        const enteredUom = normalizeUom(enteredRaw || stockUomRaw);

        if (enteredRaw && !enteredUom) {
          issues.push({
            field: "uom",
            code: "cross_field",
            severity: "error",
            message: t("common:dataImport.unknownUom", {
              uom: enteredRaw,
              defaultValue: `Unknown unit "${enteredRaw}"`,
            }),
          });
        } else if (stockUom && enteredUom && enteredUom !== stockUom) {
          try {
            convertQuantity(1, enteredUom, stockUom);
          } catch {
            const itemSuffix = item.name ? ` (${item.name})` : "";
            issues.push({
              field: "uom",
              code: "cross_field",
              severity: "error",
              message: t("common:dataImport.incompatibleUom", {
                entered: enteredUom,
                stock: stockUom,
                item: itemSuffix,
                defaultValue:
                  `Unit "${enteredUom}" cannot convert to item stock unit "${stockUom}"${itemSuffix}`,
              }),
            });
          }
        } else if (!stockUom && enteredRaw) {
          issues.push({
            field: "uom",
            code: "cross_field",
            severity: "warning",
            message: t("common:dataImport.missingItemStockUom", {
              uom: enteredRaw,
              defaultValue: `Ingredient has no stock UOM; cannot verify "${enteredRaw}"`,
            }),
          });
        }

        if (stockUom && !String(record.values.stock_uom ?? "").trim()) {
          record.values.stock_uom = stockUom;
        }

        const unitCost = itemUnitCost(item, record.values.cost);
        ctx.lineCost = recipeLineFoodCost({
          quantity: record.values.quantity,
          enteredUom: enteredUom || stockUomRaw,
          stockUom: stockUom || stockUomRaw,
          unitCost,
        });
      }
    }

    lineCtxByIndex.set(index, ctx);
    if (ctx.dishId) {
      const rows = rowsByDish.get(ctx.dishId) ?? [];
      rows.push(index);
      rowsByDish.set(ctx.dishId, rows);
      if (ctx.itemId) {
        const items = fileItemsByDish.get(ctx.dishId) ?? new Set<string>();
        items.add(ctx.itemId);
        fileItemsByDish.set(ctx.dishId, items);
      }
      if (ctx.lineCost != null) {
        fileCostByDish.set(
          ctx.dishId,
          roundInventory((fileCostByDish.get(ctx.dishId) ?? 0) + ctx.lineCost),
        );
      }
    }

    if (issues.length) {
      record.issues.push(...issues);
    }
  });

  // Existing DB recipe lines for dishes in this file (lines not superseded by the file).
  const dishIds = Array.from(rowsByDish.keys());
  const existingCostByDish = new Map<string, number>();
  if (dishIds.length) {
    const [existingRows] = await db.query(
      `SELECT menu_item, item, quantity, cost FROM ${Tables.dishes_recipes}
       WHERE menu_item IN $dishes`,
      {dishes: dishIds.map((id) => toRecordId(id))},
    );
    for (const row of existingRows ?? []) {
      const dishId = row?.menu_item != null ? String(row.menu_item) : "";
      const itemId = row?.item != null ? String(row.item) : "";
      if (!dishId || !itemId) continue;
      if (fileItemsByDish.get(dishId)?.has(itemId)) continue;
      const line = roundInventory(Number(row.quantity ?? 0) * Number(row.cost ?? 0));
      if (!Number.isFinite(line) || line <= 0) continue;
      existingCostByDish.set(
        dishId,
        roundInventory((existingCostByDish.get(dishId) ?? 0) + line),
      );
    }
  }

  for (const [dishId, rowIndexes] of rowsByDish) {
    const dish = dishById.get(dishId);
    if (!dish) continue;
    // Base price 0 is normal when sell price lives on modifiers (sizes/options).
    const sellPrice = Number(dish.price ?? 0);
    if (!Number.isFinite(sellPrice) || sellPrice <= 0) continue;

    const recipeCost = roundInventory(
      (fileCostByDish.get(dishId) ?? 0) + (existingCostByDish.get(dishId) ?? 0),
    );
    if (recipeCost <= sellPrice) continue;

    const dishLabel =
      String(dish.name ?? "").trim()
      || String(dish.number ?? "").trim()
      || dishId;
    const message = t("common:dataImport.recipeCostExceedsPrice", {
      dish: dishLabel,
      recipeCost,
      price: sellPrice,
      defaultValue:
        `Recipe food cost ${recipeCost} exceeds dish price ${sellPrice} for "${dishLabel}"`,
    });

    for (const index of rowIndexes) {
      active[index].issues.push({
        field: "quantity",
        code: "cross_field",
        severity: "warning",
        message,
      });
    }
  }
}
