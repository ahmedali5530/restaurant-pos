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

/** Resolve inventory item by code first, then case-insensitive name. */
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
    `SELECT * FROM ${Tables.inventory_items} WHERE string::lowercase(name) = string::lowercase($key)${fetchClause} LIMIT 1`,
    {key}
  );
  return byName?.[0] ?? null;
}

export type DishResolveResult =
  | {status: "found"; dish: any}
  | {status: "not_found"}
  | {status: "ambiguous"};

/** Resolve a dish by number first, then case-insensitive name. */
export async function resolveDishByNumberOrName(
  db: ImportDbLike,
  numberOrName: string
): Promise<DishResolveResult> {
  const key = numberOrName.trim();
  if (!key) return {status: "not_found"};

  const [byNumber] = await db.query(
    `SELECT id, items FROM ${Tables.dishes} WHERE number = $key AND deleted_at = none LIMIT 1`,
    {key}
  );
  if (byNumber?.length) return {status: "found", dish: byNumber[0]};

  const [byName] = await db.query(
    `SELECT id, items FROM ${Tables.dishes}
     WHERE string::lowercase(name) = string::lowercase($key) AND deleted_at = none`,
    {key}
  );
  if (!byName?.length) return {status: "not_found"};
  if (byName.length > 1) return {status: "ambiguous"};
  return {status: "found", dish: byName[0]};
}

export function itemSelectOption(item: {id: any; name?: string; code?: string}): SelectOption {
  const name = item.name ?? "";
  const code = item.code ?? "";
  return {
    label: name && code ? `${name}-${code}` : name || code || String(item.id),
    value: String(item.id),
  };
}
