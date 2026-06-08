import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import {
  TELEBIRR_POLL_INTERVAL_MS,
  TELEBIRR_POLL_MAX_ATTEMPTS,
} from "@/components/orders/payment/remote/gateways/telebirr/telebirr.utils.ts";
import { TelebirrQrDisplay } from "@/components/orders/payment/remote/gateways/telebirr/telebirr-qr-display.tsx";
import {
  AfterIntentCreatedInput,
  PendingRemoteIntent,
} from "@/components/orders/payment/remote/core/types.ts";
import { verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";

export const telebirrGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "telebirr",
  resolveCurrency: () => "ETB",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    if (intent.paymentUrl) {
      toast.success("Scan the QR code with the Telebirr app to pay.");
      return;
    }
    toast.success("Telebirr payment intent generated.");
  },
  startStatusPolling(pendingIntent, context, handlers) {
    let attempts = 0;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        if (stopped) return;
        attempts += 1;
        if (attempts > TELEBIRR_POLL_MAX_ATTEMPTS) {
          stopped = true;
          clearInterval(timer);
          handlers.onStatusChange("timeout");
          toast.warning("Telebirr payment timed out. Tap Verify to check again.");
          return;
        }
        try {
          const result = await verifyPayment({
            gateway: "telebirr",
            intentId: pendingIntent.intentId,
            orderId: context.order.id.toString(),
            metadata: {
              orderId: context.order.id.toString(),
              invoiceNumber: context.order.invoice_number,
              paymentTypeId: pendingIntent.paymentType.id.toString(),
            },
          });
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
            toast.error(`Telebirr payment ${result.status}.`);
            return;
          }
          handlers.onStatusChange(result.status);
        } catch {
          // Keep polling until timeout
        }
      })();
    }, TELEBIRR_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  },
  renderPendingDetail(intent: PendingRemoteIntent) {
    if (!intent.clientToken) return null;
    return <span> · {intent.clientToken}</span>;
  },
  renderPendingExtra(intent: PendingRemoteIntent) {
    if (!intent.paymentUrl) return null;
    return <TelebirrQrDisplay value={intent.paymentUrl} amount={intent.amount} />;
  },
  getVerifiedSuccessMessage: () => "Telebirr payment received.",
};
