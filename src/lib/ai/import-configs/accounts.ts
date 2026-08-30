import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {TFunc, WriteToolContext} from "@/lib/ai/tools/write-tools.ts";
import {parseImportBool} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";

const NORMAL_BALANCES = ["debit", "credit"];

export function createAiAccountImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "code", type: "string", required: true},
    {name: "name", type: "string", required: true},
    {name: "group_code", type: "string", required: true},
    {name: "normal_balance", type: "string", required: true, description: "debit or credit"},
    {name: "parent_code", type: "string"},
    {name: "is_active", type: "boolean"},
    {name: "notes", type: "string"},
  ];

  return {
    id: "accounts",
    entityLabel: "Account",
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions: "Chart of accounts rows with code, name, group_code, normal_balance.",
    onImportRow: async (record, ctx) => {
      const v = record.values;
      const code = String(v.code ?? "").trim();
      const name = String(v.name ?? "").trim();
      const groupCode = String(v.group_code ?? "").trim();
      const normalBalance = String(v.normal_balance ?? "").trim().toLowerCase();
      if (!code || !name || !groupCode || !NORMAL_BALANCES.includes(normalBalance)) {
        throw new Error("code, name, group_code and normal_balance (debit/credit) are required");
      }

      const [groupRows] = await db.query(
        `SELECT id FROM ${Tables.account_groups} WHERE code = $code LIMIT 1`,
        {code: groupCode},
      );
      if (!groupRows?.length) throw new Error(`Account group not found: ${groupCode}`);

      let parentId: unknown = null;
      const parentCode = String(v.parent_code ?? "").trim();
      if (parentCode) {
        const [parentRows] = await db.query(
          `SELECT id FROM ${Tables.accounts} WHERE code = $code LIMIT 1`,
          {code: parentCode},
        );
        if (!parentRows?.length) throw new Error(`Parent account not found: ${parentCode}`);
        parentId = parentRows[0].id;
      }

      const payload: Record<string, unknown> = {
        code,
        name,
        group: toRecordId(groupRows[0].id),
        normal_balance: normalBalance,
        is_active: parseImportBool(v.is_active),
        notes: v.notes ? String(v.notes) : undefined,
        parent: parentId ? toRecordId(parentId) : null,
      };

      const rowData = {code};
      assertCsvMatchValues(rowData, ctx.matchFields, (field) => `Missing ${field}`);
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_f, value) => ({column: "code", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.accounts, conditions, {softDelete: false});

      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.accounts,
        existing,
        payload,
        useCreate: true,
        notFoundMessage: "Account not found",
        multipleMatchesMessage: "Multiple accounts matched",
      });
    },
  };
}

async function resolveAccountId(db: ImportDbLike, key: string) {
  const [rows] = await db.query(
    `SELECT id, code, name FROM ${Tables.accounts}
     WHERE code = $key OR string::lowercase(name) = string::lowercase($key) LIMIT 1`,
    {key},
  );
  return rows?.[0];
}

export function createAiJournalEntryImportConfig({
  db,
  t,
  context = {},
}: {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "reference", type: "string", required: true, description: "Groups lines into one journal entry"},
    {name: "entry_date", type: "string", required: true},
    {name: "description", type: "string"},
    {name: "account", type: "string", required: true, description: "Account code or name"},
    {name: "debit", type: "number"},
    {name: "credit", type: "number"},
    {name: "line_description", type: "string"},
  ];

  const entryCache = new Map<string, string>();

  return {
    id: "journal_entries",
    entityLabel: "Journal entry",
    shape: "records",
    fields,
    matchFields: [],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Journal entry lines grouped by reference. Each reference is one journal entry with multiple debit/credit lines.",
    onImportRow: async (record: ImportRecord) => {
      const v = record.values;
      const reference = String(v.reference ?? "").trim();
      const entryDate = String(v.entry_date ?? "").trim();
      const accountKey = String(v.account ?? "").trim();
      const debit = Number(v.debit ?? 0) || 0;
      const credit = Number(v.credit ?? 0) || 0;

      if (!reference || !entryDate || !accountKey) throw new Error("reference, entry_date, and account are required");
      if (debit === 0 && credit === 0) throw new Error("debit or credit must be non-zero");

      const account = await resolveAccountId(db, accountKey);
      if (!account) throw new Error(`Account not found: ${accountKey}`);

      let entryId = entryCache.get(reference);
      if (!entryId) {
        const [created] = await db.create?.(Tables.account_journal_entries, {
          entry_date: entryDate,
          description: v.description ? String(v.description) : reference,
          status: "posted",
          created_at: nowSurrealDateTime(),
          created_by: context.userId ? toRecordId(context.userId) : undefined,
        });
        entryId = recordIdToString(created?.id);
        if (!entryId) throw new Error("Failed to create journal entry");
        entryCache.set(reference, entryId);
      }

      await db.create?.(Tables.account_journal_lines, {
        journal_entry: toRecordId(entryId),
        account: toRecordId(account.id),
        debit,
        credit,
        description: v.line_description ? String(v.line_description) : undefined,
      });
    },
  };
}
