import type {ImportConfiguration, ImportField, ImportIssue, ImportRecord} from "@/lib/data-import/types.ts";

let clientIdCounter = 0;

export function nextImportClientId(): string {
  clientIdCounter += 1;
  return `imp-${Date.now()}-${clientIdCounter}`;
}

function coerceBoolean(value: any): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  return null;
}

function coerceNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.,\-]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function coerceString(value: any): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function coerceDate(value: any): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s; // keep raw; validate may flag later
}

function splitMulti(value: any): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v && "label" in v ? String((v as any).label) : String(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(/[|,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function coerceFieldValue(
  field: ImportField,
  raw: any
): {value: any; issue?: ImportIssue} {
  if (raw === null || raw === undefined || raw === "") {
    if (field.defaultValue !== undefined) {
      return {value: field.defaultValue};
    }
    return {value: field.type === "reference[]" ? [] : null};
  }

  switch (field.type) {
    case "string": {
      const v = coerceString(raw);
      return {value: v};
    }
    case "number": {
      const v = coerceNumber(raw);
      if (v === null && String(raw).trim() !== "") {
        return {
          value: null,
          issue: {
            field: field.name,
            code: "invalid_type",
            severity: "error",
            message: `"${field.label}" must be a number`,
          },
        };
      }
      return {value: v};
    }
    case "boolean": {
      const v = coerceBoolean(raw);
      if (v === null && String(raw).trim() !== "") {
        return {
          value: null,
          issue: {
            field: field.name,
            code: "invalid_type",
            severity: "error",
            message: `"${field.label}" must be true or false`,
          },
        };
      }
      return {value: v};
    }
    case "date": {
      return {value: coerceDate(raw)};
    }
    case "reference": {
      if (typeof raw === "object" && raw !== null && ("label" in raw || "id" in raw)) {
        return {
          value: {
            label: String((raw as any).label ?? (raw as any).id ?? ""),
            id: (raw as any).id,
            create: (raw as any).create,
            candidates: (raw as any).candidates,
          },
        };
      }
      const label = coerceString(raw);
      return {
        value: label
          ? {label, id: undefined, create: undefined, candidates: undefined}
          : null,
      };
    }
    case "reference[]": {
      if (
        Array.isArray(raw) &&
        raw.length > 0 &&
        typeof raw[0] === "object" &&
        raw[0] !== null &&
        ("label" in raw[0] || "id" in raw[0])
      ) {
        return {
          value: raw.map((r: any) => ({
            label: String(r.label ?? r.id ?? ""),
            id: r.id,
            create: r.create,
            candidates: r.candidates,
          })),
        };
      }
      const labels = splitMulti(raw);
      return {
        value: labels.map((label) => ({
          label,
          id: undefined,
          create: undefined,
          candidates: undefined,
        })),
      };
    }
    default:
      return {value: raw};
  }
}

/**
 * Convert raw extracted objects into ImportRecord[] with type coercion.
 * Does not resolve lookups (see resolve-refs / validate).
 */
export function normalizeRecords(
  config: ImportConfiguration,
  rawRecords: Array<Record<string, any>>,
  options?: {
    confidence?: number[];
    fieldConfidence?: Array<Record<string, number> | undefined>;
  }
): ImportRecord[] {
  const allowedKeys = new Set(config.fields.map((f) => f.name));

  return rawRecords.map((raw, index) => {
    const values: Record<string, any> = {};
    const issues: ImportIssue[] = [];

    // Drop unknown keys from AI output
    for (const field of config.fields) {
      const rawValue = Object.prototype.hasOwnProperty.call(raw, field.name)
        ? raw[field.name]
        : undefined;
      const {value, issue} = coerceFieldValue(field, rawValue);
      if (issue) issues.push(issue);
      values[field.name] = value;
    }

    // Apply transforms after all fields coerced
    for (const field of config.fields) {
      if (!field.transform) continue;
      try {
        const before = values[field.name];
        const after = field.transform(values[field.name], values);
        values[field.name] = after;
        if (
          before !== null &&
          before !== undefined &&
          before !== "" &&
          after !== null &&
          after !== undefined &&
          after !== "" &&
          String(before).trim() !== String(after).trim()
        ) {
          issues.push({
            field: field.name,
            code: "auto_corrected",
            severity: "warning",
            message: `Matched "${String(before).trim()}" → "${String(after).trim()}"`,
          });
        }
      } catch (err: any) {
        issues.push({
          field: field.name,
          code: "custom",
          severity: "error",
          message: err?.message || `Transform failed for ${field.label}`,
        });
      }
    }

    // Apply defaults for empties after transform
    for (const field of config.fields) {
      const v = values[field.name];
      const empty =
        v === null ||
        v === undefined ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (empty && field.defaultValue !== undefined) {
        values[field.name] = field.defaultValue;
      }
    }

    const fieldConfidence = options?.fieldConfidence?.[index];
    if (fieldConfidence) {
      for (const [key, conf] of Object.entries(fieldConfidence)) {
        if (!allowedKeys.has(key)) continue;
        if (typeof conf === "number" && conf < 0.7) {
          issues.push({
            field: key,
            code: "low_confidence",
            severity: "warning",
            message: `Low confidence for "${key}"`,
          });
        }
      }
    }

    return {
      clientId: nextImportClientId(),
      values,
      issues,
      confidence: options?.confidence?.[index],
      fieldConfidence,
    };
  });
}
