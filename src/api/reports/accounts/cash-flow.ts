import {Tables} from "@/api/db/tables.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {
  classifyCashFlowBucket,
  isCashGroupAccount,
  type CashFlowBucketId,
} from "@/components/accounts/reports.utils.ts";
import {POSTED_ENTRY_FILTER, resolveDateRangeParams} from "@/api/reports/accounts/shared.ts";

export interface CashFlowSourceRow {
  sourceModule: string;
  bucket: CashFlowBucketId;
  totalDebit: number;
  totalCredit: number;
  netCash: number;
}

export interface CashFlowResult {
  bySourceModule: CashFlowSourceRow[];
  buckets: Record<CashFlowBucketId, number>;
  netCashMovement: number;
  dateRange: DateRangeFilter;
}

const resolveCashFlowAccount = (line: {
  account?: {code?: string; name?: string; group?: {code?: string; name?: string}};
  code?: string;
  name?: string;
  group?: {code?: string; name?: string};
}) => {
  if (line.account && typeof line.account === "object") {
    return line.account;
  }

  if (line.code || line.name || line.group) {
    return {code: line.code, name: line.name, group: line.group};
  }

  return undefined;
};

export const getCashFlow = async (
  db: DbClient,
  dateRange: DateRangeFilter = {},
): Promise<CashFlowResult> => {
  const {dateFrom, dateTo} = resolveDateRangeParams(dateRange);

  const [lineRows] = await db.query(
    `
      SELECT
        account,
        entry.source_module as source_module,
        debit,
        credit
      FROM ${Tables.account_journal_lines}
      WHERE ${POSTED_ENTRY_FILTER}
        AND entry.date >= <datetime>$date_from
        AND entry.date <= <datetime>$date_to
      FETCH account, account.group, entry
    `,
    {date_from: dateFrom, date_to: dateTo},
  );

  const grouped: Record<string, CashFlowSourceRow> = {};
  (lineRows || []).forEach((line: {
    account?: {code?: string; name?: string; group?: {code?: string; name?: string}};
    code?: string;
    name?: string;
    group?: {code?: string; name?: string};
    entry?: {source_module?: string};
    source_module?: string;
    debit?: number;
    credit?: number;
  }) => {
    if (!isCashGroupAccount(resolveCashFlowAccount(line))) {
      return;
    }

    const sourceModule = line.entry?.source_module || line.source_module || "unclassified";
    if (!grouped[sourceModule]) {
      grouped[sourceModule] = {
        sourceModule,
        bucket: classifyCashFlowBucket(sourceModule),
        totalDebit: 0,
        totalCredit: 0,
        netCash: 0,
      };
    }

    grouped[sourceModule].totalDebit += Number(line.debit || 0);
    grouped[sourceModule].totalCredit += Number(line.credit || 0);
    grouped[sourceModule].netCash =
      grouped[sourceModule].totalDebit - grouped[sourceModule].totalCredit;
    grouped[sourceModule].bucket = classifyCashFlowBucket(sourceModule);
  });

  const bySourceModule = Object.values(grouped);
  const buckets: Record<CashFlowBucketId, number> = {
    operating: 0,
    investing: 0,
    financing: 0,
  };

  bySourceModule.forEach((row) => {
    buckets[row.bucket] += row.netCash;
  });

  return {
    bySourceModule,
    buckets,
    netCashMovement: buckets.operating + buckets.investing + buckets.financing,
    dateRange,
  };
};
