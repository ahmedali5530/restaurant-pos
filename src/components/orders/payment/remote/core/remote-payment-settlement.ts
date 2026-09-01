import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { VerifyPaymentResponse } from "@/lib/payment.service.ts";

export type RemotePaymentSettler = (
  pendingIntent: PendingRemoteIntent,
  result: VerifyPaymentResponse,
) => void;

let remotePaymentSettler: RemotePaymentSettler | null = null;

export function registerRemotePaymentSettler(settler: RemotePaymentSettler | null) {
  remotePaymentSettler = settler;
}

export function settleRemotePayment(
  pendingIntent: PendingRemoteIntent,
  result: VerifyPaymentResponse,
) {
  if (!remotePaymentSettler) {
    throw new Error("Remote payment settler is not registered");
  }
  remotePaymentSettler(pendingIntent, result);
}
