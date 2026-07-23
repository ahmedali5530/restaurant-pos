import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  InventoryInvoiceDoc,
  mapIssueReturnToInvoice,
  mapIssueToInvoice,
  mapPurchaseOrderToInvoice,
  mapPurchaseReturnToInvoice,
  mapPurchaseToInvoice,
  mapStockTransferToInvoice,
  mapWasteToInvoice,
} from "@/lib/inventory/invoice.mapper.ts";
import type {InventoryPrintDocType} from "@/routes/posr.ts";
import {getStockTransfer} from "@/lib/inventory/stock_transfer.service.ts";

type DbClient = {
  query: (sql: string, vars?: Record<string, unknown>) => Promise<any[]>;
};

type Loader = {
  load: (db: DbClient, id: string) => Promise<InventoryInvoiceDoc | null>;
};

const selectOnly = async (db: DbClient, table: string, id: string, fetch: string[]) => {
  const fetchClause = fetch.length > 0 ? ` FETCH ${fetch.join(", ")}` : "";
  const [row] = await db.query(
    `SELECT * FROM ONLY $id${fetchClause}`,
    {id: toRecordId(id.includes(":") ? id : `${table}:${id}`)},
  );
  return row ?? null;
};

const loaders: Record<InventoryPrintDocType, Loader> = {
  purchase: {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_purchases, id, [
        "supplier",
        "purchase_order",
        "items",
        "items.item",
        "items.supplier",
        "items.location",
        "items.store",
        "created_by",
        "store",
      ]);
      return row ? mapPurchaseToInvoice(row) : null;
    },
  },
  "purchase-return": {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_purchase_returns, id, [
        "purchase",
        "purchase.supplier",
        "purchase.items",
        "purchase.items.item",
        "items",
        "items.item",
        "items.purchase_item",
        "items.purchase_item.location",
        "items.purchase_item.store",
        "items.purchase_item.supplier",
        "items.location",
        "items.store",
        "items.supplier",
        "created_by",
      ]);
      return row ? mapPurchaseReturnToInvoice(row) : null;
    },
  },
  "purchase-order": {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_purchase_orders, id, [
        "supplier",
        "items",
        "items.item",
        "items.supplier",
        "items.store",
      ]);
      return row ? mapPurchaseOrderToInvoice(row) : null;
    },
  },
  issue: {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_issues, id, [
        "issued_to",
        "created_by",
        "kitchen",
        "items",
        "items.item",
        "items.location",
        "items.store",
      ]);
      return row ? mapIssueToInvoice(row) : null;
    },
  },
  "issue-return": {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_issue_returns, id, [
        "issuance",
        "issuance.items",
        "issuance.items.item",
        "issuance.items.store",
        "issued_to",
        "kitchen",
        "created_by",
        "items",
        "items.item",
        "items.issued_item",
        "items.issued_item.store",
        "items.store",
      ]);
      return row ? mapIssueReturnToInvoice(row) : null;
    },
  },
  waste: {
    load: async (db, id) => {
      const row = await selectOnly(db, Tables.inventory_wastes, id, [
        "purchase",
        "purchase.items",
        "purchase.items.item",
        "issue",
        "issue.items",
        "issue.items.item",
        "items",
        "items.item",
        "items.purchase_item",
        "items.issue_item",
        "created_by",
      ]);
      return row ? mapWasteToInvoice(row) : null;
    },
  },
  "stock-transfer": {
    load: async (db, id) => {
      const row = await getStockTransfer(db as any, id);
      return row ? mapStockTransferToInvoice(row) : null;
    },
  },
};

export const isInventoryPrintDocType = (value: string): value is InventoryPrintDocType =>
  Object.prototype.hasOwnProperty.call(loaders, value);

export const loadInventoryPrintDoc = async (
  db: DbClient,
  type: string,
  id: string,
): Promise<InventoryInvoiceDoc | null> => {
  if (!isInventoryPrintDocType(type)) {
    return null;
  }
  return loaders[type].load(db, decodeURIComponent(id));
};
