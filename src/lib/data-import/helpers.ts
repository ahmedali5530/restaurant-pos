import type {ImportDbLike, ResolvedReference} from "@/lib/data-import/types.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";
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

/** Normalize a value for import match comparison. */
export function normalizeImportMatchValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "value" in value) {
    return String((value as {value?: unknown}).value ?? "").trim().toLowerCase();
  }
  return String(value).trim().toLowerCase();
}

/** Build a composite match key from row values and selected match fields. */
export function buildImportMatchKey(
  values: Record<string, unknown>,
  matchFields: string[],
  resolveField?: (field: string, value: unknown) => string
): string {
  return matchFields
    .map((field) => {
      const raw = values[field];
      if (resolveField) return resolveField(field, raw);
      return normalizeImportMatchValue(raw);
    })
    .join("||");
}

/** Find indexes of existing lines that match the given import row. */
export function findMatchingLineIndexes<T>(
  lines: T[],
  matchFields: string[],
  importValues: Record<string, unknown>,
  getLineValues: (line: T, index: number) => Record<string, unknown>,
  options?: {
    skipLine?: (line: T, index: number) => boolean;
    resolveImportField?: (field: string, value: unknown) => string;
    resolveLineField?: (field: string, value: unknown, line: T, index: number) => string;
  }
): number[] {
  if (matchFields.length === 0) return [];

  const importKey = buildImportMatchKey(importValues, matchFields, options?.resolveImportField);
  if (!importKey || importKey === matchFields.map(() => "").join("||")) return [];

  const indexes: number[] = [];
  lines.forEach((line, index) => {
    if (options?.skipLine?.(line, index)) return;
    const lineValues = getLineValues(line, index);
    const lineKey = buildImportMatchKey(lineValues, matchFields, (field, value) =>
      options?.resolveLineField
        ? options.resolveLineField(field, value, line, index)
        : normalizeImportMatchValue(value)
    );
    if (lineKey === importKey) indexes.push(index);
  });
  return indexes;
}

/**
 * Apply create / update / upsert to an in-memory list (form lines or collected batch).
 * Mirrors writeCsvImportRow semantics.
 */
export function applyListImportMode<T>(options: {
  mode: CsvImportMode;
  existingIndexes: number[];
  append: (payload: T) => void;
  update: (index: number, payload: T) => void;
  payload: T;
  notFoundMessage: string;
  multipleMatchesMessage: string;
}): "created" | "updated" {
  const {
    mode,
    existingIndexes,
    append,
    update,
    payload,
    notFoundMessage,
    multipleMatchesMessage,
  } = options;

  if (mode === "create") {
    append(payload);
    return "created";
  }

  if (existingIndexes.length > 1) {
    throw new Error(multipleMatchesMessage);
  }

  if (existingIndexes.length === 1) {
    update(existingIndexes[0], payload);
    return "updated";
  }

  if (mode === "update") {
    throw new Error(notFoundMessage);
  }

  append(payload);
  return "created";
}

/** Match field resolver for inventory document lines with item SelectOption. */
export function resolveItemFormMatchValue(
  field: string,
  value: unknown,
  item?: {id?: unknown; code?: string; name?: string}
): string {
  if (field === "item" || field === "code") {
    return normalizeImportMatchValue(item?.id ?? (value as any)?.value ?? value);
  }
  if (field === "name") {
    return normalizeImportMatchValue(item?.name ?? value);
  }
  return normalizeImportMatchValue(value);
}

/** Read match values from a form line with item SelectOption. */
export function resolveItemFormLineMatchValue(field: string, line: any): string {
  if (field === "item" || field === "code" || field === "name") {
    return normalizeImportMatchValue(line?.item?.value);
  }
  return normalizeImportMatchValue(line?.[field]);
}
