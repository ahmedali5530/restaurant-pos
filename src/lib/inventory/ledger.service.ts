import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  InventoryLedgerInput,
  InventoryLedgerReferenceType,
} from "@/api/model/inventory_ledger.ts";
import { toLocationRecordId } from "@/lib/inventory/location.service.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

type DatabaseClient = ReturnType<typeof useDB>;

/** Mirrors StoreInventoryBreakdown without importing utils (avoids circular deps). */
export type LedgerStoreBreakdown = {
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
  /** Signed net of adjustment quantity_change (can be + or -). */
  adjustments: number;
  net: number;
};

/** Maps ledger reference_type → breakdown key (absolute qty buckets). */
const REFERENCE_TO_BREAKDOWN_KEY: Record<
  string,
  keyof Omit<LedgerStoreBreakdown, "net" | "adjustments">
> = {
  purchase: "purchases",
  purchase_return: "returns",
  issue: "issues",
  issue_return: "issueReturns",
  waste: "waste",
  transfer_out: "transfersOut",
  transfer_in: "transfersIn",
  production_input: "productionInputs",
  production_output: "productionOutputs",
  buffet_consumption: "buffetConsumption",
};

const emptyBreakdown = (): Omit<LedgerStoreBreakdown, "net"> => ({
  purchases: 0,
  returns: 0,
  issues: 0,
  issueReturns: 0,
  waste: 0,
  transfersIn: 0,
  transfersOut: 0,
  productionInputs: 0,
  productionOutputs: 0,
  buffetConsumption: 0,
  adjustments: 0,
});

const getTotalFromResult = (result: any): number => {
  if (!result || !Array.isArray(result) || result.length === 0) return 0;
  const first = result[0];
  if (Array.isArray(first) && first.length > 0) {
    return Number(first[0]?.total ?? 0);
  }
  return Number(first?.total ?? 0);
};

const toItemRecordId = (itemId: unknown) => {
  const key = recordIdToString(itemId);
  const normalized = key.includes(":") ? key : `${Tables.inventory_items}:${key}`;
  return toRecordId(normalized);
};

const normalizeLocationParams = (itemId: unknown, locationId: unknown) => ({
  item: toItemRecordId(itemId),
  location: toLocationRecordId(recordIdToString(locationId) || String(locationId)),
});

export const buildLedgerKey = (
  referenceType: string,
  referenceItemId: string
): string => `${referenceType}:${recordIdToString(referenceItemId) || referenceItemId}`;

/**
 * Sum all ledger quantity_change for an item at a location.
 */
export const computeStockFromLedger = async (
  db: DatabaseClient,
  itemId: string,
  locationId: string
): Promise<number> => {
  const params = normalizeLocationParams(itemId, locationId);
  const [rows] = await db.query(
    `SELECT Math::sum(quantity_change) AS total FROM ${Tables.inventory_ledger}
     WHERE inventory_item = $item AND inventory_location = $location GROUP ALL`,
    params
  );
  return getTotalFromResult(rows);
};

/**
 * Build the same StoreInventoryBreakdown shape from ledger rows by reference_type.
 * Absolute quantities (not signed) for classic buckets; adjustments keep signed sum.
 */
export const computeBreakdownFromLedger = async (
  db: DatabaseClient,
  itemId: string,
  locationId: string
): Promise<LedgerStoreBreakdown> => {
  const params = normalizeLocationParams(itemId, locationId);
  const [[absRows], [adjRows]] = await Promise.all([
    db.query(
      `SELECT reference_type, Math::sum(Math::abs(quantity_change)) AS total
       FROM ${Tables.inventory_ledger}
       WHERE inventory_item = $item AND inventory_location = $location
         AND reference_type != 'adjustment'
       GROUP BY reference_type`,
      params
    ),
    db.query(
      `SELECT Math::sum(quantity_change) AS total FROM ${Tables.inventory_ledger}
       WHERE inventory_item = $item AND inventory_location = $location
         AND reference_type = 'adjustment'
       GROUP ALL`,
      params
    ),
  ]);

  const breakdown = emptyBreakdown();
  const list = Array.isArray(absRows) ? absRows : [];
  for (const row of list as Array<{ reference_type?: string; total?: number }>) {
    const key = REFERENCE_TO_BREAKDOWN_KEY[String(row.reference_type ?? "")];
    if (key) {
      breakdown[key] = Number(row.total ?? 0);
    }
  }
  breakdown.adjustments = getTotalFromResult(adjRows);

  // True ledger net (includes adjustments + reversals); bucket math is for display only.
  const net = await computeStockFromLedger(db, itemId, locationId);

  return {
    ...breakdown,
    net,
  };
};

export type LedgerNetRow = {
  itemId: string;
  locationId: string;
  net: number;
};

/**
 * Bulk on-hand nets grouped by item + location (for dashboard / current inventory).
 */
export const fetchLedgerNetsByStore = async (
  db: DatabaseClient
): Promise<LedgerNetRow[]> => {
  const [rows] = await db.query(
    `SELECT inventory_item, inventory_location, Math::sum(quantity_change) AS net
     FROM ${Tables.inventory_ledger}
     GROUP BY inventory_item, inventory_location`
  );
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row: any) => ({
    itemId: recordIdToString(row.inventory_item) || String(row.inventory_item),
    locationId: recordIdToString(row.inventory_location) || String(row.inventory_location),
    net: Number(row.net ?? 0),
  }));
};

export type LedgerMovementRow = {
  id: string;
  business_date: string;
  created_at?: unknown;
  inventory_item: string;
  inventory_location: string;
  quantity_change: number;
  unit_cost?: number;
  total_cost?: number;
  reference_type: string;
  reference_id: string;
  reference_item?: string;
  notes?: string;
  reversal_of?: string;
};

export type FetchLedgerMovementsOpts = {
  /** inventory_location id */
  locationId?: string;
  /** @deprecated alias for locationId */
  storeId?: string;
  itemId?: string;
  from?: string;
  to?: string;
  referenceTypes?: string[];
  /** When true (default), skip rows that reverse another ledger entry. */
  excludeReversals?: boolean;
};

/**
 * Dated ledger movements for detailed report + AI pipelines.
 */
export const fetchLedgerMovements = async (
  db: DatabaseClient,
  opts: FetchLedgerMovementsOpts = {}
): Promise<LedgerMovementRow[]> => {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  const locId = opts.locationId || opts.storeId;
  if (locId) {
    conditions.push("inventory_location = $location");
    params.location = toLocationRecordId(recordIdToString(locId) || locId);
  }
  if (opts.itemId) {
    conditions.push("inventory_item = $item");
    params.item = toItemRecordId(opts.itemId);
  }
  if (opts.from) {
    conditions.push("business_date >= $from");
    params.from = opts.from;
  }
  if (opts.to) {
    conditions.push("business_date <= $to");
    params.to = opts.to;
  }
  if (opts.referenceTypes?.length) {
    conditions.push("reference_type IN $referenceTypes");
    params.referenceTypes = opts.referenceTypes;
  }
  if (opts.excludeReversals !== false) {
    conditions.push("reversal_of = NONE");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT id, business_date, created_at, inventory_item, inventory_location,
            quantity_change, unit_cost, total_cost, reference_type, reference_id,
            reference_item, notes, reversal_of
     FROM ${Tables.inventory_ledger}
     ${where}
     ORDER BY business_date ASC, created_at ASC`,
    params
  );

  const list = Array.isArray(rows) ? rows : [];
  const filtered = opts.excludeReversals === false
    ? list
    : list.filter((row: any) => {
      const notes = row.notes != null ? String(row.notes) : "";
      return !notes.startsWith("reversal:");
    });

  return filtered.map((row: any) => ({
    id: recordIdToString(row.id) || String(row.id),
    business_date: String(row.business_date ?? ""),
    created_at: row.created_at,
    inventory_item: recordIdToString(row.inventory_item) || String(row.inventory_item),
    inventory_location: recordIdToString(row.inventory_location) || String(row.inventory_location),
    quantity_change: Number(row.quantity_change ?? 0),
    unit_cost: row.unit_cost != null ? Number(row.unit_cost) : undefined,
    total_cost: row.total_cost != null ? Number(row.total_cost) : undefined,
    reference_type: String(row.reference_type ?? ""),
    reference_id: String(row.reference_id ?? ""),
    reference_item: row.reference_item != null ? String(row.reference_item) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    reversal_of: row.reversal_of != null
      ? (recordIdToString(row.reversal_of) || String(row.reversal_of))
      : undefined,
  }));
};

export const writeLedgerEntries = async (
  db: DatabaseClient,
  entries: InventoryLedgerInput[]
): Promise<void> => {
  for (const entry of entries) {
    const payload: Record<string, unknown> = {
      created_at: nowSurrealDateTime(),
      business_date: entry.business_date,
      inventory_item: toRecordId(entry.inventory_item),
      inventory_location: toLocationRecordId(
        recordIdToString(entry.inventory_location) || entry.inventory_location
      ),
      quantity_change: entry.quantity_change,
      reference_type: entry.reference_type,
      reference_id: recordIdToString(entry.reference_id) || entry.reference_id,
      ledger_key: entry.ledger_key,
    };
    if (entry.created_by) payload.created_by = toRecordId(entry.created_by);
    if (entry.unit_cost != null) payload.unit_cost = entry.unit_cost;
    if (entry.total_cost != null) payload.total_cost = entry.total_cost;
    if (entry.reference_item) {
      payload.reference_item =
        recordIdToString(entry.reference_item) || entry.reference_item;
    }
    if (entry.reversal_of) payload.reversal_of = toRecordId(entry.reversal_of);
    if (entry.notes) payload.notes = entry.notes;

    await db.create(Tables.inventory_ledger, payload);
  }
};

export const ledgerEntryExists = async (
  db: DatabaseClient,
  ledgerKey: string
): Promise<boolean> => {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.inventory_ledger} WHERE ledger_key = $key LIMIT 1`,
    { key: ledgerKey }
  );
  return Array.isArray(rows) && rows.length > 0;
};

export type { InventoryLedgerReferenceType };
