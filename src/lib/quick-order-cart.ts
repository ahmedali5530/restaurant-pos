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

export const createQuickCartLine = (
  dish: Dish,
  options?: {
    selectedGroups?: CartModifierGroup[];
    categoryName?: string;
    categoryId?: string;
    quantity?: number;
  },
): MenuItem => {
  const selectedGroups = options?.selectedGroups
    ? cloneCartModifierGroups(options.selectedGroups)
    : [];
  const quantity = Math.max(1, Math.floor(Number(options?.quantity) || 1));

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
    price: dish.price,
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
  },
): MenuItem[] => {
  const addQty = Math.max(1, Math.floor(Number(options?.quantity) || 1));
  const hasGroups = (options?.selectedGroups?.length ?? 0) > 0;
  if (!hasGroups) {
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
          ? {...line, quantity: line.quantity + addQty}
          : line,
      );
    }
  }

  return [createQuickCartLine(dish, {...options, quantity: addQty}), ...cart];
};
