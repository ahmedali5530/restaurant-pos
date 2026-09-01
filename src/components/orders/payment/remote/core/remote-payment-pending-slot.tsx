import { RemotePaymentPendingList } from "@/components/orders/payment/remote/core/remote-payment-pending-list.tsx";
import { useRemotePayment } from "@/components/orders/payment/remote/core/remote-payment-context.ts";

export function RemotePaymentPendingSlot() {
  const remote = useRemotePayment();

  return (
    <RemotePaymentPendingList
      intents={remote.pendingIntents}
      verifyingIntentId={remote.verifyingIntentId}
      onVerify={(intent) => void remote.verifyPendingIntent(intent)}
      onRemove={remote.removePendingIntent}
    />
  );
}
