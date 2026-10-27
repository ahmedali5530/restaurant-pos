import {useEffect, useRef} from "react";
import {useAtomValue} from "jotai";
import {appSettings, appState} from "@/store/jotai.ts";
import {
  buildCustomerDisplaySnapshot,
  publishCustomerDisplaySnapshot,
} from "@/lib/customer-display.ts";
import {CUSTOMER_DISPLAY} from "@/routes/posr.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import type {Tax} from "@/api/model/tax.ts";

/**
 * Keep the customer-facing display window in sync with the live cart
 * (Menu and Quick Order share appState.cart), using the same tax math as CartTotals.
 */
export function useCustomerDisplayPublisher(enabled = true): void {
  const cart = useAtomValue(appState).cart;
  const taxes = useAtomValue(appSettings).taxes;
  const prevCartLenRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const liveLen = (cart ?? []).filter((line) => !line.deleted_at).length;
    const thankYou = prevCartLenRef.current > 0 && liveLen === 0;
    prevCartLenRef.current = liveLen;
    publishCustomerDisplaySnapshot(
      buildCustomerDisplaySnapshot(cart, {thankYou, taxes}),
    );
  }, [cart, taxes, enabled]);
}

/** Open /customer-display and push the current cart snapshot first. */
export function openCustomerDisplayWindow(
  cart: MenuItem[] | null | undefined,
  taxes?: Tax[] | null,
): void {
  publishCustomerDisplaySnapshot(buildCustomerDisplaySnapshot(cart, {taxes}));
  window.open(CUSTOMER_DISPLAY, "posr-customer-display", "noopener,noreferrer");
}
