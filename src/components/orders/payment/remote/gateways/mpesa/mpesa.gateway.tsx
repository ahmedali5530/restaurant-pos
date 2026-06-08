import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import {
  isValidMpesaPhone,
  MPESA_POLL_INTERVAL_MS,
  MPESA_POLL_MAX_ATTEMPTS,
  normalizeMpesaPhone,
} from "@/components/orders/payment/remote/gateways/mpesa/mpesa.utils.ts";
import {
  AfterIntentCreatedInput,
  PendingRemoteIntent,
  RemotePaymentContext,
} from "@/components/orders/payment/remote/core/types.ts";
import { getOrderCustomerPhone } from "@/components/orders/payment/remote/core/utils.ts";
import { verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";

export type MpesaPhonePromptRequest = {
  amount: number;
  paymentType: RemotePaymentContext["paymentType"];
  payable: number;
  initialPhone?: string;
};

export type MpesaPhonePromptApi = {
  requestPhone: (request: MpesaPhonePromptRequest) => Promise<string | null>;
};

let mpesaPhonePromptApi: MpesaPhonePromptApi | null = null;

export function registerMpesaPhonePrompt(api: MpesaPhonePromptApi | null) {
  mpesaPhonePromptApi = api;
}

export const mpesaGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "mpesa",
  resolveCurrency: () => "KES",
  async preparePayment(context) {
    const existingPhone = getOrderCustomerPhone(context.order);
    if (isValidMpesaPhone(existingPhone)) {
      return { proceed: true, customerPhone: normalizeMpesaPhone(existingPhone!)! };
    }
    if (!mpesaPhonePromptApi) {
      toast.error("M-Pesa phone prompt is not available.");
      return { proceed: false, reason: "awaiting_input" };
    }
    const phone = await mpesaPhonePromptApi.requestPhone({
      amount: context.amount,
      paymentType: context.paymentType,
      payable: context.payable,
      initialPhone: existingPhone,
    });
    if (!phone) {
      return { proceed: false, reason: "awaiting_input" };
    }
    return { proceed: true, customerPhone: phone };
  },
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    toast.success(
      intent.clientToken
        ? `STK push sent to ${intent.clientToken}. Check phone to enter M-Pesa PIN.`
        : "STK push sent. Check phone to enter M-Pesa PIN.",
    );
  },
  startStatusPolling(pendingIntent, context, handlers) {
    let attempts = 0;
    let stopped = false;
    const timer = setInterval(() => {
      void (async () => {
        if (stopped) return;
        attempts += 1;
        if (attempts > MPESA_POLL_MAX_ATTEMPTS) {
          stopped = true;
          clearInterval(timer);
          handlers.onStatusChange("timeout");
          toast.warning("M-Pesa payment timed out. Tap Verify to check again.");
          return;
        }
        try {
          const result = await verifyPayment({
            gateway: "mpesa",
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
            toast.error(`M-Pesa payment ${result.status}.`);
            return;
          }
          handlers.onStatusChange(result.status);
        } catch {
          // Keep polling until timeout
        }
      })();
    }, MPESA_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  },
  renderPendingDetail(intent: PendingRemoteIntent) {
    if (!intent.clientToken) return null;
    return <span> · {intent.clientToken}</span>;
  },
  getVerifiedSuccessMessage: () => "M-Pesa payment received.",
};
