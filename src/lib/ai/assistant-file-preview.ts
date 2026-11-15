import {detectSourceKind} from "@/lib/data-import/extract/detect.ts";
import {parseStructuredFile} from "@/lib/data-import/extract/structured.ts";
import type {OpenAIContentPart} from "@/lib/openai.service.ts";

/** Soft caps so analyze context stays within chat token budgets. */
export const ASSISTANT_ANALYZE_MAX_ROWS = 80;
export const ASSISTANT_ANALYZE_MAX_CHARS = 12_000;
export const ASSISTANT_ANALYZE_MAX_COLS = 40;
/** PDF pages sent to vision for analyze (import cleanse can use more). */
export const ASSISTANT_ANALYZE_MAX_PDF_PAGES = 5;

export type AssistantAnalyzeKind = "csv" | "excel" | "pdf" | "image";

export type AssistantFilePreview = {
  fileName: string;
  kind: AssistantAnalyzeKind;
  /** Spreadsheet text preview, or a short caption for vision files. */
  text: string;
  truncated: boolean;
  rowCount: number;
  sheetCount: number;
  /** JPEG data URLs for PDF pages / images (vision analyze). */
  imageUrls?: string[];
  pageCount?: number;
};

const escapeCell = (value: string): string => {
  const raw = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

async function buildSpreadsheetPreview(file: File, kind: "csv" | "excel"): Promise<AssistantFilePreview> {
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

async function buildImagePreview(file: File): Promise<AssistantFilePreview> {
  const {fileToResizedDataUrl} = await import("@/lib/data-import/extract/document.ts");
  const dataUrl = await fileToResizedDataUrl(file);
  return {
    fileName: file.name,
    kind: "image",
    text: "Image attached for visual analysis.",
    truncated: false,
    rowCount: 0,
    sheetCount: 0,
    imageUrls: [dataUrl],
    pageCount: 1,
  };
}

async function buildPdfPreview(file: File): Promise<AssistantFilePreview> {
  const {rasterizePdfPages} = await import("@/lib/data-import/extract/pdf.ts");
  try {
    const pages = await rasterizePdfPages(file, {
      maxPages: ASSISTANT_ANALYZE_MAX_PDF_PAGES,
    });
    return {
      fileName: file.name,
      kind: "pdf",
      text: `PDF attached (${pages.length} page(s) prepared for visual analysis).`,
      truncated: false,
      rowCount: 0,
      sheetCount: 0,
      imageUrls: pages.map((p) => p.dataUrl),
      pageCount: pages.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/pages\. Maximum supported/i.test(message)) throw err;

    const pages = await rasterizePdfPages(file, {maxPages: 40});
    const kept = pages.slice(0, ASSISTANT_ANALYZE_MAX_PDF_PAGES);
    return {
      fileName: file.name,
      kind: "pdf",
      text: `PDF attached (showing first ${kept.length} of ${pages.length} pages).`,
      truncated: pages.length > kept.length,
      rowCount: 0,
      sheetCount: 0,
      imageUrls: kept.map((p) => p.dataUrl),
      pageCount: pages.length,
    };
  }
}

/**
 * Build a capped preview of an uploaded file for chat analyze.
 * Spreadsheets → text; PDF/images → resized JPEG data URLs for vision.
 */
export async function buildAssistantFilePreview(file: File): Promise<AssistantFilePreview> {
  const kind = detectSourceKind(file);
  if (kind === "csv" || kind === "excel") {
    return buildSpreadsheetPreview(file, kind);
  }
  if (kind === "image") {
    return buildImagePreview(file);
  }
  if (kind === "pdf") {
    return buildPdfPreview(file);
  }
  throw new Error("Only CSV, Excel, PDF, or image files can be analyzed in the assistant.");
}

/** Format preview as a chat context block prepended to the user question (text path). */
export function formatAnalyzeUserMessage(
  question: string,
  preview: AssistantFilePreview,
): string {
  const note = preview.truncated ? " (preview truncated for size)" : "";
  const q = question.trim();

  if (preview.imageUrls?.length) {
    const pages = preview.pageCount ?? preview.imageUrls.length;
    return [
      `Attached ${preview.kind} for analysis: \`${preview.fileName}\`${note}`,
      `${preview.text}`,
      `Vision pages prepared: ${preview.imageUrls.length}${pages !== preview.imageUrls.length ? ` of ${pages}` : ""}.`,
      "Analyze the attached page image(s) and answer the question. Do not invent unseen content.",
      "",
      q,
    ].join("\n");
  }

  return [
    `Attached file for analysis: \`${preview.fileName}\`${note}`,
    `Rows in preview: ${preview.rowCount}; sheets: ${preview.sheetCount}.`,
    "",
    "```csv",
    preview.text,
    "```",
    "",
    q,
  ].join("\n");
}

/** Multimodal user content: text prompt + optional vision images. */
export function formatAnalyzeUserContent(
  question: string,
  preview: AssistantFilePreview,
): {text: string; imageUrls: string[]} {
  return {
    text: formatAnalyzeUserMessage(question, preview),
    imageUrls: preview.imageUrls ?? [],
  };
}

export function buildAnalyzeContentParts(
  text: string,
  imageUrls: string[],
): string | OpenAIContentPart[] {
  if (!imageUrls.length) return text;
  return [
    {type: "text", text},
    ...imageUrls.map(
      (url): OpenAIContentPart => ({
        type: "image_url",
        image_url: {url, detail: "high"},
      }),
    ),
  ];
}
