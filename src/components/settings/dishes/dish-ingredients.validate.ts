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
import type {TFunc} from "@/lib/data-import/helpers.ts";

type DishRow = {id: unknown; name?: string; number?: string | number};

/**
 * Cross-field cleanse/import validation for dish recipe rows:
 * - dish must exist (by number or unique name)
 * - resolved ingredient must be recipe-eligible
 * - entered UOM must convert to the item's stock UOM (e.g. L vs KG → error)
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
    `SELECT id, name, number FROM ${Tables.dishes} WHERE deleted_at = none`,
  );
  const dishes = (dishRows ?? []) as DishRow[];

  const byNumber = new Map<string, DishRow>();
  const byName = new Map<string, DishRow[]>();
  for (const dish of dishes) {
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
      `SELECT id, name, code, uom, item_types, item_type FROM ${Tables.inventory_items}
       WHERE id IN $ids`,
      {ids},
    );
    for (const item of itemRows ?? []) {
      if (item?.id != null) itemById.set(String(item.id), item);
    }
  }

  for (const record of active) {
    throwIfAborted(options?.signal);
    const issues: ImportIssue[] = [];

    const dishKey = String(record.values.dish_number ?? "").trim();
    if (dishKey) {
      const byNum = byNumber.get(dishKey);
      if (byNum) {
        // ok
      } else {
        const nameMatches = byName.get(dishKey.toLowerCase()) ?? [];
        if (nameMatches.length === 0) {
          issues.push({
            field: "dish_number",
            code: "cross_field",
            severity: "error",
            message: t("toast:admin.invalidDishNameOrNumber", {
              defaultValue: `Dish "${dishKey}" was not found`,
            }),
          });
        } else if (nameMatches.length > 1) {
          issues.push({
            field: "dish_number",
            code: "cross_field",
            severity: "error",
            message: t("toast:admin.ambiguousDishName", {
              defaultValue: `Dish name "${dishKey}" matches more than one menu item`,
            }),
          });
        }
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

        // Surface stock UOM on the reference-only column for the cleansed CSV.
        if (stockUom && !String(record.values.stock_uom ?? "").trim()) {
          record.values.stock_uom = stockUom;
        }
      }
    }

    if (issues.length) {
      record.issues.push(...issues);
    }
  }
}
