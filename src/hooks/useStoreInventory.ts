import { useCallback, useEffect, useRef, useState } from "react";
import {StringRecordId} from "surrealdb";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryPurchaseItem } from "@/api/model/inventory_purchase.ts";
import { InventoryPurchaseReturnItem } from "@/api/model/inventory_purchase_return.ts";
import { InventoryIssueItem } from "@/api/model/inventory_issue.ts";
import { InventoryIssueReturnItem } from "@/api/model/inventory_issue_return.ts";
import { InventoryWasteItem } from "@/api/model/inventory_waste.ts";
import {fetchStoreInventoryBreakdown} from "@/utils/inventory.ts";
import {
  fetchBuffetConsumptionLinesForStore,
} from "@/lib/inventory/buffet.service.ts";
import { isInventoryLedgerEnabled } from "@/lib/inventory/settings.ts";
import { fetchLedgerMovements, LedgerMovementRow } from "@/lib/inventory/ledger.service.ts";
import { toLocationRecordId } from "@/lib/inventory/location.service.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

interface InventoryTotals {
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
  adjustments: number;
}

export interface BuffetConsumptionRecord {
  id: string;
  quantity: number;
  created_at: Date;
  type: "buffet_guest" | "buffet_waste" | "buffet_staff_meal";
  item: {name?: string; code?: string; uom?: string};
  sessionNumber?: string;
  counterparty?: string;
}

export interface ProductionMovementRecord {
  id: string;
  quantity: number;
  created_at: Date;
  type: "production_in" | "production_out";
  item: {name?: string; code?: string; uom?: string};
  batchNumber?: string;
  counterparty?: string;
}

export interface StoreTransferRecord {
  id: string;
  quantity: number;
  created_at: Date;
  type: "transfer_in" | "transfer_out";
  item: {name?: string; code?: string; uom?: string};
  counterparty?: string;
}

export interface AdjustmentRecord {
  id: string;
  quantity: number;
  created_at: Date;
  type: "adjustment";
  item: {name?: string; code?: string; uom?: string};
  notes?: string;
  counterparty?: string;
}

/** Shared display shape for movement reference labels (invoice / party / from-to). */
export type MovementWithReference = {
  counterparty?: string;
  invoice_number?: number | string;
  signedQuantity?: number;
  reversal?: boolean;
};

interface InventoryRecords {
  purchases: (InventoryPurchaseItem & MovementWithReference)[];
  returns: (InventoryPurchaseReturnItem & MovementWithReference)[];
  issues: (InventoryIssueItem & MovementWithReference)[];
  issueReturns: (InventoryIssueReturnItem & MovementWithReference)[];
  waste: (InventoryWasteItem & MovementWithReference)[];
  transfersIn: StoreTransferRecord[];
  transfersOut: StoreTransferRecord[];
  productionInputs: ProductionMovementRecord[];
  productionOutputs: ProductionMovementRecord[];
  buffetConsumption: BuffetConsumptionRecord[];
  adjustments: AdjustmentRecord[];
}

const initialTotals: InventoryTotals = {
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
};

const initialRecords: InventoryRecords = {
  purchases: [],
  returns: [],
  issues: [],
  issueReturns: [],
  waste: [],
  transfersIn: [],
  transfersOut: [],
  productionInputs: [],
  productionOutputs: [],
  buffetConsumption: [],
  adjustments: [],
};

type IdentifierValue = string | undefined;

interface InventoryIdentifiers {
  itemId?: string;
  locationId?: string;
}

const toRecordIdString = (value?: string | { toString(): string }) => {
  if (!value) return undefined;
  const stringValue = typeof value === "string" ? value : value.toString();
  return new StringRecordId(stringValue);
};

const normalizeIdentifier = (value?: IdentifierValue) =>
  value ? toRecordIdString(value)!.toString() : undefined;

const toJsDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (value && typeof value === "object" && "toISOString" in value) {
    return new Date((value as {toISOString(): string}).toISOString());
  }
  return new Date();
};

const emptyItemMeta = (): {name?: string; code?: string; uom?: string} => ({});

const refKey = (type: string, id: string) => `${type}:${id}`;

const formatInvoiceRef = (invoice?: unknown, party?: string) => {
  const parts: string[] = [];
  if (invoice !== undefined && invoice !== null && invoice !== "") {
    parts.push(`#${invoice}`);
  }
  if (party) parts.push(party);
  return parts.join(" · ") || undefined;
};

const uniqueIds = (ids: string[]) =>
  [...new Set(ids.map((id) => String(id)).filter(Boolean))];

/**
 * Batch-resolve human-readable labels for ledger reference_id values.
 * Transfer labels use directional keys transfer_in / transfer_out.
 */
const resolveLedgerReferenceLabels = async (
  query: (sql: string, vars?: Record<string, unknown>) => Promise<any>,
  movements: LedgerMovementRow[],
): Promise<Map<string, string>> => {
  const labels = new Map<string, string>();

  const group = (types: string[]) =>
    uniqueIds(
      movements
        .filter((m) => types.includes(m.reference_type) && m.reference_id)
        .map((m) => m.reference_id)
    );

  const purchaseIds = group(["purchase"]);
  const purchaseReturnIds = group(["purchase_return"]);
  const issueIds = group(["issue"]);
  const issueReturnIds = group(["issue_return"]);
  const wasteIds = group(["waste"]);
  const transferIds = group(["transfer_in", "transfer_out"]);
  const productionIds = group(["production_input", "production_output"]);
  const buffetIds = group(["buffet_consumption"]);
  const adjustmentIds = group(["adjustment"]);

  const load = async (
    table: string,
    ids: string[],
    fields: string,
    fetch?: string,
  ) => {
    if (!ids.length) return [] as any[];
    try {
      const fetchClause = fetch ? ` FETCH ${fetch}` : "";
      const [rows] = await query(
        `SELECT id, ${fields} FROM ${table} WHERE id IN $ids${fetchClause}`,
        { ids: ids.map((id) => toRecordId(id)) }
      );
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.warn(`Failed resolving ${table} movement references`, error);
      return [];
    }
  };

  const [
    purchases,
    purchaseReturns,
    issues,
    issueReturns,
    wastes,
    transfers,
    productions,
    buffets,
    adjustments,
  ] = await Promise.all([
    load(Tables.inventory_purchases, purchaseIds, "invoice_number, supplier.name AS supplier_name", "supplier"),
    load(Tables.inventory_purchase_returns, purchaseReturnIds, "invoice_number, purchase.supplier.name AS supplier_name, purchase.invoice_number AS purchase_invoice", "purchase, purchase.supplier"),
    load(Tables.inventory_issues, issueIds, "invoice_number, issued_to.first_name AS issued_first, issued_to.last_name AS issued_last, location.name AS location_name", "issued_to, location"),
    load(Tables.inventory_issue_returns, issueReturnIds, "invoice_number, issue.invoice_number AS issue_invoice", "issue"),
    load(Tables.inventory_wastes, wasteIds, "invoice_number"),
    load(Tables.stock_transfers, transferIds, "from_location.name AS from_name, to_location.name AS to_name", "from_location, to_location"),
    load(Tables.production_batches, productionIds, "batch_number"),
    load(Tables.buffet_sessions, buffetIds, "session_number, invoice_number"),
    load(Tables.inventory_adjustments, adjustmentIds, "invoice_number, notes, reason"),
  ]);

  const idOf = (row: any) => recordIdToString(row?.id) || String(row?.id ?? "");

  for (const row of purchases) {
    const id = idOf(row);
    const label = formatInvoiceRef(row.invoice_number, row.supplier_name || row.supplier?.name);
    if (label) labels.set(refKey("purchase", id), label);
  }
  for (const row of purchaseReturns) {
    const id = idOf(row);
    const party = row.supplier_name || row.purchase?.supplier?.name;
    const label = formatInvoiceRef(
      row.invoice_number,
      party || (row.purchase_invoice != null ? `PO #${row.purchase_invoice}` : undefined)
    );
    if (label) labels.set(refKey("purchase_return", id), label);
  }
  for (const row of issues) {
    const id = idOf(row);
    const name = [row.issued_first ?? row.issued_to?.first_name, row.issued_last ?? row.issued_to?.last_name]
      .filter(Boolean)
      .join(" ");
    const locationName = row.location_name || row.location?.name;
    const party = [name || undefined, locationName || undefined].filter(Boolean).join(" · ");
    const label = formatInvoiceRef(row.invoice_number, party || undefined);
    if (label) labels.set(refKey("issue", id), label);
  }
  for (const row of issueReturns) {
    const id = idOf(row);
    const label = formatInvoiceRef(
      row.invoice_number,
      row.issue_invoice != null ? `Issue #${row.issue_invoice}` : undefined
    );
    if (label) labels.set(refKey("issue_return", id), label);
  }
  for (const row of wastes) {
    const id = idOf(row);
    const label = formatInvoiceRef(row.invoice_number);
    if (label) labels.set(refKey("waste", id), label);
  }
  for (const row of transfers) {
    const id = idOf(row);
    const fromName = row.from_name || row.from_location?.name;
    const toName = row.to_name || row.to_location?.name;
    if (toName) labels.set(refKey("transfer_out", id), `→ ${toName}`);
    if (fromName) labels.set(refKey("transfer_in", id), `← ${fromName}`);
  }
  for (const row of productions) {
    const id = idOf(row);
    if (row.batch_number) {
      labels.set(refKey("production_input", id), String(row.batch_number));
      labels.set(refKey("production_output", id), String(row.batch_number));
    }
  }
  for (const row of buffets) {
    const id = idOf(row);
    const label = formatInvoiceRef(row.session_number ?? row.invoice_number);
    if (label) labels.set(refKey("buffet_consumption", id), label);
  }
  for (const row of adjustments) {
    const id = idOf(row);
    const label = formatInvoiceRef(row.invoice_number, row.notes || row.reason);
    if (label) labels.set(refKey("adjustment", id), label);
  }

  return labels;
};

export const useStoreInventory = (initialItemId?: IdentifierValue, initialLocationId?: IdentifierValue) => {
  const db = useDB();
  const queryRef = useRef(db.query);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const [identifiers, setIdentifiers] = useState<InventoryIdentifiers>({
    itemId: normalizeIdentifier(initialItemId),
    locationId: normalizeIdentifier(initialLocationId)
  });

  const [totals, setTotals] = useState<InventoryTotals>(initialTotals);
  const [records, setRecords] = useState<InventoryRecords>(initialRecords);
  const [netQuantity, setNetQuantity] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const setArgs = useCallback((itemId?: IdentifierValue, locationId?: IdentifierValue) => {
    const nextItemId = normalizeIdentifier(itemId);
    const nextLocationId = normalizeIdentifier(locationId);

    setIdentifiers(prev => {
      if (prev.itemId === nextItemId && prev.locationId === nextLocationId) return prev;
      return { itemId: nextItemId, locationId: nextLocationId };
    });
  }, []);

  useEffect(() => {
    setArgs(initialItemId, initialLocationId);
  }, [initialItemId, initialLocationId, setArgs]);

  useEffect(() => {
    const { itemId, locationId } = identifiers;
    if (!itemId || !locationId) {
      setTotals(initialTotals);
      setRecords(initialRecords);
      setNetQuantity(0);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const location = toLocationRecordId(locationId);
      const params = { item: toRecordIdString(itemId), location };

      try {
        const breakdown = await fetchStoreInventoryBreakdown(db, itemId, locationId);
        const ledgerEnabled = await isInventoryLedgerEnabled(db);

        if (!cancelled) {
          setTotals({
            purchases: breakdown.purchases,
            returns: breakdown.returns,
            issues: breakdown.issues,
            issueReturns: breakdown.issueReturns,
            waste: breakdown.waste,
            transfersIn: breakdown.transfersIn,
            transfersOut: breakdown.transfersOut,
            productionInputs: breakdown.productionInputs,
            productionOutputs: breakdown.productionOutputs,
            buffetConsumption: breakdown.buffetConsumption,
            adjustments: breakdown.adjustments ?? 0,
          });
          setNetQuantity(breakdown.net);
        }

        if (ledgerEnabled) {
          const movements = await fetchLedgerMovements(db, {
            itemId,
            locationId,
            excludeReversals: false,
          });

          if (cancelled) return;

          const labelMap = await resolveLedgerReferenceLabels(queryRef.current, movements);
          if (cancelled) return;

          const purchases: InventoryRecords["purchases"] = [];
          const returns: InventoryRecords["returns"] = [];
          const issues: InventoryRecords["issues"] = [];
          const issueReturns: InventoryRecords["issueReturns"] = [];
          const waste: InventoryRecords["waste"] = [];
          const transfersIn: StoreTransferRecord[] = [];
          const transfersOut: StoreTransferRecord[] = [];
          const productionInputs: ProductionMovementRecord[] = [];
          const productionOutputs: ProductionMovementRecord[] = [];
          const buffetConsumption: BuffetConsumptionRecord[] = [];
          const adjustments: AdjustmentRecord[] = [];

          for (const row of movements) {
            const created_at = row.created_at
              ? toJsDate(row.created_at)
              : toJsDate(row.business_date);
            const signedQty = Number(row.quantity_change) || 0;
            const reversal = !!row.reversal_of;
            const refId = recordIdToString(row.reference_id) || String(row.reference_id ?? "");
            const counterparty = labelMap.get(refKey(row.reference_type, refId));
            const base = {
              id: row.id,
              quantity: Math.abs(signedQty),
              signedQuantity: signedQty,
              reversal,
              created_at,
              item: emptyItemMeta(),
              counterparty,
            };

            switch (row.reference_type) {
              case "purchase":
                purchases.push(base as unknown as InventoryRecords["purchases"][number]);
                break;
              case "purchase_return":
                returns.push(base as unknown as InventoryRecords["returns"][number]);
                break;
              case "issue":
                issues.push(base as unknown as InventoryRecords["issues"][number]);
                break;
              case "issue_return":
                issueReturns.push(base as unknown as InventoryRecords["issueReturns"][number]);
                break;
              case "waste":
                waste.push(base as unknown as InventoryRecords["waste"][number]);
                break;
              case "transfer_in":
                transfersIn.push({ ...base, type: "transfer_in" });
                break;
              case "transfer_out":
                transfersOut.push({ ...base, type: "transfer_out" });
                break;
              case "production_input":
                productionInputs.push({
                  ...base,
                  type: "production_out",
                  batchNumber: counterparty,
                });
                break;
              case "production_output":
                productionOutputs.push({
                  ...base,
                  type: "production_in",
                  batchNumber: counterparty,
                });
                break;
              case "buffet_consumption":
                buffetConsumption.push({
                  ...base,
                  type: "buffet_guest",
                  sessionNumber: counterparty || row.reference_id,
                });
                break;
              case "adjustment":
                adjustments.push({
                  id: row.id,
                  quantity: Number(row.quantity_change) || 0,
                  created_at,
                  type: "adjustment",
                  item: emptyItemMeta(),
                  notes: row.notes,
                  counterparty: counterparty || row.notes,
                });
                break;
              default:
                break;
            }
          }

          setRecords({
            purchases,
            returns,
            issues,
            issueReturns,
            waste,
            transfersIn,
            transfersOut,
            productionInputs,
            productionOutputs,
            buffetConsumption,
            adjustments,
          });
        } else {
          const [
            purchaseRecords,
            returnRecords,
            issueRecords,
            issueReturnRecords,
            wasteRecords,
            transferOutRecords,
            transferInRecords,
            productionInputRecords,
            productionOutputRecords,
            buffetConsumptionRecords,
          ] = await Promise.all([
            queryRef.current(
              `SELECT *, purchase.created_at as created_at, purchase.invoice_number as invoice_number, purchase.supplier.name as supplier_name FROM ${Tables.inventory_purchase_items} WHERE item = $item AND location = $location order by purchase.created_at DESC FETCH item, purchase, purchase.supplier`,
              params
            ),
            queryRef.current(
              `SELECT *, purchase_return.created_at as created_at, purchase_return.invoice_number as invoice_number FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND (location = $location OR purchase_item.location = $location) order by purchase_return.created_at DESC FETCH item, purchase_return`,
              params
            ),
            queryRef.current(
              `SELECT *, issue.created_at as created_at, issue.invoice_number as invoice_number, issue.issued_to.first_name as issued_first, issue.issued_to.last_name as issued_last, issue.location.name as location_name FROM ${Tables.inventory_issue_items} WHERE item = $item AND location = $location order by issue.created_at DESC FETCH item, issue, issue.issued_to, issue.location`,
              params
            ),
            queryRef.current(
              `SELECT *, issue_return.created_at as created_at, issue_return.invoice_number as invoice_number FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND (location = $location OR issued_item.location = $location) order by issue_return.created_at DESC FETCH item, issue_return`,
              params
            ),
            queryRef.current(
              `SELECT *, waste.created_at as created_at, waste.invoice_number as invoice_number FROM ${Tables.inventory_waste_items} WHERE item = $item AND (location = $location OR (purchase_item != none AND purchase_item.location = $location) OR (issue_item != none AND issue_item.location = $location)) order by waste.created_at DESC FETCH item, waste`,
              params
            ),
            queryRef.current(
              `SELECT *, transfer.created_at AS created_at, transfer.to_location.name AS counterparty_location
              FROM ${Tables.stock_transfer_items}
              WHERE item = $item AND transfer IN (
                SELECT VALUE id FROM ${Tables.stock_transfers}
                WHERE from_location = $location
                  AND to_location != NONE
              )
              ORDER BY transfer.created_at DESC
              FETCH item, transfer, transfer.to_location`,
              params
            ),
            queryRef.current(
              `SELECT *, transfer.created_at AS created_at, transfer.from_location.name AS counterparty_location
              FROM ${Tables.stock_transfer_items}
              WHERE item = $item AND transfer IN (
                SELECT VALUE id FROM ${Tables.stock_transfers}
                WHERE to_location = $location
                  AND from_location != NONE
              )
              ORDER BY transfer.created_at DESC
              FETCH item, transfer, transfer.from_location`,
              params
            ),
            queryRef.current(
              `SELECT *, batch.created_at AS created_at, batch.batch_number AS batch_number
              FROM ${Tables.production_batch_inputs}
              WHERE item = $item AND location = $location
              AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
              ORDER BY batch.created_at DESC
              FETCH item, batch`,
              params
            ),
            queryRef.current(
              `SELECT *, batch.created_at AS created_at, batch.batch_number AS batch_number
              FROM ${Tables.production_batch_outputs}
              WHERE item = $item AND location = $location AND disposition = 'inventory'
              AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
              ORDER BY batch.created_at DESC
              FETCH item, batch`,
              params
            ),
            fetchBuffetConsumptionLinesForStore(db, itemId, locationId),
          ]);

          if (!cancelled) {
            const mapTransferRows = (
              rows: any[],
              type: "transfer_in" | "transfer_out"
            ): StoreTransferRecord[] =>
              rows.map((row) => {
                const locationName = row.counterparty_location || row.counterparty;
                return {
                  id: String(row.id),
                  quantity: Number(row.quantity) || 0,
                  created_at: toJsDate(row.created_at),
                  type,
                  item: {
                    name: row.item?.name,
                    code: row.item?.code,
                    uom: row.item?.uom,
                  },
                  counterparty: locationName
                    ? (type === "transfer_out" ? `→ ${locationName}` : `← ${locationName}`)
                    : undefined,
                };
              });

            const withInvoiceRef = (rows: any[], partyFn?: (row: any) => string | undefined) =>
              rows.map((row) => ({
                ...row,
                counterparty: formatInvoiceRef(row.invoice_number, partyFn?.(row)),
              }));

            setRecords({
              purchases: withInvoiceRef((purchaseRecords[0] || []) as any[], (row) => row.supplier_name || row.purchase?.supplier?.name),
              returns: withInvoiceRef((returnRecords[0] || []) as any[]),
              issues: withInvoiceRef((issueRecords[0] || []) as any[], (row) => {
                const name = [row.issued_first ?? row.issue?.issued_to?.first_name, row.issued_last ?? row.issue?.issued_to?.last_name]
                  .filter(Boolean)
                  .join(" ");
                const locationName = row.location_name || row.issue?.location?.name;
                const parts = [name || undefined, locationName || undefined].filter(Boolean);
                return parts.length ? parts.join(" · ") : undefined;
              }),
              issueReturns: withInvoiceRef((issueReturnRecords[0] || []) as any[]),
              waste: withInvoiceRef((wasteRecords[0] || []) as any[]),
              transfersOut: mapTransferRows((transferOutRecords[0] || []) as any[], "transfer_out"),
              transfersIn: mapTransferRows((transferInRecords[0] || []) as any[], "transfer_in"),
              productionInputs: ((productionInputRecords[0] || []) as any[]).map((row) => ({
                id: String(row.id),
                quantity: Number(row.quantity) || 0,
                created_at: toJsDate(row.created_at),
                type: "production_out" as const,
                item: {
                  name: row.item?.name,
                  code: row.item?.code,
                  uom: row.item?.uom,
                },
                batchNumber: row.batch_number,
                counterparty: row.batch_number,
              })),
              productionOutputs: ((productionOutputRecords[0] || []) as any[]).map((row) => ({
                id: String(row.id),
                quantity: Number(row.quantity) || 0,
                created_at: toJsDate(row.created_at),
                type: "production_in" as const,
                item: {
                  name: row.item?.name,
                  code: row.item?.code,
                  uom: row.item?.uom,
                },
                batchNumber: row.batch_number,
                counterparty: row.batch_number,
              })),
              buffetConsumption: buffetConsumptionRecords.map((row) => ({
                id: `${row.id}-${row.source}`,
                quantity: row.quantity,
                created_at: toJsDate(row.createdAt),
                type: row.source as BuffetConsumptionRecord["type"],
                item: {},
                sessionNumber: row.sessionNumber,
                counterparty: row.sessionNumber,
              })),
              adjustments: [],
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Failed to fetch inventory"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [identifiers.itemId, identifiers.locationId]);

  return { identifiers, setArgs, totals, records, netQuantity, loading, error };
};
