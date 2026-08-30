import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {TFunc, WriteToolContext} from "@/lib/ai/tools/write-tools.ts";
import {resolveInventoryItem} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {postDocument} from "@/lib/inventory/posting.service.ts";
import {documentCreatedAtFromDateValue} from "@/lib/datetime.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";

async function resolveSupplierId(db: ImportDbLike, name: string) {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.inventory_suppliers} WHERE string::lowercase(name) = string::lowercase($name) LIMIT 1`,
    {name},
  );
  return rows?.[0]?.id;
}

async function resolveLocationId(db: ImportDbLike, name: string) {
  const [rows] = await db.query(
    `SELECT id FROM ${Tables.inventory_locations} WHERE string::lowercase(name) = string::lowercase($name) AND deleted_at = none LIMIT 1`,
    {name},
  );
  return rows?.[0]?.id;
}

export function createAiPurchaseImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "item", type: "string", required: true, description: "Inventory item code or name"},
    {name: "quantity", type: "number", required: true},
    {name: "price", type: "number", required: true, description: "Unit price"},
    {name: "supplier", type: "string", required: true},
    {name: "location", type: "string", required: true},
    {name: "post", type: "boolean", description: "Post to ledger after save (default true)"},
    {name: "comments", type: "string"},
  ];

  return {
    id: "ai_inventory_purchases",
    entityLabel: t("inventory:tabs.purchases", {defaultValue: "Purchase"}),
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Create inventory purchase documents with item, quantity, price, supplier, and location.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const itemKey = String(v.item ?? "").trim();
      const supplierName = String(v.supplier ?? "").trim();
      const locationName = String(v.location ?? "").trim();
      const quantity = Number(v.quantity);
      const price = Number(v.price);
      const shouldPost = v.post !== false;

      if (!itemKey || !supplierName || !locationName || !Number.isFinite(quantity) || !Number.isFinite(price)) {
        throw new Error(t("validation:required"));
      }

      const item = await resolveInventoryItem(db, itemKey);
      if (!item) throw new Error(`Item not found: ${itemKey}`);

      const supplierId = await resolveSupplierId(db, supplierName);
      if (!supplierId) throw new Error(`Supplier not found: ${supplierName}`);

      const locationId = await resolveLocationId(db, locationName);
      if (!locationId) throw new Error(`Location not found: ${locationName}`);

      const invoiceNumber = await fetchNextSequentialNumber(db as any, Tables.inventory_purchases, "invoice_number");

      const [purchase] = await db.create?.(Tables.inventory_purchases, {
        invoice_number: invoiceNumber,
        method: "manual",
        comments: v.comments ? String(v.comments) : undefined,
        items: [],
        tax_rate: 0,
        tax_amount: 0,
        extras: null,
        status: "draft",
        created_at: documentCreatedAtFromDateValue(null),
        created_by: context.userId ? toRecordId(context.userId) : undefined,
      });
      const purchaseId = purchase?.id;
      if (!purchaseId) throw new Error("Failed to create purchase");

      const [line] = await db.create?.(Tables.inventory_purchase_items, {
        purchase: toRecordId(purchaseId),
        item: toRecordId(item.id),
        location: toRecordId(locationId),
        supplier: toRecordId(supplierId),
        quantity,
        requested: quantity,
        price,
        base_quantity: 1,
        code: item.code ?? "",
      });

      if (line?.id) {
        await db.merge?.(toRecordId(purchaseId), {items: [line.id]});
      }

      if (shouldPost && context.userId) {
        await postDocument({
          db: db as any,
          documentType: "purchase",
          documentId: recordIdToString(purchaseId),
          userId: context.userId,
        });
      }
    },
  };
}

export function createAiWasteImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "item", type: "string", required: true},
    {name: "quantity", type: "number", required: true},
    {name: "location", type: "string", required: true},
    {name: "post", type: "boolean"},
    {name: "comments", type: "string"},
  ];

  return {
    id: "ai_inventory_wastes",
    entityLabel: t("inventory:tabs.wastes", {defaultValue: "Waste"}),
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions: "Record inventory waste with item, quantity, and location.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const itemKey = String(v.item ?? "").trim();
      const locationName = String(v.location ?? "").trim();
      const quantity = Number(v.quantity);
      const shouldPost = v.post !== false;

      const item = await resolveInventoryItem(db, itemKey);
      if (!item) throw new Error(`Item not found: ${itemKey}`);

      const locationId = await resolveLocationId(db, locationName);
      if (!locationId) throw new Error(`Location not found: ${locationName}`);

      const invoiceNumber = await fetchNextSequentialNumber(db as any, Tables.inventory_wastes, "invoice_number");

      const [waste] = await db.create?.(Tables.inventory_wastes, {
        invoice_number: invoiceNumber,
        items: [],
        status: "draft",
        created_at: documentCreatedAtFromDateValue(null),
        created_by: context.userId ? toRecordId(context.userId) : undefined,
      });
      const wasteId = waste?.id;
      if (!wasteId) throw new Error("Failed to create waste");

      const [line] = await db.create?.(Tables.inventory_waste_items, {
        waste: toRecordId(wasteId),
        item: toRecordId(item.id),
        location: toRecordId(locationId),
        quantity,
        price: Number(item.price) || 0,
        comments: v.comments ? String(v.comments) : undefined,
      });

      if (line?.id) {
        await db.merge?.(toRecordId(wasteId), {items: [line.id]});
      }

      if (shouldPost && context.userId) {
        await postDocument({
          db: db as any,
          documentType: "waste",
          documentId: recordIdToString(wasteId),
          userId: context.userId,
        });
      }
    },
  };
}

export function createAiIssueImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "item", type: "string", required: true},
    {name: "quantity", type: "number", required: true},
    {name: "location", type: "string", required: true, description: "Source stock location"},
    {name: "post", type: "boolean"},
    {name: "comments", type: "string"},
  ];

  return {
    id: "ai_inventory_issues",
    entityLabel: t("inventory:tabs.issues", {defaultValue: "Issue"}),
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions: "Record inventory issue from a location.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const itemKey = String(v.item ?? "").trim();
      const locationName = String(v.location ?? "").trim();
      const quantity = Number(v.quantity);
      const shouldPost = v.post !== false;

      const item = await resolveInventoryItem(db, itemKey);
      if (!item) throw new Error(`Item not found: ${itemKey}`);

      const locationId = await resolveLocationId(db, locationName);
      if (!locationId) throw new Error(`Location not found: ${locationName}`);

      const invoiceNumber = await fetchNextSequentialNumber(db as any, Tables.inventory_issues, "invoice_number");

      const [issue] = await db.create?.(Tables.inventory_issues, {
        invoice_number: invoiceNumber,
        location: toRecordId(locationId),
        items: [],
        status: "draft",
        created_at: documentCreatedAtFromDateValue(null),
        created_by: context.userId ? toRecordId(context.userId) : undefined,
      });
      const issueId = issue?.id;
      if (!issueId) throw new Error("Failed to create issue");

      const [line] = await db.create?.(Tables.inventory_issue_items, {
        issue: toRecordId(issueId),
        item: toRecordId(item.id),
        location: toRecordId(locationId),
        quantity,
        requested: quantity,
        comments: v.comments ? String(v.comments) : undefined,
      });

      if (line?.id) {
        await db.merge?.(toRecordId(issueId), {items: [line.id]});
      }

      if (shouldPost && context.userId) {
        await postDocument({
          db: db as any,
          documentType: "issue",
          documentId: recordIdToString(issueId),
          userId: context.userId,
        });
      }
    },
  };
}

export function createAiAdjustmentImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "item", type: "string", required: true},
    {name: "quantity_change", type: "number", required: true, description: "Signed quantity change"},
    {name: "location", type: "string", required: true},
    {name: "post", type: "boolean"},
    {name: "comments", type: "string"},
  ];

  return {
    id: "ai_inventory_adjustments",
    entityLabel: t("inventory:tabs.adjustments", {defaultValue: "Adjustment"}),
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions: "Record inventory stock adjustment (signed quantity change).",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const itemKey = String(v.item ?? "").trim();
      const locationName = String(v.location ?? "").trim();
      const quantityChange = Number(v.quantity_change);
      const shouldPost = v.post !== false;

      const item = await resolveInventoryItem(db, itemKey);
      if (!item) throw new Error(`Item not found: ${itemKey}`);

      const locationId = await resolveLocationId(db, locationName);
      if (!locationId) throw new Error(`Location not found: ${locationName}`);

      const invoiceNumber = await fetchNextSequentialNumber(db as any, Tables.inventory_adjustments, "invoice_number");

      const [adjustment] = await db.create?.(Tables.inventory_adjustments, {
        invoice_number: invoiceNumber,
        items: [],
        status: "draft",
        created_at: documentCreatedAtFromDateValue(null),
        created_by: context.userId ? toRecordId(context.userId) : undefined,
      });
      const adjustmentId = adjustment?.id;
      if (!adjustmentId) throw new Error("Failed to create adjustment");

      const [line] = await db.create?.(Tables.inventory_adjustment_items, {
        adjustment: toRecordId(adjustmentId),
        item: toRecordId(item.id),
        location: toRecordId(locationId),
        quantity_change: quantityChange,
        comments: v.comments ? String(v.comments) : undefined,
      });

      if (line?.id) {
        await db.merge?.(toRecordId(adjustmentId), {items: [line.id]});
      }

      if (shouldPost && context.userId) {
        await postDocument({
          db: db as any,
          documentType: "adjustment",
          documentId: recordIdToString(adjustmentId),
          userId: context.userId,
        });
      }
    },
  };
}
