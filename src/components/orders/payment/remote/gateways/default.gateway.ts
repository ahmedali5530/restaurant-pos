import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { AfterIntentCreatedInput } from "@/components/orders/payment/remote/types.ts";
import { GatewayType } from "@/lib/payment.service.ts";
import { toast } from "sonner";

export function createDefaultGatewayAdapter(gateway: GatewayType): RemoteGatewayAdapter {
  return {
    gateway,
    resolveCurrency: () => import.meta.env.VITE_CURRENCY || "USD",
    preparePayment: async () => ({ proceed: true }),
    onIntentCreated({ intent }: AfterIntentCreatedInput) {
      if (intent.paymentUrl) {
        window.open(intent.paymentUrl, "_blank", "noopener,noreferrer");
        toast.success("Remote payment link generated.");
      } else if (intent.clientToken) {
        toast.success(`Remote token generated: ${intent.clientToken}`);
      } else {
        toast.success("Remote payment intent generated.");
      }
    },
  };
}
