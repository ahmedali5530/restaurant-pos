import { customAlphabet, nanoid } from 'nanoid';
import { getPosStoreDatabase } from './db.ts';
import {
  POS_SCHEMA_VERSION,
  POS_SYNC_PROTOCOL_VERSION,
  type TerminalIdentity,
} from './types.ts';
import {
  DEFAULT_NUMBER_POLICY,
  normalizeNumberPolicy,
  resolvePendingLength,
  terminalCodeFallback,
  type NumberPolicy,
} from '@/lib/number-policy.ts';

function createId(): string {
  // nanoid works in non-secure contexts; crypto.randomUUID does not (HTTP LAN/Docker).
  return nanoid();
}

/** Local FOH label until the gateway assigns `invoice_number`. Not written to Surreal. */
const LOCAL_INVOICE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function nextLocalInvoiceCode(length = 6): string {
  const n = Math.min(12, Math.max(4, Math.floor(Number(length) || 6)));
  return customAlphabet(LOCAL_INVOICE_ALPHABET, n)();
}

export function createTerminalId(): string {
  return `terminal-${createId()}`;
}

export async function ensureTerminalIdentity(): Promise<TerminalIdentity> {
  const db = getPosStoreDatabase();
  const existing = await db.identity.get('singleton');
  if (existing) {
    return {
      terminalId: existing.terminalId,
      installationId: existing.installationId,
      nextSequence: existing.nextSequence,
      schemaVersion: existing.schemaVersion,
      protocolVersion: existing.protocolVersion,
      terminalCode: existing.terminalCode || terminalCodeFallback(existing.terminalId),
    };
  }

  const terminalId = createTerminalId();
  const identity: TerminalIdentity & { id: 'singleton' } = {
    id: 'singleton',
    terminalId,
    installationId: createTerminalId(),
    nextSequence: 1,
    schemaVersion: POS_SCHEMA_VERSION,
    protocolVersion: POS_SYNC_PROTOCOL_VERSION,
    terminalCode: terminalCodeFallback(terminalId),
  };
  await db.identity.put(identity);
  return identity;
}

export async function setTerminalCode(code: string): Promise<TerminalIdentity> {
  const db = getPosStoreDatabase();
  const cleaned = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16);
  return db.transaction('rw', db.identity, async () => {
    const row = await db.identity.get('singleton');
    if (!row) {
      throw new Error('Terminal identity is not initialized');
    }
    const terminalCode = cleaned || terminalCodeFallback(row.terminalId);
    await db.identity.put({ ...row, terminalCode });
    return {
      terminalId: row.terminalId,
      installationId: row.installationId,
      nextSequence: row.nextSequence,
      schemaVersion: row.schemaVersion,
      protocolVersion: row.protocolVersion,
      terminalCode,
    };
  });
}

export async function nextOperationIdentity(): Promise<{
  terminalId: string;
  sequence: number;
  operationId: string;
}> {
  const db = getPosStoreDatabase();
  return db.transaction('rw', db.identity, async () => {
    const row = await db.identity.get('singleton');
    if (!row) {
      throw new Error('Terminal identity is not initialized');
    }
    const sequence = row.nextSequence;
    await db.identity.update('singleton', { nextSequence: sequence + 1 });
    return {
      terminalId: row.terminalId,
      sequence,
      operationId: `${row.terminalId}:${sequence}`,
    };
  });
}

export function recordId(table: string, id?: string): string {
  const raw = id ?? `r${createId().replace(/-/g, '')}`;
  return raw.includes(':') ? raw : `${table}:${raw}`;
}

/** Pending local code length from a policy (or defaults). */
export function pendingCodeLength(policy?: NumberPolicy | null): number {
  return resolvePendingLength(policy ?? DEFAULT_NUMBER_POLICY);
}

export function pendingCodeFromPolicy(policy?: NumberPolicy | null): string | undefined {
  const normalized = normalizeNumberPolicy(policy ?? DEFAULT_NUMBER_POLICY);
  if (normalized.pending.mode === 'blank') return undefined;
  return nextLocalInvoiceCode(pendingCodeLength(normalized));
}
