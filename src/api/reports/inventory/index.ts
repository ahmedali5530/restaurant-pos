import {Tables} from "@/api/db/tables.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import {
  buildCreatedAtDateConditions,
  buildRecordInsideCondition,
  buildStringInsideCondition,
  unwrapQueryResult,
} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";
import {safeNumber} from "@/lib/utils.ts";
import {
  fetchLedgerMovements,
  fetchLedgerNetsByStore,
} from "@/lib/inventory/ledger.service.ts";
import {
  getIssuanceSummary,
  getRecipeConsumptionSummary,
  getRecipeConsumptionTimeSeries,
  getSaleVsConsumptionReport,
} from "@/api/reports/inventory/consumption.ts";

export {
  getIssuanceSummary,
  getRecipeConsumptionSummary,
  getRecipeConsumptionTimeSeries,
  getSaleVsConsumptionReport,
} from "@/api/reports/inventory/consumption.ts";
export type {
  RecipeConsumptionItem,
  RecipeConsumptionOptions,
  RecipeConsumptionSummary,
} from "@/api/reports/inventory/consumption.ts";
export {
  loadInventoryDashboard,
  getIssuanceVsConsumption,
  getDashboardStockByLocation,
  getTodayPulse,
  getNeededForToday,
  getRunoutForecast,
  getPeriodDocumentBundles,
} from "@/api/reports/inventory/dashboard.ts";
export type {
  InventoryDashboardPayload,
  IssuanceVsConsumptionRow,
  LocationStockGroup,
  NeededTodayRow,
  RunoutForecastRow,
  TodayPulse,
  PeriodMovementTotals,
} from "@/api/reports/inventory/dashboard.ts";

export type InventoryMovementType =
  | "purchase"
  | "purchase_return"
  | "issue"
  | "issue_return"
  | "waste"
  | "adjustment"
  | "transfer_in"
  | "transfer_out"
  | "production_input"
  | "production_output"
  | "buffet_consumption";

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

export const getCurrentInventory = async (
  db: DbClient,
  options: {itemIds?: string[]; limit?: number} = {},
) => {
  const limit = options.limit ?? 100;
  let itemsQuery = `SELECT * FROM ${Tables.inventory_items}`;
  if (options.itemIds?.length) {
    itemsQuery += ` WHERE id IN [${options.itemIds.map(id => `$item${id}`).join(", ")}]`;
  }
  itemsQuery += ` LIMIT ${limit}`;
  itemsQuery += ` FETCH category`;

  const items = unwrapQueryResult<{
    id: unknown;
    name?: string;
    code?: string;
    reorder_levels?: Record<string, number>;
    category?: {name?: string};
    unit?: string;
  }>(await db.query(itemsQuery));

  const locations = unwrapQueryResult<{id: unknown; name?: string}>(
    await db.query(`SELECT id, name FROM ${Tables.inventory_locations}`),
  );

  const itemByKey = new Map<string, (typeof items)[0]>();
  const allowedItemKeys = new Set<string>();
  items.forEach((item) => {
    const full = recordToString(item.id);
    itemByKey.set(full, item);
    itemByKey.set(normalizeKey(full), item);
    allowedItemKeys.add(normalizeKey(full));
    allowedItemKeys.add(full);
  });

  const locationByKey = new Map<string, (typeof locations)[0]>();
  locations.forEach((location) => {
    const full = recordToString(location.id);
    locationByKey.set(full, location);
    locationByKey.set(normalizeKey(full), location);
  });

  const ledgerNets = await fetchLedgerNetsByStore(db as any);

  const balances: Array<{
    itemId: string;
    itemName: string;
    locationName: string;
    quantity: number;
    reorderLevel?: number;
    belowReorder: boolean;
  }> = [];

  for (const row of ledgerNets) {
    const itemKey = normalizeKey(row.itemId);
    if (options.itemIds?.length && !allowedItemKeys.has(itemKey) && !allowedItemKeys.has(row.itemId)) {
      continue;
    }
    const item = itemByKey.get(row.itemId) || itemByKey.get(itemKey);
    if (!item) continue;
    const location = locationByKey.get(row.locationId) || locationByKey.get(normalizeKey(row.locationId));
    if (!location) continue;

    const itemId = recordToString(item.id);
    const locationId = recordToString(location.id);
    const reorderLevel = getReorderLevelForStore(item, locationId);
    balances.push({
      itemId,
      itemName: item.name ?? "Unknown",
      locationName: location.name ?? "Unknown",
      quantity: row.net,
      reorderLevel: reorderLevel || undefined,
      belowReorder: reorderLevel > 0 && row.net < reorderLevel,
    });
  }

  // Include zero-stock items that have reorder levels when few ledger rows
  if (balances.length < limit) {
    for (const item of items) {
      const itemId = recordToString(item.id);
      for (const location of locations) {
        const locationId = recordToString(location.id);
        const already = balances.some(
          (b) => normalizeKey(b.itemId) === normalizeKey(itemId)
            && b.locationName === (location.name ?? "Unknown"),
        );
        if (already) continue;
        const reorderLevel = getReorderLevelForStore(item, locationId);
        if (reorderLevel <= 0) continue;
        balances.push({
          itemId,
          itemName: item.name ?? "Unknown",
          locationName: location.name ?? "Unknown",
          quantity: 0,
          reorderLevel,
          belowReorder: true,
        });
      }
    }
  }

  return {
    items: balances.sort((a, b) => a.quantity - b.quantity).slice(0, limit),
    belowReorderCount: balances.filter(b => b.belowReorder).length,
  };
};

export const getInventoryMovements = async (
  db: DbClient,
  options: DateRangeFilter & {type: InventoryMovementType; limit?: number},
) => {
  const {type, limit = 50, ...dateRange} = options;

  const movements = await fetchLedgerMovements(db as any, {
    from: dateRange.startDate,
    to: dateRange.endDate,
    referenceTypes: [type],
    excludeReversals: true,
  });

  // Resolve item names
  const itemIds = [...new Set(movements.map((m) => m.inventory_item))];
  const itemNameByKey = new Map<string, string>();
  if (itemIds.length) {
    const items = unwrapQueryResult<{id: unknown; name?: string}>(
      await db.query(
        `SELECT id, name FROM ${Tables.inventory_items}`,
      ),
    );
    items.forEach((item) => {
      const full = recordToString(item.id);
      itemNameByKey.set(full, item.name ?? "Unknown");
      itemNameByKey.set(normalizeKey(full), item.name ?? "Unknown");
    });
  }

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
    type,
    movementCount: movements.length,
    byItem: Array.from(byItem.values()).sort((a, b) => b.quantity - a.quantity).slice(0, limit),
  };
};

/**
 * Theoretical consumption from sold (Paid) dishes × recipes.
 * For ledger issuance use getIssuanceSummary instead.
 */
export const getConsumptionSummary = async (
  db: DbClient,
  options: DateRangeFilter & {limit?: number; dishIds?: string[]; itemIds?: string[]} = {},
) => {
  const summary = await getRecipeConsumptionSummary(db, options);
  return {
    source: "recipe_x_sold" as const,
    orderCount: summary.orderCount,
    totals: summary.totals,
    byItem: summary.byItem.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      costAverage: item.costAverage,
      costCurrent: item.costCurrent,
      saleAllocated: item.saleAllocated,
    })),
  };
};

export const getWasteSummary = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  return getInventoryMovements(db, {...options, type: "waste", limit: options.limit ?? 50});
};

export const listInventoryItems = async (
  db: DbClient,
  options: {search?: string; limit?: number} = {},
) => {
  const limit = options.limit ?? 50;
  const query = `
    SELECT id, name, code, reorder_levels FROM ${Tables.inventory_items}
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const items = unwrapQueryResult<{
    id: unknown;
    name?: string;
    code?: string;
    reorder_levels?: Record<string, number>;
  }>(await db.query(query));

  const search = options.search?.toLowerCase();
  return items
    .map(item => ({
      id: recordToString(item.id),
      name: item.name ?? "Unknown",
      code: item.code,
      reorderLevels: item.reorder_levels && typeof item.reorder_levels === "object"
        ? Object.fromEntries(
          Object.entries(item.reorder_levels)
            .map(([storeId, level]) => [storeId, safeNumber(level)])
            .filter(([, level]) => level as number > 0),
        )
        : undefined,
    }))
    .filter(item => !search || item.name.toLowerCase().includes(search));
};

/** Same metrics as the Sale vs Consumption report UI. */
export const getSaleVsConsumption = async (db: DbClient, options: DateRangeFilter) => {
  return getSaleVsConsumptionReport(db, {...options, limit: 30});
};

export const getKitchenReconciliationSummary = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  const {limit = 20, ...dateRange} = options;
  const {conditions, params} = buildCreatedAtDateConditions(dateRange, "reconciled_at");

  const query = `
    SELECT * FROM ${Tables.kitchen_reconciliations}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY reconciled_at DESC
    LIMIT ${limit}
  `;

  const rows = unwrapQueryResult<{id: unknown; reconciled_at?: unknown; status?: string}>(
    await db.query(query, params),
  );

  return {
    count: rows.length,
    reconciliations: rows.map(row => ({
      id: recordToString(row.id),
      reconciledAt: row.reconciled_at,
      status: row.status,
    })),
  };
};

export const getPurchaseOrders = async (
  db: DbClient,
  options: DateRangeFilter & {
    status?: string;
    statuses?: string[];
    supplierIds?: string[];
    limit?: number;
  } = {},
) => {
  const limit = options.limit ?? 50;
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const queryParams: Record<string, any> = {...params};

  const statuses = [
    ...(options.statuses ?? []),
    ...(options.status ? [options.status] : []),
  ].filter(Boolean);

  const statusFilter = buildStringInsideCondition("status", statuses, "statuses");
  if (statusFilter.condition) {
    conditions.push(statusFilter.condition);
    Object.assign(queryParams, statusFilter.params);
  }

  const supplierFilter = buildRecordInsideCondition(
    "supplier",
    options.supplierIds ?? [],
    "supplierIds",
  );
  if (supplierFilter.condition) {
    conditions.push(supplierFilter.condition);
    Object.assign(queryParams, supplierFilter.params);
  }

  const query = `
    SELECT * FROM ${Tables.inventory_purchase_orders}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ${limit}
    FETCH supplier, items, items.item
  `;

  const rows = unwrapQueryResult<{
    id: unknown;
    po_number?: number;
    status?: string;
    created_at?: unknown;
    supplier?: {name?: string};
    items?: Array<{
      quantity?: number;
      price?: number | null;
      item?: {name?: string; code?: string; price?: number | null; average_price?: number | null};
    }>;
  }>(await db.query(query, queryParams));

  const orders = rows.map(row => {
    const lines = (row.items ?? []).map(line => {
      const qty = safeNumber(line.quantity);
      const unit =
        line.price != null && Number.isFinite(Number(line.price))
          ? safeNumber(line.price)
          : (line.item?.average_price != null && Number.isFinite(Number(line.item.average_price))
            ? safeNumber(line.item.average_price)
            : safeNumber(line.item?.price));
      return {
        itemName: line.item?.name ?? "Unknown",
        itemCode: line.item?.code,
        quantity: qty,
        price: unit,
        amount: qty * unit,
      };
    });
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

    return {
      id: recordToString(row.id),
      poNumber: row.po_number,
      status: row.status,
      createdAt: row.created_at,
      supplierName: row.supplier?.name ?? null,
      lineCount: lines.length,
      totalQuantity,
      totalAmount,
      lines,
    };
  });

  return {
    count: orders.length,
    totalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
    orders,
  };
};
