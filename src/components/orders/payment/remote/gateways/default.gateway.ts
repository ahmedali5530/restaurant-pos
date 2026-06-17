import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/core/types.ts";
import { GatewayType } from "@/lib/payment.service.ts";
import { getGatewayDescriptor } from "@/lib/payment/gateway-catalog.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

export function createDefaultGatewayAdapter(gateway: GatewayType): RemoteGatewayAdapter {
  return {
    gateway,
    resolveCurrency: () =>
      getGatewayDescriptor(gateway)?.currency || import.meta.env.VITE_CURRENCY || "USD",
    preparePayment: async () => ({ proceed: true }),
    onIntentCreated({ intent }: AfterIntentCreatedInput) {
      if (intent.paymentUrl) {
        window.open(intent.paymentUrl, "_blank", "noopener,noreferrer");
        toast.success(i18n.t('payment:remoteGateway.linkGenerated'));
      } else if (intent.clientToken) {
        toast.success(i18n.t('payment:remoteGateway.tokenGenerated', { token: intent.clientToken }));
      } else {
        toast.success(i18n.t('payment:remoteGateway.intentGenerated'));
      }
    },
  };
}
