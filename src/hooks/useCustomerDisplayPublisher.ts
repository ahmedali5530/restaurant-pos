import {useEffect, useRef} from "react";
import {useAtomValue} from "jotai";
import {appState} from "@/store/jotai.ts";
import {
  buildCustomerDisplaySnapshot,
  publishCustomerDisplaySnapshot,
} from "@/lib/customer-display.ts";
import {CUSTOMER_DISPLAY} from "@/routes/posr.ts";

/**
 * Keep the customer-facing display window in sync with the live cart
 * (Menu and Quick Order share appState.cart).
 */
export function useCustomerDisplayPublisher(enabled = true): void {
  const cart = useAtomValue(appState).cart;
  const prevCartLenRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const liveLen = (cart ?? []).filter((line) => !line.deleted_at).length;
    const thankYou = prevCartLenRef.current > 0 && liveLen === 0;
    prevCartLenRef.current = liveLen;
    publishCustomerDisplaySnapshot(
      buildCustomerDisplaySnapshot(cart, {thankYou}),
    );
  }, [cart, enabled]);
}

/** Open /customer-display and push the current cart snapshot first. */
export function openCustomerDisplayWindow(cart: Parameters<typeof buildCustomerDisplaySnapshot>[0]): void {
  publishCustomerDisplaySnapshot(buildCustomerDisplaySnapshot(cart));
  window.open(CUSTOMER_DISPLAY, "posr-customer-display", "noopener,noreferrer");
}
