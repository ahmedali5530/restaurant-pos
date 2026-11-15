import {useEffect, useRef, useState} from "react";
import {useAtomValue} from "jotai";
import {useDB} from "@/api/db/db.ts";
import {appSettings, appState} from "@/store/jotai.ts";
import {
  buildCustomerDisplaySnapshot,
  customerDisplayPublicPath,
  getOrCreateCustomerDisplayPairToken,
  isCustomerDisplayPaymentLocked,
  publishCustomerDisplaySnapshot,
  subscribeCustomerDisplayPaymentLock,
  upsertCustomerDisplayToSurreal,
} from "@/lib/customer-display.ts";
import {ensureTerminalIdentity} from "@/infrastructure/pos-store/identity.ts";
import {fetchOrderFull} from "@/lib/order-fetch.ts";
import type {MenuItem} from "@/api/model/cart_item.ts";
import type {Order} from "@/api/model/order.ts";
import type {Tax} from "@/api/model/tax.ts";

const SURREAL_UPSERT_DEBOUNCE_MS = 150;

/**
 * Keep the customer-facing display window in sync with the live cart
 * (Menu and Quick Order share appState.cart), using CartTotals / OrderTotals math.
 * Same-browser: localStorage + BroadcastChannel.
 * Cross-window (Tauri ↔ Chrome): debounced Surreal UPSERT keyed by terminal id.
 */
export function useCustomerDisplayPublisher(enabled = true): void {
  const cart = useAtomValue(appState).cart;
  const orderRef = useAtomValue(appState).order;
  const taxes = useAtomValue(appSettings).taxes;
  const prevCartLenRef = useRef(0);
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;
  const terminalIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loadedOrder, setLoadedOrder] = useState<Order | null>(null);
  const cartRef = useRef(cart);
  const taxesRef = useRef(taxes);
  const loadedOrderRef = useRef(loadedOrder);
  const enabledRef = useRef(enabled);
  cartRef.current = cart;
  taxesRef.current = taxes;
  loadedOrderRef.current = loadedOrder;
  enabledRef.current = enabled;

  useEffect(() => {
    let cancelled = false;
    void ensureTerminalIdentity()
      .then((identity) => {
        if (!cancelled) {
          terminalIdRef.current = identity.terminalId;
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror Payment: load full order when a check is open so attached totals show.
  useEffect(() => {
    const orderId = orderRef?.id;
    if (!orderId || orderId === "new") {
      setLoadedOrder(null);
      return;
    }

    let cancelled = false;
    void fetchOrderFull(dbRef.current, orderId)
      .then((order) => {
        if (!cancelled) {
          setLoadedOrder(order ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedOrder(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orderRef?.id]);

  const publishNow = (opts?: {forceThankYou?: boolean}) => {
    if (!enabledRef.current || isCustomerDisplayPaymentLocked()) {
      return;
    }

    const currentCart = cartRef.current;
    const liveLen = (currentCart ?? []).filter((line) => !line.deleted_at).length;
    const thankYou =
      opts?.forceThankYou === true ||
      (prevCartLenRef.current > 0 && liveLen === 0);
    prevCartLenRef.current = liveLen;

    // Empty cart: never keep order lines (settle/close must clear the display).
    const orderForSnapshot = liveLen > 0 ? loadedOrderRef.current : null;
    const snapshot = buildCustomerDisplaySnapshot(currentCart, {
      thankYou,
      taxes: taxesRef.current,
      order: orderForSnapshot,
    });
    publishCustomerDisplaySnapshot(snapshot);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      if (isCustomerDisplayPaymentLocked()) {
        return;
      }
      const terminalId = terminalIdRef.current;
      if (!terminalId) {
        return;
      }
      void upsertCustomerDisplayToSurreal(dbRef.current, snapshot, terminalId);
    }, SURREAL_UPSERT_DEBOUNCE_MS);
  };

  useEffect(() => {
    publishNow();
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [cart, taxes, enabled, loadedOrder]);

  // Payment modal released the lock — republish cart/idle even if cart deps unchanged.
  useEffect(() => {
    return subscribeCustomerDisplayPaymentLock(() => {
      publishNow();
    });
  }, []);
}

/** Open /customer-display?terminal=… and push the current cart snapshot first. */
export async function openCustomerDisplayWindow(
  cart: MenuItem[] | null | undefined,
  taxes?: Tax[] | null,
  db?: {upsert: (thing: any, data: any) => Promise<unknown>; select?: any; query?: any},
  order?: Order | null,
): Promise<void> {
  const liveLen = (cart ?? []).filter((line) => !line.deleted_at).length;
  const snapshot = buildCustomerDisplaySnapshot(cart, {
    taxes,
    order: liveLen > 0 ? order ?? null : null,
  });
  publishCustomerDisplaySnapshot(snapshot);

  let terminalId = "";
  try {
    terminalId = (await ensureTerminalIdentity()).terminalId;
  } catch {
    // identity store unavailable — open without pairing query
  }

  const pairToken = terminalId ? getOrCreateCustomerDisplayPairToken(terminalId) : "";
  if (db && terminalId) {
    void upsertCustomerDisplayToSurreal(db, snapshot, terminalId, pairToken);
  }

  const path = terminalId
    ? customerDisplayPublicPath(terminalId, pairToken)
    : "/customer-display";
  window.open(path, "posr-customer-display", "noopener,noreferrer");

  // Always copy the absolute pairing URL so a second browser can open it without login.
  if (terminalId) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    } catch {
      // clipboard may be denied
    }
  }
}
