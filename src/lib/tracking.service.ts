import { Tracking } from "@/api/model/tracking.ts";
import { authHeaders } from "@/lib/session.ts";

/** In DEV use same-origin (Vite proxy /tracking). Production uses explicit URL. */
export const TRACKING_SERVER_URL = import.meta.env.DEV
  ? ""
  : ((import.meta.env.VITE_TRACKING_SERVER_URL as string) || "http://localhost:3138");

/** Build-time toggle; on by default. Off for false / 0 / no. */
export function isTrackingEnabled(): boolean {
  const raw = String(import.meta.env.VITE_TRACKING_ENABLED ?? "true").toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

type TrackingRequest = Partial<Tracking>;
type TrackingPayload = Record<string, unknown>;

type TrackingUser = {
  first_name?: string;
  last_name?: string;
  role?: { name?: string };
  user_role?: { name?: string };
  user_shift?: { name?: string };
};

function toIsoDate(value?: Date | string): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function getResolution(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.innerWidth}x${window.innerHeight}`;
}

function normalizeTrackingPayload(payload: TrackingRequest): Record<string, unknown> {
  return {
    ...payload,
    // created_at: toIsoDate(payload.created_at as Date | string | undefined),
    resolution: payload.resolution || getResolution(),
    user_agent: payload.user_agent || (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
  };
}

export function normalizeOrderId(orderId?: unknown): string | undefined {
  if (orderId === undefined || orderId === null) return undefined;

  const withOrderPrefix = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.startsWith("order:") ? trimmed : `order:${trimmed}`;
  };

  if (typeof orderId === "string") return withOrderPrefix(orderId);
  if (typeof orderId === "number") return withOrderPrefix(orderId.toString());
  if (typeof orderId === "object" && "id" in (orderId as Record<string, unknown>)) {
    const objectOrderId = (orderId as { id?: unknown }).id;
    return objectOrderId ? withOrderPrefix(String(objectOrderId)) : undefined;
  }

  return withOrderPrefix(String(orderId));
}

export function withOrderTrackingPayload(payload?: unknown, orderId?: unknown): TrackingPayload | undefined {
  const normalizedOrderId = normalizeOrderId(orderId);
  const normalizedPayload = (payload && typeof payload === "object")
    ? ({ ...(payload as TrackingPayload) })
    : {};

  const existingOrderId = normalizeOrderId(normalizedPayload.order);
  if (existingOrderId) {
    normalizedPayload.order = existingOrderId;
    return normalizedPayload;
  }

  if (normalizedOrderId) {
    normalizedPayload.order = normalizedOrderId;
    return normalizedPayload;
  }

  return Object.keys(normalizedPayload).length > 0 ? normalizedPayload : undefined;
}

export function getTrackingUserFields(user?: TrackingUser): Pick<Tracking, "user" | "user_role" | "user_shift"> {
  return {
    user: user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || undefined : undefined,
    user_role: user?.user_role?.name || user?.role?.name,
    user_shift: user?.user_shift?.name,
  };
}

type PostOrderTrackingOptions = {
  module: string;
  page?: string;
  orderId?: unknown;
  payload?: unknown;
  user?: TrackingUser;
};

export function postOrderTracking(options: PostOrderTrackingOptions): void {
  if (!isTrackingEnabled()) return;

  const trackingPayload = withOrderTrackingPayload(options.payload, options.orderId);
  if (!trackingPayload) return;

  void postTracking({
    module: options.module,
    page: options.page,
    payload: trackingPayload,
    ...getTrackingUserFields(options.user),
  });
}

let trackingFailureLogged = false;

export async function postTracking(payload: TrackingRequest): Promise<void> {
  if (!isTrackingEnabled()) return;

  try {
    const base = TRACKING_SERVER_URL.replace(/\/$/, "");
    const url = `${base}/tracking`;
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(normalizeTrackingPayload(payload)),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to post tracking payload");
    }
  } catch (error) {
    // Avoid spamming the console on every failed tracking post (CORS / Tracking Prevention).
    if (!trackingFailureLogged) {
      trackingFailureLogged = true;
      console.warn("Tracking post failed (further failures suppressed)", error);
    }
  }
}
