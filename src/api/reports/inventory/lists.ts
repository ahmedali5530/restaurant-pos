import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";

type ListOptions = {search?: string; limit?: number};

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() || "";
const matchesSearch = (haystack: string, search: string) =>
  !search || haystack.toLowerCase().includes(search);

export const listSuppliers = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, phone, email FROM ${Tables.inventory_suppliers}
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    phone?: string;
    email?: string;
  }>(await db.query(query));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      phone: row.phone ?? "",
      email: row.email ?? "",
    }))
    .filter(row =>
      matchesSearch(row.name, search)
      || matchesSearch(row.phone ?? "", search)
      || matchesSearch(row.email ?? "", search),
    );
};

export const listInventoryLocations = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, type, is_active FROM ${Tables.inventory_locations}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    type?: string;
    is_active?: boolean;
  }>(await db.query(query));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      type: row.type ?? "",
      is_active: row.is_active !== false,
    }))
    .filter(row => matchesSearch(row.name, search) || matchesSearch(row.type ?? "", search));
};
