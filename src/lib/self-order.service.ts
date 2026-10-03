/**
 * Admin client for the gateway's QR self-order endpoints
 * (`gateway/src/self-order/routes.js`). Requires the POS session JWT.
 */

import { authHeaders, getGatewayBaseUrl } from "@/lib/session.ts";

export interface SelfOrderSettings {
  enabled: boolean;
  restaurantName: string;
  welcomeText: string;
  orderTypeId: string | null;
  orderTaxId: string | null;
  paymentTypeIds: string[];
  testMode: boolean;
  testPaymentTypeId: string | null;
  currency: string;
  timezone: string;
  /** null = hide categories that only contain modifier dishes */
  hiddenCategoryIds: string[] | null;
  baseUrl: string;
  /** Brand color pack for the customer QR page (matches app presets), or 'custom'. */
  themeBrand: string;
  /** light | dark | system (system follows each customer's device). */
  themeMode: string;
  /** #rrggbb primary when themeBrand === 'custom'. */
  themeCustomPrimary: string | null;
}

export interface SelfOrderTable {
  id: string;
  name: string;
  number: string;
  floorId: string | null;
  floorName: string;
  token: string;
  enabled: boolean;
}

export interface SelfOrderConfig {
  settings: SelfOrderSettings;
  tables: SelfOrderTable[];
  paymentTypes: Array<{ id: string; name: string; type: string; gateway: string | null; mode: string | null }>;
  orderTypes: Array<{ id: string; name: string }>;
  taxes: Array<{ id: string; name: string; rate: number }>;
  categories: Array<{ id: string; name: string }>;
  defaultHiddenCategoryIds: string[];
  paidAwaitingPos: Array<{ id: string; total: number; createdAt: string; error: string | null }>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getGatewayBaseUrl()}/self-order/admin${path}`, {
    ...init,
    headers: authHeaders(init?.headers),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export const selfOrderAdmin = {
  config: () => call<SelfOrderConfig>('/config'),
  saveSettings: (settings: Partial<SelfOrderSettings>) =>
    call<{ settings: SelfOrderSettings }>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  updateTable: (tableId: string, body: { regenerate?: boolean; enabled?: boolean }) =>
    call<{ table: SelfOrderTable }>(`/tables/${encodeURIComponent(tableId)}`, { method: 'POST', body: JSON.stringify(body) }),
  retryCheckout: (checkoutId: string) =>
    call<{ status: string; orderNumber: string | null }>(`/checkouts/${encodeURIComponent(checkoutId)}/retry`, { method: 'POST' }),
};

export const selfOrderLink = (baseUrl: string, token: string) =>
  `${(baseUrl || window.location.origin).replace(/\/+$/, '')}/order.html?t=${encodeURIComponent(token)}`;
