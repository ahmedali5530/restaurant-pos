import { getSessionToken } from '@/lib/session.ts';
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

async function syncFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${gatewayBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(body?.error || `Sync request failed (${response.status})`);
    (error as any).status = response.status;
    (error as any).code = body?.code;
    (error as any).body = body;
    throw error;
  }
  return body as T;
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
}) {
  return syncFetch<{
    ok: boolean;
    start: number;
    end: number;
    reservationId: string;
  }>('/sync/reserve-numbers', {
    method: 'POST',
    body: JSON.stringify({
      terminalId: input.terminalId,
      series: input.kind,
      count: input.count,
      reservationId: input.reservationId,
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
    conflicts: Array<{ operationId: string; code: string; message: string }>;
  }>('/sync/push', {
    method: 'POST',
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
