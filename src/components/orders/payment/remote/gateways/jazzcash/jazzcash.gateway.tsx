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
import i18n from "@/lib/i18n.ts";

const GATEWAY = "JazzCash";

export const jazzcashGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "jazzcash",
  resolveCurrency: () => "PKR",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    if (intent.paymentUrl) {
      window.open(intent.paymentUrl, "_blank", "noopener,noreferrer");
      toast.success(i18n.t('payment:remoteGateway.completeOnPage', { gateway: GATEWAY }));
      return;
    }
    toast.success(i18n.t('payment:remoteGateway.intentCreated', { gateway: GATEWAY }));
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
          toast.warning(i18n.t('payment:remoteGateway.paymentTimedOut', { gateway: GATEWAY }));
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
            toast.error(i18n.t('payment:remoteGateway.paymentStatus', { gateway: GATEWAY, status: result.status }));
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
  getVerifiedSuccessMessage: () => i18n.t('payment:remoteGateway.paymentReceived', { gateway: GATEWAY }),
};
