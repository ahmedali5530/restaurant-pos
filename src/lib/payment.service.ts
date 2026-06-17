export const PAYMENT_SERVER_URL =
  (import.meta.env.VITE_PAYMENT_SERVER_URL as string) || "http://localhost:3133";

export const PAYMENT_CALLBACK_SERVER_URL =
  (import.meta.env.VITE_PAYMENT_CALLBACK_SERVER_URL as string) || PAYMENT_SERVER_URL;

import type { GatewayId } from "@/lib/payment/gateway-catalog.ts";

export type GatewayType = GatewayId;
export type PaymentStatus = "pending" | "authorized" | "paid" | "failed" | "canceled";

export type CreatePaymentIntentRequest = {
  gateway: GatewayType;
  amount: number;
  currency: string;
  orderId: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
};

export type CreatePaymentIntentResponse = {
  gateway: GatewayType;
  intentId: string;
  paymentUrl: string | null;
  clientToken: string | null;
  status: PaymentStatus;
  expiresAt: string;
  gatewayPayload: Record<string, unknown>;
};

export type VerifyPaymentRequest = {
  gateway: GatewayType;
  paymentId?: string;
  intentId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

export type VerifyPaymentResponse = {
  gateway: GatewayType;
  status: PaymentStatus;
  verifiedAt: string;
  reference: string | null;
  gatewayPayload: Record<string, unknown>;
};

export type CapturePaymentRequest = {
  gateway: GatewayType;
  intentId: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiError = {
  success: false;
  error: string;
  details?: unknown;
};

async function requestJson<T>(
  path: string,
  payload: Record<string, unknown>,
  options?: { idempotencyKey?: string }
): Promise<T> {
  const res = await fetch(`${PAYMENT_SERVER_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: ApiSuccess<T> | ApiError | null = null;
  try {
    parsed = JSON.parse(text) as ApiSuccess<T> | ApiError;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed || parsed.success === false) {
    const message =
      (parsed && "error" in parsed && parsed.error) || text || "Payment request failed";
    const details = parsed && "details" in parsed ? parsed.details : undefined;

    console.error("[payment-service]", path, {
      httpStatus: res.status,
      message,
      details,
      request: payload,
      rawBody: !parsed ? text?.slice(0, 500) : undefined,
    });

    const detailsSuffix =
      details !== undefined
        ? ` (${typeof details === "string" ? details : JSON.stringify(details)})`
        : "";
    throw new Error(`${message}${detailsSuffix}`);
  }

  return parsed.data;
}

export async function createPaymentIntent(
  payload: CreatePaymentIntentRequest,
  options?: { idempotencyKey?: string }
): Promise<CreatePaymentIntentResponse> {
  return requestJson<CreatePaymentIntentResponse>("/payments/create-intent", payload, options);
}

export async function verifyPayment(
  payload: VerifyPaymentRequest
): Promise<VerifyPaymentResponse> {
  return requestJson<VerifyPaymentResponse>("/payments/verify", payload);
}

export async function capturePayment(
  payload: CapturePaymentRequest
): Promise<VerifyPaymentResponse> {
  return requestJson<VerifyPaymentResponse>("/payments/capture", payload);
}

function normalizeOrderKeyForUrl(orderId: string): string {
  const text = String(orderId || "").trim();
  const key = text.includes(":") ? text : `order:${text}`;
  return encodeURIComponent(key);
}

export async function fetchWebhookPaymentResult(
  gateway: GatewayType,
  orderId: string,
): Promise<VerifyPaymentResponse | null> {
  const base = PAYMENT_CALLBACK_SERVER_URL.replace(/\/$/, "");
  const orderKey = normalizeOrderKeyForUrl(orderId);
  const res = await fetch(`${base}/webhooks/${gateway}/${orderKey}`);

  if (res.status === 404) {
    return null;
  }

  const text = await res.text();
  let parsed: ApiSuccess<VerifyPaymentResponse> | ApiError | null = null;
  try {
    parsed = JSON.parse(text) as ApiSuccess<VerifyPaymentResponse> | ApiError;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed || parsed.success === false) {
    const message =
      (parsed && "error" in parsed && parsed.error) || text || "Webhook fetch failed";
    throw new Error(message);
  }

  return parsed.data;
}
