import {StringRecordId} from "surrealdb";
import {Tables} from "@/api/db/tables.ts";
import type {Order} from "@/api/model/order.ts";
import {fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales/fetch.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getOrderItemDisplayUnitPrice} from "@/lib/order-item-display.ts";
import {calculateOrderNetSales} from "@/lib/order.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";
import {DateTime} from "luxon";
import {
  fetchLedgerMovements,
} from "@/lib/inventory/ledger.service.ts";

export type RecipeConsumptionItem = {
  id: string;
  name: string;
  code?: string;
  uom?: string;
  quantity: number;
  costAverage: number;
  costCurrent: number;
  saleAllocated: number;
  differenceAverage: number;
  differenceCurrent: number;
};

export type RecipeConsumptionOptions = DateRangeFilter & {
  dishIds?: string[];
  itemIds?: string[];
  limit?: number;
  /** When true, allocate sale price using inclusive display unit prices. */
  showInclusive?: boolean;
};

export type RecipeConsumptionSummary = {
  orderCount: number;
  byItem: RecipeConsumptionItem[];
  totals: {
    quantity: number;
    saleAllocated: number;
    costAverage: number;
    costCurrent: number;
    differenceAverage: number;
    differenceCurrent: number;
  };
};

type RecipeRow = {
  quantity?: number;
  cost?: number;
  item?: {
    id?: unknown;
    name?: string;
    code?: string;
    uom?: string;
    average_price?: number;
    price?: number;
  };
};

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const loadRecipesByDish = async (
  db: DbClient,
  dishIds: string[],
): Promise<Map<string, RecipeRow[]>> => {
  const recipesMap = new Map<string, RecipeRow[]>();
  if (!dishIds.length) {
    return recipesMap;
  }

  await Promise.all(dishIds.map(async (dishId) => {
    try {
      const recipes = unwrapQueryResult<RecipeRow>(
        await db.query(
          `SELECT * FROM ${Tables.dishes_recipes} WHERE menu_item = $dishId FETCH item`,
          {dishId: new StringRecordId(dishId)},
        ),
      );
      if (recipes.length) {
        recipesMap.set(dishId, recipes);
      }
    } catch {
      // Skip dishes whose recipe fetch fails.
    }
  }));

  return recipesMap;
};

const collectDishIds = (orders: Order[], dishFilter: string[]): string[] => {
  const dishIds = new Set<string>();
  const filterSet = dishFilter.length ? new Set(dishFilter.map(normalizeKey)) : null;

  orders.forEach((order) => {
    order.items?.forEach((orderItem) => {
      if (!orderItem.item) {
        return;
      }
      const dishId = recordToString(orderItem.item);
      if (!dishId) {
        return;
      }
      if (filterSet && !filterSet.has(normalizeKey(dishId)) && !filterSet.has(dishId)) {
        return;
      }
      dishIds.add(dishId);
    });
  });

  return Array.from(dishIds);
};

/**
 * Theoretical consumption: recipe ingredient qty × sold (Paid) dish qty.
 * Does NOT use inventory issuance / ledger issues.
 */
export const getRecipeConsumptionSummary = async (
  db: DbClient,
  options: RecipeConsumptionOptions = {},
): Promise<RecipeConsumptionSummary> => {
  const {
    dishIds = [],
    itemIds = [],
    limit,
    showInclusive = false,
    ...dateRange
  } = options;

  const orders = await fetchPaidOrders(db, {
    ...dateRange,
    menuItemIds: dishIds,
    fetches: ["items", "items.item", "items.taxes", "items.tax_mode"],
  });

  const recipesMap = await loadRecipesByDish(db, collectDishIds(orders, dishIds));
  const itemFilter = itemIds.length
    ? new Set(itemIds.flatMap((id) => [id, normalizeKey(id)]))
    : null;

  const consumptionMap = new Map<string, RecipeConsumptionItem>();

  orders.forEach((order) => {
    order.items?.forEach((orderItem) => {
      const dish = orderItem.item;
      if (!dish) {
        return;
      }

      const dishId = recordToString(dish);
      if (dishIds.length) {
        const allowed = dishIds.some(
          (id) => id === dishId || normalizeKey(id) === normalizeKey(dishId),
        );
        if (!allowed) {
          return;
        }
      }

      const orderItemQuantity = safeNumber(orderItem.quantity);
      const orderItemSalePrice =
        orderItemQuantity * getOrderItemDisplayUnitPrice(orderItem, showInclusive);
      const recipes = recipesMap.get(dishId) || [];

      let totalRecipeCost = 0;
      const recipeCosts = new Map<string, number>();
      recipes.forEach((recipe) => {
        const inventoryItem = recipe.item;
        if (!inventoryItem) {
          return;
        }
        const itemId = recordToString(inventoryItem);
        const itemCost = safeNumber(recipe.quantity) * safeNumber(recipe.cost);
        recipeCosts.set(itemId, itemCost);
        totalRecipeCost += itemCost;
      });

      recipes.forEach((recipe) => {
        const inventoryItem = recipe.item;
        if (!inventoryItem) {
          return;
        }
        const itemId = recordToString(inventoryItem);
        if (itemFilter && !itemFilter.has(itemId) && !itemFilter.has(normalizeKey(itemId))) {
          return;
        }

        const consumedQuantity = orderItemQuantity * safeNumber(recipe.quantity);
        const averagePrice = safeNumber(inventoryItem.average_price || 0);
        const currentPrice = safeNumber(inventoryItem.price || 0);
        const costAverage = consumedQuantity * averagePrice;
        const costCurrent = consumedQuantity * currentPrice;
        const recipeCost = recipeCosts.get(itemId) || 0;
        const allocatedSalePrice = totalRecipeCost > 0
          ? (orderItemSalePrice * recipeCost) / totalRecipeCost
          : 0;

        let row = consumptionMap.get(itemId);
        if (!row) {
          row = {
            id: itemId,
            name: inventoryItem.name || "Unknown",
            code: inventoryItem.code,
            uom: inventoryItem.uom,
            quantity: 0,
            costAverage: 0,
            costCurrent: 0,
            saleAllocated: 0,
            differenceAverage: 0,
            differenceCurrent: 0,
          };
          consumptionMap.set(itemId, row);
        }

        row.quantity += consumedQuantity;
        row.costAverage += costAverage;
        row.costCurrent += costCurrent;
        row.saleAllocated += allocatedSalePrice;
      });
    });
  });

  let byItem = Array.from(consumptionMap.values()).map((item) => ({
    ...item,
    differenceAverage: item.saleAllocated - item.costAverage,
    differenceCurrent: item.saleAllocated - item.costCurrent,
  }));

  byItem.sort((a, b) => a.name.localeCompare(b.name));
  if (limit != null && limit > 0) {
    byItem = byItem
      .slice()
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const totals = byItem.reduce(
    (acc, item) => {
      acc.quantity += item.quantity;
      acc.saleAllocated += item.saleAllocated;
      acc.costAverage += item.costAverage;
      acc.costCurrent += item.costCurrent;
      acc.differenceAverage += item.differenceAverage;
      acc.differenceCurrent += item.differenceCurrent;
      return acc;
    },
    {
      quantity: 0,
      saleAllocated: 0,
      costAverage: 0,
      costCurrent: 0,
      differenceAverage: 0,
      differenceCurrent: 0,
    },
  );

  return {
    orderCount: orders.length,
    byItem,
    totals,
  };
};

/**
 * Daily (or weekly/hourly) recipe-based consumption qty from Paid orders.
 */
export const getRecipeConsumptionTimeSeries = async (
  db: DbClient,
  options: DateRangeFilter & {granularity?: "daily" | "weekly" | "hourly"},
) => {
  const granularity = options.granularity ?? "daily";
  const orders = await fetchPaidOrders(db, {
    startDate: options.startDate,
    endDate: options.endDate,
    fetches: ["items", "items.item"],
  });

  const recipesMap = await loadRecipesByDish(db, collectDishIds(orders, []));
  const buckets = new Map<string, number>();

  const bucketKey = (date: DateTime) => {
    if (granularity === "hourly") {
      return date.toFormat("yyyy-LL-dd HH:00");
    }
    if (granularity === "weekly") {
      return date.startOf("week").toISODate() ?? date.toISODate() ?? "";
    }
    return date.toISODate() ?? "";
  };

  orders.forEach((order) => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const key = bucketKey(DateTime.fromJSDate(jsDate));
    let dayQty = 0;

    order.items?.forEach((orderItem) => {
      const dish = orderItem.item;
      if (!dish) {
        return;
      }
      const dishId = recordToString(dish);
      const recipes = recipesMap.get(dishId) || [];
      const orderItemQuantity = safeNumber(orderItem.quantity);
      recipes.forEach((recipe) => {
        if (!recipe.item) {
          return;
        }
        dayQty += orderItemQuantity * safeNumber(recipe.quantity);
      });
    });

    buckets.set(key, (buckets.get(key) ?? 0) + dayQty);
  });

  return Array.from(buckets.entries())
    .map(([period, value]) => ({period, value}))
    .sort((a, b) => a.period.localeCompare(b.period));
};

/**
 * Actual stock issuance from ledger (issues + buffet consumption).
 * Distinct from theoretical recipe consumption.
 */
export const getIssuanceSummary = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number} = {},
) => {
  const limit = options.limit ?? 50;
  const movements = await fetchLedgerMovements(db as any, {
    from: options.startDate,
    to: options.endDate,
    referenceTypes: ["issue", "buffet_consumption"],
    excludeReversals: true,
  });

  const items = unwrapQueryResult<{id: unknown; name?: string}>(
    await db.query(`SELECT id, name FROM ${Tables.inventory_items}`),
  );
  const itemNameByKey = new Map<string, string>();
  items.forEach((item) => {
    const full = recordToString(item.id);
    itemNameByKey.set(full, item.name ?? "Unknown");
    itemNameByKey.set(normalizeKey(full), item.name ?? "Unknown");
  });

  const byItem = new Map<string, {name: string; quantity: number}>();
  movements.forEach((row) => {
    const name =
      itemNameByKey.get(row.inventory_item)
      || itemNameByKey.get(normalizeKey(row.inventory_item))
      || "Unknown";
    const existing = byItem.get(name) || {name, quantity: 0};
    existing.quantity += Math.abs(safeNumber(row.quantity_change));
    byItem.set(name, existing);
  });

  return {
    type: "issue" as const,
    movementCount: movements.length,
    byItem: Array.from(byItem.values()).sort((a, b) => b.quantity - a.quantity).slice(0, limit),
  };
};

const documentLineCost = (docs: Array<{items?: Array<{quantity?: number; price?: number}>}>) =>
  docs.reduce((sum, doc) => {
    return sum + (doc.items || []).reduce((itemSum, item) => {
      return itemSum + safeNumber(item.quantity) * safeNumber(item.price);
    }, 0);
  }, 0);

/**
 * Sale vs Consumption report totals (sales, recipe consumption, issuance, purchases).
 */
export const getSaleVsConsumptionReport = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number} = {},
) => {
  const limit = options.limit ?? 30;
  const {conditions, params} = buildCreatedAtDateConditions(options);

  const [orders, issues, purchases, consumption] = await Promise.all([
    fetchPaidOrders(db, {
      ...options,
      fetches: SALES_SUMMARY_FETCHES,
    }),
    unwrapQueryResult<{items?: Array<{quantity?: number; price?: number}>}>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_issues}
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         FETCH items`,
        params,
      ),
    ),
    unwrapQueryResult<{items?: Array<{quantity?: number; price?: number}>}>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_purchases}
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
         FETCH items`,
        params,
      ),
    ),
    getRecipeConsumptionSummary(db, options),
  ]);

  const saleTotal = orders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);
  const consumptionTotal = consumption.totals.costAverage;
  const issuanceTotal = documentLineCost(issues);
  const purchaseTotal = documentLineCost(purchases);

  const consumptionProfit = saleTotal - consumptionTotal;
  const issuanceProfit = saleTotal - issuanceTotal;
  const purchaseProfit = saleTotal - purchaseTotal;

  const topItems = [...consumption.byItem]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);

  return {
    saleTotal,
    consumptionTotal,
    consumptionProfit,
    consumptionProfitPercent: saleTotal > 0 ? (consumptionProfit / saleTotal) * 100 : 0,
    issuanceTotal,
    issuanceProfit,
    issuanceProfitPercent: saleTotal > 0 ? (issuanceProfit / saleTotal) * 100 : 0,
    purchaseTotal,
    purchaseProfit,
    purchaseProfitPercent: saleTotal > 0 ? (purchaseProfit / saleTotal) * 100 : 0,
    byItem: topItems.map((item) => ({
      name: item.name,
      consumed: item.quantity,
      costAverage: item.costAverage,
    })),
    orderCount: orders.length,
  };
};
