import { getSessionToken, invalidateGatewaySession } from '@/lib/session.ts';
import {
  POS_SCHEMA_VERSION,
  POS_SYNC_PROTOCOL_VERSION,
  type DomainOperation,
} from '@/infrastructure/pos-store/types.ts';

const gatewayBase = () => {
  const fromEnv = (import.meta as any).env?.VITE_GATEWAY_URL;
  if (fromEnv) return String(fromEnv).replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3142`;
  }
  return 'http://127.0.0.1:3142';
};

/** Default HTTP timeout — prevents sync UI from hanging forever. */
const SYNC_FETCH_TIMEOUT_MS = 45_000;
/** Per-batch push timeout (5 ops). Long enough for real Surreal writes, short enough to recover UI. */
const SYNC_PUSH_TIMEOUT_MS = 90_000;

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'AbortError';
}

async function syncFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const token = getSessionToken();
  const timeoutMs = init?.timeoutMs ?? SYNC_FETCH_TIMEOUT_MS;
  const { timeoutMs: _omit, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Prefer caller signal if present, but always honor our timeout.
  if (fetchInit.signal) {
    const outer = fetchInit.signal;
    if (outer.aborted) controller.abort();
    else {
      outer.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  const timedOutError = () => {
    const timedOut = new Error(`Sync request timed out after ${timeoutMs}ms (${path})`);
    (timedOut as any).code = 'SYNC_TIMEOUT';
    (timedOut as any).status = 408;
    return timedOut;
  };

  try {
    const response = await fetch(`${gatewayBase()}${path}`, {
      ...fetchInit,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchInit.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
      if (response.status === 401) {
        // Sync always uses the POS session JWT — treat 401 as hard session death.
        invalidateGatewaySession();
      }
      const error = new Error(body?.error || `Sync request failed (${response.status})`);
      (error as any).status = response.status;
      (error as any).code = body?.code;
      (error as any).body = body;
      throw error;
    }
    return body as T;
  } catch (error) {
    if (isAbortError(error)) throw timedOutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function handshake(input: {
  terminalId: string;
  scopeId?: string;
  metadata?: Record<string, unknown>;
}) {
  return syncFetch<{
    ok: boolean;
    protocolVersion: number;
    schemaVersion: number;
    lastSequence: number;
    cursor: number;
  }>('/sync/handshake', {
    method: 'POST',
    body: JSON.stringify({
      protocolVersion: POS_SYNC_PROTOCOL_VERSION,
      schemaVersion: POS_SCHEMA_VERSION,
      terminalId: input.terminalId,
      scopeId: input.scopeId ?? 'default',
      metadata: input.metadata ?? {},
    }),
  });
}

export async function fetchSnapshotPage(input: {
  terminalId: string;
  limit?: number;
  resumeToken?: string | null;
}) {
  return syncFetch<{
    ok: boolean;
    schemaVersion: number;
    highWatermark: number;
    page: { kind: 'records' | 'events'; table?: string; records?: any[]; events?: any[] };
    complete: boolean;
    resumeToken: string | null;
  }>('/sync/snapshot', {
    method: 'POST',
    timeoutMs: 120_000,
    body: JSON.stringify({
      terminalId: input.terminalId,
      limit: input.limit ?? 200,
      resumeToken: input.resumeToken ?? null,
    }),
  });
}

export async function reserveNumbers(input: {
  terminalId: string;
  kind: 'invoice' | 'receipt' | 'auto_id';
  count: number;
  reservationId: string;
  scopeId?: string;
  dayStartUnix?: number;
  dayEndUnix?: number;
}) {
  return syncFetch<{
    ok: boolean;
    start: number;
    end: number;
    reservationId: string;
    scopeId?: string;
  }>('/sync/reserve-numbers', {
    method: 'POST',
    body: JSON.stringify({
      terminalId: input.terminalId,
      series: input.kind,
      count: input.count,
      reservationId: input.reservationId,
      scopeId: input.scopeId,
      dayStartUnix: input.dayStartUnix,
      dayEndUnix: input.dayEndUnix,
    }),
  });
}

export async function pushOperations(input: {
  terminalId: string;
  operations: DomainOperation[];
  appVersion?: string;
}) {
  return syncFetch<{
    ok: boolean;
    accepted: string[];
    assignments?: Array<{ operationId: string; aggregateId: string; invoiceNumber: number }>;
    conflicts: Array<{ operationId: string; code: string; message: string }>;
  }>('/sync/push', {
    method: 'POST',
    timeoutMs: SYNC_PUSH_TIMEOUT_MS,
    body: JSON.stringify({
      terminalId: input.terminalId,
      protocolVersion: POS_SYNC_PROTOCOL_VERSION,
      schemaVersion: POS_SCHEMA_VERSION,
      appVersion: input.appVersion ?? '0.0.0',
      operations: input.operations,
    }),
  });
}

export async function pullEvents(input: {
  terminalId: string;
  cursor: number;
  limit?: number;
}) {
  const params = new URLSearchParams({
    terminalId: input.terminalId,
    cursor: String(input.cursor),
    limit: String(input.limit ?? 200),
  });
  return syncFetch<{
    ok: boolean;
    events: any[];
    cursor: number;
    highWatermark: number;
    hasMore: boolean;
  }>(`/sync/pull?${params.toString()}`);
}
