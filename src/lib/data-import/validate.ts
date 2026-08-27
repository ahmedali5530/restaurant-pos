import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {resolveReferences} from "@/lib/data-import/resolve-refs.ts";
import type {
  ImportConfiguration,
  ImportIssue,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";

function isEmptyValue(fieldType: string, value: any): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (fieldType === "reference[]") {
    return !Array.isArray(value) || value.length === 0;
  }
  if (fieldType === "reference") {
    const ref = value as ResolvedReference | null;
    return !ref || !ref.label;
  }
  return false;
}

/**
 * Recompute validation issues for one record (keeps low_confidence warnings
 * and clears stale required/type/ref issues before re-checking).
 */
export function validateRecord(
  config: ImportConfiguration,
  record: ImportRecord
): ImportIssue[] {
  const preserved = record.issues.filter(
    (i) =>
      i.code === "low_confidence" ||
      i.code === "duplicate" ||
      i.code === "custom" ||
      i.code === "auto_corrected"
  );
  const issues: ImportIssue[] = [...preserved];

  for (const field of config.fields) {
    const value = record.values[field.name];

    if (field.required && isEmptyValue(field.type, value)) {
      issues.push({
        field: field.name,
        code: "required",
        severity: "error",
        message: `"${field.label}" is required`,
      });
      continue;
    }

    if (
      field.allowedValues?.length &&
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      const str = String(value).trim();
      const canonical = field.allowedValues.find(
        (a) => a.toLowerCase() === str.toLowerCase()
      );
      if (!canonical) {
        issues.push({
          field: field.name,
          code: "invalid_type",
          severity: "error",
          message: `Invalid "${field.label}" "${str}". Expected one of: ${field.allowedValues.join(", ")}`,
        });
      }
    }

    if (field.type === "reference" && value) {
      const ref = value as ResolvedReference;
      if (ref.label && !ref.id && !ref.create) {
        // Avoid duplicating if resolve-refs already added
        const already = issues.some(
          (i) =>
            i.field === field.name &&
            (i.code === "unresolved_reference" || i.code === "ambiguous_reference")
        );
        if (!already) {
          issues.push({
            field: field.name,
            code: "unresolved_reference",
            severity: "error",
            message: `Could not resolve "${ref.label}"`,
          });
        }
      }
    }

    if (field.type === "reference[]" && Array.isArray(value)) {
      for (const ref of value as ResolvedReference[]) {
        if (ref.label && !ref.id && !ref.create) {
          const already = issues.some(
            (i) =>
              i.field === field.name &&
              i.code === "unresolved_reference" &&
              i.message.includes(ref.label)
          );
          if (!already) {
            issues.push({
              field: field.name,
              code: "unresolved_reference",
              severity: "error",
              message: `Could not resolve "${ref.label}"`,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Flag duplicate values within the batch for configured match fields.
 */
export function flagBatchDuplicates(
  config: ImportConfiguration,
  records: ImportRecord[]
): void {
  const matchFields = config.matchFields?.length
    ? config.matchFields
    : [];
  if (matchFields.length === 0) return;

  const seen = new Map<string, number>();
  records.forEach((record, index) => {
    if (record.skipped) return;
    const key = matchFields
      .map((f) => {
        const v = record.values[f];
        if (v && typeof v === "object" && "label" in v) return String((v as any).label);
        return String(v ?? "").trim();
      })
      .join("||");
    if (!key || key === matchFields.map(() => "").join("||")) return;

    if (seen.has(key)) {
      record.issues.push({
        code: "duplicate",
        severity: "warning",
        message: `Duplicate of row ${seen.get(key)! + 1} on match fields`,
      });
    } else {
      seen.set(key, index);
    }
  });
}

export function recordHasBlockingErrors(record: ImportRecord): boolean {
  if (record.skipped) return false;
  return record.issues.some((i) => i.severity === "error");
}

export function canConfirmImport(records: ImportRecord[]): boolean {
  const active = records.filter((r) => !r.skipped);
  if (active.length === 0) return false;
  return active.every((r) => !recordHasBlockingErrors(r));
}

/**
 * Full validate pass: resolve refs then recompute per-record issues.
 */
export async function validateRecords(
  config: ImportConfiguration,
  records: ImportRecord[],
  options?: {signal?: AbortSignal; resolveRefs?: boolean}
): Promise<ImportRecord[]> {
  if (options?.resolveRefs !== false) {
    // Clear previous ref issues before re-resolve (keep UOM / scalar auto_corrected)
    for (const record of records) {
      record.issues = record.issues.filter((i) => {
        if (
          i.code === "unresolved_reference" ||
          i.code === "ambiguous_reference" ||
          i.code === "required"
        ) {
          return false;
        }
        if (i.code === "auto_corrected" && i.field) {
          const field = config.fields.find((f) => f.name === i.field);
          if (field && (field.type === "reference" || field.type === "reference[]")) {
            return false;
          }
        }
        return true;
      });
    }
    await resolveReferences(config, records, {signal: options?.signal});
  }

  for (const record of records) {
    throwIfAborted(options?.signal);
    record.issues = validateRecord(config, record);
  }

  flagBatchDuplicates(config, records);
  return records;
}
