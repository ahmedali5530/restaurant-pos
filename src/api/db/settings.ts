import {
  getSessionToken,
  getSurrealToken,
  isGatewayAuthEnabled,
  withGatewayWsToken,
} from '@/lib/session.ts';

export const DB_REST_API = import.meta.env.VITE_DB_WEBDOCKET as string | undefined;

/**
 * Used only when VITE_GATEWAY_AUTH is off (local rollback / legacy) — no
 * default. That mode connects straight from the browser to SurrealDB, so a
 * hardcoded fallback here would ship a real DB credential in the client
 * bundle. If you intentionally use legacy mode, set VITE_DB_USER/VITE_DB_PASS
 * yourself.
 */
export const DB_REST_USER = import.meta.env.VITE_DB_USER as string | undefined;
/** See DB_REST_USER above. */
export const DB_REST_PASS = import.meta.env.VITE_DB_PASS as string | undefined;

export const DB_REST_DB = (import.meta.env.VITE_DB_DATABASE as string | undefined) || 'posr';
export const DB_REST_NS = (import.meta.env.VITE_DB_NAMESPACE as string | undefined) || 'posr';

export const withApi = (path: string) => {
  return (DB_REST_API || '') + path;
};

export function resolveDbWebsocketUrl(): string {
  const base = DB_REST_API || '';
  if (!isGatewayAuthEnabled()) {
    return base;
  }
  const session = getSessionToken();
  if (!session) {
    return base;
  }
  return withGatewayWsToken(base, session);
}

export function resolveDbAuthentication():
  | string
  | { username: string; password: string }
  | undefined {
  if (isGatewayAuthEnabled()) {
    return getSurrealToken() || undefined;
  }
  if (!DB_REST_USER || !DB_REST_PASS) {
    throw new Error(
      'Legacy DB mode (VITE_GATEWAY_AUTH off) requires VITE_DB_USER and VITE_DB_PASS to be set — no default credential is shipped.'
    );
  }
  return {
    username: DB_REST_USER,
    password: DB_REST_PASS,
  };
}

export { isGatewayAuthEnabled, getSessionToken, getSurrealToken };
