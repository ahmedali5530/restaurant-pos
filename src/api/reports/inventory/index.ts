import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {fetchStoreInventoryBreakdown} from "@/utils/inventory.ts";
import {safeNumber} from "@/lib/utils.ts";

export type InventoryMovementType =
  | "purchase"
  | "purchase_return"
  | "issue"
  | "issue_return"
  | "waste";

const MOVEMENT_TABLES: Record<InventoryMovementType, {table: string; itemsTable: string}> = {
  purchase: {table: Tables.inventory_purchases, itemsTable: Tables.inventory_purchase_items},
  purchase_return: {table: Tables.inventory_purchase_returns, itemsTable: Tables.inventory_purchase_return_items},
  issue: {table: Tables.inventory_issues, itemsTable: Tables.inventory_issue_items},
  issue_return: {table: Tables.inventory_issue_returns, itemsTable: Tables.inventory_issue_return_items},
  waste: {table: Tables.inventory_wastes, itemsTable: Tables.inventory_waste_items},
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
    reorder_level?: number;
    category?: {name?: string};
    unit?: string;
  }>(await db.query(itemsQuery));

  const stores = unwrapQueryResult<{id: unknown; name?: string}>(
    await db.query(`SELECT id, name FROM ${Tables.inventory_stores}`),
  );

  const balances: Array<{
    itemId: string;
    itemName: string;
    storeName: string;
    quantity: number;
    reorderLevel?: number;
    belowReorder: boolean;
  }> = [];

  for (const item of items.slice(0, 30)) {
    const itemId = recordToString(item.id);
    for (const store of stores.slice(0, 10)) {
      const storeId = recordToString(store.id);
      try {
        const breakdown = await fetchStoreInventoryBreakdown(
          db as ReturnType<typeof useDB>,
          itemId,
          storeId,
        );
        const reorderLevel = safeNumber(item.reorder_level);
        balances.push({
          itemId,
          itemName: item.name ?? "Unknown",
          storeName: store.name ?? "Unknown",
          quantity: breakdown.net,
          reorderLevel: reorderLevel || undefined,
          belowReorder: reorderLevel > 0 && breakdown.net < reorderLevel,
        });
      } catch {
        // skip failed breakdown
      }
    }
  }

  return {
    items: balances.sort((a, b) => a.quantity - b.quantity),
    belowReorderCount: balances.filter(b => b.belowReorder).length,
  };
};

export const getInventoryMovements = async (
  db: DbClient,
  options: DateRangeFilter & {type: InventoryMovementType; limit?: number},
) => {
  const {type, limit = 50, ...dateRange} = options;
  const tables = MOVEMENT_TABLES[type];
  const {conditions, params} = buildCreatedAtDateConditions(dateRange);

  const query = `
    SELECT * FROM ${tables.table}
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ${limit}
    FETCH items, items.item
  `;

  const movements = unwrapQueryResult<{
    id: unknown;
    created_at?: unknown;
    items?: Array<{item?: {name?: string}; quantity?: number}>;
  }>(await db.query(query, params));

  const byItem = new Map<string, {name: string; quantity: number}>();
  movements.forEach(movement => {
    (movement.items || []).forEach(line => {
      const name = line.item?.name ?? "Unknown";
      const existing = byItem.get(name) || {name, quantity: 0};
      existing.quantity += safeNumber(line.quantity);
      byItem.set(name, existing);
    });
  });

  return {
    type,
    movementCount: movements.length,
    byItem: Array.from(byItem.values()).sort((a, b) => b.quantity - a.quantity).slice(0, limit),
  };
};

export const getConsumptionSummary = async (db: DbClient, options: DateRangeFilter & {limit?: number}) => {
  return getInventoryMovements(db, {...options, type: "issue", limit: options.limit ?? 50});
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
    SELECT id, name, code, reorder_level FROM ${Tables.inventory_items}
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const items = unwrapQueryResult<{
    id: unknown;
    name?: string;
    code?: string;
    reorder_level?: number;
  }>(await db.query(query));

  const search = options.search?.toLowerCase();
  return items
    .map(item => ({
      id: recordToString(item.id),
      name: item.name ?? "Unknown",
      code: item.code,
      reorderLevel: safeNumber(item.reorder_level) || undefined,
    }))
    .filter(item => !search || item.name.toLowerCase().includes(search));
};

export const getSaleVsConsumption = async (db: DbClient, options: DateRangeFilter) => {
  const [issues, purchases] = await Promise.all([
    getInventoryMovements(db, {...options, type: "issue", limit: 30}),
    getInventoryMovements(db, {...options, type: "purchase", limit: 30}),
  ]);

  const issueMap = new Map(issues.byItem.map(i => [i.name, i.quantity]));
  const purchaseMap = new Map(purchases.byItem.map(i => [i.name, i.quantity]));
  const allNames = new Set([...issueMap.keys(), ...purchaseMap.keys()]);

  return {
    items: Array.from(allNames).map(name => ({
      name,
      issued: issueMap.get(name) ?? 0,
      purchased: purchaseMap.get(name) ?? 0,
      variance: (purchaseMap.get(name) ?? 0) - (issueMap.get(name) ?? 0),
    })),
  };
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
