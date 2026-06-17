import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import {
  JAZZCASH_POLL_INTERVAL_MS,
  JAZZCASH_POLL_MAX_ATTEMPTS,
} from "@/components/orders/payment/remote/gateways/jazzcash/jazzcash.utils.ts";
import {
  AfterIntentCreatedInput,
  PendingRemoteIntent,
} from "@/components/orders/payment/remote/core/types.ts";
import { fetchWebhookPaymentResult, verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";

export const jazzcashGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "jazzcash",
  resolveCurrency: () => "PKR",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    if (intent.paymentUrl) {
      window.open(intent.paymentUrl, "_blank", "noopener,noreferrer");
      toast.success("Complete payment on the JazzCash page, then return to POS.");
      return;
    }
    toast.success("JazzCash payment intent generated.");
  },
  startStatusPolling(pendingIntent, context, handlers) {
    let attempts = 0;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        if (stopped) return;
        attempts += 1;
        if (attempts > JAZZCASH_POLL_MAX_ATTEMPTS) {
          stopped = true;
          clearInterval(timer);
          handlers.onStatusChange("timeout");
          toast.warning("JazzCash payment timed out. Tap Verify to check again.");
          return;
        }
        try {
          const orderId = context.order.id.toString();
          const webhookResult = await fetchWebhookPaymentResult("jazzcash", orderId);
          const result =
            webhookResult ??
            (await verifyPayment({
              gateway: "jazzcash",
              intentId: pendingIntent.intentId,
              orderId,
              metadata: {
                orderId,
                invoiceNumber: context.order.invoice_number,
                paymentTypeId: pendingIntent.paymentType.id.toString(),
              },
            }));
          if (result.status === "paid" || result.status === "authorized") {
            stopped = true;
            clearInterval(timer);
            handlers.onSettled(result);
            return;
          }
          if (result.status === "failed" || result.status === "canceled") {
            stopped = true;
            clearInterval(timer);
            handlers.onStatusChange(result.status);
            toast.error(`JazzCash payment ${result.status}.`);
            return;
          }
          handlers.onStatusChange(result.status);
        } catch {
          // Keep polling until timeout
        }
      })();
    }, JAZZCASH_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  },
  renderPendingDetail(intent: PendingRemoteIntent) {
    const txnRef = intent.gatewayPayload?.txnRefNo;
    if (!txnRef || typeof txnRef !== "string") return null;
    return <span> · Ref {txnRef}</span>;
  },
  getVerifiedSuccessMessage: () => "JazzCash payment received.",
};
