import { authHeaders } from "@/lib/session.ts";

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
    headers: authHeaders({
      ...(options?.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : {}),
    }),
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
  const res = await fetch(`${base}/webhooks/${gateway}/${orderKey}`, {
    headers: authHeaders(),
  });

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

// ---------------------------------------------------------------------------
// Gateway credential management (encrypted at rest).
//
// These functions POST/DELETE to the /payments/credentials/:paymentTypeId
// endpoints added in the security/encrypt-payment-credentials branch. The
// payments service encrypts the gateway_config blob with AES-256-GCM before
// writing to SurrealDB, AND clears the legacy plaintext gateway_config field.
//
// The SPA MUST use these functions instead of writing gateway_config directly
// to Surreal via /rpc — otherwise credentials are stored in plaintext and
// the encryption is useless.
// ---------------------------------------------------------------------------

export type GatewayCredentialsPayload = {
  /** Stripe: publishableKey/secretKey/webhookSecret; PayPal: clientId/clientSecret/webhookId; etc. */
  [key: string]: string | undefined;
};

export type SaveGatewayCredentialsResponse = {
  ok: true;
  paymentTypeId: string;
  encrypted: true;
};

export type RemoveGatewayCredentialsResponse = {
  ok: true;
  paymentTypeId: string;
  removed: true;
};

function normalizePaymentTypeIdForUrl(paymentTypeId: string): string {
  // Strip the table prefix for URL path — the server re-adds it.
  const text = String(paymentTypeId || "").trim();
  if (text.startsWith("payment_type:")) {
    return encodeURIComponent(text.slice("payment_type:".length));
  }
  return encodeURIComponent(text);
}

/**
 * Save gateway credentials for a payment type, encrypted at rest.
 *
 * Call this from the payment type settings form whenever the user enters or
 * updates gateway credentials. The server:
 *   1. Encrypts the gatewayConfig blob with AES-256-GCM
 *   2. Writes to payment_type.gateway_config_encrypted
 *   3. Clears payment_type.gateway_config (legacy plaintext field)
 *
 * After a successful save, the SPA should NOT write gateway_config to Surreal
 * directly — that would re-create a plaintext copy.
 */
export async function saveGatewayCredentials(
  paymentTypeId: string,
  gatewayConfig: GatewayCredentialsPayload
): Promise<SaveGatewayCredentialsResponse> {
  const id = normalizePaymentTypeIdForUrl(paymentTypeId);
  const res = await fetch(
    `${PAYMENT_SERVER_URL.replace(/\/$/, "")}/payments/credentials/${id}`,
    {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ gatewayConfig }),
    }
  );

  const text = await res.text();
  let parsed: ApiSuccess<SaveGatewayCredentialsResponse> | ApiError | null = null;
  try {
    parsed = JSON.parse(text) as ApiSuccess<SaveGatewayCredentialsResponse> | ApiError;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed || parsed.success === false) {
    const message =
      (parsed && "error" in parsed && parsed.error) || text || "Failed to save gateway credentials";
    const details = parsed && "details" in parsed ? parsed.details : undefined;
    const detailsSuffix =
      details !== undefined
        ? ` (${typeof details === "string" ? details : JSON.stringify(details)})`
        : "";
    throw new Error(`${message}${detailsSuffix}`);
  }

  return parsed.data;
}

/**
 * Remove (revoke) gateway credentials for a payment type.
 *
 * Clears both the encrypted field and the legacy plaintext field. The
 * payment_type record itself is NOT deleted — only the credential fields.
 */
export async function removeGatewayCredentials(
  paymentTypeId: string
): Promise<RemoveGatewayCredentialsResponse> {
  const id = normalizePaymentTypeIdForUrl(paymentTypeId);
  const res = await fetch(
    `${PAYMENT_SERVER_URL.replace(/\/$/, "")}/payments/credentials/${id}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    }
  );

  const text = await res.text();
  let parsed: ApiSuccess<RemoveGatewayCredentialsResponse> | ApiError | null = null;
  try {
    parsed = JSON.parse(text) as ApiSuccess<RemoveGatewayCredentialsResponse> | ApiError;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed || parsed.success === false) {
    const message =
      (parsed && "error" in parsed && parsed.error) || text || "Failed to remove gateway credentials";
    throw new Error(message);
  }

  return parsed.data;
}
