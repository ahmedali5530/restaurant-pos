import type {Dish} from "@/api/model/dish.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import {getPosStoreDatabase} from "@/infrastructure/pos-store/db.ts";
import {
  getCatalogById,
  getCatalogTable,
  upsertCatalogRecords,
} from "@/infrastructure/pos-store/catalog.ts";
import {Tables} from "@/api/db/tables.ts";
import {atom} from "jotai";
import {toSurrealDateTime} from "@/lib/datetime.ts";
import type {DateTime as SurrealDateTime} from "surrealdb";
import type {AppSettingsInterface} from "@/store/jotai.ts";
import type {Menu} from "@/api/model/menu.ts";

/** Shared FOH sold-qty map (dishId → units sold since available_qty_set_at). */
export const dishSoldMapAtom = atom<Map<string, number>>(new Map());

export type DishAvailabilityReason = "unavailable" | "limit" | null;

export const isManuallyAvailable = (dish: Dish | null | undefined): boolean => {
  return dish?.available !== false;
};

const normalizeDishId = (id: unknown): string => {
  const raw = String(id ?? "");
  return raw.includes(":") ? raw : raw ? `menu_item:${raw}` : "";
};

export const qtyInCart = (cart: MenuItem[] | null | undefined, dishId: string): number => {
  if (!cart?.length || !dishId) {
    return 0;
  }
  const target = normalizeDishId(dishId) || String(dishId);
  return cart.reduce((sum, line) => {
    if (line.deleted_at) {
      return sum;
    }
    const lineId = normalizeDishId(line.dish?.id) || String(line.dish?.id ?? "");
    if (lineId !== target) {
      return sum;
    }
    return sum + (Number(line.quantity) || 0);
  }, 0);
};

/**
 * Sale-window / order-item timestamps. Rejects empty objects left by
 * structuredClone(Surreal DateTime) into IndexedDB (those parse as Invalid Date
 * or, via toJsDate fallback, "now" — both zero out sold counts).
 */
export const toAvailabilityMs = (value: unknown): number | null => {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "object") {
    const obj = value as {toDate?: () => Date; toISOString?: () => string};
    // Live Surreal DateTime has no enumerable keys but exposes toDate/toISOString.
    // structuredClone(DateTime) into IndexedDB becomes a plain {} with neither.
    const hasDateApi =
      typeof obj.toDate === "function" || typeof obj.toISOString === "function";
    if (!hasDateApi && Object.keys(obj).length === 0) {
      return null;
    }
    try {
      if (typeof obj.toDate === "function") {
        const d = obj.toDate();
        const ms = d?.getTime?.();
        if (Number.isFinite(ms)) {
          return ms as number;
        }
      }
      if (typeof obj.toISOString === "function") {
        const ms = Date.parse(obj.toISOString());
        if (Number.isFinite(ms)) {
          return ms;
        }
      }
      // Avoid toJsDate() here: its fallback is `new Date()` (now), which would
      // silently treat broken stamps as "just now" and zero out sold counts.
      return null;
    } catch {
      return null;
    }
  }
  return null;
};

/** ISO stamp safe for Dexie / JSON (Surreal DateTime cannot structuredClone). */
export const toAvailabilityStampIso = (
  value: unknown,
): string | null => {
  if (value == null || value === "") {
    return null;
  }
  const ms = toAvailabilityMs(value);
  if (ms == null) {
    return null;
  }
  return new Date(ms).toISOString();
};

/** Local-catalog / settings shape — set_at always ISO string or null. */
export type LocalAvailabilityPatch = {
  available?: boolean;
  available_qty?: number | null;
  available_qty_set_at?: string | null;
};

export const toLocalAvailabilityPatch = (
  patch: AvailabilityPatch | LocalAvailabilityPatch,
): LocalAvailabilityPatch => {
  const out: LocalAvailabilityPatch = {};
  if (typeof patch.available === "boolean") {
    out.available = patch.available;
  }
  if (patch.available_qty !== undefined) {
    out.available_qty =
      patch.available_qty == null || Number.isNaN(Number(patch.available_qty))
        ? null
        : Number(patch.available_qty);
  }
  // undefined = leave unchanged; null = clear; DateTime/string = ISO
  if (patch.available_qty_set_at !== undefined) {
    out.available_qty_set_at = toAvailabilityStampIso(patch.available_qty_set_at);
  }
  return out;
};

/**
 * Units sold for a dish since `since` across local PosStore order items
 * (open + settled; skips deleted / zero qty lines).
 */
export async function getSoldQtySince(
  dishId: string,
  since: string | Date | null | undefined,
): Promise<number> {
  const sinceMs = toAvailabilityMs(since);
  if (sinceMs == null) {
    return 0;
  }
  const target = normalizeDishId(dishId);
  if (!target) {
    return 0;
  }

  const db = getPosStoreDatabase();
  const rows = await db.orderItems.where("item").equals(target).toArray();
  let total = 0;
  for (const row of rows) {
    if (row.deleted_at) {
      continue;
    }
    const qty = Number(row.quantity) || 0;
    if (qty <= 0) {
      continue;
    }
    const createdMs = toAvailabilityMs(row.created_at);
    if (createdMs == null || createdMs < sinceMs) {
      continue;
    }
    total += qty;
  }
  return total;
}

/** Batch sold counts for dishes that have a sale window. */
export async function getSoldQtyMapForDishes(
  dishes: Array<Dish | null | undefined>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const targets = dishes.filter(
    (d) =>
      d?.id &&
      d.available_qty != null &&
      toAvailabilityMs(d.available_qty_set_at) != null &&
      isManuallyAvailable(d),
  );
  await Promise.all(
    targets.map(async (dish) => {
      const id = String(dish!.id);
      const sold = await getSoldQtySince(id, dish!.available_qty_set_at);
      map.set(id, sold);
      map.set(normalizeDishId(id), sold);
    }),
  );
  return map;
}

export const soldFromMap = (
  map: Map<string, number> | undefined,
  dishId: unknown,
): number => {
  if (!map) {
    return 0;
  }
  const raw = String(dishId ?? "");
  return map.get(raw) ?? map.get(normalizeDishId(raw)) ?? 0;
};

/** Remaining sellable units, or null when unlimited / not limited. */
export const getRemainingQty = (args: {
  dish: Dish | null | undefined;
  sold: number;
  cart: MenuItem[] | null | undefined;
  /** When bumping an existing line, pass its id so its qty is not double-counted against remaining. */
  excludeCartLineId?: string;
}): number | null => {
  const {dish, sold, cart} = args;
  if (!dish || dish.available_qty == null || Number.isNaN(Number(dish.available_qty))) {
    return null;
  }
  const limit = Math.max(0, Number(dish.available_qty) || 0);
  let inCart = qtyInCart(cart, String(dish.id ?? ""));
  if (args.excludeCartLineId && cart?.length) {
    const line = cart.find((c) => String(c.id) === String(args.excludeCartLineId) && !c.deleted_at);
    if (line) {
      inCart = Math.max(0, inCart - (Number(line.quantity) || 0));
    }
  }
  return Math.max(0, limit - (Number(sold) || 0) - inCart);
};

export const canAddDishQty = (args: {
  dish: Dish | null | undefined;
  sold: number;
  cart: MenuItem[] | null | undefined;
  addQty: number;
  excludeCartLineId?: string;
  /**
   * Sale-limit checks (available_qty). Sold-out (`available === false`) is
   * always enforced; pass false when the device setting is off.
   */
  enforceLimits?: boolean;
}): {ok: boolean; remaining: number | null; reason: DishAvailabilityReason} => {
  const {dish, sold, cart, addQty} = args;
  if (!isManuallyAvailable(dish)) {
    return {ok: false, remaining: 0, reason: "unavailable"};
  }
  if (args.enforceLimits === false) {
    return {ok: true, remaining: null, reason: null};
  }
  const remaining = getRemainingQty({
    dish,
    sold,
    cart,
    excludeCartLineId: args.excludeCartLineId,
  });
  if (remaining == null) {
    return {ok: true, remaining: null, reason: null};
  }
  if (remaining <= 0 || addQty > remaining) {
    return {ok: false, remaining, reason: "limit"};
  }
  return {ok: true, remaining, reason: null};
};

/** Sold-out always blocks; sale limits only when `enforceLimits` is true. */
export const isDishBlockedOnFoh = (args: {
  enforceLimits: boolean;
  dish: Dish | null | undefined;
  sold: number;
  cart: MenuItem[] | null | undefined;
}): boolean => {
  return !canAddDishQty({
    dish: args.dish,
    sold: args.sold,
    cart: args.cart,
    addQty: 1,
    enforceLimits: args.enforceLimits,
  }).ok;
};

const dishIdsEqual = (a: unknown, b: unknown): boolean => {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left || !right) {
    return false;
  }
  return left === right || normalizeDishId(left) === normalizeDishId(right);
};

/** Overlay catalog availability fields onto a cart/menu dish snapshot. */
export const withLiveAvailability = (
  catalogDishes: Dish[] | null | undefined,
  dish: Dish | null | undefined,
): Dish | null | undefined => {
  if (!dish?.id || !catalogDishes?.length) {
    return dish;
  }
  const live = catalogDishes.find((d) => dishIdsEqual(d.id, dish.id));
  if (!live) {
    return dish;
  }
  return {
    ...dish,
    available: live.available,
    available_qty: live.available_qty,
    available_qty_set_at: live.available_qty_set_at,
  };
};

export type AvailabilityPatch = {
  available?: boolean;
  available_qty?: number | null;
  /** Surreal datetime (not ISO string) — db.merge coerces DateTime, not strings. */
  available_qty_set_at?: SurrealDateTime | null;
};

const lookupAvailabilityFields = (
  byId: Map<string, LocalAvailabilityPatch>,
  id: unknown,
): LocalAvailabilityPatch | undefined => {
  const raw = String(id ?? "");
  return byId.get(raw) ?? byId.get(normalizeDishId(id)) ?? undefined;
};

const patchNestedMenuDishes = (
  menus: Menu[] | null | undefined,
  byId: Map<string, LocalAvailabilityPatch>,
): Menu[] => {
  if (!menus?.length) {
    return menus ?? [];
  }
  return menus.map((menu) => {
    if (!menu?.items?.length) {
      return menu;
    }
    let changed = false;
    const items = menu.items.map((row) => {
      const nested = row?.menu_item;
      if (!nested?.id) {
        return row;
      }
      const fields = lookupAvailabilityFields(byId, nested.id);
      if (!fields) {
        return row;
      }
      changed = true;
      return {
        ...row,
        menu_item: {...nested, ...fields},
      };
    });
    return changed ? {...menu, items} : menu;
  });
};

async function loadCatalogDishPayload(key: string): Promise<any | undefined> {
  const direct = await getCatalogById<any>(key);
  if (direct) {
    return {...direct, id: String(direct.id ?? key)};
  }
  // Some snapshots store the bare uuid as the catalog primary key.
  const bare = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  if (bare && bare !== key) {
    const byBare = await getCatalogById<any>(bare);
    if (byBare) {
      return {...byBare, id: String(byBare.id ?? key)};
    }
  }
  const rows = await getCatalogTable<any>(Tables.dishes);
  const match = rows.find((row) => normalizeDishId(row?.id) === key);
  return match ? {...match, id: String(match.id ?? key)} : undefined;
}

/**
 * Push availability into Dexie menu_item rows + appSettings.dishes and the
 * nested menu_item copies inside appSettings.menus (FOH timed menus use those).
 * Always stores available_qty_set_at as ISO — Surreal DateTime becomes {} in IDB.
 */
export async function applyAvailabilityLocally(args: {
  patches: Array<{id: string} & (AvailabilityPatch | LocalAvailabilityPatch)>;
  setAppSettings: (
    updater: (prev: AppSettingsInterface) => AppSettingsInterface,
  ) => void;
}): Promise<void> {
  const {patches, setAppSettings} = args;
  if (!patches.length) {
    return;
  }

  const byId = new Map<string, LocalAvailabilityPatch>();
  for (const patch of patches) {
    const key = normalizeDishId(patch.id);
    if (!key) {
      continue;
    }
    const {id: _id, ...raw} = patch;
    const fields = toLocalAvailabilityPatch(raw);
    byId.set(key, fields);
    byId.set(String(patch.id), fields);
  }

  const catalogRows: any[] = [];
  for (const key of new Set(
    [...byId.keys()].map((k) => normalizeDishId(k)).filter(Boolean),
  )) {
    // Never create a sparse catalog row (would wipe name/price until sync).
    const existing = await loadCatalogDishPayload(key);
    if (!existing) {
      continue;
    }
    const fields = byId.get(key) ?? {};
    const rowId = normalizeDishId(existing.id) || key;
    catalogRows.push({
      ...existing,
      id: rowId,
      ...fields,
    });
  }
  if (catalogRows.length) {
    await upsertCatalogRecords(Tables.dishes, catalogRows);
  }

  setAppSettings((prev) => ({
    ...prev,
    dishes: (prev.dishes ?? []).map((dish) => {
      const fields = lookupAvailabilityFields(byId, dish.id);
      return fields ? {...dish, ...fields} : dish;
    }),
    menus: patchNestedMenuDishes(prev.menus, byId),
  }));
}

/**
 * Build UPDATE patch for available / available_qty.
 * Changing qty (set, change, or clear) updates the sale window stamp.
 */
export const buildAvailabilityPatch = (args: {
  available?: boolean;
  available_qty?: number | null | undefined;
  /** Previous qty to detect change; omit when forcing a stamp (bulk set). */
  previousQty?: number | null | undefined;
  stampNow?: boolean;
  now?: Date;
}): AvailabilityPatch => {
  const patch: AvailabilityPatch = {};
  if (typeof args.available === "boolean") {
    patch.available = args.available;
  }

  if (args.available_qty === undefined) {
    return patch;
  }

  const stamp = toSurrealDateTime(args.now ?? new Date());
  if (args.available_qty == null || args.available_qty === ("" as any)) {
    patch.available_qty = null;
    patch.available_qty_set_at = null;
    return patch;
  }

  const next = Number(args.available_qty);
  patch.available_qty = Number.isFinite(next) ? next : null;
  if (patch.available_qty == null) {
    patch.available_qty_set_at = null;
    return patch;
  }

  const prev =
    args.previousQty == null || args.previousQty === ("" as any)
      ? null
      : Number(args.previousQty);
  const changed =
    args.stampNow === true ||
    prev == null ||
    !Number.isFinite(prev) ||
    prev !== patch.available_qty;

  if (changed) {
    patch.available_qty_set_at = stamp;
  }
  return patch;
};
