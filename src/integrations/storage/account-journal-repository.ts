import { Tables } from '@/api/db/tables.ts';
import { JournalDraftRequest } from '@/integrations/accounting/types.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';
import { toRecordId } from '@/lib/utils.ts';
import {
  publishJournalPosted,
  publishJournalReversed,
} from '@/integrations/events/publish/accounts.ts';
import { entityAfterWrite } from '@/integrations/events/publish/entity.ts';
import type { ManagerLike } from '@/integrations/events/publish/safe.ts';

export type JournalDbClient = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  insert: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: unknown, data: Record<string, unknown>) => Promise<unknown>;
};

export interface CreateJournalFromDraftResult {
  entryId: string;
  entryNumber: number;
  status: 'draft' | 'posted';
  duplicate: boolean;
}

const asRecordArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === 'object') {
    return [value as T];
  }
  return [];
};

export const findJournalByIdempotencyKey = async (
  db: JournalDbClient,
  idempotencyKey: string
): Promise<{ id: string; entry_number: number; status: string } | undefined> => {
  const [rows] = await db.query<
    Array<{ id: unknown; entry_number: number; status: string }>
  >(
    `SELECT id, entry_number, status FROM ${Tables.account_journal_entries}
     WHERE idempotency_key = $key LIMIT 1`,
    { key: idempotencyKey }
  );
  const row = rows?.[0];
  if (!row?.id) {
    return undefined;
  }
  return {
    id: String(row.id),
    entry_number: Number(row.entry_number),
    status: row.status,
  };
};

const nextEntryNumber = async (db: JournalDbClient): Promise<number> => {
  const [rows] = await db.query<Array<{ max_value?: number }>>(
    `SELECT math::max(<int>entry_number) as max_value
     FROM ${Tables.account_journal_entries}
     GROUP ALL`
  );
  const num = Number(rows?.[0]?.max_value || 0);
  return Number.isFinite(num) ? num + 1 : 1;
};

export const createJournalFromDraft = async (
  db: JournalDbClient,
  draft: JournalDraftRequest
): Promise<CreateJournalFromDraftResult> => {
  const existing = await findJournalByIdempotencyKey(db, draft.idempotencyKey);
  if (existing) {
    return {
      entryId: existing.id,
      entryNumber: existing.entry_number,
      status: existing.status === 'posted' ? 'posted' : 'draft',
      duplicate: true,
    };
  }

  const entryNumber = await nextEntryNumber(db);
  const dateValue = draft.date ? new Date(draft.date) : new Date();

  const inserted = await db.insert(Tables.account_journal_entries, {
    entry_number: entryNumber,
    date: dateValue,
    memo: draft.memo ?? null,
    source_module: draft.sourceModule ?? draft.originModule ?? null,
    source_id: draft.sourceId ?? draft.originRecordId ?? null,
    status: draft.status,
    origin_event: draft.originEvent,
    origin_module: draft.originModule,
    origin_record_id: draft.originRecordId,
    integration_provider_id: draft.integrationProviderId,
    posting_rule_id: draft.postingRuleId,
    journal_template_id: draft.journalTemplateId,
    idempotency_key: draft.idempotencyKey,
    generated_at: draft.generatedAt ? new Date(draft.generatedAt) : nowSurrealDateTime(),
    generated_by: draft.generatedBy ?? null,
  });

  const entry = asRecordArray<{ id: unknown }>(inserted)[0];
  if (!entry?.id) {
    throw new Error('Failed to create journal entry');
  }

  const entryId = String(entry.id);
  const lineIds: unknown[] = [];

  for (const line of draft.lines) {
    const createdLine = await db.insert(Tables.account_journal_lines, {
      entry: toRecordId(entryId),
      account: toRecordId(line.accountId),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description ?? null,
    });
    const lineRow = asRecordArray<{ id: unknown }>(createdLine)[0];
    if (lineRow?.id) {
      lineIds.push(lineRow.id);
    }
  }

  await db.merge(toRecordId(entryId), { lines: lineIds });

  await entityAfterWrite({
    domain: 'accounts',
    table: Tables.account_journal_entries,
    entityId: entryId,
    action: 'create',
    after: {
      entryNumber,
      status: draft.status,
      lineCount: lineIds.length,
      originEvent: draft.originEvent,
    },
    source: 'account-journal-repository',
    label: 'journal_create',
  });

  if (draft.status === 'posted') {
    await publishJournalPosted(undefined, {
      entryId,
      entryNumber,
      sourceModule: draft.sourceModule ?? draft.originModule,
      originEvent: draft.originEvent,
      lineCount: lineIds.length,
    });
  }

  return {
    entryId,
    entryNumber,
    status: draft.status,
    duplicate: false,
  };
};

export const publishJournalEntry = async (
  db: JournalDbClient,
  entryId: string,
  manager?: ManagerLike
): Promise<void> => {
  await db.merge(toRecordId(entryId), { status: 'posted' });
  await publishJournalPosted(manager, { entryId });
  await entityAfterWrite({
    manager,
    domain: 'accounts',
    table: Tables.account_journal_entries,
    entityId: entryId,
    action: 'status_change',
    after: { status: 'posted' },
    source: 'account-journal-repository',
    label: 'journal_publish',
  });
};

export const emitJournalReversed = async (
  entryId: string,
  reverseEntryId?: string,
  manager?: ManagerLike
): Promise<void> => {
  await publishJournalReversed(manager, { entryId, reverseEntryId });
  await entityAfterWrite({
    manager,
    domain: 'accounts',
    table: Tables.account_journal_entries,
    entityId: entryId,
    action: 'status_change',
    after: { status: 'reversed', reverseEntryId },
    source: 'account-journal-repository',
    label: 'journal_reverse',
  });
};
