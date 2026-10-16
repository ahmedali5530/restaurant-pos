/**
 * Customer-side client for the gateway's public QR self-order API.
 * Calls are same-origin (`/self-order/...`) — the web server proxies them to
 * the gateway (Vite `server.proxy` in dev, nginx in production).
 */

export interface TaxInfo {
  id: string;
  name: string;
  rate: number;
}

export interface ModifierOption {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** 0 = optional (any number), N = exactly N must be chosen */
  required: number;
  options: ModifierOption[];
}

export interface MenuDish {
  id: string;
  name: string;
  price: number;
  taxMode: 'inclusive' | 'exclusive';
  taxes: TaxInfo[];
  categoryIds: string[];
  modifierGroups: ModifierGroup[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  gateway: 'stripe' | 'paypal' | 'test';
}

export interface PublicMenu {
  restaurant: { name: string; welcomeText: string };
  table: { name: string; number: string; floor: string };
  currency: string;
  theme?: { brand: string; mode: string; customPrimary?: string | null };
  orderTax: TaxInfo | null;
  categories: Array<{ id: string; name: string }>;
  dishes: MenuDish[];
  paymentMethods: PaymentMethod[];
}

export interface CartItemInput {
  dishId: string;
  quantity: number;
  comments?: string;
  modifiers: Record<string, string[]>;
}

export interface Quote {
  currency: string;
  items: Array<{ name: string; quantity: number; options: string[]; comments?: string; amount: number }>;
  subtotal: number;
  taxes: Array<{ name: string; rate: number; amount: number }>;
  taxAmount: number;
  total: number;
}

export interface CheckoutStart {
  checkoutId: string;
  gateway: PaymentMethod['gateway'];
  quote: Quote;
  payment: {
    intentId: string;
    clientToken: string | null;
    publishableKey: string | null;
    clientId: string | null;
    mode: string | null;
  } | null;
}

export interface CheckoutStatus {
  checkoutId: string;
  status: 'pending' | 'paid' | 'submitted' | 'expired' | 'failed';
  orderNumber: string | null;
  quote: Quote;
  message: string | null;
  /** True once the kitchen has finished every stage of the order. */
  orderReady?: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/self-order/public/${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Could not reach the restaurant. Check your connection and try again.', 'NETWORK');
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new ApiError(json?.error || 'Something went wrong. Please try again.', json?.code, response.status);
  }
  return json as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  menu: (token: string) => request<PublicMenu>(encodeURIComponent(token)),
  quote: (token: string, items: CartItemInput[]) => post<Quote>(`${encodeURIComponent(token)}/quote`, { items }),
  checkout: (
    token: string,
    body: { items: CartItemInput[]; paymentMethodId: string; gateway: string; customerName?: string; notes?: string; idempotencyKey?: string },
  ) => post<CheckoutStart>(`${encodeURIComponent(token)}/checkout`, body),
  confirm: (token: string, checkoutId: string) =>
    post<CheckoutStatus>(`${encodeURIComponent(token)}/checkout/${encodeURIComponent(checkoutId)}/confirm`, {}),
  status: (token: string, checkoutId: string) =>
    request<CheckoutStatus>(`${encodeURIComponent(token)}/checkout/${encodeURIComponent(checkoutId)}`),
};

export function formatMoney(value: number, currency: string): string {
  try {
    // "Rp 4,788" rather than "IDR 4,788.00": local symbol, no cents on whole amounts.
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
