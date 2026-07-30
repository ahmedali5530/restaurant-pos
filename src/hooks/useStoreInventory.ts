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
import { fetchLedgerMovements } from "@/lib/inventory/ledger.service.ts";
import { toLocationRecordId } from "@/lib/inventory/location.service.ts";

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
}

export interface ProductionMovementRecord {
  id: string;
  quantity: number;
  created_at: Date;
  type: "production_in" | "production_out";
  item: {name?: string; code?: string; uom?: string};
  batchNumber?: string;
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
}

interface InventoryRecords {
  purchases: InventoryPurchaseItem[];
  returns: InventoryPurchaseReturnItem[];
  issues: InventoryIssueItem[];
  issueReturns: InventoryIssueReturnItem[];
  waste: InventoryWasteItem[];
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

const toRecordId = (value?: string | { toString(): string }) => {
  if (!value) return undefined;
  const stringValue = typeof value === "string" ? value : value.toString();
  return new StringRecordId(stringValue);
};

const normalizeIdentifier = (value?: IdentifierValue) =>
  value ? toRecordId(value).toString() : undefined;

const toJsDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (value && typeof value === "object" && "toISOString" in value) {
    return new Date((value as {toISOString(): string}).toISOString());
  }
  return new Date();
};

const emptyItemMeta = (): {name?: string; code?: string; uom?: string} => ({});

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
      const params = { item: toRecordId(itemId), location };

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

          const purchases: InventoryPurchaseItem[] = [];
          const returns: InventoryPurchaseReturnItem[] = [];
          const issues: InventoryIssueItem[] = [];
          const issueReturns: InventoryIssueReturnItem[] = [];
          const waste: InventoryWasteItem[] = [];
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
            const base = {
              id: row.id,
              quantity: Math.abs(signedQty),
              signedQuantity: signedQty,
              reversal,
              created_at,
              item: emptyItemMeta(),
            };

            switch (row.reference_type) {
              case "purchase":
                purchases.push(base as unknown as InventoryPurchaseItem);
                break;
              case "purchase_return":
                returns.push(base as unknown as InventoryPurchaseReturnItem);
                break;
              case "issue":
                issues.push(base as unknown as InventoryIssueItem);
                break;
              case "issue_return":
                issueReturns.push(base as unknown as InventoryIssueReturnItem);
                break;
              case "waste":
                waste.push(base as unknown as InventoryWasteItem);
                break;
              case "transfer_in":
                transfersIn.push({ ...base, type: "transfer_in" });
                break;
              case "transfer_out":
                transfersOut.push({ ...base, type: "transfer_out" });
                break;
              case "production_input":
                productionInputs.push({ ...base, type: "production_out" });
                break;
              case "production_output":
                productionOutputs.push({ ...base, type: "production_in" });
                break;
              case "buffet_consumption":
                buffetConsumption.push({
                  ...base,
                  type: "buffet_guest",
                  sessionNumber: row.reference_id,
                });
                break;
              case "adjustment":
                adjustments.push({
                  id: row.id,
                  // Keep signed quantity so UI can show +/–
                  quantity: Number(row.quantity_change) || 0,
                  created_at,
                  type: "adjustment",
                  item: emptyItemMeta(),
                  notes: row.notes,
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
              `SELECT *, purchase.created_at as created_at, purchase.invoice_number as invoice_number FROM ${Tables.inventory_purchase_items} WHERE item = $item AND location = $location order by purchase.created_at DESC FETCH item`,
              params
            ),
            queryRef.current(
              `SELECT *, purchase_return.created_at as created_at, purchase_return.invoice_number as invoice_number FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND (location = $location OR purchase_item.location = $location) order by purchase_return.created_at DESC FETCH item`,
              params
            ),
            queryRef.current(
              `SELECT *, issue.created_at as created_at, issue.invoice_number as invoice_number FROM ${Tables.inventory_issue_items} WHERE item = $item AND location = $location order by issue.created_at DESC FETCH item`,
              params
            ),
            queryRef.current(
              `SELECT *, issue_return.created_at as created_at, issue_return.invoice_number as invoice_number FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND (location = $location OR issued_item.location = $location) order by issue_return.created_at DESC FETCH item`,
              params
            ),
            queryRef.current(
              `SELECT *, waste.created_at as created_at, waste.invoice_number as invoice_number FROM ${Tables.inventory_waste_items} WHERE item = $item AND ((purchase_item != none AND purchase_item.location = $location) or (issue_item != none and issue_item.location = $location)) order by waste.created_at DESC FETCH item`,
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
              rows.map((row) => ({
                id: String(row.id),
                quantity: Number(row.quantity) || 0,
                created_at: toJsDate(row.created_at),
                type,
                item: {
                  name: row.item?.name,
                  code: row.item?.code,
                  uom: row.item?.uom,
                },
                counterparty: row.counterparty_location || row.counterparty,
              }));

            setRecords({
              purchases: (purchaseRecords[0] || []) as InventoryPurchaseItem[],
              returns: (returnRecords[0] || []) as InventoryPurchaseReturnItem[],
              issues: (issueRecords[0] || []) as InventoryIssueItem[],
              issueReturns: (issueReturnRecords[0] || []) as InventoryIssueReturnItem[],
              waste: (wasteRecords[0] || []) as InventoryWasteItem[],
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
              })),
              buffetConsumption: buffetConsumptionRecords.map((row) => ({
                id: `${row.id}-${row.source}`,
                quantity: row.quantity,
                created_at: toJsDate(row.createdAt),
                type: row.source as BuffetConsumptionRecord["type"],
                item: {},
                sessionNumber: row.sessionNumber,
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
