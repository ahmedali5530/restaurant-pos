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
import { fetchWebhookPaymentResult, verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

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
      toast.error(i18n.t('payment:remoteGateway.mpesaPhoneUnavailable'));
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
        ? i18n.t('payment:remoteGateway.mpesaPromptSent', { phone: intent.clientToken })
        : i18n.t('payment:remoteGateway.mpesaPromptSentGeneric'),
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
          toast.warning(i18n.t('payment:remoteGateway.paymentTimedOut', { gateway: 'M-Pesa' }));
          return;
        }
        try {
          const orderId = context.order.id.toString();
          const webhookResult = await fetchWebhookPaymentResult("mpesa", orderId);
          const result =
            webhookResult ??
            (await verifyPayment({
              gateway: "mpesa",
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
            toast.error(i18n.t('payment:remoteGateway.paymentStatus', { gateway: 'M-Pesa', status: result.status }));
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
  getVerifiedSuccessMessage: () => i18n.t('payment:remoteGateway.paymentReceived', { gateway: 'M-Pesa' }),
};
