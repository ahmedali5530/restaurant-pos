import { GatewayType } from "@/lib/payment.service.ts";
import { GATEWAY_CATALOG } from "@/lib/payment/gateway-catalog.ts";
import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { createDefaultGatewayAdapter } from "@/components/orders/payment/remote/gateways/default.gateway.ts";
import { mpesaGatewayAdapter } from "@/components/orders/payment/remote/gateways/mpesa/index.ts";
import { telebirrGatewayAdapter } from "@/components/orders/payment/remote/gateways/telebirr/index.ts";
import { stripeGatewayAdapter } from "@/components/orders/payment/remote/gateways/stripe/index.ts";
import { paypalGatewayAdapter } from "@/components/orders/payment/remote/gateways/paypal/index.ts";
import { razorpayGatewayAdapter } from "@/components/orders/payment/remote/gateways/razorpay/index.ts";
import { jazzcashGatewayAdapter } from "@/components/orders/payment/remote/gateways/jazzcash/index.ts";

const customAdapters: Partial<Record<GatewayType, RemoteGatewayAdapter>> = {
  mpesa: mpesaGatewayAdapter,
  telebirr: telebirrGatewayAdapter,
  stripe: stripeGatewayAdapter,
  paypal: paypalGatewayAdapter,
  razorpay: razorpayGatewayAdapter,
  jazzcash: jazzcashGatewayAdapter,
};

const adapters: Partial<Record<GatewayType, RemoteGatewayAdapter>> = Object.fromEntries(
  GATEWAY_CATALOG.map((descriptor) => [
    descriptor.id as GatewayType,
    customAdapters[descriptor.id as GatewayType] ??
      createDefaultGatewayAdapter(descriptor.id as GatewayType),
  ]),
);

export function getRemoteGatewayAdapter(gateway: GatewayType): RemoteGatewayAdapter {
  return adapters[gateway] ?? createDefaultGatewayAdapter(gateway);
}

export function registerRemoteGatewayAdapter(adapter: RemoteGatewayAdapter) {
  adapters[adapter.gateway] = adapter;
}
