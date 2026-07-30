import {DateTime} from "luxon";
import {StringRecordId} from "surrealdb";
import {Tables} from "@/api/db/tables.ts";
import {
  getIssuanceSummary,
  getRecipeConsumptionSummary,
  getRecipeConsumptionTimeSeries,
} from "@/api/reports/inventory/consumption.ts";
import {fetchPaidOrders, SALES_SUMMARY_FETCHES} from "@/api/reports/sales/fetch.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {forecastInventoryConsumption} from "@/lib/ai/forecast.ts";
import {
  fetchLedgerMovements,
  fetchLedgerNetsByStore,
} from "@/lib/inventory/ledger.service.ts";
import {calculateOrderNetSales} from "@/lib/order.ts";
import {safeNumber} from "@/lib/utils.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const unitCostOf = (item?: {average_price?: number; price?: number}): number => {
  const avg = safeNumber(item?.average_price);
  if (avg > 0) return avg;
  return safeNumber(item?.price);
};

const todayIso = (): string => DateTime.now().toISODate() ?? "";

const dayFractionElapsed = (): number => {
  const now = DateTime.now();
  const hours = now.diff(now.startOf("day"), "hours").hours;
  return Math.max(0.1, Math.min(1, hours / 24));
};

export type IssuanceVsConsumptionRow = {
  itemId: string;
  name: string;
  code?: string;
  uom?: string;
  issuedQty: number;
  consumedQty: number;
  variance: number;
  costAverage: number;
};

export type LocationStockItem = {
  id: string;
  name: string;
  code: string;
  quantity: number;
  uom: string;
  unitCost: number;
  value: number;
  reorderLevel?: number;
  belowReorder: boolean;
};

export type LocationStockGroup = {
  locationId: string;
  locationName: string;
  items: LocationStockItem[];
};

export type NeededTodayRow = {
  itemId: string;
  name: string;
  code?: string;
  uom?: string;
  onHand: number;
  todayConsumed: number;
  projectedNeed: number;
  shortfall: number;
  unitCost: number;
  shortfallCost: number;
};

export type RunoutForecastRow = {
  itemId: string;
  name: string;
  code?: string;
  uom?: string;
  onHand: number;
  avgDailyConsumption: number;
  daysOfCover: number | null;
  estimatedStockoutDays?: number;
  suggestedReorderQty?: number;
  reorderLevel?: number;
  insufficientData?: boolean;
  confidenceNote: string;
};

export type PeriodMovementTotals = {
  purchaseValue: number;
  purchaseReturnValue: number;
  issueValue: number;
  issueReturnQty: number;
  wasteQty: number;
  transferQty: number;
  productionOutputQty: number;
  buffetConsumptionQty: number;
  adjustmentQty: number;
  purchaseCount: number;
  purchaseReturnCount: number;
  issueCount: number;
  issueReturnCount: number;
  wasteCount: number;
  transferCount: number;
  productionCount: number;
  buffetCount: number;
  adjustmentCount: number;
};

export type TodayPulse = {
  date: string;
  orderCount: number;
  netSales: number;
  consumptionQty: number;
  consumptionCost: number;
  issuedQty: number;
  purchaseValue: number;
  wasteQty: number;
  transferQty: number;
  productionOutputQty: number;
  buffetConsumptionQty: number;
  adjustmentQty: number;
  sameWeekdayAvgSales: number;
  sameWeekdayAvgConsumption: number;
  salesTrendPercent: number | null;
  consumptionTrendPercent: number | null;
  trendSummaryKey: "higher" | "lower" | "similar" | "insufficient";
};

const sumDocumentLineValue = (
  docs: Array<{items?: Array<{quantity?: number; price?: number}>; tax_amount?: number; extras?: Array<{amount?: number}>}>,
): number =>
  docs.reduce((sum, doc) => {
    const itemsTotal = (doc.items ?? []).reduce(
      (itemSum, item) => itemSum + safeNumber(item.quantity) * safeNumber(item.price),
      0,
    );
    const extras = (doc.extras ?? []).reduce(
      (extraSum, extra) => extraSum + safeNumber(extra.amount),
      0,
    );
    return sum + itemsTotal + safeNumber(doc.tax_amount) + extras;
  }, 0);

const sumDocumentLineQty = (
  docs: Array<{items?: Array<{quantity?: number; quantity_change?: number}>}>,
  field: "quantity" | "quantity_change" = "quantity",
): number =>
  docs.reduce((sum, doc) => {
    return sum + (doc.items ?? []).reduce((itemSum, item) => {
      return itemSum + Math.abs(safeNumber(field === "quantity_change" ? item.quantity_change : item.quantity));
    }, 0);
  }, 0);

export const getIssuanceVsConsumption = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number} = {},
): Promise<{
  rows: IssuanceVsConsumptionRow[];
  totals: {issuedQty: number; consumedQty: number; variance: number; costAverage: number};
}> => {
  const limit = options.limit ?? 50;
  const [issuance, consumption] = await Promise.all([
    getIssuanceSummary(db, {...options, limit: 500}),
    getRecipeConsumptionSummary(db, {...options, limit: 500}),
  ]);

  const byKey = new Map<string, IssuanceVsConsumptionRow>();

  consumption.byItem.forEach((item) => {
    const key = normalizeKey(item.id);
    byKey.set(key, {
      itemId: item.id,
      name: item.name,
      code: item.code,
      uom: item.uom,
      issuedQty: 0,
      consumedQty: item.quantity,
      variance: -item.quantity,
      costAverage: item.costAverage,
    });
  });

  issuance.byItem.forEach((item) => {
    const key = normalizeKey(item.itemId);
    const existing = byKey.get(key);
    if (existing) {
      existing.issuedQty = item.quantity;
      existing.variance = existing.issuedQty - existing.consumedQty;
    } else {
      byKey.set(key, {
        itemId: item.itemId,
        name: item.name,
        issuedQty: item.quantity,
        consumedQty: 0,
        variance: item.quantity,
        costAverage: 0,
      });
    }
  });

  const rows = Array.from(byKey.values())
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance) || b.consumedQty - a.consumedQty)
    .slice(0, limit);

  const totals = rows.reduce(
    (acc, row) => {
      acc.issuedQty += row.issuedQty;
      acc.consumedQty += row.consumedQty;
      acc.variance += row.variance;
      acc.costAverage += row.costAverage;
      return acc;
    },
    {issuedQty: 0, consumedQty: 0, variance: 0, costAverage: 0},
  );

  return {rows, totals};
};

export const getDashboardStockByLocation = async (
  db: DbClient,
): Promise<{
  locations: LocationStockGroup[];
  totalStockValue: number;
  belowReorderCount: number;
  onHandByItem: Map<string, number>;
  maxReorderByItem: Map<string, number>;
  itemMetaByKey: Map<string, {id: string; name: string; code?: string; uom?: string; unitCost: number}>;
}> => {
  const [items, locations, ledgerNets] = await Promise.all([
    unwrapQueryResult<{
      id: unknown;
      name?: string;
      code?: string;
      uom?: string;
      average_price?: number;
      price?: number;
      reorder_levels?: Record<string, number>;
    }>(await db.query(`SELECT id, name, code, uom, average_price, price, reorder_levels FROM ${Tables.inventory_items}`)),
    unwrapQueryResult<{id: unknown; name?: string}>(
      await db.query(`SELECT id, name FROM ${Tables.inventory_locations}`),
    ),
    fetchLedgerNetsByStore(db as any),
  ]);

  const itemByKey = new Map<string, (typeof items)[0]>();
  const itemMetaByKey = new Map<string, {id: string; name: string; code?: string; uom?: string; unitCost: number}>();
  items.forEach((item) => {
    const full = recordToString(item.id);
    itemByKey.set(full, item);
    itemByKey.set(normalizeKey(full), item);
    itemMetaByKey.set(normalizeKey(full), {
      id: full,
      name: item.name ?? "Unknown",
      code: item.code,
      uom: item.uom,
      unitCost: unitCostOf(item),
    });
  });

  const locationByKey = new Map<string, {id: string; name: string}>();
  locations.forEach((location) => {
    const full = recordToString(location.id);
    locationByKey.set(full, {id: full, name: location.name ?? "Unknown"});
    locationByKey.set(normalizeKey(full), {id: full, name: location.name ?? "Unknown"});
  });

  const stockMap = new Map<string, Map<string, number>>();
  locations.forEach((location) => {
    stockMap.set(normalizeKey(location.id), new Map());
  });

  const onHandByItem = new Map<string, number>();
  const maxReorderByItem = new Map<string, number>();
  let belowReorderCount = 0;
  let totalStockValue = 0;

  ledgerNets.forEach((row) => {
    const locationKey = normalizeKey(row.locationId);
    const itemKey = normalizeKey(row.itemId);
    const locationItemMap = stockMap.get(locationKey);
    if (!locationItemMap) return;
    locationItemMap.set(itemKey, (locationItemMap.get(itemKey) || 0) + row.net);
    onHandByItem.set(itemKey, (onHandByItem.get(itemKey) || 0) + row.net);
  });

  const groups: LocationStockGroup[] = locations.map((location) => {
    const locationId = recordToString(location.id);
    const locationKey = normalizeKey(locationId);
    const locationItemMap = stockMap.get(locationKey) || new Map();
    const itemsList: LocationStockItem[] = Array.from(locationItemMap.entries())
      .map(([itemKey, quantity]) => {
        const item = itemByKey.get(itemKey);
        const unitCost = unitCostOf(item);
        const reorderLevel = getReorderLevelForStore(item, locationId);
        const belowReorder = reorderLevel > 0 && quantity < reorderLevel;
        if (belowReorder) belowReorderCount += 1;
        if (reorderLevel > 0) {
          maxReorderByItem.set(itemKey, Math.max(maxReorderByItem.get(itemKey) || 0, reorderLevel));
        }
        const value = quantity * unitCost;
        totalStockValue += value;
        return {
          id: itemKey,
          name: item?.name || "Unknown Item",
          code: item?.code || "-",
          quantity,
          uom: item?.uom || "",
          unitCost,
          value,
          reorderLevel: reorderLevel || undefined,
          belowReorder,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      locationId,
      locationName: location.name ?? "Unknown",
      items: itemsList,
    };
  });

  // Zero-stock items with reorder levels
  items.forEach((item) => {
    const itemId = recordToString(item.id);
    const itemKey = normalizeKey(itemId);
    locations.forEach((location) => {
      const locationId = recordToString(location.id);
      const locationKey = normalizeKey(locationId);
      const group = groups.find((g) => normalizeKey(g.locationId) === locationKey);
      if (!group) return;
      if (group.items.some((row) => row.id === itemKey)) return;
      const reorderLevel = getReorderLevelForStore(item, locationId);
      if (reorderLevel <= 0) return;
      belowReorderCount += 1;
      maxReorderByItem.set(itemKey, Math.max(maxReorderByItem.get(itemKey) || 0, reorderLevel));
      group.items.push({
        id: itemKey,
        name: item.name ?? "Unknown",
        code: item.code || "-",
        quantity: 0,
        uom: item.uom || "",
        unitCost: unitCostOf(item),
        value: 0,
        reorderLevel,
        belowReorder: true,
      });
      group.items.sort((a, b) => a.name.localeCompare(b.name));
    });
  });

  return {locations: groups, totalStockValue, belowReorderCount, onHandByItem, maxReorderByItem, itemMetaByKey};
};

export const getPeriodDocumentBundles = async (
  db: DbClient,
  options: DateRangeFilter,
) => {
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [
    purchases,
    purchaseReturns,
    issues,
    issueReturns,
    wastes,
    transfers,
    productionBatches,
    buffetSessions,
    adjustments,
  ] = await Promise.all([
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_purchases} ${where} ORDER BY created_at DESC FETCH items, items.item, supplier, location, created_by`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_purchase_returns} ${where} ORDER BY created_at DESC FETCH items, items.item, purchase, location, created_by`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_issues} ${where} ORDER BY created_at DESC FETCH items, items.item, location, created_by, issued_to`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_issue_returns} ${where} ORDER BY created_at DESC FETCH items, items.item, location, created_by, issuance`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_wastes} ${where} ORDER BY created_at DESC FETCH items, items.item, created_by, purchase, issue`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.stock_transfers} ${where} ORDER BY created_at DESC FETCH items, items.item, from_location, to_location, created_by`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.production_batches} ${where} ORDER BY created_at DESC FETCH recipe, location, created_by, outputs, outputs.item`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.buffet_sessions} ${where} ORDER BY created_at DESC FETCH menu, location, created_by, consumption_logs, consumption_logs.item`,
        params,
      ),
    ),
    unwrapQueryResult<any>(
      await db.query(
        `SELECT * FROM ${Tables.inventory_adjustments} ${where} ORDER BY created_at DESC FETCH items, items.item, location, created_by`,
        params,
      ),
    ),
  ]);

  const buffetConsumptionQty = buffetSessions.reduce((sum, session) => {
    return sum + (session.consumption_logs ?? []).reduce(
      (logSum: number, log: any) => logSum + Math.abs(safeNumber(log.total_consumed ?? log.quantity)),
      0,
    );
  }, 0);

  const productionOutputQty = productionBatches.reduce((sum, batch) => {
    return sum + (batch.outputs ?? []).reduce(
      (outSum: number, out: any) => outSum + safeNumber(out.quantity),
      0,
    );
  }, 0);

  const totals: PeriodMovementTotals = {
    purchaseValue: sumDocumentLineValue(purchases),
    purchaseReturnValue: sumDocumentLineValue(purchaseReturns),
    issueValue: sumDocumentLineValue(issues),
    issueReturnQty: sumDocumentLineQty(issueReturns),
    wasteQty: sumDocumentLineQty(wastes),
    transferQty: sumDocumentLineQty(transfers),
    productionOutputQty,
    buffetConsumptionQty,
    adjustmentQty: sumDocumentLineQty(adjustments, "quantity_change"),
    purchaseCount: purchases.length,
    purchaseReturnCount: purchaseReturns.length,
    issueCount: issues.length,
    issueReturnCount: issueReturns.length,
    wasteCount: wastes.length,
    transferCount: transfers.length,
    productionCount: productionBatches.length,
    buffetCount: buffetSessions.length,
    adjustmentCount: adjustments.length,
  };

  return {
    purchases,
    purchaseReturns,
    issues,
    issueReturns,
    wastes,
    transfers,
    productionBatches,
    buffetSessions,
    adjustments,
    totals,
  };
};

const getLedgerQtyByTypes = async (
  db: DbClient,
  options: DateRangeFilter,
  referenceTypes: string[],
): Promise<number> => {
  const movements = await fetchLedgerMovements(db as any, {
    from: options.startDate,
    to: options.endDate,
    referenceTypes,
    excludeReversals: true,
  });
  return movements.reduce((sum, row) => sum + Math.abs(safeNumber(row.quantity_change)), 0);
};

export const getTodayPulse = async (db: DbClient): Promise<TodayPulse> => {
  const today = todayIso();
  const historyStart = DateTime.now().minus({days: 28}).toISODate() ?? today;

  const [
    todayOrders,
    todayConsumption,
    todayIssuance,
    historyOrders,
    historySeries,
    todayPurchases,
    wasteQty,
    transferQty,
    productionOutputQty,
    buffetConsumptionQty,
    adjustmentQty,
  ] = await Promise.all([
    fetchPaidOrders(db, {startDate: today, endDate: today, fetches: SALES_SUMMARY_FETCHES}),
    getRecipeConsumptionSummary(db, {startDate: today, endDate: today}),
    getIssuanceSummary(db, {startDate: today, endDate: today, limit: 500}),
    fetchPaidOrders(db, {startDate: historyStart, endDate: today, fetches: SALES_SUMMARY_FETCHES}),
    getRecipeConsumptionTimeSeries(db, {startDate: historyStart, endDate: today, granularity: "daily"}),
    (async () => {
      const {conditions, params} = buildCreatedAtDateConditions({startDate: today, endDate: today});
      const rows = unwrapQueryResult<{
        items?: Array<{quantity?: number; price?: number}>;
        tax_amount?: number;
        extras?: Array<{amount?: number}>;
      }>(
        await db.query(
          `SELECT * FROM ${Tables.inventory_purchases} ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} FETCH items`,
          params,
        ),
      );
      return sumDocumentLineValue(rows);
    })(),
    getLedgerQtyByTypes(db, {startDate: today, endDate: today}, ["waste"]),
    getLedgerQtyByTypes(db, {startDate: today, endDate: today}, ["transfer_in", "transfer_out"]),
    getLedgerQtyByTypes(db, {startDate: today, endDate: today}, ["production_output"]),
    getLedgerQtyByTypes(db, {startDate: today, endDate: today}, ["buffet_consumption"]),
    getLedgerQtyByTypes(db, {startDate: today, endDate: today}, ["adjustment"]),
  ]);

  const netSales = todayOrders.reduce((sum, order) => sum + calculateOrderNetSales(order), 0);
  const issuedQty = todayIssuance.byItem.reduce((sum, row) => sum + row.quantity, 0);
  const purchaseValue = todayPurchases;

  const weekday = DateTime.now().weekday;
  const sameWeekdaySales: number[] = [];
  const salesByDay = new Map<string, number>();
  historyOrders.forEach((order) => {
    const jsDate = toJsDate(order.created_at as Parameters<typeof toJsDate>[0]);
    const dt = DateTime.fromJSDate(jsDate);
    const key = dt.toISODate() ?? "";
    if (!key || key === today) return;
    if (dt.weekday !== weekday) return;
    salesByDay.set(key, (salesByDay.get(key) || 0) + calculateOrderNetSales(order));
  });
  salesByDay.forEach((value) => sameWeekdaySales.push(value));

  const sameWeekdayConsumption: number[] = [];
  historySeries.forEach((point) => {
    if (point.period === today) return;
    const dt = DateTime.fromISO(point.period);
    if (!dt.isValid || dt.weekday !== weekday) return;
    sameWeekdayConsumption.push(point.value);
  });

  const sameWeekdayAvgSales =
    sameWeekdaySales.length > 0
      ? sameWeekdaySales.reduce((a, b) => a + b, 0) / sameWeekdaySales.length
      : 0;
  const sameWeekdayAvgConsumption =
    sameWeekdayConsumption.length > 0
      ? sameWeekdayConsumption.reduce((a, b) => a + b, 0) / sameWeekdayConsumption.length
      : 0;

  const salesTrendPercent =
    sameWeekdayAvgSales > 0 ? ((netSales - sameWeekdayAvgSales) / sameWeekdayAvgSales) * 100 : null;
  const consumptionTrendPercent =
    sameWeekdayAvgConsumption > 0
      ? ((todayConsumption.totals.quantity - sameWeekdayAvgConsumption) / sameWeekdayAvgConsumption) * 100
      : null;

  let trendSummaryKey: TodayPulse["trendSummaryKey"] = "insufficient";
  const basis = salesTrendPercent ?? consumptionTrendPercent;
  if (basis != null) {
    if (basis > 8) trendSummaryKey = "higher";
    else if (basis < -8) trendSummaryKey = "lower";
    else trendSummaryKey = "similar";
  }

  return {
    date: today,
    orderCount: todayOrders.length,
    netSales,
    consumptionQty: todayConsumption.totals.quantity,
    consumptionCost: todayConsumption.totals.costAverage,
    issuedQty,
    purchaseValue,
    wasteQty,
    transferQty,
    productionOutputQty,
    buffetConsumptionQty,
    adjustmentQty,
    sameWeekdayAvgSales,
    sameWeekdayAvgConsumption,
    salesTrendPercent,
    consumptionTrendPercent,
    trendSummaryKey,
  };
};

export const getNeededForToday = async (
  db: DbClient,
  onHandByItem: Map<string, number>,
  itemMetaByKey: Map<string, {id: string; name: string; code?: string; uom?: string; unitCost: number}>,
): Promise<{
  rows: NeededTodayRow[];
  coveredCount: number;
  shortCount: number;
  totalProjectedNeedCost: number;
  totalShortfallCost: number;
  dayFraction: number;
}> => {
  const today = todayIso();
  const fraction = dayFractionElapsed();
  const consumption = await getRecipeConsumptionSummary(db, {
    startDate: today,
    endDate: today,
    limit: 500,
  });

  const rows: NeededTodayRow[] = consumption.byItem.map((item) => {
    const key = normalizeKey(item.id);
    const meta = itemMetaByKey.get(key);
    const onHand = onHandByItem.get(key) || 0;
    const todayConsumed = item.quantity;
    const projectedNeed = todayConsumed / fraction;
    const shortfall = Math.max(0, projectedNeed - onHand);
    const unitCost = meta?.unitCost ?? (item.quantity > 0 ? item.costAverage / item.quantity : 0);
    return {
      itemId: item.id,
      name: item.name,
      code: item.code ?? meta?.code,
      uom: item.uom ?? meta?.uom,
      onHand,
      todayConsumed,
      projectedNeed,
      shortfall,
      unitCost,
      shortfallCost: shortfall * unitCost,
    };
  }).sort((a, b) => b.shortfall - a.shortfall || b.projectedNeed - a.projectedNeed);

  const shortCount = rows.filter((r) => r.shortfall > 0.001).length;
  const coveredCount = rows.length - shortCount;
  const totalProjectedNeedCost = rows.reduce((sum, r) => sum + r.projectedNeed * r.unitCost, 0);
  const totalShortfallCost = rows.reduce((sum, r) => sum + r.shortfallCost, 0);

  return {
    rows: rows.slice(0, 40),
    coveredCount,
    shortCount,
    totalProjectedNeedCost,
    totalShortfallCost,
    dayFraction: fraction,
  };
};

/**
 * Per-item daily theoretical consumption for runout forecasting.
 */
const getPerItemDailyConsumption = async (
  db: DbClient,
  options: DateRangeFilter,
): Promise<Map<string, {name: string; code?: string; uom?: string; points: Array<{period: string; value: number}>}>> => {
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

  const result = new Map<string, {name: string; code?: string; uom?: string; points: Array<{period: string; value: number}>}>();
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

export const getRunoutForecast = async (
  db: DbClient,
  onHandByItem: Map<string, number>,
  maxReorderByItem: Map<string, number>,
  itemMetaByKey: Map<string, {id: string; name: string; code?: string; uom?: string; unitCost: number}>,
  forecastDays = 14,
): Promise<{
  rows: RunoutForecastRow[];
  overallSeries: Array<{period: string; value: number}>;
}> => {
  const end = todayIso();
  const start = DateTime.now().minus({days: 28}).toISODate() ?? end;

  const [perItem, overallSeries] = await Promise.all([
    getPerItemDailyConsumption(db, {startDate: start, endDate: end}),
    getRecipeConsumptionTimeSeries(db, {startDate: start, endDate: end, granularity: "daily"}),
  ]);

  const rows: RunoutForecastRow[] = [];
  perItem.forEach((entry, key) => {
    const onHand = onHandByItem.get(key) || 0;
    const meta = itemMetaByKey.get(key);
    const reorderLevel = maxReorderByItem.get(key);
    const forecast = forecastInventoryConsumption(
      onHand,
      entry.points,
      forecastDays,
      reorderLevel,
    );
    const avgDaily = forecast.avgDailyConsumption;
    const daysOfCover = avgDaily > 0 ? onHand / avgDaily : null;
    const stockoutMatch = forecast.estimatedStockoutDate?.match(/day\+(\d+)/);
    rows.push({
      itemId: meta?.id || key,
      name: entry.name || meta?.name || "Unknown",
      code: entry.code ?? meta?.code,
      uom: entry.uom ?? meta?.uom,
      onHand,
      avgDailyConsumption: avgDaily,
      daysOfCover,
      estimatedStockoutDays: stockoutMatch ? Number(stockoutMatch[1]) : undefined,
      suggestedReorderQty: forecast.suggestedReorderQty,
      reorderLevel,
      insufficientData: forecast.insufficientData,
      confidenceNote: forecast.confidenceNote,
    });
  });

  rows.sort((a, b) => {
    const aDays = a.daysOfCover ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysOfCover ?? Number.POSITIVE_INFINITY;
    return aDays - bDays;
  });

  return {
    rows: rows.filter((r) => r.avgDailyConsumption > 0 || r.insufficientData).slice(0, 40),
    overallSeries,
  };
};

export type InventoryDashboardPayload = {
  documents: Awaited<ReturnType<typeof getPeriodDocumentBundles>>;
  stock: Awaited<ReturnType<typeof getDashboardStockByLocation>>;
  issuanceVsConsumption: Awaited<ReturnType<typeof getIssuanceVsConsumption>>;
  today: TodayPulse;
  neededToday: Awaited<ReturnType<typeof getNeededForToday>>;
  runout: Awaited<ReturnType<typeof getRunoutForecast>>;
};

export const loadInventoryDashboard = async (
  db: DbClient,
  options: DateRangeFilter = {},
): Promise<InventoryDashboardPayload> => {
  const [documents, stock, issuanceVsConsumption, today] = await Promise.all([
    getPeriodDocumentBundles(db, options),
    getDashboardStockByLocation(db),
    getIssuanceVsConsumption(db, {...options, limit: 50}),
    getTodayPulse(db),
  ]);

  const [neededToday, runout] = await Promise.all([
    getNeededForToday(db, stock.onHandByItem, stock.itemMetaByKey),
    getRunoutForecast(db, stock.onHandByItem, stock.maxReorderByItem, stock.itemMetaByKey),
  ]);

  return {
    documents,
    stock,
    issuanceVsConsumption,
    today,
    neededToday,
    runout,
  };
};
