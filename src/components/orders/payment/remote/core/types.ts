import type { Dispatch, SetStateAction } from "react";
import { PaymentType } from "@/api/model/payment_type.ts";
import { Order } from "@/api/model/order.ts";
import { OrderPayment } from "@/api/model/order_payment.ts";
import {
  CreatePaymentIntentResponse,
  GatewayType,
  VerifyPaymentResponse,
} from "@/lib/payment.service.ts";

export type PendingRemoteIntent = {
  id: string;
  amount: number;
  payable: number;
  paymentType: PaymentType;
  gateway: GatewayType;
  intentId: string;
  paymentUrl: string | null;
  clientToken: string | null;
  gatewayPayload?: Record<string, unknown>;
  orderId: string;
  invoiceNumber?: string | number;
  status: string;
  expiresAt: string;
};

export type RemotePaymentContext = {
  order: Order;
  paymentType: PaymentType;
  amount: number;
  payable: number;
};

export type RemotePaymentCallbacks = {
  setPayments: Dispatch<SetStateAction<OrderPayment[]>>;
  onIntentSettled?: () => void;
  /** Called when create-intent request finishes (success or error). Used to close M-Pesa phone modal. */
  onPaymentRequestFinished?: () => void;
  trackCreateIntent: (payload: Record<string, unknown>) => void;
  trackVerifyPayment: (payload: Record<string, unknown>) => void;
};

export type CompleteRemotePaymentFn = (
  pendingIntent: PendingRemoteIntent,
  result: VerifyPaymentResponse,
) => void;

export type AfterIntentCreatedInput = {
  intent: CreatePaymentIntentResponse;
  pendingIntent: PendingRemoteIntent;
  context: RemotePaymentContext;
};
