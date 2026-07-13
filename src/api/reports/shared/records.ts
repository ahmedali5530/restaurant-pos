import {RecordId, StringRecordId} from "surrealdb";

/**
 * Prefer recordIdToString for filter equality against URL select values
 * (full "table:id"). Passing RecordId into this helper via `.id` drops the
 * table prefix and breaks comparisons.
 */
export const recordToString = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as {id: unknown}).id;
    return typeof id === "string" ? id : String(id);
  }
  return String(value);
};

/** Full record id string e.g. user:abc — prefers RecordId.toString(). */
export const recordIdToString = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof StringRecordId || value instanceof RecordId) {
    return value.toString();
  }
  if (typeof value === "object" && value !== null) {
    if ("tb" in value && "id" in value) {
      return `${(value as {tb: string}).tb}:${(value as {id: unknown}).id}`;
    }
    if ("id" in value) {
      return recordIdToString((value as {id: unknown}).id);
    }
    const str = (value as {toString?: () => string}).toString?.();
    if (str && str.includes(":")) {
      return str;
    }
  }
  return String(value);
};

/** Bind a value as a SurrealDB record id parameter (matches Clock screen usage). */
export const toQueryRecordId = (
  value: unknown,
  defaultTable?: string,
): StringRecordId => {
  const normalized = recordIdToString(value);
  if (!normalized) {
    throw new Error("Empty record id");
  }

  const id = normalized.includes(":")
    ? normalized
    : `${defaultTable ?? "user"}:${normalized}`;

  return new StringRecordId(id);
};
