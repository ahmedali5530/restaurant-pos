import { GatewayType } from "@/lib/payment.service.ts";
import { RemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/types.ts";
import { createDefaultGatewayAdapter } from "@/components/orders/payment/remote/gateways/default.gateway.ts";
import { mpesaGatewayAdapter } from "@/components/orders/payment/remote/gateways/mpesa.gateway.tsx";

const adapters: Partial<Record<GatewayType, RemoteGatewayAdapter>> = {
  mpesa: mpesaGatewayAdapter,
};

export function getRemoteGatewayAdapter(gateway: GatewayType): RemoteGatewayAdapter {
  return adapters[gateway] ?? createDefaultGatewayAdapter(gateway);
}

export function registerRemoteGatewayAdapter(adapter: RemoteGatewayAdapter) {
  adapters[adapter.gateway] = adapter;
}
