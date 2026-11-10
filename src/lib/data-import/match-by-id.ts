import type {ImportDbLike, ImportField} from "@/lib/data-import/types.ts";
import {toRecordId} from "@/lib/utils.ts";

export type MatchByIdOptions = {
  id?: unknown;
  /** Legacy business-key equality filters (AND). */
  keys?: Record<string, unknown>;
  softDelete?: boolean;
  /** When true and multiple key matches exist, return [] instead of LIMIT 1 pick. */
  rejectAmbiguousKeys?: boolean;
  limit?: number;
};

export type TFuncLike = (key: string, options?: any) => string;

/** Optional id column for import configs (create ignores; update prefers). */
export function optionalIdField(t: TFuncLike): ImportField {
  return {
    name: "id",
    label: t("admin:columns.id", {defaultValue: "ID"}),
    type: "string",
    optional: true,
    aliases: ["ID", "Record ID"],
    description:
      "Existing record id (e.g. inventory_item:…). Prefer for updates when business keys can change or collide.",
  };
}

export function patchHasId(patch: Record<string, unknown> | null | undefined): boolean {
  return String(patch?.id ?? "").trim() !== "";
}

/**
 * Find rows by unique id first, else by AND of business keys.
 * Returns up to `limit` rows (default 2) so callers can detect ambiguity.
 */
export async function findRecordsByIdOrKeys(
  db: ImportDbLike,
  table: string,
  options: MatchByIdOptions,
): Promise<Array<{id: any} & Record<string, unknown>>> {
  const softDelete = options.softDelete !== false;
  const limit = options.limit ?? 2;
  const deletedClause = softDelete ? " AND deleted_at = none" : "";
  const idRaw = String(options.id ?? "").trim();

  if (idRaw) {
    const [rows] = await db.query(
      `SELECT * FROM ${table} WHERE id = $id${deletedClause} LIMIT 1`,
      {id: toRecordId(idRaw)},
    );
    return (rows ?? []) as Array<{id: any} & Record<string, unknown>>;
  }

  const keys = options.keys ?? {};
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  for (const [field, raw] of Object.entries(keys)) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const param = `m_${field}`;
    conditions.push(`${field} = $${param}`);
    params[param] = value;
  }

  if (conditions.length === 0) return [];

  const fetchLimit = options.rejectAmbiguousKeys ? Math.max(limit, 2) : 1;
  const [rows] = await db.query(
    `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}${deletedClause} LIMIT ${fetchLimit}`,
    params,
  );
  return (rows ?? []) as Array<{id: any} & Record<string, unknown>>;
}

export function assertUniqueMatch(
  rows: Array<{id: any}>,
  t: TFuncLike,
  context?: {keyLabel?: string; keyValue?: string},
): {id: any} {
  if (rows.length === 0) {
    throw new Error(t("common:csvImport.recordNotFound"));
  }
  if (rows.length > 1) {
    const key = context?.keyLabel && context?.keyValue
      ? `${context.keyLabel} "${context.keyValue}"`
      : "these match fields";
    throw new Error(
      t("common:csvImport.ambiguousMatch", {
        key,
        defaultValue:
          `Multiple records match ${key}. Pass id to update the correct record.`,
      }),
    );
  }
  return rows[0];
}

/**
 * Resolve exactly one row for update/delete: id preferred, else keys.
 * Throws not-found / ambiguous.
 */
export async function requireUniqueMatchByIdOrKeys(
  db: ImportDbLike,
  table: string,
  options: MatchByIdOptions & {t: TFuncLike; keyLabel?: string},
): Promise<{id: any} & Record<string, unknown>> {
  const rows = await findRecordsByIdOrKeys(db, table, {
    ...options,
    rejectAmbiguousKeys: true,
    limit: 2,
  });
  const keyEntries = Object.entries(options.keys ?? {}).filter(
    ([, v]) => String(v ?? "").trim() !== "",
  );
  const [keyLabel, keyValue] = keyEntries[0] ?? [];
  return assertUniqueMatch(rows, options.t, {
    keyLabel: options.keyLabel ?? keyLabel,
    keyValue: keyValue != null ? String(keyValue) : undefined,
  }) as {id: any} & Record<string, unknown>;
}

/** Write-tool field: optional record id for updates. */
export const ID_WRITE_FIELD = {
  name: "id",
  type: "string" as const,
  description:
    "Record id from list_* tools (e.g. inventory_item:…). Prefer over business keys when updating or when keys can change/collide.",
};

/**
 * Resolve rows for import update/delete: prefer id, else run legacy matcher.
 * Returns [] for create mode.
 */
export async function resolveUpdateMatchesByIdOrLegacy(
  db: ImportDbLike,
  table: string,
  opts: {
    mode: string;
    id?: unknown;
    softDelete?: boolean;
    legacy: () => Promise<Array<{id: any}>>;
  },
): Promise<Array<{id: any}>> {
  if (opts.mode === "create") return [];
  const idRaw = String(opts.id ?? "").trim();
  if (idRaw) {
    return findRecordsByIdOrKeys(db, table, {
      id: idRaw,
      softDelete: opts.softDelete,
      limit: 2,
    });
  }
  return opts.legacy();
}
