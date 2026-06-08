import { ReactNode } from "react";
import { GatewayType, VerifyPaymentResponse } from "@/lib/payment.service.ts";
import {
  AfterIntentCreatedInput,
  PendingRemoteIntent,
  RemotePaymentContext,
} from "@/components/orders/payment/remote/core/types.ts";

export type PrepareRemotePaymentResult =
  | { proceed: true; customerPhone?: string }
  | { proceed: false; reason: "awaiting_input" };

export interface RemoteGatewayAdapter {
  readonly gateway: GatewayType;
  resolveCurrency(): string;
  preparePayment(context: RemotePaymentContext): Promise<PrepareRemotePaymentResult>;
  onIntentCreated?(input: AfterIntentCreatedInput): void;
  startStatusPolling?(
    pendingIntent: PendingRemoteIntent,
    context: RemotePaymentContext,
    handlers: {
      onSettled: (result: VerifyPaymentResponse) => void;
      onStatusChange: (status: string) => void;
    },
  ): () => void;
  renderPendingDetail?(intent: PendingRemoteIntent): ReactNode;
  renderPendingExtra?(intent: PendingRemoteIntent): ReactNode;
  getVerifiedSuccessMessage?(): string;
}
