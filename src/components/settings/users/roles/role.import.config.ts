import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {ACCESS_RULE_MODULES, normalizeModules} from "@/lib/access.rules.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches, writeCsvImportRow} from "@/utils/csv-import.ts";

const allowedModuleSet = new Set(normalizeModules(Object.keys(ACCESS_RULE_MODULES)));

export function createRoleImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true},
    {name: "modules", label: t("admin:forms.modules"), type: "string[]", required: true},
  ];

  return {
    id: "roles",
    entityLabel: t("admin:buttons.role", {defaultValue: "Role"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract role name and permission module keys (admin.*, reports.*, etc.).",
    onImportRow: async (record: ImportRecord, ctx) => {
      const name = String(record.values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));
      const modules = Array.isArray(record.values.modules)
        ? record.values.modules.map(item => String(item).trim()).filter(Boolean)
        : [];
      if (!modules.length) throw new Error(t("validation:required"));

      const invalid = modules.filter(module => !allowedModuleSet.has(module));
      if (invalid.length) {
        throw new Error(`Invalid permission modules: ${invalid.join(", ")}`);
      }

      const payload = {name, roles: modules};
      const rowData = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "name", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.user_roles, conditions);
      await writeCsvImportRow(db as any, {
        mode: ctx.mode,
        table: Tables.user_roles,
        existing,
        payload,
        notFoundMessage: t("common:csvImport.recordNotFound"),
        multipleMatchesMessage: t("common:csvImport.multipleMatches"),
      });
    },
  };
}
