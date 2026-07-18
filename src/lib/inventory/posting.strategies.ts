import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryLedgerInput } from "@/api/model/inventory_ledger.ts";
import { InventoryPurchase, InventoryPurchaseItem } from "@/api/model/inventory_purchase.ts";
import { InventoryIssue, InventoryIssueItem } from "@/api/model/inventory_issue.ts";
import { InventoryAdjustment, InventoryAdjustmentItem } from "@/api/model/inventory_adjustment.ts";
import { buildLedgerKey } from "@/lib/inventory/ledger.service.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { toJsDate } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type InventoryPostingDocumentType = "purchase" | "issue" | "adjustment";

export type InventoryPostingContext = {
  db: DatabaseClient;
  documentId: string;
  userId?: string;
};

export type InventoryPostingStrategy = {
  referenceType: InventoryPostingDocumentType;
  table: string;
  itemTable: string;
  itemParentField: string;
  loadDocument: (ctx: InventoryPostingContext) => Promise<any>;
  loadItems: (ctx: InventoryPostingContext) => Promise<any[]>;
  buildEntries: (doc: any, items: any[], userId?: string) => InventoryLedgerInput[];
  requiresAvailabilityCheck: boolean;
  getAvailabilityLines?: (items: any[]) => Array<{ itemId: string; locationId: string; quantity: number }>;
};

const toIdString = (value: unknown): string =>
  recordIdToString(value) || String(value ?? "");

const toBusinessDate = (createdAt: unknown): string => {
  try {
    const d = toJsDate(createdAt as any);
    if (d && !Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // fall through
  }
  return new Date().toISOString().slice(0, 10);
};

const resolveItemId = (item: any): string => {
  const raw = item?.item?.id ?? item?.item ?? item?.inventory_item;
  return toIdString(raw);
};

const resolveLocationId = (item: any, doc?: any): string => {
  const raw =
    item?.location?.id ??
    item?.location ??
    doc?.location?.id ??
    doc?.location ??
    item?.store?.id ??
    item?.store ??
    doc?.store?.id ??
    doc?.store;
  return toIdString(raw);
};

const resolveUnitCost = (item: any): number => {
  // Prefer landed-cost final unit cost when allocation has run at post time
  const price = Number(
    item?.final_unit_cost ?? item?.price ?? item?.unit_cost ?? 0
  );
  return Number.isFinite(price) ? price : 0;
};

export const purchasePostingStrategy: InventoryPostingStrategy = {
  referenceType: "purchase",
  table: Tables.inventory_purchases,
  itemTable: Tables.inventory_purchase_items,
  itemParentField: "purchase",
  requiresAvailabilityCheck: false,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchases} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, items.store, created_by, parent`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchase_items} WHERE purchase = $id FETCH item, location, store`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  buildEntries: (doc: InventoryPurchase, items: InventoryPurchaseItem[], userId?: string) => {
    const referenceId = toIdString(doc.id);
    const businessDate = toBusinessDate(doc.created_at);
    const entries: InventoryLedgerInput[] = [];

    for (const item of items) {
      const itemId = resolveItemId(item);
      const locationId = resolveLocationId(item, doc);
      if (!itemId || !locationId) continue;

      const quantity = Number(item.quantity) || 0;
      if (quantity === 0) continue;

      const unitCost = resolveUnitCost(item);
      const referenceItem = toIdString(item.id);

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: locationId,
        quantity_change: quantity,
        unit_cost: unitCost,
        total_cost: unitCost * quantity,
        reference_type: "purchase",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("purchase", referenceItem),
      });
    }

    return entries;
  },
};

export const issuePostingStrategy: InventoryPostingStrategy = {
  referenceType: "issue",
  table: Tables.inventory_issues,
  itemTable: Tables.inventory_issue_items,
  itemParentField: "issue",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_issues} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, items.store, created_by, parent`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_issue_items} WHERE issue = $id FETCH item, location, store`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  getAvailabilityLines: (items: InventoryIssueItem[]) =>
    items
      .map((item) => ({
        itemId: resolveItemId(item),
        locationId: resolveLocationId(item),
        quantity: Number(item.quantity) || 0,
      }))
      .filter((line) => line.itemId && line.locationId && line.quantity > 0),
  buildEntries: (doc: InventoryIssue, items: InventoryIssueItem[], userId?: string) => {
    const referenceId = toIdString(doc.id);
    const businessDate = toBusinessDate(doc.created_at);
    const entries: InventoryLedgerInput[] = [];

    for (const item of items) {
      const itemId = resolveItemId(item);
      const locationId = resolveLocationId(item, doc);
      if (!itemId || !locationId) continue;

      const quantity = Number(item.quantity) || 0;
      if (quantity === 0) continue;

      const unitCost = resolveUnitCost(item);
      const referenceItem = toIdString(item.id);

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: locationId,
        quantity_change: -quantity,
        unit_cost: unitCost,
        total_cost: unitCost * quantity,
        reference_type: "issue",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("issue", referenceItem),
      });
    }

    return entries;
  },
};

export const adjustmentPostingStrategy: InventoryPostingStrategy = {
  referenceType: "adjustment",
  table: Tables.inventory_adjustments,
  itemTable: Tables.inventory_adjustment_items,
  itemParentField: "adjustment",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_adjustments} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, items.store, location, store, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_adjustment_items} WHERE adjustment = $id FETCH item, location, store`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  getAvailabilityLines: (items: InventoryAdjustmentItem[]) =>
    items
      .map((item) => {
        const qty = Number(item.quantity_change) || 0;
        return {
          itemId: resolveItemId(item),
          locationId: resolveLocationId(item),
          quantity: qty < 0 ? Math.abs(qty) : 0,
        };
      })
      .filter((line) => line.itemId && line.locationId && line.quantity > 0),
  buildEntries: (doc: InventoryAdjustment, items: InventoryAdjustmentItem[], userId?: string) => {
    const referenceId = toIdString(doc.id);
    const businessDate = toBusinessDate(doc.created_at);
    const entries: InventoryLedgerInput[] = [];

    for (const item of items) {
      const itemId = resolveItemId(item);
      const locationId = resolveLocationId(item, doc);
      if (!itemId || !locationId) continue;

      const quantityChange = Number(item.quantity_change) || 0;
      if (quantityChange === 0) continue;

      const unitCost = resolveUnitCost(item);
      const referenceItem = toIdString(item.id);

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: locationId,
        quantity_change: quantityChange,
        unit_cost: unitCost,
        total_cost: unitCost * Math.abs(quantityChange),
        reference_type: "adjustment",
        reference_id: referenceId,
        reference_item: referenceItem,
        notes: doc.reason ? `reason:${doc.reason}` : undefined,
        ledger_key: buildLedgerKey("adjustment", referenceItem),
      });
    }

    return entries;
  },
};

export const POSTING_STRATEGIES: Record<InventoryPostingDocumentType, InventoryPostingStrategy> = {
  purchase: purchasePostingStrategy,
  issue: issuePostingStrategy,
  adjustment: adjustmentPostingStrategy,
};
