/**
 * Inventory quantity and cost precision.
 * Configure with VITE_INVENTORY_DECIMAL_PLACES (default 4).
 * Independent of VITE_DECIMAL_PLACES (POS/UI currency display).
 */

import {formatNumber, withCurrency} from "@/lib/utils.ts";

const parseDecimals = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 12) {
    return fallback;
  }
  return Math.floor(n);
};

export const INVENTORY_DECIMAL_PLACES = parseDecimals(
  import.meta.env.VITE_INVENTORY_DECIMAL_PLACES,
  4,
);

const inventoryFactor = 10 ** INVENTORY_DECIMAL_PLACES;
const inventoryUnit = 1 / inventoryFactor;

/** Round a quantity or inventory money/cost value to inventory precision. */
export const roundInventory = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value + Number.EPSILON) * inventoryFactor) / inventoryFactor;
};

/** Alias — qty and cost share the same inventory precision. */
export const roundInventoryQty = roundInventory;

/** Alias — qty and cost share the same inventory precision. */
export const roundInventoryMoney = roundInventory;

/** Format currency using inventory decimal places. */
export const withInventoryCurrency = (
  amount: string | number | undefined,
  currency?: string,
): string => {
  if (currency) {
    return withCurrency(amount, INVENTORY_DECIMAL_PLACES, currency);
  }
  return withCurrency(amount, INVENTORY_DECIMAL_PLACES);
};

/** Format a plain inventory quantity/cost number. */
export const formatInventoryNumber = (amount: string | number): string =>
  formatNumber(amount, INVENTORY_DECIMAL_PLACES);

/**
 * Largest-remainder allocation at inventory precision so line amounts sum to total.
 */
export const allocateInventoryProportionally = (
  total: number,
  weights: {id: string; weight: number}[],
): {id: string; amount: number}[] => {
  if (weights.length === 0) {
    return [];
  }

  const weightSum = weights.reduce((sum, weight) => sum + weight.weight, 0);
  if (weightSum <= 0) {
    return weights.map((weight) => ({id: weight.id, amount: 0}));
  }

  const rounded = weights.map((weight) => {
    const raw = (total * weight.weight) / weightSum;
    const floored = Math.floor(raw * inventoryFactor) / inventoryFactor;
    return {id: weight.id, amount: floored, remainder: raw - floored};
  });

  let allocated = rounded.reduce((sum, row) => sum + row.amount, 0);
  let remainder = roundInventory(total - allocated);
  const sorted = [...rounded].sort((a, b) => b.remainder - a.remainder);

  let i = 0;
  while (remainder >= inventoryUnit - Number.EPSILON && sorted.length > 0) {
    const index = i % sorted.length;
    sorted[index].amount = roundInventory(sorted[index].amount + inventoryUnit);
    remainder = roundInventory(remainder - inventoryUnit);
    i += 1;
    if (i > 100000) {
      break;
    }
  }

  return sorted.map(({id, amount}) => ({id, amount: roundInventory(amount)}));
};
