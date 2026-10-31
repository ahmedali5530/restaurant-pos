import type {ImportConfiguration, ImportField, ImportRecord, ResolvedReference} from "@/lib/data-import/types.ts";
import * as XLSX from "xlsx";

const csvCellFromReference = (ref: ResolvedReference | null | undefined): string => {
  if (!ref?.label) {
    return "";
  }
  return String(ref.label).trim();
};

/** Serialize a field value for an import-ready CSV cell (labels for refs). */
export const csvCellFromValue = (field: ImportField, value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (field.type === "boolean") {
    if (value === true || value === "true" || value === 1 || value === "1") {
      return "true";
    }
    if (value === false || value === "false" || value === 0 || value === "0") {
      return "false";
    }
    return String(value);
  }

  if (field.type === "reference") {
    return csvCellFromReference(value as ResolvedReference);
  }

  if (field.type === "reference[]") {
    if (!Array.isArray(value)) {
      return "";
    }
    return value
      .map(item => csvCellFromReference(item as ResolvedReference))
      .filter(Boolean)
      .join(", ");
  }

  if (field.type === "date" && value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object" && value && "label" in (value as object)) {
    return csvCellFromReference(value as ResolvedReference);
  }

  return String(value).trim();
};

/**
 * Build a CSV string (SheetJS) with field **labels** as headers so the file
 * matches AI Import templates. Skips skipped rows. No extra audit columns.
 */
export const recordsToImportCsv = (
  config: ImportConfiguration,
  records: ImportRecord[],
): string => {
  const fields = config.fields;
  const headers = fields.map(field => field.label);
  const dataRows = records
    .filter(record => !record.skipped)
    .map(record =>
      fields.map(field => csvCellFromValue(field, record.values[field.name])),
    );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return csv;
};

/** Browser download helper for a corrected CSV blob. */
export const downloadImportCsv = (
  csv: string,
  filename: string,
): void => {
  const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const buildCleanseSummaryMarkdown = (
  domainLabel: string,
  summary: {
    totalRows: number;
    readyRows: number;
    skippedRows: number;
    errorRows: number;
    warningRows: number;
    unresolvedRefs: number;
    samples: Array<{row: number; severity: string; message: string; field?: string}>;
  },
  extras?: {mappingAutoAccepted?: boolean; fileName?: string},
): string => {
  const lines = [
    `**Import cleanse — ${domainLabel}**`,
    extras?.fileName ? `File: \`${extras.fileName}\`` : null,
    "",
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Rows | ${summary.totalRows} |`,
    `| Ready | ${summary.readyRows} |`,
    `| Errors | ${summary.errorRows} |`,
    `| Warnings | ${summary.warningRows} |`,
    `| Skipped | ${summary.skippedRows} |`,
    `| Unresolved refs | ${summary.unresolvedRefs} |`,
  ].filter(line => line !== null) as string[];

  if (extras?.mappingAutoAccepted) {
    lines.push("", "_Column headers were auto-mapped (best effort)._");
  }

  if (summary.samples.length) {
    lines.push("", "**Sample issues**", "");
    for (const sample of summary.samples.slice(0, 12)) {
      const field = sample.field ? ` (${sample.field})` : "";
      lines.push(`- Row ${sample.row}${field}: ${sample.message}`);
    }
  }

  lines.push(
    "",
    "Download the corrected CSV and import it on the matching **AI Import** screen.",
  );
  return lines.join("\n");
};
