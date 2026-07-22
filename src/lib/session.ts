const SESSION_TOKEN_KEY = 'posr_session_token';
const SURREAL_TOKEN_KEY = 'posr_surreal_token';

export function isGatewayAuthEnabled(): boolean {
  const raw = String(import.meta.env.VITE_GATEWAY_AUTH ?? '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function getGatewayBaseUrl(): string {
  const explicit = (import.meta.env.VITE_GATEWAY_URL as string | undefined)?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSurrealToken(): string | null {
  try {
    return sessionStorage.getItem(SURREAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionTokens(sessionToken: string, surrealToken: string): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  sessionStorage.setItem(SURREAL_TOKEN_KEY, surrealToken);
}

export function clearSessionTokens(): void {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SURREAL_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init || {});
  const token = getSessionToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export type GatewayLoginResponse = {
  ok: boolean;
  token?: string;
  surrealToken?: string;
  expiresIn?: number;
  user?: unknown;
  error?: string;
};

export async function gatewayLogin(payload: {
  method: 'pin' | 'form';
  login: string;
  password: string;
}): Promise<GatewayLoginResponse> {
  const res = await fetch(`${getGatewayBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as GatewayLoginResponse;
  if (!res.ok) {
    return { ok: false, error: data.error || `Login failed (${res.status})` };
  }
  return data;
}

export async function gatewayLogout(): Promise<void> {
  const token = getSessionToken();
  if (!token) return;
  try {
    await fetch(`${getGatewayBaseUrl()}/auth/logout`, {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    // ignore network errors on logout
  }
}

export async function refreshSurrealToken(): Promise<string | null> {
  const res = await fetch(`${getGatewayBaseUrl()}/auth/db-token`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.surrealToken) {
    sessionStorage.setItem(SURREAL_TOKEN_KEY, data.surrealToken);
    return data.surrealToken as string;
  }
  return null;
}

/** Append gateway session JWT to the Surreal WS URL for the relay. */
export function withGatewayWsToken(wsUrl: string, sessionToken: string): string {
  try {
    const url = new URL(wsUrl);
    url.searchParams.set('token', sessionToken);
    return url.toString();
  } catch {
    const join = wsUrl.includes('?') ? '&' : '?';
    return `${wsUrl}${join}token=${encodeURIComponent(sessionToken)}`;
  }
}
