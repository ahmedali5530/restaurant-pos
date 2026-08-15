import type {ImportDbLike, ResolvedReference} from "@/lib/data-import/types.ts";
import {toRecordId} from "@/lib/utils.ts";
import {Tables} from "@/api/db/tables.ts";

export type SelectOption = {label: string; value: string};

/** Convert a resolved import reference to a ReactSelect option. */
export function toSelectOption(ref: ResolvedReference | null | undefined): SelectOption | null {
  if (!ref?.id) return null;
  return {label: ref.label || String(ref.id), value: String(ref.id)};
}

export function requireRefId(ref: ResolvedReference | null | undefined, message: string): any {
  if (!ref?.id) {
    throw new Error(message);
  }
  return toRecordId(ref.id);
}

export function requireRefIds(
  refs: ResolvedReference[] | null | undefined,
  message: string
): any[] {
  const list = refs ?? [];
  if (list.length === 0) {
    throw new Error(message);
  }
  return list.map((ref) => {
    if (!ref.id) throw new Error(message);
    return toRecordId(ref.id);
  });
}

export function parseImportBool(value: any): boolean {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "y"].includes(s);
}

export type TFunc = (key: string, options?: any) => string;

/** Resolve inventory item by code first, then name. */
export async function resolveInventoryItem(
  db: ImportDbLike,
  codeOrName: string,
  fetch: string = ""
): Promise<any> {
  const key = codeOrName.trim();
  if (!key) return null;
  const fetchClause = fetch ? ` FETCH ${fetch}` : "";
  const [byCode] = await db.query(
    `SELECT * FROM ${Tables.inventory_items} WHERE code = $key${fetchClause} LIMIT 1`,
    {key}
  );
  if (byCode?.length) return byCode[0];
  const [byName] = await db.query(
    `SELECT * FROM ${Tables.inventory_items} WHERE name = $key${fetchClause} LIMIT 1`,
    {key}
  );
  return byName?.[0] ?? null;
}

export function itemSelectOption(item: {id: any; name?: string; code?: string}): SelectOption {
  const name = item.name ?? "";
  const code = item.code ?? "";
  return {
    label: name && code ? `${name}-${code}` : name || code || String(item.id),
    value: String(item.id),
  };
}
