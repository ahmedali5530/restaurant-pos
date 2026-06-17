import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { StripePaymentForm } from "@/components/orders/payment/remote/gateways/stripe/stripe-payment-form.tsx";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/core/types.ts";
import { getGatewayDescriptor } from "@/lib/payment/gateway-catalog.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

export const stripeGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "stripe",
  resolveCurrency: () =>
    getGatewayDescriptor("stripe")?.currency || import.meta.env.VITE_CURRENCY || "USD",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    if (intent.clientToken) {
      toast.success(i18n.t('payment:remoteGateway.enterCardDetails'));
      return;
    }
    toast.success(i18n.t('payment:remoteGateway.intentCreated', { gateway: 'Stripe' }));
  },
  renderPendingExtra(intent: PendingRemoteIntent) {
    return <StripePaymentForm intent={intent} />;
  },
  getVerifiedSuccessMessage: () => i18n.t('payment:remoteGateway.paymentReceived', { gateway: 'Stripe' }),
};
