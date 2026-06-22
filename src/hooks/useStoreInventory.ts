import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {StringRecordId} from "surrealdb";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryPurchaseItem } from "@/api/model/inventory_purchase.ts";
import { InventoryPurchaseReturnItem } from "@/api/model/inventory_purchase_return.ts";
import { InventoryIssueItem } from "@/api/model/inventory_issue.ts";
import { InventoryIssueReturnItem } from "@/api/model/inventory_issue_return.ts";
import { InventoryWasteItem } from "@/api/model/inventory_waste.ts";
import {computeStoreNet} from "@/utils/inventory.ts";
import {fetchStoreTransferTotals} from "@/lib/inventory/stock_transfer.service.ts";
import {
  fetchBuffetConsumptionLinesForStore,
  fetchBuffetConsumptionTotals,
} from "@/lib/inventory/buffet.service.ts";

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
};

type SumQueryResponse = Array<{ total: number | null }>;

const getTotalFromRows = (rows?: SumQueryResponse) => rows?.[0]?.total ?? 0;

type IdentifierValue = string | undefined;

interface InventoryIdentifiers {
  itemId?: string;
  storeId?: string;
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

export const useStoreInventory = (initialItemId?: IdentifierValue, initialStoreId?: IdentifierValue) => {
  const db = useDB();
  const queryRef = useRef(db.query);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const [identifiers, setIdentifiers] = useState<InventoryIdentifiers>({
    itemId: normalizeIdentifier(initialItemId),
    storeId: normalizeIdentifier(initialStoreId)
  });

  const [totals, setTotals] = useState<InventoryTotals>(initialTotals);
  const [records, setRecords] = useState<InventoryRecords>(initialRecords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const setArgs = useCallback((itemId?: IdentifierValue, storeId?: IdentifierValue) => {
    const nextItemId = normalizeIdentifier(itemId);
    const nextStoreId = normalizeIdentifier(storeId);

    setIdentifiers(prev => {
      if (prev.itemId === nextItemId && prev.storeId === nextStoreId) return prev;
      return { itemId: nextItemId, storeId: nextStoreId };
    });
  }, []);

  useEffect(() => {
    const { itemId, storeId } = identifiers;
    if (!itemId || !storeId) {
      setTotals(initialTotals);
      setRecords(initialRecords);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const params = { item: toRecordId(itemId), store: toRecordId(storeId) };

      try {
        const [
          [purchaseTotalsResult],
          [returnTotalsResult],
          [issueTotalsResult],
          [issueReturnTotalsResult],
          [wasteTotalsResult],
          transferTotals,
          purchaseRecords,
          returnRecords,
          issueRecords,
          issueReturnRecords,
          wasteRecords,
          transferOutRecords,
          transferInRecords,
          productionInputTotalsResult,
          productionOutputTotalsResult,
          productionInputRecords,
          productionOutputRecords,
          buffetConsumptionTotal,
          buffetConsumptionRecords,
        ] = await Promise.all([
          queryRef.current(
            `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_items} WHERE item = $item AND store = $store GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND purchase_item.store = $store GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_items} WHERE item = $item AND store = $store GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND store = $store GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_waste_items} WHERE item = $item AND purchase_item != null AND purchase_item.store = $store GROUP ALL`,
            params
          ),
          fetchStoreTransferTotals(db, itemId, storeId),
          queryRef.current(
            `SELECT *, purchase.created_at as created_at, purchase.invoice_number as invoice_number FROM ${Tables.inventory_purchase_items} WHERE item = $item AND store = $store order by purchase.created_at DESC FETCH item`,
            params
          ),
          queryRef.current(
            `SELECT *, purchase_return.created_at as created_at, purchase_return.invoice_number as invoice_number FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND purchase_item.store = $store order by purchase_return.created_at DESC FETCH item`,
            params
          ),
          queryRef.current(
            `SELECT *, issue.created_at as created_at, issue.invoice_number as invoice_number FROM ${Tables.inventory_issue_items} WHERE item = $item AND store = $store order by issue.created_at DESC FETCH item`,
            params
          ),
          queryRef.current(
            `SELECT *, issue_return.created_at as created_at, issue_return.invoice_number as invoice_number FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND store = $store order by issue_return.created_at DESC FETCH item`,
            params
          ),
          queryRef.current(
            `SELECT *, waste.created_at as created_at, waste.invoice_number as invoice_number FROM ${Tables.inventory_waste_items} WHERE item = $item AND ((purchase_item != none AND purchase_item.store = $store) or (issue_item != none and issue_item.store = $store)) order by waste.created_at DESC FETCH item`,
            params
          ),
          queryRef.current(
            `SELECT *, transfer.created_at AS created_at, transfer.to_store.name AS counterparty
            FROM ${Tables.stock_transfer_items}
            WHERE item = $item AND transfer IN (
              SELECT VALUE id FROM ${Tables.stock_transfers} WHERE from_store = $store AND to_store != NONE
            )
            ORDER BY transfer.created_at DESC
            FETCH item, transfer, transfer.to_store`,
            params
          ),
          queryRef.current(
            `SELECT *, transfer.created_at AS created_at, transfer.from_store.name AS counterparty
            FROM ${Tables.stock_transfer_items}
            WHERE item = $item AND transfer IN (
              SELECT VALUE id FROM ${Tables.stock_transfers} WHERE to_store = $store AND from_store != NONE
            )
            ORDER BY transfer.created_at DESC
            FETCH item, transfer, transfer.from_store`,
            params
          ),
          queryRef.current(
            `SELECT math::sum(quantity) AS total FROM ${Tables.production_batch_inputs}
            WHERE item = $item AND store = $store
            AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
            GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT math::sum(quantity) AS total FROM ${Tables.production_batch_outputs}
            WHERE item = $item AND store = $store AND disposition = 'inventory'
            AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
            GROUP ALL`,
            params
          ),
          queryRef.current(
            `SELECT *, batch.created_at AS created_at, batch.batch_number AS batch_number
            FROM ${Tables.production_batch_inputs}
            WHERE item = $item AND store = $store
            AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
            ORDER BY batch.created_at DESC
            FETCH item, batch`,
            params
          ),
          queryRef.current(
            `SELECT *, batch.created_at AS created_at, batch.batch_number AS batch_number
            FROM ${Tables.production_batch_outputs}
            WHERE item = $item AND store = $store AND disposition = 'inventory'
            AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
            ORDER BY batch.created_at DESC
            FETCH item, batch`,
            params
          ),
          fetchBuffetConsumptionTotals(db, itemId, storeId),
          fetchBuffetConsumptionLinesForStore(db, itemId, storeId),
        ]);

        if (!cancelled) {
          setTotals({
            purchases: getTotalFromRows(purchaseTotalsResult as SumQueryResponse),
            returns: getTotalFromRows(returnTotalsResult as SumQueryResponse),
            issues: getTotalFromRows(issueTotalsResult as SumQueryResponse),
            issueReturns: getTotalFromRows(issueReturnTotalsResult as SumQueryResponse),
            waste: getTotalFromRows(wasteTotalsResult as SumQueryResponse),
            transfersIn: transferTotals.transfersIn,
            transfersOut: transferTotals.transfersOut,
            productionInputs: getTotalFromRows(productionInputTotalsResult as SumQueryResponse),
            productionOutputs: getTotalFromRows(productionOutputTotalsResult as SumQueryResponse),
            buffetConsumption: buffetConsumptionTotal,
          });

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
              counterparty: row.counterparty,
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
          });
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
  }, [identifiers.itemId, identifiers.storeId]);

  const netQuantity = useMemo(() => computeStoreNet(totals), [totals]);

  return { identifiers, setArgs, totals, records, netQuantity, loading, error };
};
