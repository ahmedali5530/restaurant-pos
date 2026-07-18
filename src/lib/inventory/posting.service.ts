import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { IntegrationManager } from "@/integrations/core/integration-manager.ts";
import { InventoryLedgerInput } from "@/api/model/inventory_ledger.ts";
import { normalizeDocumentStatus } from "@/api/model/inventory_document.ts";
import {
  assertTransition,
  canPost,
  canVoid,
} from "@/lib/inventory/lifecycle.ts";
import {
  buildLedgerKey,
  ledgerEntryExists,
} from "@/lib/inventory/ledger.service.ts";
import { fetchNetQuantity } from "@/utils/inventory.ts";
import { withTransaction, TransactionStatement } from "@/lib/inventory/transaction.ts";
import { nowSurrealDateTime, toJsDate } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import {
  publishInventoryAdjusted,
  publishInventoryPosted,
  publishInventoryReversed,
} from "@/lib/inventory/events/publish.ts";
import {
  InventoryPostingDocumentType,
  POSTING_STRATEGIES,
} from "@/lib/inventory/posting.strategies.ts";
import { assertCanVoid } from "@/lib/inventory/dependency-validator.ts";
import { fetchInventorySettings } from "@/lib/inventory/settings.ts";
import { allocatePurchaseCosts } from "@/lib/inventory/purchase-cost/allocate.ts";
import type { LineAllocationResult } from "@/lib/inventory/purchase-cost/types.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export class InventoryPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryPostingError";
  }
}

export type PostDocumentInput = {
  db: DatabaseClient;
  documentType: InventoryPostingDocumentType;
  documentId: string;
  userId?: string;
  integrationManager?: IntegrationManager | null;
};

export type PostDocumentResult = {
  posted: boolean;
  skipped?: boolean;
  reason?: string;
  ledgerEntryCount: number;
};

export type ReverseDocumentResult = {
  reversed: boolean;
  skipped?: boolean;
  reason?: string;
  ledgerEntryCount: number;
};

const buildLedgerCreateStatements = (
  entries: InventoryLedgerInput[]
): TransactionStatement[] => {
  return entries.map((entry, index) => {
    const p = `e${index}_`;
    const sets = [
      "created_at = time::now()",
      `business_date = $${p}business_date`,
      `inventory_item = $${p}inventory_item`,
      `inventory_location = $${p}inventory_location`,
      `quantity_change = $${p}quantity_change`,
      `reference_type = $${p}reference_type`,
      `reference_id = $${p}reference_id`,
      `ledger_key = $${p}ledger_key`,
    ];
    const params: Record<string, unknown> = {
      [`${p}business_date`]: entry.business_date,
      [`${p}inventory_item`]: toRecordId(entry.inventory_item),
      [`${p}inventory_location`]: toRecordId(entry.inventory_location),
      [`${p}quantity_change`]: entry.quantity_change,
      [`${p}reference_type`]: entry.reference_type,
      [`${p}reference_id`]: entry.reference_id,
      [`${p}ledger_key`]: entry.ledger_key,
    };

    if (entry.created_by) {
      sets.push(`created_by = $${p}created_by`);
      params[`${p}created_by`] = toRecordId(entry.created_by);
    }
    if (entry.unit_cost != null && Number.isFinite(entry.unit_cost)) {
      sets.push(`unit_cost = $${p}unit_cost`);
      params[`${p}unit_cost`] = entry.unit_cost;
    }
    if (entry.total_cost != null && Number.isFinite(entry.total_cost)) {
      sets.push(`total_cost = $${p}total_cost`);
      params[`${p}total_cost`] = entry.total_cost;
    }
    if (entry.reference_item) {
      sets.push(`reference_item = $${p}reference_item`);
      params[`${p}reference_item`] = entry.reference_item;
    }
    if (entry.notes) {
      sets.push(`notes = $${p}notes`);
      params[`${p}notes`] = entry.notes;
    }
    if (entry.reversal_of) {
      sets.push(`reversal_of = $${p}reversal_of`);
      params[`${p}reversal_of`] = toRecordId(entry.reversal_of);
    }
    if (entry.batch_code) {
      sets.push(`batch_code = $${p}batch_code`);
      params[`${p}batch_code`] = entry.batch_code;
    }
    if (entry.expiry_date) {
      sets.push(`expiry_date = $${p}expiry_date`);
      params[`${p}expiry_date`] = entry.expiry_date;
    }
    if (entry.manufacturing_date) {
      sets.push(`manufacturing_date = $${p}manufacturing_date`);
      params[`${p}manufacturing_date`] = entry.manufacturing_date;
    }

    return {
      sql: `CREATE ${Tables.inventory_ledger} SET ${sets.join(", ")}`,
      params,
    };
  });
};

const loadLedgerRowsForDocument = async (
  db: DatabaseClient,
  referenceType: string,
  referenceId: string
) => {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.inventory_ledger}
     WHERE reference_type = $type AND reference_id = $ref
       AND (notes = NONE OR string::starts_with(notes, 'reversal:') = false)`,
    {
      type: referenceType,
      ref: recordIdToString(referenceId) || String(referenceId),
    }
  );
  return Array.isArray(rows) ? rows : [];
};

/**
 * Generate opposite ledger rows for a posted document (never deletes history).
 */
export const reverseDocument = async (
  input: PostDocumentInput & { stampVoided?: boolean }
): Promise<ReverseDocumentResult> => {
  const strategy = POSTING_STRATEGIES[input.documentType];
  if (!strategy) {
    throw new InventoryPostingError(`Unsupported document type: ${input.documentType}`);
  }

  const documentId =
    recordIdToString(input.documentId) || String(input.documentId);

  if (input.documentType === "purchase" || input.documentType === "issue") {
    await assertCanVoid(input.db, input.documentType, documentId);
  }

  const doc = await strategy.loadDocument({
    db: input.db,
    documentId,
    userId: input.userId,
  });
  if (!doc) {
    throw new InventoryPostingError(`Document not found: ${documentId}`);
  }

  const status = normalizeDocumentStatus(doc.status);
  if (status === "voided") {
    return {
      reversed: false,
      skipped: true,
      reason: "Document already voided",
      ledgerEntryCount: 0,
    };
  }

  if (status !== "posted" && !canVoid(status)) {
    throw new InventoryPostingError(
      `Document status "${status}" cannot be reversed`
    );
  }

  const originalRows = await loadLedgerRowsForDocument(
    input.db,
    strategy.referenceType,
    documentId
  );

  const reversalEntries: InventoryLedgerInput[] = [];
  for (const row of originalRows) {
    const originalId = recordIdToString(row.id) || String(row.id);
    const ledgerKey = buildLedgerKey("reversal", originalId);
    const exists = await ledgerEntryExists(input.db, ledgerKey);
    if (exists) continue;

    const itemId = recordIdToString(row.inventory_item) || String(row.inventory_item);
    const locationId =
      recordIdToString(row.inventory_location) || String(row.inventory_location);
    const qty = Number(row.quantity_change) || 0;
    if (!itemId || !locationId || qty === 0) continue;

    let businessDate = row.business_date;
    if (!businessDate) {
      try {
        const d = toJsDate(row.created_at);
        businessDate = d?.toISOString().slice(0, 10);
      } catch {
        businessDate = new Date().toISOString().slice(0, 10);
      }
    }

    reversalEntries.push({
      created_by: input.userId,
      business_date: businessDate || new Date().toISOString().slice(0, 10),
      inventory_item: itemId,
      inventory_location: locationId,
      quantity_change: -qty,
      unit_cost: row.unit_cost != null ? Number(row.unit_cost) : undefined,
      total_cost: row.total_cost != null ? Number(row.total_cost) : undefined,
      reference_type: strategy.referenceType,
      reference_id: documentId,
      reference_item: row.reference_item
        ? String(row.reference_item)
        : undefined,
      reversal_of: originalId,
      notes: `reversal:${row.ledger_key || originalId}`,
      ledger_key: ledgerKey,
    });
  }

  const statements: TransactionStatement[] = [
    ...buildLedgerCreateStatements(reversalEntries),
  ];

  if (input.stampVoided !== false) {
    assertTransition(status, "voided");
    const voidSets = ["status = 'voided'", "voided_at = $voided_at"];
    const voidParams: Record<string, unknown> = {
      doc_id: toRecordId(documentId),
      voided_at: nowSurrealDateTime(),
    };
    if (input.userId) {
      voidSets.push("voided_by = $voided_by");
      voidParams.voided_by = toRecordId(input.userId);
    }
    statements.push({
      sql: `UPDATE $doc_id SET ${voidSets.join(", ")}`,
      params: voidParams,
    });
  }

  if (statements.length > 0) {
    await withTransaction(input.db, statements);
  }

  try {
    await publishInventoryReversed(input.integrationManager, {
      referenceType: strategy.referenceType,
      referenceId: documentId,
      ledgerEntryCount: reversalEntries.length,
      reversedBy: input.userId,
    });
  } catch (error) {
    console.warn("Failed publishing InventoryReversed event", error);
  }

  return {
    reversed: true,
    ledgerEntryCount: reversalEntries.length,
  };
};

export const voidDocument = async (
  input: PostDocumentInput
): Promise<ReverseDocumentResult> => {
  return reverseDocument({ ...input, stampVoided: true });
};

/**
 * Sole writer of inventory_ledger for business documents.
 */
export const postDocument = async (
  input: PostDocumentInput
): Promise<PostDocumentResult> => {
  const strategy = POSTING_STRATEGIES[input.documentType];
  if (!strategy) {
    throw new InventoryPostingError(`Unsupported document type: ${input.documentType}`);
  }

  const documentId =
    recordIdToString(input.documentId) || String(input.documentId);
  const ctx = {
    db: input.db,
    documentId,
    userId: input.userId,
  };

  const doc = await strategy.loadDocument(ctx);
  if (!doc) {
    throw new InventoryPostingError(`Document not found: ${documentId}`);
  }

  const status = normalizeDocumentStatus(doc.status);
  if (status === "posted" && doc.posted_at) {
    return {
      posted: false,
      skipped: true,
      reason: "Document already posted",
      ledgerEntryCount: 0,
    };
  }

  if (!canPost(status)) {
    throw new InventoryPostingError(
      `Document status "${status}" cannot be posted`
    );
  }

  assertTransition(status, "posted");

  const items = (await strategy.loadItems(ctx)) ?? doc.items ?? [];
  if (!items.length) {
    throw new InventoryPostingError("Document has no line items to post");
  }

  if (strategy.requiresAvailabilityCheck && strategy.getAvailabilityLines) {
    const lines = strategy.getAvailabilityLines(items);
    for (const line of lines) {
      const available = await fetchNetQuantity(
        input.db,
        line.itemId,
        line.locationId
      );
      if (line.quantity > available) {
        throw new InventoryPostingError(
          `Insufficient stock for item ${line.itemId}: need ${line.quantity}, available ${available}`
        );
      }
    }
  }

  // Phase 5: when posting a revision, reverse the parent first in the same flow
  const parentId = recordIdToString(doc.parent?.id ?? doc.parent);
  let parentReversalCount = 0;
  if (parentId) {
    const parentReverse = await reverseDocument({
      db: input.db,
      documentType: input.documentType,
      documentId: parentId,
      userId: input.userId,
      integrationManager: input.integrationManager,
      stampVoided: true,
    });
    parentReversalCount = parentReverse.ledgerEntryCount;
  }

  // Landed cost: allocate extras/tax/discount into final unit costs before ledger write
  let itemsForPosting = items;
  let allocationByItemId = new Map<string, LineAllocationResult>();
  let costAllocationSnapshot: any = undefined;
  if (input.documentType === "purchase") {
    const settings = await fetchInventorySettings(input.db);
    const allocation = allocatePurchaseCosts({
      lines: items.map((item: any) => ({
        id: recordIdToString(item.id) || String(item.id ?? ""),
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        taxable: item.taxable,
      })),
      extras: doc.extras,
      tax_rate: doc.tax_rate,
      tax_amount: doc.tax_amount,
      settings,
    });
    costAllocationSnapshot = {
      summary: allocation.summary,
      components: allocation.components,
      lines: allocation.lines,
      allocated_at: new Date().toISOString(),
    };
    allocationByItemId = new Map(
      allocation.lines.map((line) => [line.purchase_item_id, line])
    );
    itemsForPosting = items.map((item: any) => {
      const itemId = recordIdToString(item.id) || String(item.id ?? "");
      const line = allocationByItemId.get(itemId);
      if (!line) return item;
      return {
        ...item,
        purchase_price: line.purchase_price,
        allocated_extra_cost: line.allocated_extra_cost,
        allocated_tax: line.allocated_tax,
        allocated_discount: line.allocated_discount,
        final_unit_cost: line.final_unit_cost,
        total_inventory_cost: line.total_inventory_cost,
      };
    });
  }

  const entries = strategy.buildEntries(doc, itemsForPosting, input.userId);
  if (!entries.length) {
    throw new InventoryPostingError("No ledger entries generated from document lines");
  }

  // Prefer allocation totals for ledger total_cost (avoids per-unit rounding drift)
  if (input.documentType === "purchase" && allocationByItemId.size > 0) {
    for (const entry of entries) {
      const refItem = entry.reference_item
        ? recordIdToString(entry.reference_item) || String(entry.reference_item)
        : "";
      const line = allocationByItemId.get(refItem);
      if (!line) continue;
      entry.unit_cost = line.final_unit_cost;
      entry.total_cost = line.total_inventory_cost;
    }
  }

  const newEntries: InventoryLedgerInput[] = [];
  for (const entry of entries) {
    const key = entry.ledger_key || buildLedgerKey(entry.reference_type, entry.reference_item || "");
    const exists = await ledgerEntryExists(input.db, key);
    if (!exists) {
      newEntries.push({ ...entry, ledger_key: key });
    }
  }

  const postStampSets = [
    "status = 'posted'",
    "posted_at = $posted_at",
  ];
  const postStampParams: Record<string, unknown> = {
    doc_id: toRecordId(documentId),
    posted_at: nowSurrealDateTime(),
  };
  if (input.userId) {
    postStampSets.push("posted_by = $posted_by");
    postStampParams.posted_by = toRecordId(input.userId);
  }
  if (costAllocationSnapshot) {
    postStampSets.push("cost_allocation_snapshot = $cost_allocation_snapshot");
    postStampParams.cost_allocation_snapshot = costAllocationSnapshot;
  }

  const lineCostStatements: TransactionStatement[] = [];
  if (input.documentType === "purchase") {
    for (const [itemId, line] of allocationByItemId) {
      if (!itemId) continue;
      const p = `lc_${itemId.replace(/[^a-zA-Z0-9]/g, "_")}_`;
      lineCostStatements.push({
        sql: `UPDATE $item_id SET
          purchase_price = $${p}purchase_price,
          allocated_extra_cost = $${p}allocated_extra_cost,
          allocated_tax = $${p}allocated_tax,
          allocated_discount = $${p}allocated_discount,
          final_unit_cost = $${p}final_unit_cost,
          total_inventory_cost = $${p}total_inventory_cost`,
        params: {
          item_id: toRecordId(itemId),
          [`${p}purchase_price`]: line.purchase_price,
          [`${p}allocated_extra_cost`]: line.allocated_extra_cost,
          [`${p}allocated_tax`]: line.allocated_tax,
          [`${p}allocated_discount`]: line.allocated_discount,
          [`${p}final_unit_cost`]: line.final_unit_cost,
          [`${p}total_inventory_cost`]: line.total_inventory_cost,
        },
      });
    }
  }

  const statements: TransactionStatement[] = [
    ...lineCostStatements,
    ...buildLedgerCreateStatements(newEntries),
    {
      sql: `UPDATE $doc_id SET ${postStampSets.join(", ")}`,
      params: postStampParams,
    },
  ];

  await withTransaction(input.db, statements);

  try {
    if (input.documentType === "adjustment") {
      await publishInventoryAdjusted(input.integrationManager, {
        referenceType: strategy.referenceType,
        referenceId: documentId,
        documentNumber: doc.invoice_number,
        ledgerEntryCount: newEntries.length,
        reason: doc.reason,
        adjustedBy: input.userId,
        businessDate: newEntries[0]?.business_date,
      });
    } else {
      await publishInventoryPosted(input.integrationManager, {
        referenceType: strategy.referenceType,
        referenceId: documentId,
        documentNumber: doc.invoice_number,
        ledgerEntryCount: newEntries.length + parentReversalCount,
        postedBy: input.userId,
        businessDate: newEntries[0]?.business_date,
      });
    }
  } catch (error) {
    console.warn("Failed publishing inventory posting event", error);
  }

  return {
    posted: true,
    ledgerEntryCount: newEntries.length,
  };
};

export const approveDocument = async (
  db: DatabaseClient,
  documentType: InventoryPostingDocumentType,
  documentId: string,
  userId?: string
): Promise<void> => {
  const strategy = POSTING_STRATEGIES[documentType];
  const id = recordIdToString(documentId) || String(documentId);
  const doc = await strategy.loadDocument({ db, documentId: id, userId });
  if (!doc) {
    throw new InventoryPostingError(`Document not found: ${id}`);
  }

  const status = normalizeDocumentStatus(doc.status);
  assertTransition(status, "approved");

  const mergePayload: Record<string, unknown> = {
    status: "approved",
    approved_at: nowSurrealDateTime(),
  };
  if (userId) {
    mergePayload.approved_by = toRecordId(userId);
  }
  await db.merge(toRecordId(id), mergePayload);
};
