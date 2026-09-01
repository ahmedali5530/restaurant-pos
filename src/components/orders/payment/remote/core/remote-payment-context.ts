import { createContext, useContext } from "react";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { PaymentType } from "@/api/model/payment_type.ts";

export type RemotePaymentContextValue = {
  startRemotePayment: (
    amount: string | number,
    paymentType: PaymentType,
    payable: number,
  ) => Promise<void>;
  isProcessing: boolean;
  pendingIntents: PendingRemoteIntent[];
  verifyingIntentId: string | null;
  verifyPendingIntent: (intent: PendingRemoteIntent) => Promise<void>;
  removePendingIntent: (localIntentId: string) => void;
};

export const RemotePaymentContext = createContext<RemotePaymentContextValue | null>(null);

export function useRemotePayment() {
  const ctx = useContext(RemotePaymentContext);
  if (!ctx) {
    throw new Error("useRemotePayment must be used within RemotePaymentProvider");
  }
  return ctx;
}
