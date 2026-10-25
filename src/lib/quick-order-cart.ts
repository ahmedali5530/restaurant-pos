import {nanoid} from "nanoid";
import type {Dish} from "@/api/model/dish.ts";
import {CartModifierGroup, MenuItem, MenuItemType} from "@/api/model/cart_item.ts";
import type {DishModifierGroup} from "@/api/model/dish_modifier_group.ts";
import {
  buildCartModifierGroups,
  cloneCartModifierGroups,
} from "@/lib/modifier-groups.ts";

export const dishNeedsModifierPrompt = (
  dish: Dish,
  groupsDishes: DishModifierGroup[],
): boolean => {
  const groups = groupsDishes.filter(
    (g) => g.in?.id?.toString() === dish.id?.toString(),
  );
  return groups.some((g) => g.has_required_modifiers || g.should_auto_open);
};

export const buildCartModifierGroupsForDish = (
  dish: Dish,
  groupsDishes: DishModifierGroup[],
  categoryName?: string,
): CartModifierGroup[] => {
  const groups = groupsDishes.filter(
    (g) => g.in?.id?.toString() === dish.id?.toString(),
  );
  return buildCartModifierGroups(
    groups,
    0,
    (grp) =>
      categoryName ||
      (grp.in?.categories?.length === 1 ? grp.in.categories[0].name : ""),
  );
};

const normalizeAddQty = (quantity: unknown, fractional?: boolean): number => {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n <= 0) {
    return 1;
  }
  if (fractional) {
    // Gram precision for scale weight lines.
    return Math.max(0.001, Math.round(n * 1000) / 1000);
  }
  return Math.max(1, Math.floor(n));
};

export const createQuickCartLine = (
  dish: Dish,
  options?: {
    selectedGroups?: CartModifierGroup[];
    categoryName?: string;
    categoryId?: string;
    quantity?: number;
    /** Allow fractional qty (scale weight in kg). */
    fractionalQty?: boolean;
    /** Absolute unit price override (scale price-embedded labels). */
    priceOverride?: number;
  },
): MenuItem => {
  const selectedGroups = options?.selectedGroups
    ? cloneCartModifierGroups(options.selectedGroups)
    : [];
  const quantity = normalizeAddQty(options?.quantity, options?.fractionalQty);
  const price =
    options?.priceOverride != null && Number.isFinite(Number(options.priceOverride))
      ? Number(options.priceOverride)
      : dish.price;

  return {
    quantity,
    dish,
    seat: undefined,
    id: nanoid(),
    level: 0,
    selectedGroups,
    newOrOld: MenuItemType.new,
    category:
      options?.categoryName ||
      (dish.categories?.length === 1 ? dish.categories[0].name : ""),
    category_id: options?.categoryId,
    price,
    menu_name: dish.menu_name,
    tax_mode: dish.tax_mode ?? "exclusive",
    taxes: dish.taxes,
  };
};

/**
 * Bump qty when the same dish is already a plain (no-modifier) new line;
 * otherwise append a new line.
 */
export const mergeOrAppendCartLine = (
  cart: MenuItem[],
  dish: Dish,
  options?: {
    selectedGroups?: CartModifierGroup[];
    categoryName?: string;
    categoryId?: string;
    quantity?: number;
    fractionalQty?: boolean;
    priceOverride?: number;
  },
): MenuItem[] => {
  const addQty = normalizeAddQty(options?.quantity, options?.fractionalQty);
  const hasGroups = (options?.selectedGroups?.length ?? 0) > 0;
  // Price-embedded scale labels should not merge (each sticker is its own priced pack).
  const canMerge = !hasGroups && options?.priceOverride == null;
  if (canMerge) {
    const existing = cart.find(
      (line) =>
        !line.deleted_at &&
        line.newOrOld === MenuItemType.new &&
        line.dish?.id?.toString() === dish.id?.toString() &&
        !(line.selectedGroups?.length),
    );
    if (existing) {
      return cart.map((line) =>
        line.id === existing.id
          ? {
              ...line,
              quantity: normalizeAddQty(
                Number(line.quantity) + addQty,
                options?.fractionalQty || !Number.isInteger(Number(line.quantity)),
              ),
            }
          : line,
      );
    }
  }

  return [createQuickCartLine(dish, {...options, quantity: addQty}), ...cart];
};
