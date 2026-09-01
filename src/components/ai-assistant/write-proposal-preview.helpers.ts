import type {ImportField, ImportRecord} from "@/lib/data-import/types.ts";

export const MAX_TABLE_COLUMNS = 6;

export const isMeaningfulPreviewValue = (value: unknown, field: ImportField): boolean => {
  if (value === null || value === undefined || value === "") return false;
  if (field.type === "boolean" && value === false) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (field.type === "number" && value === 0 && field.name === "priority") return false;
  return true;
};

export const selectPreviewFields = (
  columns: ImportField[],
  record: ImportRecord,
  matchFields: string[] = [],
): ImportField[] => {
  const matchSet = new Set(matchFields);
  const selected = columns.filter(col =>
    matchSet.has(col.name) || isMeaningfulPreviewValue(record.values[col.name], col),
  );

  if (selected.length > 0) return selected;

  const nameField = columns.find(col => col.name === "name" || col.name === "code");
  return nameField ? [nameField] : columns.slice(0, 3);
};

export const shouldUseCardPreviewLayout = (columnCount: number): boolean =>
  columnCount > MAX_TABLE_COLUMNS;
