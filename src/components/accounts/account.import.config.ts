import {Tables} from "@/api/db/tables.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportRecord,
} from "@/lib/data-import/types.ts";
import {parseImportBool, type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

const NORMAL_BALANCES = ["debit", "credit"];

export function createAccountImportConfig({
  db,
  t,
  onResult,
}: {
  db: ImportDbLike;
  t: TFunc;
  onResult?: (result: "created" | "updated") => void;
}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "code", label: "code", type: "string", required: true, aliases: ["Code"]},
    {name: "name", label: "name", type: "string", required: true, aliases: ["Name"]},
    {name: "group_code", label: "group_code", type: "string", required: true, aliases: ["Group code", "Group"]},
    {name: "normal_balance", label: "normal_balance", type: "string", required: true, aliases: ["Normal balance"]},
    {name: "parent_code", label: "parent_code", type: "string", optional: true, aliases: ["Parent code", "Parent"]},
    {name: "is_active", label: "is_active", type: "boolean", defaultValue: true, aliases: ["Active"]},
    {name: "notes", label: "notes", type: "string", optional: true, aliases: ["Notes"]},
  ];

  return {
    id: "accounts",
    entityLabel: t("accounts:actions.account", {defaultValue: "Account"}),
    shape: "records",
    fields,
    matchFields: ["code"],
    defaultMode: "create",
    db,
    extractionInstructions:
      "Extract chart of accounts rows with code, name, group_code, normal_balance (debit/credit), optional parent_code, is_active, and notes.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const v = record.values;
      const code = String(v.code ?? "").trim();
      const name = String(v.name ?? "").trim();
      const groupCode = String(v.group_code ?? "").trim();
      const normalBalance = String(v.normal_balance ?? "").trim().toLowerCase();
      const parentCode = String(v.parent_code ?? "").trim();
      const notes = String(v.notes ?? "").trim();
      const isActive = parseImportBool(v.is_active);

      if (!code || !name || !groupCode || !normalBalance) {
        throw new Error("code, name, group_code and normal_balance are required values.");
      }
      if (!NORMAL_BALANCES.includes(normalBalance)) {
        throw new Error("Invalid normal_balance. Use: debit or credit.");
      }

      const [groupRows] = await db.query(
        `SELECT id, head_type FROM ${Tables.account_groups} WHERE code = $code LIMIT 1`,
        {code: groupCode}
      );
      if (!groupRows?.length) {
        throw new Error(`Account group not found for group_code: ${groupCode}`);
      }

      let parentId: any = null;
      if (parentCode) {
        const [parentRows] = await db.query(
          `SELECT id FROM ${Tables.accounts} WHERE code = $code LIMIT 1`,
          {code: parentCode}
        );
        if (!parentRows?.length) {
          throw new Error(`Parent account not found for parent_code: ${parentCode}`);
        }
        parentId = toRecordId(parentRows[0].id);
      }

      const payload: any = {
        code,
        name,
        group: toRecordId(groupRows[0].id),
        account_type: groupRows[0].head_type,
        normal_balance: normalBalance,
        parent: parentId,
        notes: notes || null,
        is_active: isActive,
      };

      const rowData: Record<string, string> = {
        code,
        name,
        group_code: groupCode,
        normal_balance: normalBalance,
        parent_code: parentCode,
        is_active: String(isActive),
        notes,
      };

      assertCsvMatchValues(rowData, ctx.matchFields, (field) =>
        t("common:csvImport.emptyMatchValue", {field})
      );

      const unsupported = ["group_code", "parent_code"];
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (field, value) => {
        if (unsupported.includes(field)) {
          throw new Error(t("common:csvImport.unsupportedMatchField", {field}));
        }
        if (field === "is_active") return {column: "is_active", value: parseImportBool(value)};
        if (field === "normal_balance") return {column: "normal_balance", value: value.toLowerCase()};
        return {column: field, value};
      });

      const existing =
        ctx.mode === "create"
          ? []
          : await findCsvImportMatches(db, Tables.accounts, conditions, {softDelete: false});

      const result = await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.accounts,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
      onResult?.(result);
    },
  };
}
