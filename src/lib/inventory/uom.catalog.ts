import {Tables} from "@/api/db/tables.ts";
import type {InventoryUomFamily, InventoryUomRecord} from "@/api/model/inventory_uom.ts";

type DatabaseClient = {
  query: (sql: string, params?: Record<string, unknown>) => Promise<unknown[][]>;
};

/** Built-in seed used as fallback and when the DB catalog is empty. */
export const DEFAULT_INVENTORY_UOM_SEED: readonly InventoryUomRecord[] = [
  {code: "KG", name: "KG", family: "weight", base_factor: 1000, is_system: true, is_active: true, sort: 10},
  {code: "G", name: "G", family: "weight", base_factor: 1, is_system: true, is_active: true, sort: 20},
  {code: "MG", name: "MG", family: "weight", base_factor: 0.001, is_system: true, is_active: true, sort: 30},
  {code: "LB", name: "LB", family: "weight", base_factor: 453.59237, is_system: true, is_active: true, sort: 40},
  {code: "OZ", name: "OZ", family: "weight", base_factor: 28.349523125, is_system: true, is_active: true, sort: 50},
  {code: "L", name: "L", family: "volume", base_factor: 1000, is_system: true, is_active: true, sort: 110},
  {code: "ML", name: "ML", family: "volume", base_factor: 1, is_system: true, is_active: true, sort: 120},
  {code: "GAL", name: "GAL", family: "volume", base_factor: 3785.411784, is_system: true, is_active: true, sort: 130},
  {code: "QT", name: "QT", family: "volume", base_factor: 946.352946, is_system: true, is_active: true, sort: 140},
  {code: "PT", name: "PT", family: "volume", base_factor: 473.176473, is_system: true, is_active: true, sort: 150},
  {code: "FLOZ", name: "FLOZ", family: "volume", base_factor: 29.5735295625, is_system: true, is_active: true, sort: 160},
  {code: "PC", name: "PC", family: "count", base_factor: 1, is_system: true, is_active: true, sort: 210},
  {code: "DZN", name: "DZN", family: "count", base_factor: 12, is_system: true, is_active: true, sort: 220},
  {code: "PK", name: "PK", family: "pack", base_factor: 1, is_system: true, is_active: true, sort: 310},
] as const;

/** @deprecated Prefer DEFAULT_INVENTORY_UOM_SEED; kept for import configs. */
export const DEFAULT_INVENTORY_UOMS = DEFAULT_INVENTORY_UOM_SEED.map((u) => u.code);

let catalogCache: InventoryUomRecord[] | null = null;

function sortCatalog(rows: InventoryUomRecord[]): InventoryUomRecord[] {
  return [...rows].sort((a, b) => (a.sort - b.sort) || a.code.localeCompare(b.code));
}

function unwrapRows(result: unknown): any[] {
  if (!Array.isArray(result)) return [];
  const first = result[0];
  if (Array.isArray(first)) return first;
  if (first && typeof first === "object" && Array.isArray((first as any).result)) {
    return (first as any).result;
  }
  return Array.isArray(result) ? (result as any[]) : [];
}

function normalizeRecord(row: any): InventoryUomRecord | null {
  const code = String(row?.code ?? "").trim().toUpperCase();
  if (!code) return null;
  const family = String(row?.family ?? "") as InventoryUomFamily;
  if (!["weight", "volume", "count", "pack"].includes(family)) return null;
  const base_factor = Number(row?.base_factor);
  if (!Number.isFinite(base_factor) || base_factor <= 0) return null;
  return {
    id: row?.id != null ? String(row.id) : undefined,
    code,
    name: String(row?.name ?? code).trim() || code,
    family,
    base_factor,
    is_system: Boolean(row?.is_system),
    is_active: row?.is_active !== false,
    sort: Number.isFinite(Number(row?.sort)) ? Number(row.sort) : 0,
  };
}

/** Replace the in-memory catalog (tests / after admin save). */
export function setInventoryUomCatalog(records: InventoryUomRecord[] | null): void {
  catalogCache = records ? sortCatalog(records.map((r) => ({...r, code: r.code.toUpperCase()}))) : null;
}

/** Sync view of the catalog; falls back to seed when not loaded. */
export function getInventoryUomCatalog(): InventoryUomRecord[] {
  return catalogCache ?? [...DEFAULT_INVENTORY_UOM_SEED];
}

export function getInventoryUomByCode(code: string | null | undefined): InventoryUomRecord | null {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase();
  return getInventoryUomCatalog().find((u) => u.code === upper) ?? null;
}

export function getActiveInventoryUoms(): InventoryUomRecord[] {
  return getInventoryUomCatalog().filter((u) => u.is_active);
}

async function fetchCatalogRows(db: DatabaseClient): Promise<InventoryUomRecord[]> {
  const result = await db.query(
    `SELECT * FROM ${Tables.inventory_uoms} ORDER BY sort ASC, code ASC`
  );
  const rows = unwrapRows(result);
  return sortCatalog(
    rows.map(normalizeRecord).filter((r): r is InventoryUomRecord => r != null)
  );
}

async function seedCatalog(db: DatabaseClient): Promise<void> {
  for (const unit of DEFAULT_INVENTORY_UOM_SEED) {
    await db.query(
      `UPSERT type::record($table, $code) SET
        code = $code,
        name = $name,
        family = $family,
        base_factor = $base_factor,
        is_system = $is_system,
        is_active = $is_active,
        sort = $sort`,
      {
        table: Tables.inventory_uoms,
        code: unit.code,
        name: unit.name,
        family: unit.family,
        base_factor: unit.base_factor,
        is_system: unit.is_system,
        is_active: unit.is_active,
        sort: unit.sort,
      }
    );
  }
}

/**
 * Load units from DB into the module cache.
 * If the table is empty, upsert the default seed then reload.
 */
export async function ensureInventoryUomCatalog(db: DatabaseClient): Promise<InventoryUomRecord[]> {
  let rows = await fetchCatalogRows(db);
  if (rows.length === 0) {
    await seedCatalog(db);
    rows = await fetchCatalogRows(db);
  }
  if (rows.length === 0) {
    // Table missing or query failed — keep working from seed.
    setInventoryUomCatalog([...DEFAULT_INVENTORY_UOM_SEED]);
    return getInventoryUomCatalog();
  }
  setInventoryUomCatalog(rows);
  return rows;
}

export async function reloadInventoryUomCatalog(db: DatabaseClient): Promise<InventoryUomRecord[]> {
  const rows = await fetchCatalogRows(db);
  if (rows.length === 0) {
    return ensureInventoryUomCatalog(db);
  }
  setInventoryUomCatalog(rows);
  return rows;
}

export async function countItemsUsingUom(
  db: DatabaseClient,
  code: string
): Promise<number> {
  const result = await db.query(
    `SELECT count() FROM ${Tables.inventory_items} WHERE string::uppercase(uom) = $code GROUP ALL`,
    {code: code.toUpperCase()}
  );
  const rows = unwrapRows(result);
  const c = Number(rows[0]?.count ?? rows[0]?.c ?? 0);
  return Number.isFinite(c) ? c : 0;
}
