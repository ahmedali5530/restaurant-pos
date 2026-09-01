import {DateTime} from "luxon";
import {StringRecordId} from "surrealdb";
import {Tables} from "@/api/db/tables.ts";
import {fetchPaidOrders} from "@/api/reports/sales/fetch.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

export type DailyConsumptionEntry = {
  name: string;
  code?: string;
  uom?: string;
  points: Array<{period: string; value: number}>;
};

/**
 * Per-item daily theoretical consumption (recipe × sold Paid dishes).
 */
export const getPerItemDailyConsumption = async (
  db: DbClient,
  options: DateRangeFilter,
): Promise<Map<string, DailyConsumptionEntry>> => {
  const orders = await fetchPaidOrders(db, {
    startDate: options.startDate,
    endDate: options.endDate,
    fetches: ["items", "items.item"],
  });

  const dishIds = new Set<string>();
  orders.forEach((order) => {
    order.items?.forEach((orderItem) => {
      if (!orderItem.item) return;
      const dishId = recordToString(orderItem.item);
      if (dishId) dishIds.add(dishId);
    });
  });

  const recipesMap = new Map<string, Array<{quantity?: number; item?: any}>>();
  await Promise.all(Array.from(dishIds).map(async (dishId) => {
    try {
      const recipes = unwrapQueryResult<{quantity?: number; item?: any}>(
        await db.query(
          `SELECT * FROM ${Tables.dishes_recipes} WHERE menu_item = $dishId FETCH item`,
          {dishId: new StringRecordId(dishId)},
        ),
      );
      if (recipes.length) recipesMap.set(dishId, recipes);
    } catch {
      // skip dishes whose recipe fetch fails
    }
  }));

  const byItem = new Map<string, {name: string; code?: string; uom?: string; points: Map<string, number>}>();

  orders.forEach((order) => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const period = DateTime.fromJSDate(jsDate).toISODate() ?? "";
    if (!period) return;

    order.items?.forEach((orderItem) => {
      const dish = orderItem.item;
      if (!dish) return;
      const dishId = recordToString(dish);
      const recipes = recipesMap.get(dishId) || [];
      const orderItemQuantity = safeNumber(orderItem.quantity);
      recipes.forEach((recipe) => {
        const inventoryItem = recipe.item;
        if (!inventoryItem) return;
        const itemId = recordToString(inventoryItem);
        const key = normalizeKey(itemId);
        let entry = byItem.get(key);
        if (!entry) {
          entry = {
            name: inventoryItem.name || "Unknown",
            code: inventoryItem.code,
            uom: inventoryItem.uom,
            points: new Map(),
          };
          byItem.set(key, entry);
        }
        const qty = orderItemQuantity * safeNumber(recipe.quantity);
        entry.points.set(period, (entry.points.get(period) || 0) + qty);
      });
    });
  });

  const result = new Map<string, DailyConsumptionEntry>();
  byItem.forEach((entry, key) => {
    result.set(key, {
      name: entry.name,
      code: entry.code,
      uom: entry.uom,
      points: Array.from(entry.points.entries())
        .map(([period, value]) => ({period, value}))
        .sort((a, b) => a.period.localeCompare(b.period)),
    });
  });
  return result;
};
