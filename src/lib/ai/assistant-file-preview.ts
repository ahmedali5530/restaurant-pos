import {detectSourceKind} from "@/lib/data-import/extract/detect.ts";
import {parseStructuredFile} from "@/lib/data-import/extract/structured.ts";

/** Soft caps so analyze context stays within chat token budgets. */
export const ASSISTANT_ANALYZE_MAX_ROWS = 80;
export const ASSISTANT_ANALYZE_MAX_CHARS = 12_000;
export const ASSISTANT_ANALYZE_MAX_COLS = 40;

export type AssistantFilePreview = {
  fileName: string;
  kind: "csv" | "excel";
  text: string;
  truncated: boolean;
  rowCount: number;
  sheetCount: number;
};

const escapeCell = (value: string): string => {
  const raw = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

/**
 * Build a capped CSV-like text preview of an uploaded spreadsheet for chat analyze.
 */
export async function buildAssistantFilePreview(file: File): Promise<AssistantFilePreview> {
  const kind = detectSourceKind(file);
  if (kind !== "csv" && kind !== "excel") {
    throw new Error("Only CSV or Excel files can be analyzed in the assistant.");
  }

  const parsed = await parseStructuredFile(file);
  const sheets = parsed.sheets.slice(0, 3);
  const parts: string[] = [];
  let truncated = sheets.length < parsed.sheets.length;
  let rowCount = 0;

  for (const sheet of sheets) {
    const headers = sheet.headers.slice(0, ASSISTANT_ANALYZE_MAX_COLS);
    if (sheet.headers.length > ASSISTANT_ANALYZE_MAX_COLS) truncated = true;
    const rows = sheet.rows.slice(0, ASSISTANT_ANALYZE_MAX_ROWS);
    if (sheet.rows.length > ASSISTANT_ANALYZE_MAX_ROWS) truncated = true;
    rowCount += rows.length;

    parts.push(`### Sheet: ${sheet.name}`);
    parts.push(headers.map(escapeCell).join(","));
    for (const row of rows) {
      parts.push(
        headers.map((_, i) => escapeCell(String(row[i] ?? ""))).join(","),
      );
    }
    parts.push("");
  }

  let text = parts.join("\n").trim();
  if (text.length > ASSISTANT_ANALYZE_MAX_CHARS) {
    text = `${text.slice(0, ASSISTANT_ANALYZE_MAX_CHARS - 1)}…`;
    truncated = true;
  }

  return {
    fileName: file.name,
    kind,
    text,
    truncated,
    rowCount,
    sheetCount: parsed.sheets.length,
  };
}

/** Format preview as a chat context block prepended to the user question. */
export function formatAnalyzeUserMessage(
  question: string,
  preview: AssistantFilePreview,
): string {
  const note = preview.truncated
    ? " (preview truncated for size)"
    : "";
  return [
    `Attached file for analysis: \`${preview.fileName}\`${note}`,
    `Rows in preview: ${preview.rowCount}; sheets: ${preview.sheetCount}.`,
    "",
    "```csv",
    preview.text,
    "```",
    "",
    question.trim(),
  ].join("\n");
}
