const SESSION_TOKEN_KEY = 'posr_session_token';
const SURREAL_TOKEN_KEY = 'posr_surreal_token';

function readStorage(key: string): string | null {
  try {
    const fromLocal = localStorage.getItem(key);
    if (fromLocal) {
      return fromLocal;
    }
    // One-time migrate from sessionStorage (pre multi-tab fix).
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) {
      localStorage.setItem(key, fromSession);
      sessionStorage.removeItem(key);
      return fromSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function isGatewayAuthEnabled(): boolean {
  const raw = String(import.meta.env.VITE_GATEWAY_AUTH ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
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
  return readStorage(SESSION_TOKEN_KEY);
}

export function getSurrealToken(): string | null {
  return readStorage(SURREAL_TOKEN_KEY);
}

export function setSessionTokens(sessionToken: string, surrealToken: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
  localStorage.setItem(SURREAL_TOKEN_KEY, surrealToken);
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SURREAL_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function clearSessionTokens(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SURREAL_TOKEN_KEY);
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
    localStorage.setItem(SURREAL_TOKEN_KEY, data.surrealToken);
    try {
      sessionStorage.removeItem(SURREAL_TOKEN_KEY);
    } catch {
      // ignore
    }
    return data.surrealToken as string;
  }
  return null;
}

/** Decode JWT `exp` without verifying — used only for proactive refresh. */
export function isJwtExpiredOrNearExpiry(
  token: string | null | undefined,
  skewSeconds = 120
): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return true;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return false;
  }
}

export function isSurrealAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const name = error instanceof Error ? error.name : '';
  const haystack = `${name} ${message}`.toLowerCase();
  return (
    haystack.includes('notallowed') ||
    haystack.includes('token has expired') ||
    haystack.includes('token expired') ||
    haystack.includes('invalid token') ||
    haystack.includes('expired token') ||
    haystack.includes('authentication')
  );
}

/** Clear POS + Surreal tokens and notify providers (forces login in gateway mode). */
export function invalidateGatewaySession(): void {
  clearSessionTokens();
  try {
    window.dispatchEvent(new Event('posr-session'));
  } catch {
    // ignore
  }
}

export class SessionAuthError extends Error {
  constructor(message = 'Session expired. Please sign in again.') {
    super(message);
    this.name = 'SessionAuthError';
  }
}

export function isSidecarSessionAuthFailure(status: number, errorMessage?: string): boolean {
  if (status !== 401) {
    return false;
  }
  const msg = String(errorMessage ?? '').toLowerCase();
  return (
    msg.includes('unauthorized') ||
    msg.includes('invalid or expired session') ||
    msg.includes('invalid token type')
  );
}

export type ApiErrorBody = {
  ok?: boolean;
  success?: boolean;
  error?: string;
};

/**
 * Decide whether a failed fetch to a sidecar (api, payments, etc.) should clear
 * the POS session. Module routes wrap errors as `{ success: false }`; gateway
 * session middleware uses `{ ok: false }`. Upstream AI 401s must not log the
 * user out.
 */
export function shouldInvalidateSessionFromApiError(
  status: number,
  body: ApiErrorBody | null,
  errorMessage?: string,
): boolean {
  if (!isGatewayAuthEnabled() || status !== 401) {
    return false;
  }
  if (body?.ok === false) {
    return isSidecarSessionAuthFailure(status, errorMessage);
  }
  if (body?.success === false) {
    return false;
  }
  const msg = String(errorMessage ?? '').toLowerCase();
  return msg.includes('invalid or expired session') || msg.includes('invalid token type');
}

/** Invalidate gateway session when a sidecar rejects the POS session JWT. */
export function invalidateSessionOnSidecarAuthFailure(
  status: number,
  errorMessage?: string,
  body: ApiErrorBody | null = null,
): boolean {
  if (!shouldInvalidateSessionFromApiError(status, body, errorMessage)) {
    return false;
  }
  invalidateGatewaySession();
  return true;
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
