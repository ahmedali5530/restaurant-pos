/**
 * Bridge between the QuickBooksProvider (browser) and the API proxy (server).
 * All QBO API calls go through session-authenticated fetch to /integrations/qbo/*
 */

import { getSessionToken } from '@/lib/session.ts';
import { MasterDataImport, AccountingRemoteAdapter, ChangeSet } from '@/integrations/accounting/external/types.ts';

const API_BASE = import.meta.env.VITE_API_SERVER_URL + '/integrations/qbo';

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const err: any = new Error(`API returned non-JSON response (${res.status}). Is the API server running?`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  if (!json.success && json.error) {
    const err: any = new Error(json.error);
    err.status = res.status;
    throw err;
  }
  return json.data ?? json;
}

/**
 * Start OAuth flow. Returns the Intuit authorize URL to redirect to.
 */
export async function startOAuth(options: { userId?: string; redirectPath?: string }): Promise<{ authorizeUrl: string }> {
  return apiFetch('/oauth/start', {
    method: 'POST',
    body: JSON.stringify({ userId: options.userId, redirectPath: options.redirectPath }),
  });
}

/**
 * Disconnect / revoke tokens for a realm.
 */
export async function disconnectOAuth(realmId: string): Promise<{ disconnected: boolean }> {
  return apiFetch('/oauth/disconnect', {
    method: 'POST',
    body: JSON.stringify({ realmId }),
  });
}

/**
 * Refresh the OAuth access token.
 */
export async function refreshToken(realmId: string): Promise<void> {
  return apiFetch('/oauth/refresh', {
    method: 'POST',
    body: JSON.stringify({ realmId }),
  });
}

/**
 * Get connection status for the UI.
 */
export async function getConnectionStatus(realmId: string): Promise<{
  connected: boolean;
  status: string;
  companyName?: string;
  tenantId?: string;
  expiresAt?: string;
}> {
  return apiFetch(`/status/${encodeURIComponent(realmId)}`);
}

/**
 * Proxy a QBO API request through the server.
 */
export async function proxyQboRequest(params: {
  realmId: string;
  method?: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}): Promise<any> {
  return apiFetch('/proxy', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
