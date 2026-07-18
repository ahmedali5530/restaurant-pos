import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { fetchInventorySettings } from "@/lib/inventory/settings.ts";
import { toStoreRecordId } from "@/lib/inventory/stock_transfer.service.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

type DatabaseClient = ReturnType<typeof useDB>;

/**
 * Weighted average unit cost from purchase/adjustment ledger rows (AVCO).
 * FIFO/FEFO are reserved for when batch tracking is enabled (Phase 9).
 */
export const resolveAverageUnitCost = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const [rows] = await db.query(
    `SELECT math::sum(total_cost) AS total_cost,
            math::sum(math::abs(quantity_change)) AS total_qty
     FROM ${Tables.inventory_ledger}
     WHERE inventory_item = $item
       AND inventory_location = $store
       AND quantity_change > 0
       AND (reference_type = 'purchase' OR reference_type = 'adjustment' OR reference_type = 'production_output' OR reference_type = 'transfer_in' OR reference_type = 'issue_return')
     GROUP ALL`,
    {
      item: toRecordId(
        recordIdToString(itemId).includes(":")
          ? itemId
          : `${Tables.inventory_items}:${itemId}`
      ),
      store: toStoreRecordId(storeId),
    }
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  const totalCost = Number(row?.total_cost ?? 0);
  const totalQty = Number(row?.total_qty ?? 0);
  if (!totalQty || !Number.isFinite(totalCost)) return 0;
  return totalCost / totalQty;
};

/**
 * Resolve unit cost for a posting line using inventory settings.costing.
 * Falls back to provided line cost, then AVCO.
 */
export const resolvePostingUnitCost = async (
  db: DatabaseClient,
  params: {
    itemId: string;
    storeId: string;
    lineUnitCost?: number | null;
  }
): Promise<number> => {
  const line = Number(params.lineUnitCost);
  if (Number.isFinite(line) && line > 0) {
    return line;
  }

  const settings = await fetchInventorySettings(db);
  // fifo/fefo require batch layers — fall back to average until batch posting is enabled
  if (settings.costing === "fifo" || settings.costing === "fefo") {
    if (!settings.enableBatchTracking) {
      return resolveAverageUnitCost(db, params.itemId, params.storeId);
    }
  }

  return resolveAverageUnitCost(db, params.itemId, params.storeId);
};
