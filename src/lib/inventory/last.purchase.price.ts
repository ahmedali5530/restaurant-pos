import {Tables} from "@/api/db/tables.ts";
import {toRecordId, safeNumber} from "@/lib/utils.ts";
import {resolveCatalogUnitCost} from "@/lib/inventory/line.cost.ts";

type DbLike = {
  query: (sql: string, vars?: Record<string, any>) => Promise<any>;
};

type CatalogFallback = {
  average_price?: number | null;
  price?: number | null;
} | null | undefined;

type PurchaseLineRow = {
  final_unit_cost?: number | null;
  purchase_price?: number | null;
  price?: number | null;
};

const unwrapFirst = <T>(result: unknown): T | null => {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return null;
  }
  const first = result[0] as {result?: T[]} | T[];
  const rows = Array.isArray(first)
    ? first
    : (first && typeof first === "object" && "result" in first && Array.isArray(first.result)
      ? first.result
      : []);
  return (rows[0] as T) ?? null;
};

const resolveLinePrice = (row: PurchaseLineRow | null): number | null => {
  if (!row) return null;
  if (row.final_unit_cost != null && Number.isFinite(Number(row.final_unit_cost))) {
    return safeNumber(row.final_unit_cost);
  }
  if (row.purchase_price != null && Number.isFinite(Number(row.purchase_price))) {
    return safeNumber(row.purchase_price);
  }
  if (row.price != null && Number.isFinite(Number(row.price))) {
    return safeNumber(row.price);
  }
  return null;
};

const queryLastPurchaseLine = async (
  db: DbLike,
  itemId: string,
  supplierId?: string | null,
): Promise<PurchaseLineRow | null> => {
  const params: Record<string, any> = {
    itemId: toRecordId(itemId),
  };
  const conditions = [`item = $itemId`];

  if (supplierId) {
    params.supplierId = toRecordId(supplierId);
    conditions.push(`(purchase.supplier = $supplierId OR supplier = $supplierId)`);
  }

  const query = `
    SELECT final_unit_cost, purchase_price, price
    FROM ${Tables.inventory_purchase_items}
    WHERE ${conditions.join(" AND ")}
    ORDER BY purchase.created_at DESC
    LIMIT 1
  `;

  return unwrapFirst<PurchaseLineRow>(await db.query(query, params));
};

/**
 * Last posted purchase unit cost for an item.
 * Prefers same-supplier match when supplierId is set, then any supplier,
 * then catalog average_price || price.
 */
export const getLastPurchasePrice = async (
  db: DbLike,
  itemId: string,
  options: {
    supplierId?: string | null;
    catalog?: CatalogFallback;
  } = {},
): Promise<number> => {
  if (options.supplierId) {
    const withSupplier = resolveLinePrice(
      await queryLastPurchaseLine(db, itemId, options.supplierId),
    );
    if (withSupplier != null) {
      return withSupplier;
    }
  }

  const anySupplier = resolveLinePrice(
    await queryLastPurchaseLine(db, itemId),
  );
  if (anySupplier != null) {
    return anySupplier;
  }

  return resolveCatalogUnitCost(options.catalog);
};
