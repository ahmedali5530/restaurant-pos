import { useState, useCallback, useEffect } from "react";
import { Order, OrderStatus } from "@/api/model/order.ts";
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";

export interface UseFetchDeliveryOrdersOptions {
  enabled?: boolean;
}

export const useFetchDeliveryOrders = (options: UseFetchDeliveryOrdersOptions = {}) => {
  const { enabled = true } = options;

  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const fetchDeliveryOrders = useCallback(async () => {
    if (!enabled) return;

    try {
      setLoading(true);
      setError(null);

      const orders = (await posStore.getDeliveryOrdersHydrated([
        OrderStatus["In Progress"],
        OrderStatus.Pending,
      ])) as unknown as Order[];

      setDeliveryOrders(orders);
    } catch (err) {
      console.error("Error fetching delivery orders:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setDeliveryOrders([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setDeliveryOrders([]);
      setLoading(false);
      setError(null);
      return;
    }
    void fetchDeliveryOrders();

    const onWrite = () => {
      void fetchDeliveryOrders();
    };
    window.addEventListener("posr-posstore-write", onWrite);
    window.addEventListener("posr-operational-orders-updated", onWrite);
    const pollId = window.setInterval(() => void fetchDeliveryOrders(), 5_000);
    return () => {
      window.removeEventListener("posr-posstore-write", onWrite);
      window.removeEventListener("posr-operational-orders-updated", onWrite);
      window.clearInterval(pollId);
    };
  }, [enabled, fetchDeliveryOrders]);

  return {
    deliveryOrders,
    loading,
    error,
    refetch: fetchDeliveryOrders,
  };
};
