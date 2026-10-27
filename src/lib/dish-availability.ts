import type {Dish} from "@/api/model/dish.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import type {MenuItemModifierAvailability} from "@/api/model/menu_item_modifier_availability.ts";
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

/** Contextual sold map keyed by `parentId|optionId`. */
export const modifierContextualSoldMapAtom = atom<Map<string, number>>(new Map());

export type DishAvailabilityReason = "unavailable" | "limit" | null;

export const isManuallyAvailable = (dish: Dish | null | undefined): boolean => {
  return dish?.available !== false;
};

const normalizeDishId = (id: unknown): string => {
  const raw = String(id ?? "");
  return raw.includes(":") ? raw : raw ? `menu_item:${raw}` : "";
};

export {normalizeDishId as normalizeAvailabilityDishId};

/** Loose modifier-group tree (cart `selectedGroups` or order_item `modifiers`). */
export type AvailabilityModifierGroup = {
  selectedModifiers?: Array<{
    dish?: {id?: unknown; name?: string} | null;
    quantity?: number | null;
    selectedGroups?: AvailabilityModifierGroup[] | null;
  } | null> | null;
};

/**
 * Units of `dishId` inside a modifier tree, scaled by `multiplier`
 * (usually the parent cart/order line quantity).
 */
export const countDishInModifierGroups = (
  groups: AvailabilityModifierGroup[] | null | undefined,
  dishId: string,
  multiplier = 1,
): number => {
  if (!groups?.length || !dishId || multiplier <= 0) {
    return 0;
  }
  const target = normalizeDishId(dishId) || String(dishId);
  let total = 0;
  for (const group of groups) {
    for (const mod of group?.selectedModifiers ?? []) {
      if (!mod) {
        continue;
      }
      const modQty = Math.max(1, Number(mod.quantity) || 1) * multiplier;
      const modId = normalizeDishId(mod.dish?.id) || String(mod.dish?.id ?? "");
      if (modId && modId === target) {
        total += modQty;
      }
      if (mod.selectedGroups?.length) {
        total += countDishInModifierGroups(mod.selectedGroups, dishId, modQty);
      }
    }
  }
  return total;
};

/** Top-level line qty (if match) + nested modifier usages for `dishId`. */
export const qtyContributedByCartLine = (
  line: MenuItem | null | undefined,
  dishId: string,
): number => {
  if (!line || line.deleted_at || !dishId) {
    return 0;
  }
  const lineQty = Number(line.quantity) || 0;
  if (lineQty <= 0) {
    return 0;
  }
  const target = normalizeDishId(dishId) || String(dishId);
  let total = 0;
  const lineId = normalizeDishId(line.dish?.id) || String(line.dish?.id ?? "");
  if (lineId && lineId === target) {
    total += lineQty;
  }
  total += countDishInModifierGroups(line.selectedGroups, dishId, lineQty);
  return total;
};

export const qtyInCart = (cart: MenuItem[] | null | undefined, dishId: string): number => {
  if (!cart?.length || !dishId) {
    return 0;
  }
  return cart.reduce((sum, line) => sum + qtyContributedByCartLine(line, dishId), 0);
};

/** Aggregate dish id → units reserved by the live cart (top-level + modifiers). */
export const collectDishUsageInCart = (
  cart: MenuItem[] | null | undefined,
): Map<string, number> => {
  const map = new Map<string, number>();
  if (!cart?.length) {
    return map;
  }
  for (const line of cart) {
    if (line.deleted_at) {
      continue;
    }
    const lineQty = Number(line.quantity) || 0;
    if (lineQty <= 0) {
      continue;
    }
    const bump = (rawId: unknown, qty: number) => {
      const key = normalizeDishId(rawId) || String(rawId ?? "");
      if (!key || qty <= 0) {
        return;
      }
      map.set(key, (map.get(key) ?? 0) + qty);
    };
    if (line.dish?.id) {
      bump(line.dish.id, lineQty);
    }
    const walk = (groups: AvailabilityModifierGroup[] | null | undefined, mult: number) => {
      for (const group of groups ?? []) {
        for (const mod of group?.selectedModifiers ?? []) {
          if (!mod) {
            continue;
          }
          const modQty = Math.max(1, Number(mod.quantity) || 1) * mult;
          bump(mod.dish?.id, modQty);
          if (mod.selectedGroups?.length) {
            walk(mod.selectedGroups, modQty);
          }
        }
      }
    };
    walk(line.selectedGroups, lineQty);
  }
  return map;
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
 * (open + settled; skips deleted / zero qty lines). Includes top-level
 * `order_item.item` rows and nested modifier trees on other lines.
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
  let total = 0;

  const asItem = await db.orderItems.where("item").equals(target).toArray();
  for (const row of asItem) {
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

  // Modifier usages live on other lines' `modifiers` trees — scan by created_at.
  const sinceIso = new Date(sinceMs).toISOString();
  let recent: Awaited<ReturnType<typeof db.orderItems.toArray>>;
  try {
    recent = await db.orderItems.where("created_at").aboveOrEqual(sinceIso).toArray();
  } catch {
    recent = await db.orderItems.toArray();
  }
  for (const row of recent) {
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
    if (!row.modifiers?.length) {
      continue;
    }
    total += countDishInModifierGroups(row.modifiers as AvailabilityModifierGroup[], target, qty);
  }
  return total;
}

/**
 * Units of `optionDishId` sold as a modifier under parent dish `parentDishId`
 * since `since` (contextual sale limits). Top-level sales of the option are
 * not included — only nested picks where the immediate parent is `parentDishId`.
 */
export async function getContextualSoldQtySince(
  parentDishId: string,
  optionDishId: string,
  since: string | Date | null | undefined,
): Promise<number> {
  const sinceMs = toAvailabilityMs(since);
  if (sinceMs == null) {
    return 0;
  }
  const parent = normalizeDishId(parentDishId);
  const option = normalizeDishId(optionDishId);
  if (!parent || !option) {
    return 0;
  }

  const db = getPosStoreDatabase();
  const sinceIso = new Date(sinceMs).toISOString();
  let recent: Awaited<ReturnType<typeof db.orderItems.toArray>>;
  try {
    recent = await db.orderItems.where("created_at").aboveOrEqual(sinceIso).toArray();
  } catch {
    recent = await db.orderItems.toArray();
  }

  let total = 0;
  for (const row of recent) {
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
    const lineParent = normalizeDishId(row.item) || String(row.item ?? "");
    total += countOptionUnderParent(
      row.modifiers as AvailabilityModifierGroup[] | undefined,
      parent,
      option,
      qty,
      lineParent,
    );
  }
  return total;
}

/** Walk groups; `currentParent` is the dish whose groups are open. */
export const countOptionUnderParent = (
  groups: AvailabilityModifierGroup[] | null | undefined,
  parentDishId: string,
  optionDishId: string,
  multiplier: number,
  currentParent: string,
): number => {
  if (!groups?.length || multiplier <= 0) {
    return 0;
  }
  const parent = normalizeDishId(parentDishId) || parentDishId;
  const option = normalizeDishId(optionDishId) || optionDishId;
  const cur = normalizeDishId(currentParent) || currentParent;
  let total = 0;
  for (const group of groups) {
    for (const mod of group?.selectedModifiers ?? []) {
      if (!mod) {
        continue;
      }
      const modQty = Math.max(1, Number(mod.quantity) || 1) * multiplier;
      const modId = normalizeDishId(mod.dish?.id) || String(mod.dish?.id ?? "");
      if (modId && modId === option && cur === parent) {
        total += modQty;
      }
      if (mod.selectedGroups?.length && modId) {
        total += countOptionUnderParent(mod.selectedGroups, parent, option, modQty, modId);
      }
    }
  }
  return total;
};

/** Cart units of `option` selected under immediate parent `parent`. */
export const qtyOptionUnderParentInCart = (
  cart: MenuItem[] | null | undefined,
  parentDishId: string,
  optionDishId: string,
): number => {
  if (!cart?.length) {
    return 0;
  }
  let total = 0;
  for (const line of cart) {
    if (line.deleted_at) {
      continue;
    }
    const lineQty = Number(line.quantity) || 0;
    if (lineQty <= 0) {
      continue;
    }
    const lineParent = normalizeDishId(line.dish?.id) || String(line.dish?.id ?? "");
    total += countOptionUnderParent(
      line.selectedGroups,
      parentDishId,
      optionDishId,
      lineQty,
      lineParent,
    );
  }
  return total;
};

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
      inCart = Math.max(0, inCart - qtyContributedByCartLine(line, String(dish.id ?? "")));
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

export const contextualSoldKey = (parentDishId: string, optionDishId: string): string => {
  return `${normalizeDishId(parentDishId)}|${normalizeDishId(optionDishId)}`;
};

export const refRecordId = (value: unknown): string => {
  if (value == null) {
    return "";
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    return normalizeDishId((value as {id: unknown}).id) || String((value as {id: unknown}).id ?? "");
  }
  return normalizeDishId(value) || String(value);
};

export const lookupModifierAvailability = (
  rows: MenuItemModifierAvailability[] | null | undefined,
  parentDishId: string,
  optionDishId: string,
): MenuItemModifierAvailability | undefined => {
  if (!rows?.length) {
    return undefined;
  }
  const parent = normalizeDishId(parentDishId);
  const option = normalizeDishId(optionDishId);
  return rows.find(
    (row) => refRecordId(row.parent) === parent && refRecordId(row.option) === option,
  );
};

export const soldFromContextualMap = (
  map: Map<string, number> | undefined,
  parentDishId: string,
  optionDishId: string,
): number => {
  if (!map) {
    return 0;
  }
  return map.get(contextualSoldKey(parentDishId, optionDishId)) ?? 0;
};

/** Batch contextual sold for overrides that have a sale window. */
export async function getContextualSoldQtyMap(
  rows: Array<MenuItemModifierAvailability | null | undefined>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const targets = rows.filter(
    (row) =>
      row &&
      row.available !== false &&
      row.available_qty != null &&
      toAvailabilityMs(row.available_qty_set_at) != null &&
      refRecordId(row.parent) &&
      refRecordId(row.option),
  );
  await Promise.all(
    targets.map(async (row) => {
      const parent = refRecordId(row!.parent);
      const option = refRecordId(row!.option);
      const sold = await getContextualSoldQtySince(parent, option, row!.available_qty_set_at);
      map.set(contextualSoldKey(parent, option), sold);
    }),
  );
  return map;
};

/**
 * Global option dish rules first, then optional per-parent override.
 */
export const canAddModifierOptionQty = (args: {
  parentDishId: string;
  optionDish: Dish | null | undefined;
  globalSold: number;
  contextualSold: number;
  cart: MenuItem[] | null | undefined;
  addQty: number;
  enforceLimits?: boolean;
  override?: MenuItemModifierAvailability | null;
}): {ok: boolean; remaining: number | null; reason: DishAvailabilityReason} => {
  const global = canAddDishQty({
    dish: args.optionDish,
    sold: args.globalSold,
    cart: args.cart,
    addQty: args.addQty,
    enforceLimits: args.enforceLimits,
  });
  if (!global.ok) {
    return global;
  }

  const ov = args.override;
  if (!ov) {
    return {ok: true, remaining: global.remaining, reason: null};
  }
  if (ov.available === false) {
    return {ok: false, remaining: 0, reason: "unavailable"};
  }
  if (args.enforceLimits === false || ov.available_qty == null) {
    return {ok: true, remaining: global.remaining, reason: null};
  }

  const limit = Math.max(0, Number(ov.available_qty) || 0);
  const inCart = qtyOptionUnderParentInCart(
    args.cart,
    args.parentDishId,
    String(args.optionDish?.id ?? ""),
  );
  const remaining = Math.max(0, limit - (Number(args.contextualSold) || 0) - inCart);
  if (remaining <= 0 || args.addQty > remaining) {
    return {ok: false, remaining, reason: "limit"};
  }
  return {ok: true, remaining, reason: null};
};

/** Walk cart modifier trees and enforce per-parent overrides. */
export async function findContextualCartAvailabilityViolations(args: {
  cart: MenuItem[] | null | undefined;
  overrides: MenuItemModifierAvailability[] | null | undefined;
  catalogDishes: Dish[] | null | undefined;
  contextualSoldByKey:
    | Map<string, number>
    | ((parentId: string, optionId: string, setAt: unknown) => number | Promise<number>);
  enforceLimits?: boolean;
}): Promise<CartAvailabilityViolation[]> {
  if (!args.overrides?.length || !args.cart?.length) {
    return [];
  }

  const resolveSold = async (
    parentId: string,
    optionId: string,
    setAt: unknown,
  ): Promise<number> => {
    if (typeof args.contextualSoldByKey === "function") {
      return await args.contextualSoldByKey(parentId, optionId, setAt);
    }
    return soldFromContextualMap(args.contextualSoldByKey, parentId, optionId);
  };

  const violations: CartAvailabilityViolation[] = [];
  const seen = new Set<string>();

  const visit = async (
    groups: AvailabilityModifierGroup[] | null | undefined,
    parentId: string,
    lineQty: number,
  ) => {
    for (const group of groups ?? []) {
      for (const mod of group?.selectedModifiers ?? []) {
        if (!mod?.dish?.id) {
          continue;
        }
        const optionId = normalizeDishId(mod.dish.id) || String(mod.dish.id);
        const modQty = Math.max(1, Number(mod.quantity) || 1) * lineQty;
        const key = contextualSoldKey(parentId, optionId);
        const ov = lookupModifierAvailability(args.overrides, parentId, optionId);
        if (ov && !seen.has(key)) {
          seen.add(key);
          const live =
            withLiveAvailability(args.catalogDishes, mod.dish as Dish) ?? (mod.dish as Dish);
          if (ov.available === false) {
            violations.push({
              dishId: optionId,
              name: live?.name,
              reason: "unavailable",
              remaining: 0,
            });
          } else if (
            args.enforceLimits !== false &&
            ov.available_qty != null &&
            toAvailabilityMs(ov.available_qty_set_at) != null
          ) {
            const sold = await resolveSold(parentId, optionId, ov.available_qty_set_at);
            const used = qtyOptionUnderParentInCart(args.cart, parentId, optionId);
            const limit = Math.max(0, Number(ov.available_qty) || 0);
            if (sold + used > limit) {
              violations.push({
                dishId: optionId,
                name: live?.name,
                reason: "limit",
                remaining: Math.max(0, limit - sold),
              });
            }
          }
        }
        if (mod.selectedGroups?.length) {
          await visit(mod.selectedGroups, optionId, modQty);
        }
      }
    }
  };

  for (const line of args.cart) {
    if (line.deleted_at) {
      continue;
    }
    const lineQty = Number(line.quantity) || 0;
    if (lineQty <= 0 || !line.dish?.id) {
      continue;
    }
    await visit(
      line.selectedGroups,
      normalizeDishId(line.dish.id) || String(line.dish.id),
      lineQty,
    );
  }

  return violations;
}

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

export type CartAvailabilityViolation = {
  dishId: string;
  name?: string;
  reason: Exclude<DishAvailabilityReason, null>;
  remaining: number | null;
};

/**
 * Validate that every dish used in the cart (including modifiers) fits
 * sold-out + sale-limit rules. `soldByDishId` may be a precomputed map or
 * an async lookup (e.g. fresh `getSoldQtySince` at settle).
 */
export async function findCartAvailabilityViolations(args: {
  cart: MenuItem[] | null | undefined;
  catalogDishes: Dish[] | null | undefined;
  soldByDishId:
    | Map<string, number>
    | ((dishId: string, setAt: unknown) => number | Promise<number>);
  enforceLimits?: boolean;
}): Promise<CartAvailabilityViolation[]> {
  const usage = collectDishUsageInCart(args.cart);
  if (!usage.size) {
    return [];
  }

  const resolveSold = async (dishId: string, setAt: unknown): Promise<number> => {
    if (typeof args.soldByDishId === "function") {
      return await args.soldByDishId(dishId, setAt);
    }
    return soldFromMap(args.soldByDishId, dishId);
  };

  const findDishInCart = (dishId: string): Dish | null => {
    for (const line of args.cart ?? []) {
      if (line.deleted_at) {
        continue;
      }
      if (normalizeDishId(line.dish?.id) === dishId) {
        return line.dish;
      }
      const stack: AvailabilityModifierGroup[] = [...(line.selectedGroups ?? [])];
      while (stack.length) {
        const g = stack.pop()!;
        for (const mod of g.selectedModifiers ?? []) {
          if (normalizeDishId(mod?.dish?.id) === dishId) {
            return (mod?.dish as Dish) ?? null;
          }
          if (mod?.selectedGroups?.length) {
            stack.push(...mod.selectedGroups);
          }
        }
      }
    }
    return null;
  };

  const violations: CartAvailabilityViolation[] = [];
  for (const [dishId, used] of usage) {
    const catalog =
      args.catalogDishes?.find((d) => normalizeDishId(d?.id) === dishId) ?? null;
    const dish =
      withLiveAvailability(args.catalogDishes, catalog ?? findDishInCart(dishId)) ??
      catalog ??
      findDishInCart(dishId);
    if (!dish) {
      continue;
    }
    if (!isManuallyAvailable(dish)) {
      violations.push({
        dishId,
        name: dish.name,
        reason: "unavailable",
        remaining: 0,
      });
      continue;
    }
    if (args.enforceLimits === false || dish.available_qty == null) {
      continue;
    }
    const sold = await resolveSold(dishId, dish.available_qty_set_at);
    const limit = Math.max(0, Number(dish.available_qty) || 0);
    if (sold + used > limit) {
      violations.push({
        dishId,
        name: dish.name,
        reason: "limit",
        remaining: Math.max(0, limit - sold),
      });
    }
  }
  return violations;
}

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

export type ModifierAvailabilityLocalRow = {
  id?: string;
  parent: string;
  option: string;
} & LocalAvailabilityPatch;

/**
 * Upsert/delete local catalog rows for per-parent modifier availability and
 * patch `appSettings.modifier_availability`.
 */
export async function applyModifierAvailabilityLocally(args: {
  parentId: string;
  rows: ModifierAvailabilityLocalRow[];
  /** Record ids to remove from local catalog + settings. */
  deletedIds?: string[];
  setAppSettings: (
    updater: (prev: AppSettingsInterface) => AppSettingsInterface,
  ) => void;
}): Promise<void> {
  const parentKey = normalizeDishId(args.parentId);
  if (!parentKey) {
    return;
  }

  const upserts = args.rows
    .map((row) => {
      const option = normalizeDishId(row.option);
      if (!option) {
        return null;
      }
      const id =
        row.id && String(row.id).includes(":")
          ? String(row.id)
          : row.id
            ? `menu_item_modifier_availability:${row.id}`
            : `menu_item_modifier_availability:${parentKey.replace("menu_item:", "")}_${option.replace("menu_item:", "")}`;
      return {
        id,
        parent: parentKey,
        option,
        available: row.available !== false,
        available_qty: row.available_qty ?? null,
        available_qty_set_at: row.available_qty_set_at ?? null,
      };
    })
    .filter(Boolean) as any[];

  const deleted = new Set(
    (args.deletedIds ?? []).map((id) => String(id)).filter(Boolean),
  );
  if (deleted.size) {
    const db = getPosStoreDatabase();
    await db.catalog.bulkDelete([...deleted]);
  }

  if (upserts.length) {
    await upsertCatalogRecords(Tables.dish_modifier_availability, upserts);
  }

  args.setAppSettings((prev) => {
    const others = (prev.modifier_availability ?? []).filter((row) => {
      const id = String(row.id ?? "");
      if (deleted.has(id)) {
        return false;
      }
      return refRecordId(row.parent) !== parentKey;
    });
    const nextRows: MenuItemModifierAvailability[] = upserts.map((row) => ({
      id: row.id,
      parent: row.parent,
      option: row.option,
      available: row.available,
      available_qty: row.available_qty,
      available_qty_set_at: row.available_qty_set_at,
    }));
    return {
      ...prev,
      modifier_availability: [...others, ...nextRows],
    };
  });
}
