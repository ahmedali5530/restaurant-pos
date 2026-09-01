import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
  ImportRowContext,
} from "@/lib/data-import/types.ts";
import {
  applyListImportMode,
  findMatchingLineIndexes,
  normalizeImportMatchValue,
  type SelectOption,
  type TFunc,
} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";

export type JournalLinePayload = {
  account: SelectOption;
  debit: number;
  credit: number;
  description?: string;
};

export type JournalLineAppend = (line: JournalLinePayload) => void;

export function createJournalEntryImportConfig({
  db,
  t,
  append,
  update,
  getLines,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: JournalLineAppend;
  update: (index: number, line: JournalLinePayload) => void;
  getLines: () => any[];
}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "account",
      label: t("accounts:reports.account", {defaultValue: "Account"}),
      type: "string",
      required: true,
      aliases: ["Account", "Account code", "Code", "Name"],
      description: "Account code or name",
    },
    {
      name: "debit",
      label: t("accounts:columns.debit", {defaultValue: "Debit"}),
      type: "number",
      defaultValue: 0,
      aliases: ["Debit", "Dr"],
    },
    {
      name: "credit",
      label: t("accounts:columns.credit", {defaultValue: "Credit"}),
      type: "number",
      defaultValue: 0,
      aliases: ["Credit", "Cr"],
    },
    {
      name: "description",
      label: t("accounts:reports.description", {defaultValue: "Description"}),
      type: "string",
      optional: true,
      aliases: ["Description", "Memo", "Narration"],
    },
  ];

  const notFoundMessage = t("common:csvImport.recordNotFound");
  const multipleMatchesMessage = t("common:csvImport.multipleMatches");

  return {
    id: "journal_lines",
    entityLabel: t("accounts:forms.journalLine", {defaultValue: "Journal line"}),
    shape: "records",
    fields,
    matchFields: ["account"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract journal entry lines with account (code or name), debit, credit, and optional description. Prefer account codes when present.",
    onImportRow: async (record: ImportRecord, ctx: ImportRowContext) => {
      const v = record.values;
      const key = String(v.account ?? "").trim();
      if (!key) throw new Error("Account is required");

      const [byCode] = await db.query(
        `SELECT id, code, name FROM ${Tables.accounts} WHERE code = $key LIMIT 1`,
        {key}
      );
      let account = byCode?.[0];
      if (!account) {
        const [byName] = await db.query(
          `SELECT id, code, name FROM ${Tables.accounts} WHERE name = $key LIMIT 1`,
          {key}
        );
        account = byName?.[0];
      }
      if (!account) throw new Error(`Account not found: ${key}`);

      const debit = Number(v.debit) || 0;
      const credit = Number(v.credit) || 0;
      if (debit < 0 || credit < 0) throw new Error("Debit and credit must be non-negative");
      if (debit > 0 && credit > 0) {
        throw new Error("A line cannot have both debit and credit");
      }
      if (debit === 0 && credit === 0) {
        throw new Error("A line must have a debit or credit amount");
      }

      const payload: JournalLinePayload = {
        account: {
          label: `${account.code} - ${account.name}`,
          value: String(account.id),
        },
        debit,
        credit,
        description: v.description ? String(v.description) : "",
      };

      const matchIndexes = findMatchingLineIndexes(
        getLines(),
        ctx.matchFields,
        v,
        (line) => ({
          account: line.account?.value,
          debit: line.debit,
          credit: line.credit,
        }),
        {
          skipLine: (line) => !line?.account?.value,
          resolveImportField: (field, value) => {
            if (field === "account") {
              return normalizeImportMatchValue(account.id);
            }
            return normalizeImportMatchValue(value);
          },
          resolveLineField: (field, _value, line) => {
            if (field === "account") {
              return normalizeImportMatchValue(line.account?.value);
            }
            return normalizeImportMatchValue(line[field as keyof typeof line]);
          },
        }
      );

      applyListImportMode({
        mode: ctx.mode,
        existingIndexes: matchIndexes,
        append,
        update: (index) => update(index, payload),
        payload,
        notFoundMessage,
        multipleMatchesMessage,
      });
    },
  };
}
