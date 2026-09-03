import {Order} from "@/api/model/order.ts";
import {useDB} from "@/api/db/db.ts";
import {fetchOrderCard, orderSnapshotKey} from "@/lib/order-fetch.ts";
import {useCallback, useEffect, useRef, useState} from "react";

/**
 * Progressive hydrate for Orders list cards/rows:
 * starts from a light snapshot, loads ORDER_CARD_FETCHES when the element enters view.
 */
export function useOrderCardHydrate(snapshot: Order) {
  const db = useDB();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [cardOrder, setCardOrder] = useState<Order | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState(false);
  const snapshotKey = orderSnapshotKey(snapshot);
  const inFlightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setCardOrder(null);
    setHydrateError(false);
    setIsHydrating(false);
    inFlightKeyRef.current = null;
  }, [snapshotKey]);

  const hydrate = useCallback(async () => {
    if (inFlightKeyRef.current === snapshotKey) {
      return;
    }
    inFlightKeyRef.current = snapshotKey;
    setIsHydrating(true);
    setHydrateError(false);

    try {
      const next = await fetchOrderCard(db, snapshot.id);
      if (inFlightKeyRef.current !== snapshotKey) {
        return;
      }
      if (next) {
        setCardOrder(next);
      } else {
        setHydrateError(true);
      }
    } catch (error) {
      console.error("Order card hydrate failed", error);
      if (inFlightKeyRef.current === snapshotKey) {
        setHydrateError(true);
      }
    } finally {
      if (inFlightKeyRef.current === snapshotKey) {
        setIsHydrating(false);
      }
    }
  }, [db, snapshot.id, snapshotKey]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || cardOrder) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      void hydrate();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void hydrate();
          observer.disconnect();
        }
      },
      {root: null, rootMargin: "240px 120px", threshold: 0.01},
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [cardOrder, hydrate, snapshotKey]);

  return {
    rootRef,
    displayOrder: cardOrder ?? snapshot,
    cardReady: cardOrder != null,
    isHydrating,
    hydrateError,
    retryHydrate: hydrate,
  };
}
