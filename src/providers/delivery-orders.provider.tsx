import React, { createContext, useEffect, useMemo, useState, useCallback, ReactNode, useRef } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Order, ORDER_FETCHES } from "@/api/model/order.ts";
import { useFetchDeliveryOrders } from "@/hooks/useFetchDeliveryOrders.ts";
import { dispatchPrint } from "@/lib/print.service.ts";
import { PRINT_TYPE } from "@/lib/print.registry.tsx";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai";
import { LiveSubscription } from "surrealdb";
import { toJsDate } from "@/lib/datetime.ts";
import { getUserModules } from "@/lib/access.rules.ts";

export interface DeliveryOrdersProviderState {
  deliveryOrders: Order[];
  selectedOrder: Order | null;
  openOrderPopup: (order: Order) => void;
  closeOrderPopup: () => void;
  isPopupOpen: boolean;
  refetchDeliveryOrders: () => Promise<void>;
}

export const DeliveryOrdersContext = createContext<DeliveryOrdersProviderState | undefined>(undefined);

export interface DeliveryOrdersProviderProps {
  children: ReactNode;
}

const DELIVERY_ORDER_FETCH = `FETCH ${ORDER_FETCHES.join(", ")}`;

export const DeliveryOrdersProvider: React.FC<DeliveryOrdersProviderProps> = ({ children }) => {
  const db = useDB();
  const dbRef = useRef(db);
  dbRef.current = db;
  const [{ user }] = useAtom(appPage);

  const canUseDeliveryOrders = Boolean(
    user && getUserModules(user).includes("delivery")
  );

  const { deliveryOrders, refetch: fetchDeliveryOrders } = useFetchDeliveryOrders({
    enabled: canUseDeliveryOrders,
  });
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [liveQuery, setLiveQuery] = useState<LiveSubscription | null>(null);
  const processedOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const openOrderPopup = useCallback((order: Order) => {
    setSelectedOrder(order);
    setIsPopupOpen(true);
  }, []);

  const closeOrderPopup = useCallback(() => {
    setIsPopupOpen(false);
    setSelectedOrder(null);
  }, []);

  useEffect(() => {
    if (!canUseDeliveryOrders) {
      processedOrderIdsRef.current = new Set();
      initialLoadDoneRef.current = false;
      setSelectedOrder(null);
      setIsPopupOpen(false);
    }
  }, [canUseDeliveryOrders]);

  // Update selectedOrder when deliveryOrders updates (if popup is open)
  useEffect(() => {
    if (!canUseDeliveryOrders) return;
    if (isPopupOpen && selectedOrder) {
      const selectedOrderId = selectedOrder.id.toString();
      const updatedOrder = deliveryOrders.find(
        o => o.id.toString() === selectedOrderId
      );
      if (updatedOrder && JSON.stringify(updatedOrder) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(updatedOrder);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryOrders, isPopupOpen, canUseDeliveryOrders]);

  // Track processed orders — on first load mark all existing as processed (no auto-popup),
  // on subsequent fetches only open popup for genuinely new orders.
  useEffect(() => {
    if (!canUseDeliveryOrders) return;
    if (!initialLoadDoneRef.current) {
      deliveryOrders.forEach(order => {
        processedOrderIdsRef.current.add(order.id.toString());
      });
      initialLoadDoneRef.current = true;
      return;
    }

    const newOrders = deliveryOrders.filter(order =>
      !processedOrderIdsRef.current.has(order.id.toString())
    );

    // Mark ALL new orders as processed at once
    newOrders.forEach(order => {
      processedOrderIdsRef.current.add(order.id.toString());
    });

    if (newOrders.length > 0) {
      const newestOrder = newOrders.sort((a, b) =>
        toJsDate(b.created_at).getTime() - toJsDate(a.created_at).getTime()
      )[0];

      setSelectedOrder(newestOrder);
      setIsPopupOpen(true);
    }
  }, [deliveryOrders, canUseDeliveryOrders]);

  // Set up live query to watch for new delivery orders
  useEffect(() => {
    if (!canUseDeliveryOrders) return;

    let isMounted = true;
    let querySubscription: LiveSubscription | null = null;

    const runLiveQuery = async () => {
      try {
        const result = await db.live(Tables.orders, async (action: string, result) => {
          if (!isMounted) return;

          if (action === "CREATE") {
            await fetchDeliveryOrders();

            // Only handle delivery orders
            if (result.delivery && typeof result.delivery === 'object' && Object.keys(result.delivery).length > 0) {
              try {
                const [fullOrder] = await dbRef.current.query<[Order]>(
                  `SELECT * FROM only ${result.id} ${DELIVERY_ORDER_FETCH}`
                );

                if (fullOrder) {
                  processedOrderIdsRef.current.add(result.id.toString());
                  openOrderPopup(fullOrder as unknown as Order);
                  void dispatchPrint(dbRef.current, PRINT_TYPE.delivery_bill, { order: fullOrder, userId: user?.id });
                }
              } catch (err) {
                console.error("Error fetching/printing delivery order:", err);
              }
            }
          } else if (action === "UPDATE") {
            await fetchDeliveryOrders();
          }
        });

        if (isMounted) {
          querySubscription = result;
          setLiveQuery(result);
        }
      } catch (error) {
        console.error("Error setting up live query:", error);
      }
    };

    runLiveQuery();

    return () => {
      isMounted = false;
      querySubscription?.kill().catch(console.error);
    };
  }, [canUseDeliveryOrders, fetchDeliveryOrders, user?.id, openOrderPopup]);

  const value: DeliveryOrdersProviderState = useMemo(
    () => ({
      deliveryOrders,
      selectedOrder,
      openOrderPopup,
      closeOrderPopup,
      isPopupOpen,
      refetchDeliveryOrders: fetchDeliveryOrders,
    }),
    [deliveryOrders, selectedOrder, openOrderPopup, closeOrderPopup, isPopupOpen, fetchDeliveryOrders]
  );

  return (
    <DeliveryOrdersContext.Provider value={value}>
      {children}
    </DeliveryOrdersContext.Provider>
  );
};
