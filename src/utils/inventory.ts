import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  fetchStoreTransferTotals,
  type StockTransferLineInput,
} from "@/lib/inventory/stock_transfer.service.ts";
import {toRecordId} from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type StoreInventoryBreakdown = {
  purchases: number;
  returns: number;
  issues: number;
  issueReturns: number;
  waste: number;
  transfersIn: number;
  transfersOut: number;
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
  );
};

const normalizeRecordParams = (itemId: string, storeId: string) => ({
  item: toRecordId(itemId),
  store: toRecordId(storeId),
});

export const fetchStoreInventoryBreakdown = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<StoreInventoryBreakdown> => {
  const params = normalizeRecordParams(itemId, storeId);

  const [
    [purchaseRows],
    [returnRows],
    [issueRows],
    [issueReturnRows],
    [wasteRows],
    transferTotals,
  ] = await Promise.all([
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_items} WHERE item = $item AND store = $store GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND purchase_item.store = $store GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_items} WHERE item = $item AND store = $store GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND store = $store GROUP ALL`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_waste_items} WHERE item = $item AND purchase_item != null AND purchase_item.store = $store GROUP ALL`,
      params
    ),
    fetchStoreTransferTotals(db, itemId, storeId),
  ]);

  const breakdown = {
    purchases: getTotalFromResult(purchaseRows),
    returns: getTotalFromResult(returnRows),
    issues: getTotalFromResult(issueRows),
    issueReturns: getTotalFromResult(issueReturnRows),
    waste: getTotalFromResult(wasteRows),
    transfersIn: transferTotals.transfersIn,
    transfersOut: transferTotals.transfersOut,
  };

  return {
    ...breakdown,
    net: computeStoreNet(breakdown),
  };
};

/**
 * Fetches the net available quantity of an item in a specific store.
 * Formula: purchases - returns - issues + issueReturns - waste - transfersOut + transfersIn
 */
export const fetchNetQuantity = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const breakdown = await fetchStoreInventoryBreakdown(db, itemId, storeId);
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
