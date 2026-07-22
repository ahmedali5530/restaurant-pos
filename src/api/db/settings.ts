import {
  getSessionToken,
  getSurrealToken,
  isGatewayAuthEnabled,
  withGatewayWsToken,
} from '@/lib/session.ts';

export const DB_REST_API = import.meta.env.VITE_DB_WEBDOCKET as string | undefined;

/** Used only when VITE_GATEWAY_AUTH is off (local rollback / legacy). */
export const DB_REST_USER = (import.meta.env.VITE_DB_USER as string | undefined) || 'root';
/** Used only when VITE_GATEWAY_AUTH is off (local rollback / legacy). */
export const DB_REST_PASS = (import.meta.env.VITE_DB_PASS as string | undefined) || 'root';

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
  return {
    username: DB_REST_USER,
    password: DB_REST_PASS,
  };
}

export { isGatewayAuthEnabled, getSessionToken, getSurrealToken };
