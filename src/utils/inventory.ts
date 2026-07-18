import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  fetchProductionInputTotals,
  fetchProductionOutputTotals,
} from "@/lib/inventory/production.service.ts";
import {
  fetchStoreTransferTotals,
  type StockTransferLineInput,
} from "@/lib/inventory/stock_transfer.service.ts";
import {fetchBuffetConsumptionTotals} from "@/lib/inventory/buffet.service.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import {toRecordId} from "@/lib/utils.ts";
import type {InventoryItem} from "@/api/model/inventory_item.ts";
import {isInventoryLedgerEnabled} from "@/lib/inventory/settings.ts";
import {computeBreakdownFromLedger, computeStockFromLedger} from "@/lib/inventory/ledger.service.ts";
import {toLocationRecordId} from "@/lib/inventory/location.service.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type StoreInventoryBreakdown = {
  purchases: number;
  returns: number;
  issues: number;
  issueReturns: number;
  waste: number;
  transfersIn: number;
  transfersOut: number;
  productionInputs: number;
  productionOutputs: number;
  buffetConsumption: number;
  /** Signed net of adjustment quantity_change (ledger); 0 on legacy path. */
  adjustments: number;
  net: number;
};

/**
 * Extracts the total quantity from a SurrealDB query result
 */
export const getTotalFromResult = (result: any): number => {
  if (!result || !Array.isArray(result) || result.length === 0) return 0;
  const first = result[0];
  if (Array.isArray(first) && first.length > 0) {
    return Number(first[0]?.total ?? 0);
  }
  return Number(first?.total ?? 0);
};

export const computeStoreNet = (breakdown: Omit<StoreInventoryBreakdown, "net">): number => {
  return (
    breakdown.purchases
    - breakdown.returns
    - breakdown.issues
    + breakdown.issueReturns
    - breakdown.waste
    - breakdown.transfersOut
    + breakdown.transfersIn
    - breakdown.productionInputs
    + breakdown.productionOutputs
    - breakdown.buffetConsumption
    + (breakdown.adjustments ?? 0)
  );
};

const toItemRecordIdForQuery = (itemId: unknown) => {
  const key = recordIdToString(itemId);
  const normalized = key.includes(":") ? key : `${Tables.inventory_items}:${key}`;
  return toRecordId(normalized);
};

const normalizeRecordParams = (itemId: unknown, locationId: unknown) => ({
  item: toItemRecordIdForQuery(itemId),
  location: toLocationRecordId(recordIdToString(locationId) || String(locationId)),
});

/** Legacy movement-table aggregation (pre-ledger). Kept for backfill reconciliation. */
export const fetchLegacyStoreInventoryBreakdown = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<StoreInventoryBreakdown> => {
  const itemKey = recordIdToString(itemId) || String(itemId);
  const storeKey = recordIdToString(storeId) || String(storeId);
  const params = normalizeRecordParams(itemKey, storeKey);

  const [
    [purchaseRows],
    [returnRows],
    [issueRows],
    [issueReturnRows],
    [wasteRows],
    transferTotals,
    productionInputs,
    productionOutputs,
    buffetConsumption,
  ] = await Promise.all([
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_items}
       WHERE item = $item AND (location = $location OR store = $location)
         AND (purchase.status = 'posted' OR purchase.status = NONE)
       GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_return_items}
       WHERE item = $item AND (location = $location OR purchase_item.location = $location OR purchase_item.store = $location)
         AND (purchase_return.status = 'posted' OR purchase_return.status = NONE)
       GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_items}
       WHERE item = $item AND (location = $location OR store = $location)
         AND (issue.status = 'posted' OR issue.status = NONE)
       GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_return_items}
       WHERE item = $item AND (location = $location OR store = $location OR issued_item.location = $location OR issued_item.store = $location)
         AND (issue_return.status = 'posted' OR issue_return.status = NONE)
       GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_waste_items}
       WHERE item = $item AND purchase_item != null AND (purchase_item.location = $location OR purchase_item.store = $location)
         AND (waste.status = 'posted' OR waste.status = NONE)
       GROUP ALL`,
      params
    ),
    fetchStoreTransferTotals(db, itemKey, storeKey),
    fetchProductionInputTotals(db, itemKey, storeKey),
    fetchProductionOutputTotals(db, itemKey, storeKey),
    fetchBuffetConsumptionTotals(db, itemKey, storeKey),
  ]);

  const breakdown = {
    purchases: getTotalFromResult(purchaseRows),
    returns: getTotalFromResult(returnRows),
    issues: getTotalFromResult(issueRows),
    issueReturns: getTotalFromResult(issueReturnRows),
    waste: getTotalFromResult(wasteRows),
    transfersIn: transferTotals.transfersIn,
    transfersOut: transferTotals.transfersOut,
    productionInputs,
    productionOutputs,
    buffetConsumption,
    adjustments: 0,
  };

  return {
    ...breakdown,
    net: computeStoreNet(breakdown),
  };
};

/**
 * Fetches inventory breakdown. When inventory_ledger_enabled is on, reads from
 * the unified ledger; otherwise uses legacy movement-table aggregation.
 */
export const fetchStoreInventoryBreakdown = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<StoreInventoryBreakdown> => {
  const ledgerEnabled = await isInventoryLedgerEnabled(db);
  if (ledgerEnabled) {
    return computeBreakdownFromLedger(db, itemId, storeId);
  }
  return fetchLegacyStoreInventoryBreakdown(db, itemId, storeId);
};

/**
 * Fetches the net available quantity of an item in a specific store.
 */
export const fetchNetQuantity = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const ledgerEnabled = await isInventoryLedgerEnabled(db);
  if (ledgerEnabled) {
    return computeStockFromLedger(db, itemId, storeId);
  }
  const breakdown = await fetchLegacyStoreInventoryBreakdown(db, itemId, storeId);
  return breakdown.net;
};

export const validateStoreTransferAvailability = async (
  db: DatabaseClient,
  fromStoreId: string,
  items: StockTransferLineInput[],
  excludeTransferId?: string
): Promise<{valid: boolean; itemId?: string; available?: number; requested?: number}> => {
  for (const line of items) {
    const available = await fetchNetQuantity(db, line.itemId, fromStoreId);
    let adjustedAvailable = available;

    if (excludeTransferId) {
      const {transfersOut} = await fetchStoreTransferTotals(
        db,
        line.itemId,
        fromStoreId,
        excludeTransferId
      );
      adjustedAvailable += transfersOut;
    }

    if (Number(line.quantity) > adjustedAvailable) {
      return {
        valid: false,
        itemId: line.itemId,
        available: adjustedAvailable,
        requested: Number(line.quantity),
      };
    }
  }

  return {valid: true};
};

export const validateProductionAvailability = async (
  db: DatabaseClient,
  storeId: string,
  items: Array<{itemId: string; quantity: number}>
): Promise<{valid: boolean; itemId?: string; available?: number; requested?: number}> => {
  for (const line of items) {
    const available = await fetchNetQuantity(db, line.itemId, storeId);
    if (Number(line.quantity) > available) {
      return {
        valid: false,
        itemId: line.itemId,
        available,
        requested: Number(line.quantity),
      };
    }
  }
  return {valid: true};
};

const normalizeRecordKey = (id: string): string => {
  const str = recordToString(id);
  const colonIdx = str.lastIndexOf(":");
  return colonIdx >= 0 ? str.slice(colonIdx + 1) : str;
};

export const getReorderLevelForStore = (
  item: Pick<InventoryItem, "reorder_levels"> | undefined,
  storeId: string,
): number => {
  const levels = item?.reorder_levels;
  if (!levels || typeof levels !== "object") {
    return 0;
  }

  const targetKey = normalizeRecordKey(storeId);
  for (const [key, value] of Object.entries(levels)) {
    if (normalizeRecordKey(key) === targetKey) {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : 0;
    }
  }

  return 0;
};

export const isBelowReorderLevel = (
  item: Pick<InventoryItem, "reorder_levels"> | undefined,
  storeId: string,
  quantity: number,
): boolean => {
  const reorderLevel = getReorderLevelForStore(item, storeId);
  return reorderLevel > 0 && quantity < reorderLevel;
};
