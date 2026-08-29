import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches} from "@/utils/csv-import.ts";
import {StringRecordId} from "surrealdb";

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return [];
};

async function resolveRole(db: ImportDbLike, roleName: string) {
  const rows = unwrapRows<{id: unknown; roles?: string[]}>(
    await db.query(
      `SELECT id, roles FROM ${Tables.user_roles} WHERE deleted_at = NONE AND string::lowercase(name) = string::lowercase($name) LIMIT 1`,
      {name: roleName},
    ),
  );
  return rows[0] ?? null;
}

async function resolveShift(db: ImportDbLike, shiftName: string) {
  const rows = unwrapRows<{id: unknown}>(
    await db.query(
      `SELECT id FROM ${Tables.shifts} WHERE deleted_at = NONE AND string::lowercase(name) = string::lowercase($name) LIMIT 1`,
      {name: shiftName},
    ),
  );
  return rows[0]?.id ?? null;
}

export function createUserImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "first_name", label: t("admin:columns.firstName"), type: "string", required: true},
    {name: "last_name", label: t("admin:columns.lastName"), type: "string", required: true},
    {name: "login", label: t("admin:columns.login"), type: "string", required: true},
    {name: "login_method", label: t("admin:columns.loginMethod"), type: "string", defaultValue: "pin"},
    {name: "set_password", label: t("admin:forms.password"), type: "string", optional: true, description: "Password or PIN value — stored hashed on commit only"},
    {name: "role_name", label: t("admin:columns.role"), type: "string", required: true},
    {name: "shift_name", label: t("admin:columns.shift"), type: "string", optional: true},
  ];

  return {
    id: "users",
    entityLabel: t("admin:buttons.user", {defaultValue: "User"}),
    shape: "records",
    fields,
    matchFields: ["login"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract POS users with login, role name, optional shift, and login method pin or form.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const values = record.values;
      const login = String(values.login ?? "").trim();
      const firstName = String(values.first_name ?? "").trim();
      const lastName = String(values.last_name ?? "").trim();
      const roleName = String(values.role_name ?? "").trim();
      if (!login || !firstName || !roleName) throw new Error(t("validation:required"));

      const loginMethod = String(values.login_method ?? "pin").trim().toLowerCase();
      const role = await resolveRole(db, roleName);
      if (!role?.id) throw new Error(`Role not found: ${roleName}`);

      const shiftName = String(values.shift_name ?? "").trim();
      const shiftId = shiftName ? await resolveShift(db, shiftName) : null;
      if (shiftName && !shiftId) throw new Error(`Shift not found: ${shiftName}`);

      let password = String(values.set_password ?? "").trim();
      if (!password) {
        password = loginMethod === "pin" ? login : "";
      }
      if (loginMethod === "form" && ctx.mode === "create" && !password) {
        throw new Error(t("toast:admin.passwordRequired"));
      }

      const rowData = {login};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "login", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.users, conditions);

      const params = {
        first_name: firstName,
        last_name: lastName,
        login,
        login_method: loginMethod,
        password,
        roles: role.roles ?? [],
        user_role: new StringRecordId(String(role.id)),
        user_shift: shiftId ? new StringRecordId(String(shiftId)) : null,
      };

      if (ctx.mode !== "create" && existing.length === 1) {
        if (password) {
          await db.query(
            `UPDATE ${existing[0].id} SET first_name = $first_name, last_name = $last_name, login = $login, login_method = $login_method, password = crypto::bcrypt::generate($password), roles = $roles, user_role = $user_role, user_shift = $user_shift`,
            params,
          );
        } else {
          await db.query(
            `UPDATE ${existing[0].id} SET first_name = $first_name, last_name = $last_name, login = $login, login_method = $login_method, roles = $roles, user_role = $user_role, user_shift = $user_shift`,
            params,
          );
        }
        return;
      }

      if (ctx.mode === "update") {
        throw new Error(t("common:csvImport.recordNotFound"));
      }

      await db.query(
        `INSERT INTO user (first_name, last_name, login, login_method, password, roles, user_role, user_shift) VALUES ($first_name, $last_name, $login, $login_method, crypto::bcrypt::generate($password), $roles, $user_role, $user_shift)`,
        params,
      );
    },
  };
}
