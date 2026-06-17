import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { StripePaymentForm } from "@/components/orders/payment/remote/gateways/stripe/stripe-payment-form.tsx";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/core/types.ts";
import { getGatewayDescriptor } from "@/lib/payment/gateway-catalog.ts";
import { toast } from "sonner";

export const stripeGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "stripe",
  resolveCurrency: () =>
    getGatewayDescriptor("stripe")?.currency || import.meta.env.VITE_CURRENCY || "USD",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated({ intent }: AfterIntentCreatedInput) {
    if (intent.clientToken) {
      toast.success("Enter card details below to complete payment.");
      return;
    }
    toast.success("Stripe payment intent created.");
  },
  renderPendingExtra(intent: PendingRemoteIntent) {
    return <StripePaymentForm intent={intent} />;
  },
  getVerifiedSuccessMessage: () => "Stripe payment received.",
};
