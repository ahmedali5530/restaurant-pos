import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {resolveDateRangeParams} from "@/api/reports/accounts/shared.ts";
import type {AccountJournalEntryStatus} from "@/api/model/account.journal.entry.ts";

export interface JournalEntrySummary {
  id?: string;
  entryNumber: number;
  date: string;
  memo?: string;
  status: AccountJournalEntryStatus;
  sourceModule?: string;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalEntriesResult {
  entries: JournalEntrySummary[];
  dateRange: DateRangeFilter;
}

export const getJournalEntries = async (
  db: DbClient,
  filters: DateRangeFilter & {
    status?: AccountJournalEntryStatus;
    sourceModule?: string;
    limit?: number;
  } = {},
): Promise<JournalEntriesResult> => {
  const {dateFrom, dateTo} = resolveDateRangeParams(filters);
  const where: string[] = [
    "date >= <datetime>$date_from",
    "date <= <datetime>$date_to",
  ];
  const parameters: Record<string, unknown> = {
    date_from: dateFrom,
    date_to: dateTo,
    limit: Math.min(Math.max(filters.limit ?? 50, 1), 200),
  };

  if (filters.status) {
    where.push("status = $status");
    parameters.status = filters.status;
  }

  if (filters.sourceModule) {
    where.push("string::lowercase(source_module) = string::lowercase($source_module)");
    parameters.source_module = filters.sourceModule;
  }

  const [entries] = await db.query(
    `
      SELECT *
      FROM ${Tables.account_journal_entries}
      WHERE ${where.join(" AND ")}
      ORDER BY entry_number DESC, date DESC
      LIMIT $limit
      FETCH lines, lines.account
    `,
    parameters,
  );

  const summaries: JournalEntrySummary[] = (entries || []).map((entry: {
    id?: {toString(): string};
    entry_number?: number;
    date?: string | Date;
    memo?: string;
    status?: AccountJournalEntryStatus;
    source_module?: string;
    lines?: Array<{debit?: number; credit?: number}>;
  }) => {
    const lines = entry.lines || [];
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);

    return {
      id: entry.id?.toString(),
      entryNumber: Number(entry.entry_number || 0),
      date: entry.date ? new Date(entry.date).toISOString() : "",
      memo: entry.memo,
      status: entry.status || "draft",
      sourceModule: entry.source_module,
      totalDebit,
      totalCredit,
    };
  });

  return {
    entries: summaries,
    dateRange: filters,
  };
};
