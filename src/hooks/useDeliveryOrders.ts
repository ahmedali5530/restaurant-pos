import { useContext } from "react";
import {DeliveryOrdersContext} from "@/providers/delivery-orders.provider.tsx";

/**
 * Hook to access delivery orders context
 */
export const useDeliveryOrders = () => {
  const context = useContext(DeliveryOrdersContext);
  if (!context) {
    throw new Error("useDeliveryOrders must be used within a DeliveryOrdersProvider");
  }
  return context;
};