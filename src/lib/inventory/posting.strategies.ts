import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryLedgerInput } from "@/api/model/inventory_ledger.ts";
import { InventoryPurchase, InventoryPurchaseItem } from "@/api/model/inventory_purchase.ts";
import { InventoryIssue, InventoryIssueItem } from "@/api/model/inventory_issue.ts";
import { InventoryAdjustment, InventoryAdjustmentItem } from "@/api/model/inventory_adjustment.ts";
import { StockTransfer, StockTransferItem } from "@/api/model/stock_transfer.ts";
import {
  InventoryPurchaseReturn,
  InventoryPurchaseReturnItem,
} from "@/api/model/inventory_purchase_return.ts";
import {
  InventoryIssueReturn,
  InventoryIssueReturnItem,
} from "@/api/model/inventory_issue_return.ts";
import { InventoryWaste, InventoryWasteItem } from "@/api/model/inventory_waste.ts";
import {
  ProductionBatch,
  ProductionBatchInput,
  ProductionBatchOutput,
} from "@/api/model/production_batch.ts";
import { buildLedgerKey } from "@/lib/inventory/ledger.service.ts";
import { resolveCatalogUnitCost } from "@/lib/inventory/line.cost.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { toAppBusinessDate } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type InventoryPostingDocumentType =
  | "purchase"
  | "issue"
  | "adjustment"
  | "stock_transfer"
  | "purchase_return"
  | "issue_return"
  | "waste"
  | "production_batch";

type ProductionLedgerLine =
  | (ProductionBatchInput & { _kind: "input" })
  | (ProductionBatchOutput & { _kind: "output" });

export type InventoryPostingContext = {
  db: DatabaseClient;
  documentId: string;
  userId?: string;
};

export type InventoryPostingStrategy = {
  referenceType: InventoryPostingDocumentType;
  /** Ledger reference_type values for this document (defaults to [referenceType]). */
  ledgerReferenceTypes?: string[];
  table: string;
  itemTable: string;
  itemParentField: string;
  loadDocument: (ctx: InventoryPostingContext) => Promise<any>;
  loadItems: (ctx: InventoryPostingContext) => Promise<any[]>;
  buildEntries: (doc: any, items: any[], userId?: string) => InventoryLedgerInput[];
  requiresAvailabilityCheck: boolean;
  getAvailabilityLines?: (
    items: any[],
    doc?: any
  ) => Array<{ itemId: string; locationId: string; quantity: number }>;
};

const toIdString = (value: unknown): string =>
  recordIdToString(value) || String(value ?? "");

/** Business date in app timezone (fixes UTC off-by-one from toISOString). */
const toBusinessDate = (createdAt: unknown): string => toAppBusinessDate(createdAt as any);

const resolveItemId = (item: any): string => {
  const raw = item?.item?.id ?? item?.item ?? item?.inventory_item;
  return toIdString(raw);
};

const resolveLinkedLocation = (linked?: any): unknown =>
  linked?.location?.id ??
  linked?.location;

const resolveLocationId = (item: any, doc?: any): string => {
  const raw =
    item?.location?.id ??
    item?.location ??
    resolveLinkedLocation(item?.purchase_item) ??
    resolveLinkedLocation(item?.issued_item) ??
    resolveLinkedLocation(item?.issue_item) ??
    doc?.location?.id ??
    doc?.location;
  return toIdString(raw);
};

const resolveTransferEndpointId = (
  location?: {id?: unknown} | string | null
): string => {
  const raw =
    typeof location === "object" && location !== null ? location.id ?? location : location;
  return toIdString(raw);
};

const resolveUnitCost = (item: any): number => {
  // Prefer landed-cost final unit cost when allocation has run at post time
  const price = Number(
    item?.final_unit_cost ?? item?.price ?? item?.unit_cost ?? 0
  );
  if (Number.isFinite(price) && price !== 0) {
    return price;
  }
  return resolveCatalogUnitCost(item?.item);
};

export const purchasePostingStrategy: InventoryPostingStrategy = {
  referenceType: "purchase",
  table: Tables.inventory_purchases,
  itemTable: Tables.inventory_purchase_items,
  itemParentField: "purchase",
  requiresAvailabilityCheck: false,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchases} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, created_by, parent`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchase_items} WHERE purchase = $id FETCH item, location`,
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
      `SELECT * FROM ${Tables.inventory_issues} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, created_by, parent`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_issue_items} WHERE issue = $id FETCH item, location`,
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
      `SELECT * FROM ${Tables.inventory_adjustments} WHERE id = $id LIMIT 1 FETCH items, items.item, items.location, location, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_adjustment_items} WHERE adjustment = $id FETCH item, location`,
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

export const stockTransferPostingStrategy: InventoryPostingStrategy = {
  referenceType: "stock_transfer",
  ledgerReferenceTypes: ["transfer_out", "transfer_in"],
  table: Tables.stock_transfers,
  itemTable: Tables.stock_transfer_items,
  itemParentField: "transfer",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.stock_transfers} WHERE id = $id LIMIT 1
       FETCH from_location, to_location, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.stock_transfer_items} WHERE transfer = $id FETCH item`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  getAvailabilityLines: (items: StockTransferItem[], doc?: StockTransfer) => {
    const fromLocationId = resolveTransferEndpointId(doc?.from_location as any);
    if (!fromLocationId) return [];
    return items
      .map((item) => ({
        itemId: resolveItemId(item),
        locationId: fromLocationId,
        quantity: Number(item.quantity) || 0,
      }))
      .filter((line) => line.itemId && line.locationId && line.quantity > 0);
  },
  buildEntries: (doc: StockTransfer, items: StockTransferItem[], userId?: string) => {
    const referenceId = toIdString(doc.id);
    const businessDate = toBusinessDate(doc.created_at);
    const fromLocationId = resolveTransferEndpointId(doc.from_location as any);
    const toLocationId = resolveTransferEndpointId(doc.to_location as any);
    const entries: InventoryLedgerInput[] = [];

    if (!fromLocationId || !toLocationId) {
      return entries;
    }

    for (const item of items) {
      const itemId = resolveItemId(item);
      if (!itemId) continue;

      const quantity = Number(item.quantity) || 0;
      if (quantity === 0) continue;

      const unitCost = resolveCatalogUnitCost(item.item as any);
      const referenceItem = toIdString(item.id);
      if (!referenceItem) continue;

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: fromLocationId,
        quantity_change: -quantity,
        unit_cost: unitCost,
        total_cost: unitCost * quantity,
        reference_type: "transfer_out",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("transfer_out", referenceItem),
      });

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: toLocationId,
        quantity_change: quantity,
        unit_cost: unitCost,
        total_cost: unitCost * quantity,
        reference_type: "transfer_in",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("transfer_in", referenceItem),
      });
    }

    return entries;
  },
};

export const purchaseReturnPostingStrategy: InventoryPostingStrategy = {
  referenceType: "purchase_return",
  table: Tables.inventory_purchase_returns,
  itemTable: Tables.inventory_purchase_return_items,
  itemParentField: "purchase_return",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchase_returns} WHERE id = $id LIMIT 1
       FETCH items, items.item, items.location, items.purchase_item,
             items.purchase_item.location, location, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_purchase_return_items} WHERE purchase_return = $id
       FETCH item, location, purchase_item, purchase_item.location`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  getAvailabilityLines: (items: InventoryPurchaseReturnItem[], doc?: InventoryPurchaseReturn) =>
    items
      .map((item) => ({
        itemId: resolveItemId(item),
        locationId: resolveLocationId(item, doc),
        quantity: Number(item.quantity) || 0,
      }))
      .filter((line) => line.itemId && line.locationId && line.quantity > 0),
  buildEntries: (
    doc: InventoryPurchaseReturn,
    items: InventoryPurchaseReturnItem[],
    userId?: string
  ) => {
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
        reference_type: "purchase_return",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("purchase_return", referenceItem),
      });
    }

    return entries;
  },
};

export const issueReturnPostingStrategy: InventoryPostingStrategy = {
  referenceType: "issue_return",
  table: Tables.inventory_issue_returns,
  itemTable: Tables.inventory_issue_return_items,
  itemParentField: "issue_return",
  requiresAvailabilityCheck: false,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_issue_returns} WHERE id = $id LIMIT 1
       FETCH items, items.item, items.location, items.issued_item,
             items.issued_item.location, location, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_issue_return_items} WHERE issue_return = $id
       FETCH item, location, issued_item, issued_item.location`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  buildEntries: (
    doc: InventoryIssueReturn,
    items: InventoryIssueReturnItem[],
    userId?: string
  ) => {
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
        reference_type: "issue_return",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("issue_return", referenceItem),
      });
    }

    return entries;
  },
};

export const wastePostingStrategy: InventoryPostingStrategy = {
  referenceType: "waste",
  table: Tables.inventory_wastes,
  itemTable: Tables.inventory_waste_items,
  itemParentField: "waste",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_wastes} WHERE id = $id LIMIT 1
       FETCH items, items.item, items.location, items.purchase_item,
             items.purchase_item.location,
             items.issue_item, items.issue_item.location, created_by`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.inventory_waste_items} WHERE waste = $id
       FETCH item, location, purchase_item, purchase_item.location,
             issue_item, issue_item.location`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows : [];
  },
  getAvailabilityLines: (items: InventoryWasteItem[]) =>
    items
      .map((item) => ({
        itemId: resolveItemId(item),
        locationId: resolveLocationId(item),
        quantity: Number(item.quantity) || 0,
      }))
      .filter((line) => line.itemId && line.locationId && line.quantity > 0),
  buildEntries: (doc: InventoryWaste, items: InventoryWasteItem[], userId?: string) => {
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

      const expiryDate =
        (item as any).expiry_date ??
        (item.purchase_item as any)?.expiry_date;
      const batchCode =
        (item as any).batch_code ??
        (item.purchase_item as any)?.batch_code;

      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: locationId,
        quantity_change: -quantity,
        unit_cost: unitCost,
        total_cost: unitCost * quantity,
        reference_type: "waste",
        reference_id: referenceId,
        reference_item: referenceItem,
        notes: item.source ? `source:${item.source}` : undefined,
        ledger_key: buildLedgerKey("waste", referenceItem),
        ...(expiryDate ? { expiry_date: String(expiryDate) } : {}),
        ...(batchCode ? { batch_code: String(batchCode) } : {}),
      });
    }

    return entries;
  },
};

export const productionBatchPostingStrategy: InventoryPostingStrategy = {
  referenceType: "production_batch",
  ledgerReferenceTypes: ["production_input", "production_output"],
  table: Tables.production_batches,
  itemTable: Tables.production_batch_inputs,
  itemParentField: "batch",
  requiresAvailabilityCheck: true,
  loadDocument: async ({ db, documentId }) => {
    const [rows] = await db.query(
      `SELECT * FROM ${Tables.production_batches} WHERE id = $id LIMIT 1
       FETCH location, created_by, recipe`,
      { id: toRecordId(documentId) }
    );
    return Array.isArray(rows) ? rows[0] : undefined;
  },
  loadItems: async ({ db, documentId }) => {
    const batchId = toRecordId(documentId);
    const [[inputs], [outputs]] = await Promise.all([
      db.query(
        `SELECT * FROM ${Tables.production_batch_inputs} WHERE batch = $id
         FETCH item, location`,
        { id: batchId }
      ),
      db.query(
        `SELECT * FROM ${Tables.production_batch_outputs} WHERE batch = $id
         FETCH item, location`,
        { id: batchId }
      ),
    ]);
    const inputLines: ProductionLedgerLine[] = (Array.isArray(inputs) ? inputs : []).map(
      (line: ProductionBatchInput) => ({ ...line, _kind: "input" as const })
    );
    const outputLines: ProductionLedgerLine[] = (Array.isArray(outputs) ? outputs : []).map(
      (line: ProductionBatchOutput) => ({ ...line, _kind: "output" as const })
    );
    return [...inputLines, ...outputLines];
  },
  getAvailabilityLines: (items: ProductionLedgerLine[], doc?: ProductionBatch) =>
    items
      .filter((line) => line._kind === "input")
      .map((item) => ({
        itemId: resolveItemId(item),
        locationId: resolveLocationId(item, doc),
        quantity: Number(item.quantity) || 0,
      }))
      .filter((line) => line.itemId && line.locationId && line.quantity > 0),
  buildEntries: (doc: ProductionBatch, items: ProductionLedgerLine[], userId?: string) => {
    const referenceId = toIdString(doc.id);
    const businessDate = toBusinessDate(doc.completed_at ?? doc.created_at);
    const entries: InventoryLedgerInput[] = [];

    for (const item of items) {
      const itemId = resolveItemId(item);
      const locationId = resolveLocationId(item, doc);
      if (!itemId || !locationId) continue;

      const quantity = Number(item.quantity) || 0;
      if (quantity === 0) continue;

      const referenceItem = toIdString(item.id);
      if (!referenceItem) continue;

      if (item._kind === "input") {
        const unitCost = Number(item.unit_cost) || resolveUnitCost(item);
        entries.push({
          created_by: userId,
          business_date: businessDate,
          inventory_item: itemId,
          inventory_location: locationId,
          quantity_change: -quantity,
          unit_cost: unitCost,
          total_cost: Number(item.total_cost) || unitCost * quantity,
          reference_type: "production_input",
          reference_id: referenceId,
          reference_item: referenceItem,
          ledger_key: buildLedgerKey("production_input", referenceItem),
        });
        continue;
      }

      if (item.disposition !== "inventory") continue;

      const unitCost = Number(item.unit_cost) || resolveUnitCost(item);
      entries.push({
        created_by: userId,
        business_date: businessDate,
        inventory_item: itemId,
        inventory_location: locationId,
        quantity_change: quantity,
        unit_cost: unitCost,
        total_cost: Number(item.allocated_cost) || unitCost * quantity,
        reference_type: "production_output",
        reference_id: referenceId,
        reference_item: referenceItem,
        ledger_key: buildLedgerKey("production_output", referenceItem),
      });
    }

    return entries;
  },
};

export const POSTING_STRATEGIES: Record<InventoryPostingDocumentType, InventoryPostingStrategy> = {
  purchase: purchasePostingStrategy,
  issue: issuePostingStrategy,
  adjustment: adjustmentPostingStrategy,
  stock_transfer: stockTransferPostingStrategy,
  purchase_return: purchaseReturnPostingStrategy,
  issue_return: issueReturnPostingStrategy,
  waste: wastePostingStrategy,
  production_batch: productionBatchPostingStrategy,
};
