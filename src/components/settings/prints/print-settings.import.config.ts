import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {toRecordId} from "@/lib/utils.ts";

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return [];
};

const PRINT_SETTING_KEYS = [
  "Temp Print",
  "Final Print",
  "Kitchen Print",
  "Summary Print",
  "Delivery Print",
] as const;

export function createPrintSettingsImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "key", label: t("admin:columns.name"), type: "string", required: true},
    {name: "top_margin", label: t("admin:forms.topMargin"), type: "number", optional: true},
    {name: "bottom_margin", label: t("admin:forms.bottomMargin"), type: "number", optional: true},
    {name: "left_margin", label: t("admin:forms.leftMargin"), type: "number", optional: true},
    {name: "right_margin", label: t("admin:forms.rightMargin"), type: "number", optional: true},
    {name: "show_logo", label: t("admin:forms.showLogo"), type: "boolean", optional: true},
    {name: "show_vat_number", label: t("admin:forms.showVatNumber"), type: "boolean", optional: true},
    {name: "vat_name", label: t("admin:forms.vatName"), type: "string", optional: true},
    {name: "vat_number", label: t("admin:forms.vatNumber"), type: "string", optional: true},
  ];

  return {
    id: "print_settings",
    entityLabel: t("admin:tabs.printSettings", {defaultValue: "Print settings"}),
    shape: "records",
    fields,
    matchFields: ["key"],
    defaultMode: "update",
    db,
    extractionInstructions: "Update print settings by key (Temp Print, Final Print, Kitchen Print, Summary Print, Delivery Print).",
    onImportRow: async (record: ImportRecord) => {
      const key = String(record.values.key ?? "").trim();
      if (!key) throw new Error(t("validation:required"));
      if (!PRINT_SETTING_KEYS.includes(key as typeof PRINT_SETTING_KEYS[number])) {
        throw new Error(`Unknown print setting key: ${key}`);
      }

      const rows = unwrapRows<{id: unknown; values?: Record<string, unknown>}>(
        await db.query(
          `SELECT id, values FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
          {key},
        ),
      );
      if (!rows[0]?.id) throw new Error(t("common:csvImport.recordNotFound"));

      const current = rows[0].values ?? {};
      const patch: Record<string, unknown> = {...current};
      for (const field of fields) {
        if (field.name === "key") continue;
        if (record.values[field.name] !== undefined && record.values[field.name] !== null && record.values[field.name] !== "") {
          patch[field.name] = record.values[field.name];
        }
      }

      await db.merge?.(rows[0].id, {values: patch});
    },
  };
}

type WeightRow = {role_name?: string; user_login?: string; weight?: number};

export function createTipDistributionImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {
      name: "distribution",
      label: t("admin:forms.saveDistribution"),
      type: "string",
      required: true,
      description: 'JSON object {"roles":[{"role_name":"Manager","weight":2}],"users":[{"user_login":"1234","weight":1}]}',
    },
  ];

  return {
    id: "tip_distribution",
    entityLabel: t("admin:tabs.tipsDefinition", {defaultValue: "Tip distribution"}),
    shape: "records",
    fields,
    matchFields: ["distribution"],
    defaultMode: "update",
    db,
    extractionInstructions: "Replace tip distribution weights by role name and/or user login.",
    onImportRow: async (record: ImportRecord) => {
      const raw = record.values.distribution;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      const roleRows = Array.isArray(parsed?.roles) ? parsed.roles as WeightRow[] : [];
      const userRows = Array.isArray(parsed?.users) ? parsed.users as WeightRow[] : [];

      const roles: Array<{role_id: unknown; weight: number}> = [];
      for (const row of roleRows) {
        const roleName = String(row.role_name ?? "").trim();
        if (!roleName) continue;
        const found = unwrapRows<{id: unknown}>(
          await db.query(
            `SELECT id FROM ${Tables.user_roles} WHERE deleted_at = NONE AND string::lowercase(name) = string::lowercase($name) LIMIT 1`,
            {name: roleName},
          ),
        );
        if (!found[0]?.id) throw new Error(`Role not found: ${roleName}`);
        roles.push({role_id: toRecordId(found[0].id), weight: Number(row.weight ?? 0) || 0});
      }

      const users: Array<{user_id: unknown; weight: number}> = [];
      for (const row of userRows) {
        const login = String(row.user_login ?? "").trim();
        if (!login) continue;
        const found = unwrapRows<{id: unknown}>(
          await db.query(
            `SELECT id FROM ${Tables.users} WHERE deleted_at = NONE AND login = $login LIMIT 1`,
            {login},
          ),
        );
        if (!found[0]?.id) throw new Error(`User not found: ${login}`);
        users.push({user_id: toRecordId(found[0].id), weight: Number(row.weight ?? 0) || 0});
      }

      const payload = {roles, users};
      const existing = unwrapRows<{id: unknown}>(
        await db.query(
          `SELECT id FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
          {key: "tip_distribution"},
        ),
      );

      if (existing[0]?.id) {
        await db.merge?.(existing[0].id, {values: payload});
      } else {
        await db.create?.(Tables.settings, {key: "tip_distribution", is_global: true, values: payload});
      }
    },
  };
}
