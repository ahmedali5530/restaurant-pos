import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { RazorpayCheckoutButton } from "@/components/orders/payment/remote/gateways/razorpay/razorpay-checkout-button.tsx";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/core/types.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

export const razorpayGatewayAdapter: RemoteGatewayAdapter = {
  gateway: "razorpay",
  resolveCurrency: () => "INR",
  preparePayment: async () => ({ proceed: true }),
  onIntentCreated(_input: AfterIntentCreatedInput) {
    toast.success(i18n.t('payment:remoteGateway.useRazorpayButton'));
  },
  renderPendingExtra(intent: PendingRemoteIntent) {
    return <RazorpayCheckoutButton intent={intent} />;
  },
  getVerifiedSuccessMessage: () => i18n.t('payment:remoteGateway.paymentReceived', { gateway: 'Razorpay' }),
};
