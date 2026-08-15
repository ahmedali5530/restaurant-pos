import * as XLSX from "xlsx";
import {throwIfAborted} from "@/lib/data-import/abort.ts";
import type {StructuredExtractResult, StructuredSheet} from "@/lib/data-import/types.ts";

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function sheetToStructured(name: string, sheet: XLSX.WorkSheet): StructuredSheet {
  const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as string[][];

  if (!aoa.length) {
    return {name, headers: [], rows: []};
  }

  const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = aoa.slice(1).map((row) => {
    const cells: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      cells.push(String(row?.[i] ?? "").trim());
    }
    return cells;
  }).filter((row) => row.some((cell) => cell.length > 0));

  return {name, headers, rows};
}

/**
 * Parse CSV or Excel into structured sheets using SheetJS.
 * Yields to the event loop between sheets for large workbooks.
 */
export async function parseStructuredFile(
  file: File,
  options?: {signal?: AbortSignal}
): Promise<StructuredExtractResult> {
  throwIfAborted(options?.signal);

  const buffer = await file.arrayBuffer();
  throwIfAborted(options?.signal);

  const workbook = XLSX.read(buffer, {type: "array", cellDates: true});
  const sheets: StructuredSheet[] = [];

  for (let i = 0; i < workbook.SheetNames.length; i++) {
    throwIfAborted(options?.signal);
    const name = workbook.SheetNames[i];
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    sheets.push(sheetToStructured(name, sheet));
    if (i % 2 === 1) {
      await yieldToUi();
    }
  }

  if (sheets.length === 0) {
    throw new Error("No sheets found in the uploaded file.");
  }

  const kind = file.name.toLowerCase().endsWith(".csv") ? "csv" : "excel";
  return {kind, sheets, sheetIndex: 0};
}

/**
 * Apply a field-name → CSV header mapping to produce raw record objects.
 */
export function applyColumnMapping(
  headers: string[],
  rows: string[][],
  fields: Array<{name: string}>,
  mapping: Record<string, string | "">
): Array<Record<string, any>> {
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    headerIndex[h] = i;
  });

  return rows.map((row) => {
    const record: Record<string, any> = {};
    for (const field of fields) {
      const csvHeader = mapping[field.name];
      if (!csvHeader) continue;
      const idx = headerIndex[csvHeader];
      if (idx === undefined) continue;
      record[field.name] = row[idx] ?? "";
    }
    return record;
  });
}

/**
 * Build an initial mapping from field names/labels/aliases to headers.
 */
export function autoMapColumns(
  headers: string[],
  fields: Array<{name: string; label: string; aliases?: string[]}>
): Record<string, string | ""> {
  const normalizedHeaders = headers.map((h) => ({
    raw: h,
    norm: h.trim().toLowerCase(),
  }));

  const mapping: Record<string, string | ""> = {};

  for (const field of fields) {
    const candidates = [
      field.name,
      field.label,
      ...(field.aliases ?? []),
    ].map((c) => c.trim().toLowerCase());

    const hit = normalizedHeaders.find((h) => candidates.includes(h.norm));
    mapping[field.name] = hit?.raw ?? "";
  }

  return mapping;
}

export function mappingNeedsReview(
  fields: Array<{name: string; required?: boolean; optional?: boolean}>,
  mapping: Record<string, string | "">
): boolean {
  for (const field of fields) {
    if (field.optional || !field.required) continue;
    if (!mapping[field.name]) return true;
  }
  // Also review when any required-ish field (no optional) is unmapped and we have headers
  const anyMapped = Object.values(mapping).some(Boolean);
  if (!anyMapped) return true;
  return false;
}
