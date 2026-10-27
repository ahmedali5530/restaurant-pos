import type {MenuItem} from "@/api/model/cart_item.ts";
import type {Tax} from "@/api/model/tax.ts";
import {getCartItemTaxableUnitBase} from "@/lib/cart.ts";
import {
  calculateCartItemsBaseTotal,
  calculateCartTotalsWithTaxes,
} from "@/lib/tax-calculator.ts";
import {safeNumber} from "@/lib/utils.ts";

export const CUSTOMER_DISPLAY_CHANNEL = "posr-customer-display";
export const CUSTOMER_DISPLAY_STORAGE_KEY = "posr-customer-display-snapshot";

export type CustomerDisplayLine = {
  id: string;
  name: string;
  quantity: number;
  /** Net/base line total (qty × unit + modifiers) — same base CartTotals uses. */
  lineTotal: number;
};

export type CustomerDisplayTaxTotal = {
  name: string;
  rate: number;
  taxAmount: number;
  /** itemsBase + taxAmount — same figure CartTotals shows per system tax. */
  total: number;
};

export type CustomerDisplaySnapshot = {
  updatedAt: number;
  lines: CustomerDisplayLine[];
  /** Cart items base before order tax (matches CartTotals "items" row). */
  itemsBase: number;
  /** Per system tax preview totals (matches CartTotals tax rows). */
  taxTotals: CustomerDisplayTaxTotal[];
  /**
   * Amount highlighted as the order total for the customer.
   * Same as CartTotals: first tax-inclusive total when taxes exist, else itemsBase.
   */
  total: number;
  /** True briefly after cart clears following a paid settle. */
  thankYou?: boolean;
};

export const buildCustomerDisplaySnapshot = (
  cart: MenuItem[] | null | undefined,
  options?: {thankYou?: boolean; taxes?: Tax[] | null},
): CustomerDisplaySnapshot => {
  const live = (cart ?? []).filter((line) => !line.deleted_at);
  const itemsBase = calculateCartItemsBaseTotal(live);
  const taxPreview = calculateCartTotalsWithTaxes(live, options?.taxes ?? []);
  const taxTotals: CustomerDisplayTaxTotal[] = taxPreview.map(({tax, taxAmount, total}) => ({
    name: String(tax.name ?? ""),
    rate: safeNumber(tax.rate),
    taxAmount,
    total,
  }));

  return {
    updatedAt: Date.now(),
    lines: live.map((line) => ({
      id: String(line.id),
      name: line.dish?.name ?? "",
      quantity: Number(line.quantity) || 0,
      lineTotal: roundLine(
        getCartItemTaxableUnitBase(line) * safeNumber(line.quantity || 1),
      ),
    })),
    itemsBase,
    taxTotals,
    total: taxTotals.length > 0 ? taxTotals[0].total : itemsBase,
    thankYou: options?.thankYou === true,
  };
};

const roundLine = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;

export const publishCustomerDisplaySnapshot = (
  snapshot: CustomerDisplaySnapshot,
): void => {
  try {
    localStorage.setItem(CUSTOMER_DISPLAY_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // private mode / quota — channel alone may still work
  }
  try {
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channel.postMessage(snapshot);
    channel.close();
  } catch {
    // BroadcastChannel unsupported
  }
};

export const readCustomerDisplaySnapshot = (): CustomerDisplaySnapshot | null => {
  try {
    const raw = localStorage.getItem(CUSTOMER_DISPLAY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CustomerDisplaySnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.lines)) {
      return null;
    }
    // Back-compat for snapshots published before tax fields existed.
    if (!Array.isArray(parsed.taxTotals)) {
      parsed.taxTotals = [];
    }
    if (typeof parsed.itemsBase !== "number") {
      parsed.itemsBase = Number(parsed.total) || 0;
    }
    return parsed;
  } catch {
    return null;
  }
};
