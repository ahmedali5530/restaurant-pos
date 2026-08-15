import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {type SelectOption, type TFunc} from "@/lib/data-import/helpers.ts";
import {Tables} from "@/api/db/tables.ts";

export type JournalLineAppend = (line: {
  account: SelectOption;
  debit: number;
  credit: number;
  description?: string;
}) => void;

export function createJournalEntryImportConfig({
  db,
  t,
  append,
}: {
  db: ImportDbLike;
  t: TFunc;
  append: JournalLineAppend;
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

  return {
    id: "journal_lines",
    entityLabel: t("accounts:forms.journalLine", {defaultValue: "Journal line"}),
    shape: "records",
    fields,
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract journal entry lines with account (code or name), debit, credit, and optional description. Prefer account codes when present.",
    onImportRow: async (record: ImportRecord) => {
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

      append({
        account: {
          label: `${account.code} - ${account.name}`,
          value: String(account.id),
        },
        debit,
        credit,
        description: v.description ? String(v.description) : "",
      });
    },
  };
}
