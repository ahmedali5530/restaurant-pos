import {Tables} from "@/api/db/tables.ts";
import {buildCreatedAtDateConditions, unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {safeNumber} from "@/lib/utils.ts";
import {extrasTotal, itemsSubtotal} from "@/lib/inventory/purchase.totals.ts";
import type {InventoryDocumentType} from "@/lib/ai/inventory-operation-query.ts";
import type {InventoryDocumentStatus} from "@/api/model/inventory_document.ts";

export type InventoryDocumentSummary = {
  id: string;
  documentNumber?: string;
  createdAt?: unknown;
  status?: string;
  supplier?: string;
  location?: string;
  fromLocation?: string;
  toLocation?: string;
  itemCount: number;
  totalAmount: number;
  createdBy?: string;
  voidedAt?: unknown;
  voidedBy?: string;
};

const personName = (row: {first_name?: string; last_name?: string; login?: string} | null | undefined) => {
  if (!row) return undefined;
  const full = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return full || row.login || undefined;
};

const summarizeLines = (items: Array<{quantity?: unknown; price?: unknown}> | null | undefined) => ({
  itemCount: items?.length ?? 0,
  totalAmount: itemsSubtotal(items ?? []),
});

const fetchDocuments = async (
  db: DbClient,
  table: string,
  fetchClause: string,
  options: DateRangeFilter & {limit?: number; documentStatus?: InventoryDocumentStatus},
): Promise<any[]> => {
  const limit = options.limit ?? 50;
  const {conditions, params} = buildCreatedAtDateConditions(options);
  const statusConditions = options.documentStatus ? [`status = '${options.documentStatus}'`] : [];
  const allConditions = [...statusConditions, ...conditions];
  const whereClause = allConditions.length ? `WHERE ${allConditions.join(" AND ")}` : "";
  const query = `
    SELECT * FROM ${table}
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
    ${fetchClause}
  `;
  return unwrapQueryResult<any>(await db.query(query, params));
};

export const getInventoryDocuments = async (
  db: DbClient,
  options: DateRangeFilter & {
    documentType: InventoryDocumentType;
    documentStatus?: InventoryDocumentStatus;
    limit?: number;
  },
): Promise<{documentType: InventoryDocumentType; documentStatus?: InventoryDocumentStatus; count: number; documents: InventoryDocumentSummary[]}> => {
  const {documentType, documentStatus, limit = 50, ...dateRange} = options;
  let rows: any[] = [];

  switch (documentType) {
    case "purchase":
      rows = await fetchDocuments(
        db,
        Tables.inventory_purchases,
        "FETCH items, supplier, location, created_by, voided_by",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          documentNumber: row.invoice_number ?? undefined,
          createdAt: row.created_at,
          status: row.status,
          supplier: row.supplier?.name,
          location: row.location?.name,
          itemCount: row.items?.length ?? 0,
          totalAmount: itemsSubtotal(row.items) + safeNumber(row.tax_amount) + extrasTotal(row.extras),
          createdBy: personName(row.created_by),
          voidedAt: row.voided_at,
          voidedBy: personName(row.voided_by),
        })),
      };

    case "purchase_return":
      rows = await fetchDocuments(
        db,
        Tables.inventory_purchase_returns,
        "FETCH items, location, created_by, purchase",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => {
          const totals = summarizeLines(row.items);
          return {
            id: recordIdToString(row.id),
            documentNumber: row.invoice_number ?? undefined,
            createdAt: row.created_at,
            status: row.status,
            location: row.location?.name,
            ...totals,
            createdBy: personName(row.created_by),
          };
        }),
      };

    case "issue":
      rows = await fetchDocuments(
        db,
        Tables.inventory_issues,
        "FETCH items, location, created_by, issued_to",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          documentNumber: row.number != null ? String(row.number) : undefined,
          createdAt: row.created_at,
          status: row.status,
          location: row.location?.name,
          ...summarizeLines(row.items),
          createdBy: personName(row.created_by),
        })),
      };

    case "issue_return":
      rows = await fetchDocuments(
        db,
        Tables.inventory_issue_returns,
        "FETCH items, location, created_by",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          documentNumber: row.number != null ? String(row.number) : undefined,
          createdAt: row.created_at,
          status: row.status,
          location: row.location?.name,
          ...summarizeLines(row.items),
          createdBy: personName(row.created_by),
        })),
      };

    case "waste":
      rows = await fetchDocuments(
        db,
        Tables.inventory_wastes,
        "FETCH items, location, created_by",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          documentNumber: row.number != null ? String(row.number) : undefined,
          createdAt: row.created_at,
          status: row.status,
          location: row.location?.name,
          ...summarizeLines(row.items),
          createdBy: personName(row.created_by),
        })),
      };

    case "adjustment":
      rows = await fetchDocuments(
        db,
        Tables.inventory_adjustments,
        "FETCH items, location, created_by",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          createdAt: row.created_at,
          status: row.status,
          location: row.location?.name,
          itemCount: row.items?.length ?? 0,
          totalAmount: 0,
          createdBy: personName(row.created_by),
        })),
      };

    case "transfer":
      rows = await fetchDocuments(
        db,
        Tables.stock_transfers,
        "FETCH items, from_location, to_location, created_by",
        {...dateRange, limit, documentStatus},
      );
      return {
        documentType,
        documentStatus,
        count: rows.length,
        documents: rows.map(row => ({
          id: recordIdToString(row.id),
          documentNumber: row.number != null ? String(row.number) : undefined,
          createdAt: row.created_at,
          status: row.status,
          fromLocation: row.from_location?.name,
          toLocation: row.to_location?.name,
          ...summarizeLines(row.items),
          createdBy: personName(row.created_by),
        })),
      };

    default:
      return {documentType, documentStatus, count: 0, documents: []};
  }
};
