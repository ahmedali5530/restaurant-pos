import {Order} from "@/api/model/order.ts";
import {useDB} from "@/api/db/db.ts";
import {fetchOrderCard, orderSnapshotKey} from "@/lib/order-fetch.ts";
import {hasHydratedOrderItems, mergeOrderCardSnapshot} from "@/lib/pos-order-merge.ts";
import {useCallback, useEffect, useRef, useState} from "react";

/**
 * Progressive hydrate for Orders list cards/rows:
 * starts from a light snapshot, loads ORDER_CARD_FETCHES when the element enters view.
 * PosStore-hydrated snapshots keep their items; Surreal only fills remote-only relations.
 */
export function useOrderCardHydrate(snapshot: Order) {
  const db = useDB();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [cardOrder, setCardOrder] = useState<Order | null>(() =>
    hasHydratedOrderItems(snapshot) ? snapshot : null,
  );
  const [isHydrating, setIsHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState(false);
  const snapshotKey = orderSnapshotKey(snapshot);
  const inFlightKeyRef = useRef<string | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // Apply PosStore snapshot immediately so cancel/void line state is visible
  // without waiting for a Surreal re-FETCH (which often still has live lines).
  useEffect(() => {
    if (hasHydratedOrderItems(snapshot)) {
      setCardOrder((prev) => mergeOrderCardSnapshot(snapshot, prev ?? snapshot) as Order);
    } else {
      setCardOrder(null);
    }
    setHydrateError(false);
    inFlightKeyRef.current = null;
  }, [snapshotKey, snapshot]);

  const hydrate = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    const key = orderSnapshotKey(snapshotRef.current);
    if (!force && inFlightKeyRef.current === key) {
      return;
    }
    inFlightKeyRef.current = key;
    setIsHydrating(true);
    setHydrateError(false);

    try {
      const currentSnapshot = snapshotRef.current;
      const next = await fetchOrderCard(db, currentSnapshot.id);
      if (inFlightKeyRef.current !== key) {
        return;
      }
      if (next) {
        setCardOrder(mergeOrderCardSnapshot(currentSnapshot, next) as Order);
      } else if (!hasHydratedOrderItems(currentSnapshot)) {
        setHydrateError(true);
      }
    } catch (error) {
      console.error("Order card hydrate failed", error);
      if (inFlightKeyRef.current === key) {
        setHydrateError(true);
      }
    } finally {
      if (inFlightKeyRef.current === key) {
        setIsHydrating(false);
      }
    }
  }, [db]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) {
      return;
    }

    // PosStore already has lines — still refresh remote-only relations in background.
    if (hasHydratedOrderItems(snapshotRef.current)) {
      void hydrate();
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
  }, [hydrate, snapshotKey]);

  useEffect(() => {
    const onLocalWrite = () => {
      const current = snapshotRef.current;
      if (hasHydratedOrderItems(current)) {
        setCardOrder((prev) => mergeOrderCardSnapshot(current, prev ?? current) as Order);
      }
      void hydrate({ force: true });
    };
    window.addEventListener('posr-posstore-write', onLocalWrite);
    window.addEventListener('posr-operational-orders-updated', onLocalWrite);
    return () => {
      window.removeEventListener('posr-posstore-write', onLocalWrite);
      window.removeEventListener('posr-operational-orders-updated', onLocalWrite);
    };
  }, [hydrate]);

  return {
    rootRef,
    displayOrder: cardOrder ?? snapshot,
    cardReady: cardOrder != null || hasHydratedOrderItems(snapshot),
    isHydrating,
    hydrateError,
    retryHydrate: () => hydrate({ force: true }),
  };
}
