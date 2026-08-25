import {lazy, Suspense} from "react";
import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/core/types.ts";
import { getGatewayDescriptor } from "@/lib/payment/gateway-catalog.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

const PaypalButtonsPanel = lazy(() =>
  import("@/components/orders/payment/remote/gateways/paypal/paypal-buttons.tsx").then(
    (m) => ({default: m.PaypalButtonsPanel})
  )
);

export const paypalGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "paypal",
  resolveCurrency: () =>
    getGatewayDescriptor("paypal")?.currency || import.meta.env.VITE_CURRENCY || "USD",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated(_input: AfterIntentCreatedInput) {
    toast.success(i18n.t('payment:remoteGateway.usePaypalButton'));
  },
  renderPendingExtra(intent: PendingRemoteIntent) {
    return (
      <Suspense fallback={null}>
        <PaypalButtonsPanel intent={intent} />
      </Suspense>
    );
  },
  getVerifiedSuccessMessage: () => i18n.t('payment:remoteGateway.paymentReceived', { gateway: 'PayPal' }),
};
