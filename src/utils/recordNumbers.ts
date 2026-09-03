import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";

type DatabaseClient = ReturnType<typeof useDB>;

const normalizeRecordId = (value?: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const maybeId = (value as { id?: unknown }).id;
    if (typeof maybeId === "string") {
      return maybeId;
    }

    if (maybeId && typeof (maybeId as { id?: unknown }).id === "string") {
      return (maybeId as { id: string }).id;
    }

    if (typeof (value as { toString?: () => string }).toString === "function") {
      return (value as { toString: () => string }).toString();
    }
  }

  return undefined;
};

export const fetchNextSequentialNumber = async (
  db: DatabaseClient,
  table: Tables,
  field: string
): Promise<number> => {
  const [rows] = await db.query(
    `SELECT math::max(${field}) as max_value FROM ${table} GROUP ALL`
  );

  const maxValue = rows?.[0]?.max_value ?? 0;
  const parsedValue = Number(maxValue);

  if (Number.isFinite(parsedValue)) {
    return parsedValue + 1;
  }

  return 1;
};

export const isUniqueRecordNumber = async (
  db: DatabaseClient,
  table: Tables,
  field: string,
  value?: number | string | null,
  currentId?: string
): Promise<boolean> => {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return true;
  }

  const [rows] = await db.query(
    `SELECT id FROM ${table} WHERE ${field} = $value LIMIT 1`,
    { value: numericValue }
  );

  const existingRecord = rows?.[0];
  if (!existingRecord) {
    return true;
  }

  const existingId = normalizeRecordId(existingRecord.id);
  const currentRecordId = normalizeRecordId(currentId);

  if (existingId && currentRecordId && existingId === currentRecordId) {
    return true;
  }

  return false;
};

