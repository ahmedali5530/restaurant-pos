import type { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {
  InventoryLocation,
  InventoryLocationType,
} from "@/api/model/inventory_location.ts";
import { toRecordId } from "@/lib/utils.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";

type DatabaseClient = ReturnType<typeof useDB>;

const rows = <T = any>(result: unknown): T[] => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? (first as T[]) : [];
};

const onlyRow = <T = any>(result: unknown): T | undefined => {
  const first = Array.isArray(result) ? result[0] : undefined;
  if (Array.isArray(first)) return first[0] as T | undefined;
  return first as T | undefined;
};

/** Normalize any id into an inventory_location record id. */
export const toLocationRecordId = (locationId: string) => {
  const key = recordIdToString(locationId) || String(locationId);
  const normalized = key.includes(":") ? key : `${Tables.inventory_locations}:${key}`;
  return toRecordId(normalized);
};

export type LocationInput = {
  name: string;
  type: InventoryLocationType | string;
  is_active?: boolean;
  linked_store?: string;
  linked_kitchen?: string;
};

export const createLocation = async (
  db: DatabaseClient,
  input: LocationInput
): Promise<string> => {
  const payload: Record<string, unknown> = {
    created_at: nowSurrealDateTime(),
    name: input.name.trim(),
    type: input.type,
    is_active: input.is_active !== false,
  };
  if (input.linked_store) {
    payload.linked_store = toRecordId(input.linked_store);
  }
  if (input.linked_kitchen) {
    payload.linked_kitchen = toRecordId(input.linked_kitchen);
  }
  const [created] = await db.create(Tables.inventory_locations, payload);
  const id = recordIdToString(created?.id) || String(created?.id ?? "");
  if (!id) throw new Error("Failed to create inventory location");
  return id;
};

export const updateLocation = async (
  db: DatabaseClient,
  locationId: string,
  input: Partial<LocationInput>
): Promise<void> => {
  const payload: Record<string, unknown> = {};
  if (input.name != null) payload.name = input.name.trim();
  if (input.type != null) payload.type = input.type;
  if (input.is_active != null) payload.is_active = input.is_active;
  await db.merge(toLocationRecordId(locationId), payload);
};

export const deactivateLocation = async (
  db: DatabaseClient,
  locationId: string
): Promise<void> => {
  await db.merge(toLocationRecordId(locationId), { is_active: false });
};

/**
 * Ensure an inventory_location exists for a store (legacy sync).
 */
export const ensureLocationForStore = async (
  db: DatabaseClient,
  storeId: string,
  options?: { name?: string; type?: InventoryLocationType }
): Promise<string> => {
  const key = recordIdToString(storeId) || String(storeId);
  const storeRef = toRecordId(key.includes(":") ? key : `${Tables.inventory_stores}:${key}`);
  const existing = rows<InventoryLocation>(
    await db.query(
      `SELECT * FROM ${Tables.inventory_locations} WHERE linked_store = $store LIMIT 1`,
      { store: storeRef }
    )
  );
  if (existing[0]?.id) {
    const locationId = recordIdToString(existing[0].id) || String(existing[0].id);
    if (options?.name && existing[0].name !== options.name) {
      await db.merge(toRecordId(locationId), { name: options.name });
    }
    return locationId;
  }

  let resolvedName = options?.name;
  if (!resolvedName) {
    const store = onlyRow<{ name?: string }>(
      await db.query(`SELECT name FROM ONLY $id`, { id: storeRef })
    );
    resolvedName = store?.name || "Store";
  }

  return createLocation(db, {
    name: resolvedName,
    type: options?.type ?? "Store",
    linked_store: recordIdToString(storeRef) || String(storeRef),
  });
};

/**
 * Ensure an inventory_location exists for a kitchen (Admin POS sync).
 */
export const ensureLocationForKitchen = async (
  db: DatabaseClient,
  kitchenId: string,
  options?: { name?: string; type?: InventoryLocationType }
): Promise<string> => {
  const key = recordIdToString(kitchenId) || String(kitchenId);
  const kitchenRef = toRecordId(key.includes(":") ? key : `${Tables.kitchens}:${key}`);
  const existing = rows<InventoryLocation>(
    await db.query(
      `SELECT * FROM ${Tables.inventory_locations} WHERE linked_kitchen = $kitchen LIMIT 1`,
      { kitchen: kitchenRef }
    )
  );
  if (existing[0]?.id) {
    const locationId = recordIdToString(existing[0].id) || String(existing[0].id);
    if (options?.name && existing[0].name !== options.name) {
      await db.merge(toRecordId(locationId), { name: options.name });
    }
    return locationId;
  }

  let resolvedName = options?.name;
  if (!resolvedName) {
    const kitchen = onlyRow<{ name?: string }>(
      await db.query(`SELECT name FROM ONLY $id`, { id: kitchenRef })
    );
    resolvedName = kitchen?.name || "Kitchen";
  }

  return createLocation(db, {
    name: resolvedName,
    type: options?.type ?? "Kitchen",
    linked_kitchen: recordIdToString(kitchenRef) || String(kitchenRef),
  });
};

export const syncStoreLocations = async (db: DatabaseClient): Promise<number> => {
  const stores = rows<{ id: unknown; name?: string }>(
    await db.query(`SELECT id, name FROM ${Tables.inventory_stores}`)
  );
  for (const store of stores) {
    const storeId = recordIdToString(store.id) || String(store.id);
    if (!storeId) continue;
    await ensureLocationForStore(db, storeId, { name: store.name, type: "Store" });
  }
  return stores.length;
};

export const syncKitchenLocations = async (db: DatabaseClient): Promise<number> => {
  const kitchens = rows<{ id: unknown; name?: string }>(
    await db.query(
      `SELECT id, name FROM ${Tables.kitchens} WHERE deleted_at = NONE`
    )
  );
  for (const kitchen of kitchens) {
    const kitchenId = recordIdToString(kitchen.id) || String(kitchen.id);
    if (!kitchenId) continue;
    await ensureLocationForKitchen(db, kitchenId, {
      name: kitchen.name,
      type: "Kitchen",
    });
  }
  return kitchens.length;
};

export const syncAllInventoryLocations = async (
  db: DatabaseClient
): Promise<{ stores: number; kitchens: number }> => {
  const stores = await syncStoreLocations(db);
  const kitchens = await syncKitchenLocations(db);
  return { stores, kitchens };
};

export const listInventoryLocations = async (
  db: DatabaseClient,
  options?: { activeOnly?: boolean; types?: string[]; sync?: boolean }
): Promise<InventoryLocation[]> => {
  if (options?.sync) {
    await syncAllInventoryLocations(db);
  }

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (options?.activeOnly !== false) {
    conditions.push("(is_active = true OR is_active = NONE)");
  }
  if (options?.types?.length) {
    conditions.push("type IN $types");
    params.types = options.types;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return rows(
    await db.query(
      `SELECT * FROM ${Tables.inventory_locations}
       ${where}
       ORDER BY name ASC
       FETCH linked_store, linked_kitchen`,
      params
    )
  );
};

/** React-select options: value is location id. */
export const toLocationOptions = (
  locations: InventoryLocation[]
): Array<{ label: string; value: string }> => {
  return locations
    .map((loc) => {
      const id = recordIdToString(loc.id) || String(loc.id ?? "");
      if (!id) return null;
      const typeLabel = loc.type ? ` (${loc.type})` : "";
      return {
        label: `${loc.name}${typeLabel}`,
        value: id,
      };
    })
    .filter((opt): opt is { label: string; value: string } => !!opt);
};

/** @deprecated Use listInventoryLocations + toLocationOptions */
export const listStoreLocations = async (
  db: DatabaseClient,
  options?: { sync?: boolean }
): Promise<InventoryLocation[]> => {
  return listInventoryLocations(db, { sync: options?.sync, activeOnly: true });
};

/** @deprecated Use toLocationOptions */
export const toStoreLocationOptions = toLocationOptions;
