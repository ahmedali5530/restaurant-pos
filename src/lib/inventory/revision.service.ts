import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryPurchase } from "@/api/model/inventory_purchase.ts";
import { InventoryIssue } from "@/api/model/inventory_issue.ts";
import { normalizeDocumentStatus } from "@/api/model/inventory_document.ts";
import { assertCanVoid } from "@/lib/inventory/dependency-validator.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { fetchNextSequentialNumber } from "@/utils/recordNumbers.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export class InventoryRevisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryRevisionError";
  }
}

/**
 * Create a draft revision of a posted purchase (never edit posted in place).
 * Marks the source document as superseded. New revision starts as draft;
 * posting it will reverse the parent ledger then post the new lines.
 */
export const createPurchaseRevision = async (
  db: DatabaseClient,
  purchaseId: string,
  userId?: string
): Promise<InventoryPurchase> => {
  const id = recordIdToString(purchaseId) || String(purchaseId);
  await assertCanVoid(db, "purchase", id);

  const [rows] = await db.query(
    `SELECT * FROM ${Tables.inventory_purchases} WHERE id = $id LIMIT 1
     FETCH items, items.item, items.store, items.supplier, supplier, store, documents`,
    { id: toRecordId(id) }
  );
  const source = (Array.isArray(rows) ? rows[0] : undefined) as InventoryPurchase | undefined;
  if (!source) {
    throw new InventoryRevisionError("Purchase not found");
  }
  if (source.superseded_by) {
    throw new InventoryRevisionError("Purchase already superseded");
  }
  if (normalizeDocumentStatus(source.status) !== "posted") {
    throw new InventoryRevisionError("Only posted purchases can be revised");
  }

  const nextInvoice = await fetchNextSequentialNumber(
    db,
    Tables.inventory_purchases,
    "invoice_number"
  );
  const newRevision = (source.revision ?? 1) + 1;

  const headerPayload: Record<string, unknown> = {
    invoice_number: nextInvoice,
    status: "draft",
    revision: newRevision,
    parent: toRecordId(id),
    created_at: nowSurrealDateTime(),
    comments: source.comments,
    method: source.method,
    tax_rate: source.tax_rate,
    tax_amount: source.tax_amount,
    extras: source.extras,
    cost_allocation_snapshot: null,
    items: [],
  };
  if (userId) headerPayload.created_by = toRecordId(userId);
  if (source.supplier) {
    headerPayload.supplier = toRecordId(
      recordIdToString(source.supplier.id ?? source.supplier)
    );
  }
  if (source.store) {
    headerPayload.store = toRecordId(
      recordIdToString(source.store.id ?? source.store)
    );
  }
  if (source.payment_method) {
    headerPayload.payment_method = toRecordId(
      recordIdToString((source.payment_method as any).id ?? source.payment_method)
    );
  }
  if (source.purchase_order) {
    headerPayload.purchase_order = toRecordId(
      recordIdToString((source.purchase_order as any).id ?? source.purchase_order)
    );
  }

  const [created] = await db.create(Tables.inventory_purchases, headerPayload);
  const newId = recordIdToString(created?.id) || String(created?.id ?? "");
  if (!newId) {
    throw new InventoryRevisionError("Failed to create purchase revision");
  }

  const itemIds: string[] = [];
  for (const line of source.items ?? []) {
    const [item] = await db.create(Tables.inventory_purchase_items, {
      purchase: toRecordId(newId),
      item: toRecordId(recordIdToString(line.item?.id ?? line.item)),
      quantity: line.quantity,
      requested: line.requested,
      price: line.price,
      base_quantity: line.base_quantity ?? line.quantity,
      code: line.code,
      comments: line.comments,
      taxable: line.taxable,
      // Calculated landed-cost fields are recomputed on next post
      purchase_price: null,
      allocated_extra_cost: null,
      allocated_tax: null,
      allocated_discount: null,
      final_unit_cost: null,
      total_inventory_cost: null,
      store: line.store
        ? toRecordId(recordIdToString(line.store.id ?? line.store))
        : undefined,
      supplier: line.supplier
        ? toRecordId(recordIdToString(line.supplier.id ?? line.supplier))
        : undefined,
      expiry_date: line.expiry_date,
      manufacturing_date: line.manufacturing_date,
    });
    if (item?.id) itemIds.push(recordIdToString(item.id) || String(item.id));
  }

  if (itemIds.length) {
    await db.merge(toRecordId(newId), {
      items: itemIds.map((itemId) => toRecordId(itemId)),
    });
  }

  await db.merge(toRecordId(id), {
    superseded_by: toRecordId(newId),
  });

  const [fresh] = await db.query(
    `SELECT * FROM ${Tables.inventory_purchases} WHERE id = $id LIMIT 1
     FETCH items, items.item, items.store, supplier, store, created_by`,
    { id: toRecordId(newId) }
  );
  return (Array.isArray(fresh) ? fresh[0] : fresh) as InventoryPurchase;
};

export const createIssueRevision = async (
  db: DatabaseClient,
  issueId: string,
  userId?: string
): Promise<InventoryIssue> => {
  const id = recordIdToString(issueId) || String(issueId);
  await assertCanVoid(db, "issue", id);

  const [rows] = await db.query(
    `SELECT * FROM ${Tables.inventory_issues} WHERE id = $id LIMIT 1
     FETCH items, items.item, items.store, issued_to, kitchen, store, documents`,
    { id: toRecordId(id) }
  );
  const source = (Array.isArray(rows) ? rows[0] : undefined) as InventoryIssue | undefined;
  if (!source) {
    throw new InventoryRevisionError("Issue not found");
  }
  if (source.superseded_by) {
    throw new InventoryRevisionError("Issue already superseded");
  }
  if (normalizeDocumentStatus(source.status) !== "posted") {
    throw new InventoryRevisionError("Only posted issues can be revised");
  }

  const nextInvoice = await fetchNextSequentialNumber(
    db,
    Tables.inventory_issues,
    "invoice_number"
  );
  const newRevision = (source.revision ?? 1) + 1;

  const headerPayload: Record<string, unknown> = {
    invoice_number: nextInvoice,
    status: "draft",
    revision: newRevision,
    parent: toRecordId(id),
    created_at: nowSurrealDateTime(),
    items: [],
  };
  if (userId) headerPayload.created_by = toRecordId(userId);
  if (source.issued_to) {
    headerPayload.issued_to = toRecordId(
      recordIdToString(source.issued_to.id ?? source.issued_to)
    );
  }
  if (source.kitchen) {
    headerPayload.kitchen = toRecordId(
      recordIdToString(source.kitchen.id ?? source.kitchen)
    );
  }
  if (source.store) {
    headerPayload.store = toRecordId(
      recordIdToString(source.store.id ?? source.store)
    );
  }

  const [created] = await db.create(Tables.inventory_issues, headerPayload);
  const newId = recordIdToString(created?.id) || String(created?.id ?? "");
  if (!newId) {
    throw new InventoryRevisionError("Failed to create issue revision");
  }

  const itemIds: string[] = [];
  for (const line of source.items ?? []) {
    const [item] = await db.create(Tables.inventory_issue_items, {
      issue: toRecordId(newId),
      item: toRecordId(recordIdToString(line.item?.id ?? line.item)),
      quantity: line.quantity,
      requested: line.requested,
      price: line.price,
      code: line.code,
      comments: line.comments,
      store: line.store
        ? toRecordId(recordIdToString(line.store.id ?? line.store))
        : undefined,
    });
    if (item?.id) itemIds.push(recordIdToString(item.id) || String(item.id));
  }

  if (itemIds.length) {
    await db.merge(toRecordId(newId), {
      items: itemIds.map((itemId) => toRecordId(itemId)),
    });
  }

  await db.merge(toRecordId(id), {
    superseded_by: toRecordId(newId),
  });

  const [fresh] = await db.query(
    `SELECT * FROM ${Tables.inventory_issues} WHERE id = $id LIMIT 1
     FETCH items, items.item, items.store, issued_to, kitchen, created_by`,
    { id: toRecordId(newId) }
  );
  return (Array.isArray(fresh) ? fresh[0] : fresh) as InventoryIssue;
};
