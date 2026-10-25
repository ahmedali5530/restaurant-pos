import type {MenuItem} from "@/api/model/cart_item.ts";
import {calculateCartItemPrice, calculateCartTotal} from "@/lib/cart.ts";

export const CUSTOMER_DISPLAY_CHANNEL = "posr-customer-display";
export const CUSTOMER_DISPLAY_STORAGE_KEY = "posr-customer-display-snapshot";

export type CustomerDisplayLine = {
  id: string;
  name: string;
  quantity: number;
  lineTotal: number;
};

export type CustomerDisplaySnapshot = {
  updatedAt: number;
  lines: CustomerDisplayLine[];
  total: number;
  /** True briefly after cart clears following a paid settle. */
  thankYou?: boolean;
};

export const buildCustomerDisplaySnapshot = (
  cart: MenuItem[] | null | undefined,
  options?: {thankYou?: boolean},
): CustomerDisplaySnapshot => {
  const live = (cart ?? []).filter((line) => !line.deleted_at);
  return {
    updatedAt: Date.now(),
    lines: live.map((line) => ({
      id: String(line.id),
      name: line.dish?.name ?? "",
      quantity: Number(line.quantity) || 0,
      lineTotal: calculateCartItemPrice(line),
    })),
    total: calculateCartTotal(live),
    thankYou: options?.thankYou === true,
  };
};

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
    return parsed;
  } catch {
    return null;
  }
};
